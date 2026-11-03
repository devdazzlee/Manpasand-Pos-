/**
 * Public (customer-facing) view of catalog data.
 *
 * Anything served without a staff login — the website, the customer app —
 * must go through this. It removes internal business data at any depth, so a
 * new `include` added to a query later can't silently re-expose costs:
 *
 *  - cost:      purchase_rate, cost_price, unit_cost, weighted/latest costs
 *  - sourcing:  supplier_id and the supplier relation
 *  - history:   purchase / price / cost history and stock-movement relations
 *
 * Sale price, images, category, brand, availability etc. are kept.
 */
const INTERNAL_KEYS = new Set([
  'purchase_rate',
  'cost_price',
  'unit_cost',
  'weighted_avg_cost',
  'weightedAvgCost',
  'latest_cost',
  'latestCost',
  'last_cost',
  'avg_cost',
  'supplier_id',
  'supplier',
  'purchases',
  'purchase_order_items',
  'purchase_return_items',
  'price_history',
  'stock_movements',
  'stock_adjustments',
  'stock_import_lines',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  // Prisma Decimal and other class instances are values, not records to walk.
  Object.getPrototypeOf(value) === Object.prototype;

export function toPublicCatalog<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => toPublicCatalog(item)) as unknown as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (INTERNAL_KEYS.has(key)) continue;
    out[key] = toPublicCatalog(child);
  }
  return out as T;
}
