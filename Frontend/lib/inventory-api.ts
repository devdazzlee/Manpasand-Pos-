import apiClient from "@/lib/apiClient";

export interface InventoryBranchSummary {
  branchId: string;
  name: string;
  value: number;
  items: number;
  type?: string;
}

export interface InventoryCategorySummary {
  name: string;
  value: number;
  items: number;
}

export interface InventoryVelocityItem {
  productId?: string;
  name: string;
  sku?: string;
  quantity: number;
}

export interface InventoryLowStockAlert {
  productId?: string;
  product: { id?: string; name?: string; sku?: string; code?: string } | null;
  branch: { id?: string; name?: string } | null;
  currentQuantity: number;
  minThreshold: number;
}

export interface InventoryPendingTransfer {
  id: string;
  quantity: number;
  status: string;
  transferDate?: string;
  product: { id?: string; name?: string } | null;
  from_branch: { id?: string; name?: string } | null;
  to_branch: { id?: string; name?: string } | null;
}

export interface InventoryRecentPurchase {
  id: string;
  quantity: number;
  costPrice: number;
  purchaseDate?: string;
  product: { id?: string; name?: string } | null;
  supplier: { id?: string; name?: string } | null;
}

export interface InventoryMovementTrend {
  movement_type: string;
  count: number;
  quantity?: number;
  _count?: number;
}

export interface InventoryDashboardStats {
  totalInventoryValue: number;
  positiveInventoryValue: number;
  totalStockQuantity: number;
  negativeStockCount: number;
  lowStockCount: number;
  totalSkus: number;
  outOfStockCount: number;
  totalLocations: number;
  pendingTransferCount: number;
  branchSummary: InventoryBranchSummary[];
  categorySummary: InventoryCategorySummary[];
  velocity: InventoryVelocityItem[];
  recentPurchases: InventoryRecentPurchase[];
  pendingTransfers: InventoryPendingTransfer[];
  lowStockAlerts: InventoryLowStockAlert[];
  movementTrend: InventoryMovementTrend[];
  procurementHealth: { count: number; totalValue: number };
  warehouse: { id: string; name: string } | null;
  filteredBranchId: string | null;
}

export interface BranchOption {
  id: string;
  name: string;
  branch_type?: string;
  is_active?: boolean;
}

function unwrapData<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

export async function fetchInventoryDashboard(
  branchId?: string,
): Promise<InventoryDashboardStats> {
  const res = await apiClient.get("/inventory/dashboard", {
    params: branchId ? { branchId } : {},
  });
  const data = unwrapData<Partial<InventoryDashboardStats>>(res.data);

  return {
    totalInventoryValue: Number(data.totalInventoryValue || 0),
    positiveInventoryValue: Number(
      data.positiveInventoryValue ?? data.totalInventoryValue ?? 0,
    ),
    totalStockQuantity: Number(data.totalStockQuantity || 0),
    negativeStockCount: Number(data.negativeStockCount || 0),
    lowStockCount: Number(
      data.lowStockCount ?? data.lowStockAlerts?.length ?? 0,
    ),
    totalSkus: Number(data.totalSkus || 0),
    outOfStockCount: Number(data.outOfStockCount || 0),
    totalLocations: Number(data.totalLocations || 0),
    pendingTransferCount: Number(
      data.pendingTransferCount ?? data.pendingTransfers?.length ?? 0,
    ),
    branchSummary: Array.isArray(data.branchSummary) ? data.branchSummary : [],
    categorySummary: Array.isArray(data.categorySummary)
      ? data.categorySummary
      : [],
    velocity: Array.isArray(data.velocity) ? data.velocity : [],
    recentPurchases: Array.isArray(data.recentPurchases)
      ? data.recentPurchases
      : [],
    pendingTransfers: Array.isArray(data.pendingTransfers)
      ? data.pendingTransfers
      : [],
    lowStockAlerts: Array.isArray(data.lowStockAlerts)
      ? data.lowStockAlerts
      : [],
    movementTrend: Array.isArray(data.movementTrend) ? data.movementTrend : [],
    procurementHealth: {
      count: Number(data.procurementHealth?.count || 0),
      totalValue: Number(data.procurementHealth?.totalValue || 0),
    },
    warehouse: data.warehouse ?? null,
    filteredBranchId: data.filteredBranchId ?? null,
  };
}

export async function fetchBranchesForFilter(): Promise<BranchOption[]> {
  const res = await apiClient.get("/branches", {
    params: { fetch_all: true },
  });
  const data = unwrapData<BranchOption[]>(res.data);
  return Array.isArray(data) ? data : [];
}
