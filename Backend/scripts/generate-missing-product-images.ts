/**
 * Generate professional e-commerce product images with Gemini, upload them
 * to Cloudinary, and attach the URL on the product.
 *
 * Usage:
 *   yarn generate:product-images:dry
 *   yarn generate:product-images
 *   yarn generate:product-images -- --limit 1
 *   yarn generate:product-images -- --placeholders
 *   yarn generate:product-images -- --retry-failed
 *
 * Flags:
 *   --dry-run          List matching products; do not generate or upload
 *   --limit N          Process at most N products this run
 *   --delay MS         Pause between Gemini calls (default 2500)
 *   --placeholders     Also replace shared category-banner "placeholder" images
 *   --duplicates       Replace any Cloudinary URL used by 2+ products
 *   --force-sku SKU    Always regenerate this SKU even if it already has a unique image
 *   --retry-failed     Only retry products that failed in a previous run
 *   --skip-failed      Do not retry previously failed products
 *   --include-services Include non-physical items (e.g. Delivery Charges)
 *   --active-only      Only active products (default)
 *   --all-products     Include inactive products
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { prisma } from '../src/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OUTPUT_DIR = path.resolve(__dirname, '../generated-product-images');
const PROGRESS_PATH = path.resolve(__dirname, '.generate-product-images-progress.json');
const LOG_PATH = path.resolve(__dirname, '.generate-product-images-log.jsonl');
const CLOUDINARY_FOLDER = 'manpasand/products/ai-generated';
const MIN_IMAGE_BYTES = 8_000;
const DEFAULT_DELAY_MS = 2_500;
const GEN_RETRIES = 3;

const SKIP_NAME_RE = /delivery charges|shipping fee|service fee/i;

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  code: string;
  description: string | null;
  is_active: boolean;
  has_images: boolean;
  is_loose_item: boolean;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  brand: { name: string } | null;
  color: { name: string } | null;
  size: { name: string } | null;
  unit: { name: string } | null;
  ProductImage: { id: string; image: string; status: string }[];
};

type ProgressEntry = {
  id: string;
  name: string;
  sku: string;
  at: string;
  url?: string;
  file?: string;
  error?: string;
};

type ProgressFile = {
  success: ProgressEntry[];
  failed: ProgressEntry[];
};

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
  delayMs: number;
  placeholders: boolean;
  duplicates: boolean;
  forceSkus: Set<string>;
  retryFailed: boolean;
  skipFailed: boolean;
  includeServices: boolean;
  activeOnly: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const getNum = (flag: string, fallback: number | null) => {
    const i = argv.indexOf(flag);
    if (i === -1 || !argv[i + 1]) return fallback;
    const n = Number(argv[i + 1]);
    return Number.isFinite(n) ? n : fallback;
  };

  const forceSkus = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force-sku' && argv[i + 1]) {
      argv[i + 1].split(',').forEach((s) => {
        if (s.trim()) forceSkus.add(s.trim());
      });
    }
  }

  return {
    dryRun: argv.includes('--dry-run'),
    limit: getNum('--limit', null),
    delayMs: getNum('--delay', DEFAULT_DELAY_MS) ?? DEFAULT_DELAY_MS,
    placeholders: argv.includes('--placeholders'),
    duplicates: argv.includes('--duplicates') || argv.includes('--placeholders'),
    forceSkus,
    retryFailed: argv.includes('--retry-failed'),
    skipFailed: argv.includes('--skip-failed'),
    includeServices: argv.includes('--include-services'),
    activeOnly: !argv.includes('--all-products'),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileStem(name: string, sku: string) {
  const stem = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);
  return `${sku}_${stem || 'product'}`;
}

function isPlaceholderUrl(url: string | null | undefined, sharedUrls?: Set<string>): boolean {
  if (!url) return true;
  const u = url.toLowerCase();
  if (!u.startsWith('http')) return true;
  if (u.startsWith('failed-')) return true;
  if (sharedUrls?.has(url)) return true;
  return (
    u.includes('/manpasand/categories/') ||
    u.includes('placeholder') ||
    u.includes('spices_main') ||
    u.includes('main_category') ||
    /category\.(png|jpe?g|webp)/.test(u)
  );
}

function hasValidUniqueImage(product: ProductRow, sharedUrls?: Set<string>) {
  return product.ProductImage.some(
    (img) =>
      img.status !== 'FAILED' &&
      typeof img.image === 'string' &&
      img.image.trim().length > 0 &&
      !isPlaceholderUrl(img.image, sharedUrls),
  );
}

function loadProgress(): ProgressFile {
  if (!fs.existsSync(PROGRESS_PATH)) return { success: [], failed: [] };
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8')) as ProgressFile;
  } catch {
    return { success: [], failed: [] };
  }
}

function saveProgress(progress: ProgressFile) {
  const tmp = `${PROGRESS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(progress, null, 2), 'utf-8');
  fs.renameSync(tmp, PROGRESS_PATH);
}

function appendLog(event: Record<string, unknown>) {
  fs.appendFileSync(LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function photographyStyle(category: string, productName = ''): string {
  const c = category.toLowerCase();
  const n = productName.toLowerCase();
  if (
    /neela tota|phitkari|nowshadar|suhaga|camphor|gandak|fine coal|surma|sindhoor|silver warq/.test(n)
  ) {
    return [
      'Professional catalog photography of a traditional South Asian apothecary mineral, salt, crystal, or chemical sold as a grocery item.',
      'Show the actual substance as crystals, lumps, or powder in a simple unlabeled bowl or packet.',
      'This is NOT a culinary herb or food dish. Clean white background, studio lighting, no people, no readable hazard labels.',
    ].join(' ');
  }

  if (c.includes('herb') || c.includes('spice')) {
    return [
      'Professional food photography of dried culinary herbs or spices.',
      'Show the actual dried leaves, seeds, bark, roots, or powder named in the product,',
      'arranged as a generous heap or in a simple ceramic bowl, optionally with a small wooden scoop.',
      'Warm natural light, shallow depth of field, clean light marble or off-white background.',
    ].join(' ');
  }

  if (c.includes('date') || c.includes('dried fruit') || c.includes('nut')) {
    return [
      'Professional food photography of dried fruits or nuts.',
      'Show a plentiful, appetizing pile or bowl of the named item with realistic texture, color, and size.',
      'Soft studio lighting, clean white or light stone surface, no packaging unless the name implies a packed item.',
    ].join(' ');
  }

  if (c.includes('grain') || c.includes('pulse') || c.includes('rice') || c.includes('flour')) {
    return [
      'Professional pantry-staple food photography.',
      'Show raw grains, pulses, rice, or flour as a generous heap or in a simple bowl or cloth sack,',
      'with accurate color and grain size. Clean white background, overhead or 45-degree angle.',
    ].join(' ');
  }

  if (c.includes('oil') || c.includes('shampoo') || c.includes('beauty')) {
    return [
      'Professional beauty / personal-care product photography.',
      'A single bottle or jar of the product, centered, well-lit, with realistic glass or plastic packaging.',
      'Softbox lighting, seamless white or very light gray background, subtle reflection on the surface.',
      'No readable fake brand logos. Unlabeled or minimally labeled packaging.',
    ].join(' ');
  }

  if (c.includes('scent') || c.includes('perfume')) {
    return [
      'Professional perfume photography.',
      'An elegant bottle of attar or perfume, centered, studio lighting, seamless light background.',
      'Glass bottle with realistic liquid color. No fake logos or decorative text.',
    ].join(' ');
  }

  if (c.includes('juice') || c.includes('arqiat') || c.includes('sharbat')) {
    return [
      'Professional beverage photography of a South Asian sharbat, squash, or herbal drink.',
      'A glass bottle filled with the liquid in the correct color, centered, condensation optional.',
      'Clean white background, commercial catalog lighting. No fake brand labels.',
    ].join(' ');
  }

  if (c.includes('pickle') || c.includes('jam') || c.includes('honey') || c.includes('murabba')) {
    return [
      'Professional jar photography of pickles, jam, honey, or murabba.',
      'A glass jar filled with the named preserve, contents visible, centered on a clean surface.',
      'Warm appetizing light, white or light wood background. No fake labels.',
    ].join(' ');
  }

  if (c.includes('cracker') || c.includes('nimco') || c.includes('confection')) {
    return [
      'Professional snack / confectionery photography.',
      'Show the named snack or sweet clearly, either loose on a plate or in simple unlabeled packaging.',
      'Appetizing color, clean background, catalog lighting.',
    ].join(' ');
  }

  if (c.includes('irani') || c.includes('indian') || c.includes('general')) {
    return [
      'Professional grocery product photography for a South Asian specialty store.',
      'Show the named item as a single hero product on a seamless white background.',
      'If it is typically bottled, boxed, or jarred, show realistic unlabeled packaging of that type.',
    ].join(' ');
  }

  if (c.includes('service') || /delivery|shipping|gift box|bouquet/i.test(productName)) {
    if (/delivery|shipping|charges/i.test(productName)) {
      return [
        'Professional e-commerce photo of a sealed brown cardboard delivery parcel / courier box with simple twine, sitting centered on a seamless white background.',
        'This represents a delivery service listing. Show a physical package, not text, not an invoice, not a store, no people, no readable labels.',
      ].join(' ');
    }
    return [
      'Clean lifestyle product photography of the named item only (for example a flower bouquet or gift box).',
      'Centered, simple background, no people, no storefront, no text.',
    ].join(' ');
  }

  return [
    'Professional e-commerce catalog photography.',
    'The named product is the only subject, centered, well lit, on a clean seamless background.',
  ].join(' ');
}

function buildPrompt(product: ProductRow): string {
  const category = product.category?.name || 'General grocery';
  const facts = [
    `Product name: ${product.name}`,
    `Store: Manpasand, a premium South Asian specialty grocer (spices, herbs, dry fruits, traditional foods, oils).`,
    `Category: ${category}`,
    product.subcategory?.name ? `Subcategory: ${product.subcategory.name}` : null,
    product.brand?.name ? `Brand: ${product.brand.name}` : null,
    product.color?.name ? `Color: ${product.color.name}` : null,
    product.size?.name ? `Size / pack: ${product.size.name}` : null,
    product.unit?.name ? `Sold by: ${product.unit.name}` : null,
    product.is_loose_item ? 'This is typically sold loose / by weight.' : null,
    product.description?.trim() ? `Description: ${product.description.trim()}` : null,
    'If this item is a mineral, salt, crystal, or apothecary chemical (not a food), still generate a realistic product photo of that substance.',
  ]
    .filter(Boolean)
    .join('\n');

  return `Create one photorealistic e-commerce product photograph for the item below.

${facts}

Photography style:
${photographyStyle(category, product.name)}

Hard requirements:
- Accurately depict THIS specific product from the name and details. Do not substitute a similar but different item.
- Square 1:1 catalog photo. Product clearly visible, centered, occupying most of the frame.
- Clean simple background (seamless white, light gray, or light marble). Good studio lighting. Sharp, realistic detail.
- No extra props that could confuse a shopper. No people, hands, tablescapes, kitchens, or busy scenes.
- No watermarks, no promotional banners, no prices, no random text.
- Do not invent logos or copy trademarked packaging. If a commercial brand is named, show a realistic generic unlabeled example of that product type.
- Do not add labels unless they are an inseparable part of the physical object, and even then keep text minimal and unreadable rather than misspelled.
- High quality, commercially attractive, consistent with a premium grocery website.

Output only the photograph.`;
}

function configureCloudinary() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error('Cloudinary credentials are missing from .env');
  }
  cloudinary.config({ cloud_name, api_key, api_secret });
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing from .env');
  }
  return new GoogleGenAI({ apiKey });
}

function extractInlineImage(response: unknown): { mimeType: string; data: string } | null {
  const root = response as Record<string, unknown>;
  const candidates = root.candidates as Array<Record<string, unknown>> | undefined;
  const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
  const parts = (content?.parts as Array<Record<string, unknown>> | undefined)
    ?? (root.parts as Array<Record<string, unknown>> | undefined)
    ?? [];

  for (const part of parts) {
    const inline = (part.inlineData || part.inline_data) as
      | { mimeType?: string; mime_type?: string; data?: string }
      | undefined;
    if (inline?.data) {
      return {
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        data: inline.data,
      };
    }
  }
  return null;
}

async function generateImageBuffer(prompt: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const ai = getGeminiClient();
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GEN_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
        },
      });

      const inline = extractInlineImage(response);
      if (!inline?.data) {
        const text = (response as { text?: string }).text;
        throw new Error(
          `Gemini returned no image${text ? `: ${text.slice(0, 240)}` : ''}`,
        );
      }

      return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || 'image/png',
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`   ⚠️  Generation attempt ${attempt}/${GEN_RETRIES} failed: ${lastError.message}`);
      if (attempt < GEN_RETRIES) await sleep(1500 * attempt);
    }
  }

  throw lastError || new Error('Image generation failed');
}

async function validateImage(buffer: Buffer): Promise<Buffer> {
  if (buffer.length < MIN_IMAGE_BYTES) {
    throw new Error(`Generated file too small (${buffer.length} bytes)`);
  }

  const image = sharp(buffer, { failOn: 'none' });
  const meta = await image.metadata();
  if (!meta.format || !meta.width || !meta.height) {
    throw new Error('Generated file is not a valid image');
  }
  if (meta.width < 256 || meta.height < 256) {
    throw new Error(`Image too small: ${meta.width}x${meta.height}`);
  }

  return image.png({ quality: 90, compressionLevel: 8 }).toBuffer();
}

async function uploadToCloudinary(filePath: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: CLOUDINARY_FOLDER,
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    unique_filename: false,
    transformation: [
      { width: 1400, height: 1400, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
    ],
  });

  if (!result?.secure_url || !result.secure_url.includes('cloudinary.com')) {
    throw new Error('Cloudinary did not return a valid secure URL');
  }
  return result.secure_url;
}

async function attachImageToProduct(
  product: ProductRow,
  url: string,
  options: { replaceOld: boolean; replaceAll: boolean; sharedUrls: Set<string> },
) {
  await prisma.$transaction(async (tx) => {
    if (options.replaceOld) {
      const ids = product.ProductImage
        .filter((img) => img.image !== url)
        .filter(
          (img) => options.replaceAll || isPlaceholderUrl(img.image, options.sharedUrls),
        )
        .map((img) => img.id);

      if (ids.length > 0) {
        await tx.productImage.deleteMany({ where: { id: { in: ids } } });
      }
    }

    const already = await tx.productImage.findFirst({
      where: { product_id: product.id, image: url },
    });
    if (!already) {
      await tx.productImage.create({
        data: {
          product_id: product.id,
          image: url,
          status: 'COMPLETE',
          is_active: true,
        },
      });
    }

    await tx.product.update({
      where: { id: product.id },
      data: { has_images: true },
    });
  });
}

function needsImage(
  product: ProductRow,
  opts: CliOptions,
  sharedUrls: Set<string>,
): boolean {
  if (opts.forceSkus.has(product.sku)) return true;
  if (opts.activeOnly && !product.is_active) return false;
  if (!opts.includeServices && SKIP_NAME_RE.test(product.name)) return false;
  if (hasValidUniqueImage(product, sharedUrls)) return false;

  const hasAnyRow = product.ProductImage.some(
    (img) => img.image?.trim() && img.status !== 'FAILED',
  );

  if (!hasAnyRow) return true;
  if (opts.placeholders || opts.duplicates) return true;
  return false;
}

async function processProduct(
  product: ProductRow,
  opts: CliOptions,
  sharedUrls: Set<string>,
): Promise<{ url: string; file: string }> {
  const stem = safeFileStem(product.name, product.sku);
  const localPath = path.join(OUTPUT_DIR, `${stem}.png`);
  const forced = opts.forceSkus.has(product.sku);

  if (!fs.existsSync(localPath) || forced) {
    const prompt = buildPrompt(product);
    const generated = await generateImageBuffer(prompt);
    const png = await validateImage(generated.buffer);
    fs.writeFileSync(localPath, png);
    console.log(`   💾 Saved local file (${(png.length / 1024).toFixed(0)} KB)`);
  } else {
    console.log('   ↩️  Local file already exists — skipping generation');
  }

  const stat = fs.statSync(localPath);
  if (stat.size < MIN_IMAGE_BYTES) {
    throw new Error('Local image file is too small to upload');
  }

  const url = await uploadToCloudinary(localPath, stem);
  console.log(`   ☁️  Cloudinary: ${url}`);

  await attachImageToProduct(product, url, {
    replaceOld: opts.placeholders || opts.duplicates || forced,
    replaceAll: forced,
    sharedUrls,
  });
  return { url, file: localPath };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  configureCloudinary();

  if (!process.env.GEMINI_API_KEY && !opts.dryRun) {
    throw new Error('GEMINI_API_KEY is not set in Backend/.env');
  }

  const progress = loadProgress();
  const successIds = new Set(progress.success.map((e) => e.id));
  const failedIds = new Set(progress.failed.map((e) => e.id));

  console.log('\n🖼️  Manpasand AI product image generator\n');
  console.log(`   Mode: ${opts.dryRun ? 'dry-run' : 'generate + upload'}`);
  console.log(`   Placeholders: ${opts.placeholders ? 'replace category banners' : 'missing images only'}`);
  console.log(`   Duplicates: ${opts.duplicates ? 'replace URLs used by 2+ products' : 'off'}`);
  if (opts.forceSkus.size > 0) {
    console.log(`   Force SKUs: ${[...opts.forceSkus].join(', ')}`);
  }
  console.log(`   Delay: ${opts.delayMs}ms\n`);

  const products = (await prisma.product.findMany({
    include: {
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      brand: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { name: true } },
      unit: { select: { name: true } },
      ProductImage: { select: { id: true, image: true, status: true } },
    },
    orderBy: { name: 'asc' },
  })) as ProductRow[];

  const urlProducts = new Map<string, Set<string>>();
  for (const p of products) {
    for (const img of p.ProductImage) {
      if (!img.image?.trim() || img.status === 'FAILED') continue;
      if (!urlProducts.has(img.image)) urlProducts.set(img.image, new Set());
      urlProducts.get(img.image)!.add(p.id);
    }
  }
  const sharedUrls = new Set(
    [...urlProducts.entries()].filter(([, ids]) => ids.size >= 2).map(([url]) => url),
  );
  const sharedProductCount = new Set(
    [...urlProducts.entries()]
      .filter(([, ids]) => ids.size >= 2)
      .flatMap(([, ids]) => [...ids]),
  ).size;
  console.log(`🔁 Shared Cloudinary URLs: ${sharedUrls.size} (on ${sharedProductCount} products)`);

  const matching = products.filter((p) => needsImage(p, opts, sharedUrls));
  const skippedValid = products.length - matching.length;

  let queue = matching.filter(
    (p) => opts.forceSkus.has(p.sku) || !successIds.has(p.id),
  );
  if (opts.skipFailed) {
    queue = queue.filter((p) => !failedIds.has(p.id));
  }
  if (opts.retryFailed) {
    queue = matching.filter((p) => failedIds.has(p.id) && !successIds.has(p.id));
  }

  if (opts.limit != null) {
    queue = queue.slice(0, opts.limit);
  }

  console.log(`📦 Catalog: ${products.length}`);
  console.log(`✅ Already have a valid unique image: ${skippedValid}`);
  console.log(`🔎 Matching this run: ${matching.length}`);
  console.log(`⏭️  Already succeeded (resume): ${matching.filter((p) => successIds.has(p.id) && !opts.forceSkus.has(p.sku)).length}`);
  console.log(`📋 Queue now: ${queue.length}\n`);

  if (opts.dryRun) {
    queue.forEach((p, i) => {
      const kind =
        opts.forceSkus.has(p.sku)
          ? 'force'
          : p.ProductImage.length === 0
            ? 'no image'
            : 'shared/placeholder';
      console.log(
        `   ${String(i + 1).padStart(3, ' ')}. [${kind}] ${p.name}  (${p.sku})  — ${p.category?.name ?? 'uncategorized'}`,
      );
    });
    console.log('\nDry run complete. Re-run without --dry-run to generate.\n');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const product = queue[i];
    const label = `[${i + 1}/${queue.length}] ${product.name} (${product.sku})`;
    console.log(`\n${label}`);
    console.log(`   Category: ${product.category?.name ?? '—'} | ${opts.forceSkus.has(product.sku) ? 'force replace' : product.ProductImage.length === 0 ? 'no image' : 'shared/placeholder'}`);

    try {
      const result = await processProduct(product, opts, sharedUrls);
      progress.success = progress.success.filter((e) => e.id !== product.id);
      progress.failed = progress.failed.filter((e) => e.id !== product.id);
      progress.success.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        at: new Date().toISOString(),
        url: result.url,
        file: result.file,
      });
      saveProgress(progress);
      appendLog({ status: 'success', id: product.id, name: product.name, sku: product.sku, url: result.url });
      ok += 1;
      console.log('   ✅ Database updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      progress.failed = progress.failed.filter((e) => e.id !== product.id);
      progress.failed.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        at: new Date().toISOString(),
        error: message.slice(0, 500),
      });
      saveProgress(progress);
      appendLog({ status: 'failed', id: product.id, name: product.name, sku: product.sku, error: message });
      failed += 1;
      console.log(`   ❌ ${message}`);
    }

    if (i < queue.length - 1) {
      await sleep(opts.delayMs);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Done. Success this run: ${ok}  Failed this run: ${failed}`);
  console.log(`Lifetime: ${progress.success.length} succeeded, ${progress.failed.length} failed`);
  console.log(`Progress: ${PROGRESS_PATH}`);
  console.log(`Local images: ${OUTPUT_DIR}`);
  console.log('Re-run the same command to resume or retry failures.\n');
}

main()
  .catch((err) => {
    console.error('\nFatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
