/**
 * Weighed labels. A sticker for part of a unit (e.g. 250g of a product sold per
 * kg) carries that quantity in its barcode as `<code>-q0.25`, so New Sale adds
 * exactly what the sticker says. The rate still comes from the product.
 *
 * The marker is lowercase on purpose: scanners type it without Shift, and the
 * POS keyboard capture ignores Shift-modified keys.
 */

const QUANTITY_SUFFIX = /^(.+)-q(\d+(?:\.\d+)?)$/i;
const LEGACY_PRICE_SUFFIX = /^(.+)-(\d+(?:\.\d+)?)$/;

const isWeightUnit = (unitName?: string): boolean => {
  if (!unitName) return true;
  return /kg|kilo|gram|g|mg|lb|pound|oz|ounce|l|ser|seer|maund/i.test(unitName.trim());
};

const roundQuantity = (value: number) => Number(value.toFixed(6));

/**
 * How many selling units a label's weight text means, for example "250g" on a
 * product sold per kg is 0.25. Null when there is no usable weight.
 */
export function labelQuantityFromWeight(input: unknown, unitName?: string): number | null {
  const text = String(input ?? "").toLowerCase().trim();
  const match = text.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!(value > 0)) return null;

  const has = (...words: string[]) => words.some((word) => text.includes(word));
  let quantity: number;
  // "dozen" contains "oz", so it has to be checked first.
  if (has("dozen")) quantity = value * 12;
  else if (has("kg", "kilo")) quantity = value;
  else if (has("mg")) quantity = value / 1_000_000;
  else if (has("ml", "milliliter")) quantity = value / 1000;
  else if (has("lb", "pound")) quantity = value * 0.453592;
  else if (has("oz")) quantity = value * 0.0283495;
  else if (has("maund")) quantity = value * 37.3242;
  else if (has("ser", "seer")) quantity = value * 0.933105;
  else if (has("pc", "piece")) quantity = value;
  else if (has("g")) quantity = value / 1000;
  else if (has("l")) quantity = value;
  else quantity = isWeightUnit(unitName) ? value / 1000 : value;

  const rounded = roundQuantity(quantity);
  return rounded > 0 ? rounded : null;
}

/** Barcode to print: the plain code, plus the quantity unless it is exactly one unit. */
export function withLabelQuantity(code: string, quantity: number | null): string {
  if (!code || quantity === null || quantity === 1) return code;
  return `${code}-q${quantity.toFixed(6).replace(/\.?0+$/, "")}`;
}

export type ScannedLabel = { code: string; quantity?: number; legacyPrice?: number };

/**
 * Splits a scanned value. `code-q0.25` is a quantity; `code-180` is the price
 * format on stickers printed before quantities were added.
 */
export function parseScannedLabel(raw: string): ScannedLabel {
  const value = raw.trim();
  const withQuantity = value.match(QUANTITY_SUFFIX);
  if (withQuantity) {
    const quantity = Number.parseFloat(withQuantity[2]);
    if (quantity > 0) return { code: withQuantity[1], quantity };
  }
  const withPrice = value.match(LEGACY_PRICE_SUFFIX);
  if (withPrice) return { code: withPrice[1], legacyPrice: Number.parseFloat(withPrice[2]) };
  return { code: value };
}
