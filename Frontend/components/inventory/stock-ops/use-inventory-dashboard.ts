"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchInventoryDashboard,
  type InventoryDashboardStats,
} from "@/lib/inventory-api";

export type { InventoryDashboardStats };

export interface InventoryDashboardKpis {
  totalInventoryValue: number;
  totalStockQuantity: number;
  negativeStockCount: number;
  lowStockCount: number;
  totalSkus: number;
  outOfStockCount: number;
  totalLocations: number;
  pendingTransferCount: number;
}

const EMPTY: InventoryDashboardKpis = {
  totalInventoryValue: 0,
  totalStockQuantity: 0,
  negativeStockCount: 0,
  lowStockCount: 0,
  totalSkus: 0,
  outOfStockCount: 0,
  totalLocations: 0,
  pendingTransferCount: 0,
};

function toKpis(data: InventoryDashboardStats): InventoryDashboardKpis {
  return {
    totalInventoryValue: data.totalInventoryValue,
    totalStockQuantity: data.totalStockQuantity,
    negativeStockCount: data.negativeStockCount,
    lowStockCount: data.lowStockCount,
    totalSkus: data.totalSkus,
    outOfStockCount: data.outOfStockCount,
    totalLocations: data.totalLocations,
    pendingTransferCount: data.pendingTransferCount,
  };
}

export function useInventoryDashboard(branchId?: string) {
  const [stats, setStats] = useState<InventoryDashboardKpis>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInventoryDashboard(branchId);
      setStats(toKpis(data));
    } catch {
      setStats(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
