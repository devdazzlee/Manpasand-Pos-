export const ALL_BRANCHES = "__all_branches__";
export const ALL_CATEGORIES = "__all_categories__";
export const ALL_BRANDS = "__all_brands__";
export const ALL_SUPPLIERS = "__all_suppliers__";
export const ALL_STOCK_STATUS = "__all_stock_status__";

export const STOCK_STATUS_OPTIONS = [
  { value: ALL_STOCK_STATUS, label: "All statuses" },
  { value: "in", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "negative", label: "Negative stock" },
] as const;

export const STOCK_IN_SOURCES = [
  { value: "PURCHASE_ORDER", label: "Purchase Order" },
  { value: "SUPPLIER_DELIVERY", label: "Supplier Delivery" },
  { value: "CUSTOMER_RETURN", label: "Customer Return" },
  { value: "OPENING_STOCK", label: "Opening Stock" },
  { value: "ADJUSTMENT", label: "Inventory Adjustment" },
  { value: "PRODUCTION", label: "Manufacturing / Production" },
] as const;

export const STOCK_OUT_REASONS = [
  { value: "DAMAGE", label: "Damaged Products" },
  { value: "EXPIRED", label: "Expired Products" },
  { value: "LOSS", label: "Internal Consumption / Lost / Stolen" },
  { value: "RETURN", label: "Supplier Return" },
  { value: "SALE", label: "Sale / Dispatch" },
] as const;

export const INVENTORY_REPORT_LINKS = [
  { tab: "inventory-reports", report: "valuation", label: "Inventory Valuation" },
  { tab: "inventory-reports", report: "movement_summary", label: "Stock Movement Report" },
  { tab: "inventory-reports", report: "lowstock", label: "Low Stock Report" },
  { tab: "inventory-reports", report: "stockout", label: "Out of Stock Report" },
  { tab: "inventory-reports", report: "aging", label: "Dead / Slow Stock" },
  { tab: "inventory-reports", report: "transfer", label: "Transfer Report" },
  { tab: "stock-movement-log", label: "Stock Ledger" },
  { tab: "inventory-audit", label: "Audit Trail" },
] as const;
