/**
 * Cost data is owner-level. Branch accounts (manager / supervisor / cashier)
 * must never receive purchase prices, unit costs or cost-based stock values.
 *
 * Applied to every JSON response for those roles (see auth middleware), so a
 * new endpoint or a new `include` can't leak cost by accident.
 *
 *  - Cost fields are removed outright.
 *  - Aggregates that carry both a cost `value` and a `retail` value (inventory
 *    dashboard: by branch / category / top items) keep the shape the screens
 *    expect, but `value` becomes the retail figure.
 */
const COST_KEYS = new Set([
  'purchase_rate',
  'cost_price',
  'unit_cost',
  'unitCost',
  'costPrice',
  'weighted_avg_cost',
  'weightedAvgCost',
  'latest_cost',
  'latestCost',
  'last_cost',
  'avg_cost',
  'firstCost',
  'minCost',
  'maxCost',
  'stockCost',
  'cogs',
  'cost_of_goods',
  'totalInventoryValue',
  'deadStockValue',
  'potentialProfit',
  'procurementHealth',
  'positiveInventoryValue',
  'inventoryValue',
  'excessValue',
  'valueGained',
  'valueLost',
  'netValue',
  'margin',
  'marginPct',
  'profit',
  'grossProfit',
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

export function stripCost<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripCost(v)) as unknown as T;
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  const swapValueForRetail = 'retail' in value && 'value' in value;
  for (const [key, child] of Object.entries(value)) {
    if (COST_KEYS.has(key)) continue;
    if (swapValueForRetail && key === 'value') {
      out.value = value.retail;
      continue;
    }
    out[key] = stripCost(child);
  }
  return out as T;
}
