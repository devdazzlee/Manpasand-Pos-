"use client";

import { useCallback, useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";

export interface InventoryDashboardStats {
  totalInventoryValue: number;
  totalStockQuantity: number;
  negativeStockCount: number;
  lowStockCount: number;
  totalSkus: number;
  outOfStockCount: number;
  totalLocations: number;
  pendingTransferCount: number;
}

const EMPTY: InventoryDashboardStats = {
  totalInventoryValue: 0,
  totalStockQuantity: 0,
  negativeStockCount: 0,
  lowStockCount: 0,
  totalSkus: 0,
  outOfStockCount: 0,
  totalLocations: 0,
  pendingTransferCount: 0,
};

export function useInventoryDashboard() {
  const [stats, setStats] = useState<InventoryDashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/inventory/dashboard`);
      const data = res.data?.data ?? res.data ?? {};
      setStats({
        totalInventoryValue: Number(data.totalInventoryValue || 0),
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
      });
    } catch {
      setStats(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
