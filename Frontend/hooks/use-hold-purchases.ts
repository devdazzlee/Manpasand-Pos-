import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/apiClient";
import { normalizeBranchId } from "@/lib/branch-utils";
import { API_BASE } from "@/config/constants";

export interface HoldPurchasePayload {
  supplierId?: string;
  warehouseBranchId?: string;
  purchaseDate?: string;
  referenceNumber?: string;
  stockInSource?: string;
  batchNo?: string;
  expiryDate?: string | null;
  notes?: string;
  paymentMode?: "CASH" | "CREDIT" | "MIX";
  paidNowInput?: string;
  settleMethod?: string;
  settleReference?: string;
  paidFromAccountId?: string | null;
  bills?: Array<{
    id: string;
    invoiceRef: string;
    lines: Array<{
      productId: string;
      productName: string;
      sku?: string;
      quantity: number;
      costPrice: number;
    }>;
  }>;
  activeBillId?: string;
}

export interface HoldPurchaseRecord {
  id: string;
  branchId: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  label: string | null;
  lineCount: number;
  createdAt: string;
  payload: HoldPurchasePayload;
}

export function useHoldPurchases(branchIdOverride?: string) {
  const [holdPurchases, setHoldPurchases] = useState<HoldPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const getBranchId = useCallback(() => {
    if (branchIdOverride && branchIdOverride.trim()) {
      return branchIdOverride.trim();
    }
    if (typeof window === "undefined") return "";
    return normalizeBranchId(localStorage.getItem("branch"));
  }, [branchIdOverride]);

  const mapHold = (raw: any): HoldPurchaseRecord => ({
    id: String(raw.id),
    branchId: raw.branch_id || raw.branch?.id || "",
    branchName: raw.branch?.name || "Unknown Branch",
    supplierId: raw.supplier_id || raw.supplier?.id || null,
    supplierName: raw.supplier?.name || null,
    label: raw.label ?? null,
    lineCount: Number(raw.line_count || 0),
    createdAt: raw.created_at || new Date().toISOString(),
    payload: (raw.payload && typeof raw.payload === "object" ? raw.payload : {}) as HoldPurchasePayload,
  });

  const refreshHoldPurchases = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") {
      setHoldPurchases([]);
      return;
    }
    try {
      setLoading(true);
      const response = await apiClient.get(`${API_BASE}/purchases/hold`, {
        params: { branchId },
      });
      const holds = Array.isArray(response?.data?.data)
        ? response.data.data.map(mapHold)
        : [];
      setHoldPurchases(holds);
    } catch (error) {
      console.error("Failed to load hold purchases:", error);
      setHoldPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [getBranchId]);

  useEffect(() => {
    refreshHoldPurchases();
  }, [refreshHoldPurchases]);

  const holdPurchase = useCallback(
    async (payload: HoldPurchasePayload, label?: string) => {
      const branchId = payload.warehouseBranchId || getBranchId();
      if (!branchId || branchId === "Not Found") return false;

      const hasLines =
        Array.isArray(payload.bills) &&
        payload.bills.some((b) => Array.isArray(b.lines) && b.lines.length > 0);
      if (!hasLines) return false;

      try {
        const response = await apiClient.post(`${API_BASE}/purchases/hold`, {
          branchId,
          supplierId: payload.supplierId || null,
          label: label || null,
          payload,
        });
        const created = response?.data?.data ? mapHold(response.data.data) : null;
        if (created) {
          setHoldPurchases((prev) => [created, ...prev]);
          return true;
        }
        await refreshHoldPurchases();
        return true;
      } catch (error) {
        console.error("Failed to hold purchase:", error);
        return false;
      }
    },
    [getBranchId, refreshHoldPurchases],
  );

  const retrieveHoldPurchase = useCallback(
    async (index: number): Promise<HoldPurchaseRecord | null> => {
      if (index < 0 || index >= holdPurchases.length) return null;
      const record = holdPurchases[index];
      const branchId = getBranchId();
      try {
        const response = await apiClient.post(
          `${API_BASE}/purchases/hold/${record.id}/retrieve`,
          { branchId },
        );
        const retrieved = response?.data?.data ? mapHold(response.data.data) : record;
        setHoldPurchases((prev) => prev.filter((item) => item.id !== record.id));
        return retrieved;
      } catch (error) {
        console.error("Failed to retrieve hold purchase:", error);
        return null;
      }
    },
    [getBranchId, holdPurchases],
  );

  const deleteHoldPurchase = useCallback(
    async (index: number) => {
      if (index < 0 || index >= holdPurchases.length) return;
      const record = holdPurchases[index];
      const branchId = getBranchId();
      try {
        await apiClient.delete(`${API_BASE}/purchases/hold/${record.id}`, {
          params: { branchId },
        });
        setHoldPurchases((prev) => prev.filter((item) => item.id !== record.id));
      } catch (error) {
        console.error("Failed to delete hold purchase:", error);
      }
    },
    [getBranchId, holdPurchases],
  );

  return {
    holdPurchases,
    holdPurchase,
    retrieveHoldPurchase,
    deleteHoldPurchase,
    refreshHoldPurchases,
    holdPurchasesLoading: loading,
  };
}
