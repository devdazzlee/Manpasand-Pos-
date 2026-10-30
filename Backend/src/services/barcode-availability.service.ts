import { prisma } from '../prisma/client';

/**
 * Is a scan code free to use as a product's custom barcode? The till matches a
 * scan against barcode, SKU, product code and merchant code, so a value is
 * taken when any other product already has it in one of those.
 */
export async function findBarcodeOwner(code: string, excludeId?: string | null) {
  const value = code.trim();
  if (!value) return null;
  return prisma.product.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { label_barcode: { equals: value, mode: 'insensitive' } },
        { sku: { equals: value, mode: 'insensitive' } },
        { code: { equals: value, mode: 'insensitive' } },
        { custom_code: { equals: value, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
  });
}

/**
 * Next free code after `base`: bump the trailing number keeping its padding
 * (PA-144 → PA-145, ITEM-0099 → ITEM-0100); with no trailing number, add -2, -3…
 */
export async function suggestNextBarcode(base: string, excludeId?: string | null) {
  const value = base.trim();
  if (!value) return null;
  const m = /^(.*?)(\d+)$/.exec(value);
  const candidates: string[] = [];
  if (m) {
    const [, prefix, digits] = m;
    const start = Number(digits);
    for (let i = 1; i <= 300; i++) candidates.push(`${prefix}${String(start + i).padStart(digits.length, '0')}`);
  } else {
    for (let i = 2; i <= 300; i++) candidates.push(`${value}-${i}`);
  }
  // One query for everything that could clash, then pick the first free one.
  const prefix = m ? m[1] : value;
  const rows = await prisma.product.findMany({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { label_barcode: { startsWith: prefix, mode: 'insensitive' } },
        { sku: { startsWith: prefix, mode: 'insensitive' } },
        { code: { startsWith: prefix, mode: 'insensitive' } },
        { custom_code: { startsWith: prefix, mode: 'insensitive' } },
      ],
    },
    select: { label_barcode: true, sku: true, code: true, custom_code: true },
  });
  const used = new Set<string>();
  for (const r of rows) for (const v of [r.label_barcode, r.sku, r.code, r.custom_code]) if (v) used.add(v.trim().toLowerCase());
  return candidates.find((c) => !used.has(c.toLowerCase())) ?? null;
}

export async function barcodeAvailability(code: string, excludeId?: string | null) {
  const owner = await findBarcodeOwner(code, excludeId);
  return {
    code: code.trim(),
    available: !owner,
    usedBy: owner ? { id: owner.id, name: owner.name } : null,
    suggestion: owner ? await suggestNextBarcode(code, excludeId) : null,
  };
}
