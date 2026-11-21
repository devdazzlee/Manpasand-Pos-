import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/apiClient";
import { normalizeBranchId } from "@/lib/branch-utils";
import { offlineDB } from "@/lib/offline-db";
import { isNetworkFailure, syncManager } from "@/lib/offline-sync";

interface CartItem {
  id: string;
  name: string;
  barcodeDisplay?: string;
  price: number;
  originalPrice: number;
  actualUnitPrice?: number;
  quantity: number;
  category: string;
  discount?: number;
  unitId?: string;
  unitName?: string;
  unit?: string;
  productId?: string;
}

interface HoldSaleCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

interface HoldSaleRecord {
  id: string;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
  branchId: string;
  branchName: string;
  createdAt: string;
  customerId: string | null;
  customer: HoldSaleCustomer | null;
  offlinePending?: boolean;
}

export function useHoldSales(branchIdOverride?: string) {
  const [holdSales, setHoldSales] = useState<HoldSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const getBranchId = useCallback(() => {
    if (branchIdOverride && branchIdOverride.trim()) {
      return branchIdOverride.trim();
    }

    if (typeof window === "undefined") return "";
    return normalizeBranchId(localStorage.getItem("branch"));
  }, [branchIdOverride]);

  const getBranchName = useCallback(() => {
    if (typeof window === "undefined") return "Branch";
    try {
      const raw = localStorage.getItem("branch");
      if (!raw) return "Branch";
      const parsed = JSON.parse(raw);
      return parsed?.name || "Branch";
    } catch {
      return "Branch";
    }
  }, []);

  const normalizeItem = (item: any): CartItem => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    barcodeDisplay: item.barcodeDisplay ? String(item.barcodeDisplay) : undefined,
    price: Number(item.price || 0),
    originalPrice: Number(item.originalPrice ?? item.price ?? 0),
    actualUnitPrice: Number(item.actualUnitPrice ?? item.price ?? 0),
    quantity: Number(item.quantity || 0),
    category: item.category || "",
    discount: Number(item.discount || 0),
    unitId: item.unitId,
    unitName: item.unitName,
    unit: item.unit,
  });

  const mapHoldSale = (holdSale: any, offlinePending = false): HoldSaleRecord => {
    const customer = holdSale.customer
      ? {
          id: String(holdSale.customer.id),
          name: holdSale.customer.name ?? null,
          email: holdSale.customer.email ?? null,
          phone_number: holdSale.customer.phone_number ?? holdSale.customer.phone ?? null,
          phone: holdSale.customer.phone ?? holdSale.customer.phone_number ?? null,
          is_active: holdSale.customer.is_active,
        }
      : null;
    const customerId =
      holdSale.customer_id ||
      holdSale.customerId ||
      customer?.id ||
      null;

    return {
      id: holdSale.id,
      items: Array.isArray(holdSale.items) ? holdSale.items.map(normalizeItem) : [],
      subtotal: Number(holdSale.subtotal || 0),
      totalItems: Number(holdSale.total_items || holdSale.totalItems || 0),
      branchId: holdSale.branch_id || holdSale.branchId || "",
      branchName: holdSale.branch?.name || holdSale.branchName || "Unknown Branch",
      createdAt: holdSale.created_at || holdSale.createdAt || new Date().toISOString(),
      customerId: customerId ? String(customerId) : null,
      customer,
      offlinePending,
    };
  };

  const loadLocalHolds = useCallback(async (branchId: string): Promise<HoldSaleRecord[]> => {
    const local = await offlineDB.getHoldSalesForBranch(branchId);
    return local.map((row) =>
      mapHoldSale(
        {
          id: row.id,
          items: row.items,
          subtotal: row.subtotal,
          total_items: row.totalItems,
          branch_id: row.branchId,
          branchName: row.branchName,
          created_at: row.createdAt,
          customerId: row.customerId,
          customer: row.customer,
        },
        row.synced === false,
      ),
    );
  }, []);

  const refreshHoldSales = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") {
      setHoldSales([]);
      return;
    }

    try {
      setLoading(true);

      if (!navigator.onLine || !syncManager.canMakeRequest()) {
        setHoldSales(await loadLocalHolds(branchId));
        return;
      }

      try {
        const response = await apiClient.get("/sale/hold", { params: { branchId } });
        const serverHolds = Array.isArray(response?.data?.data) ? response.data.data : [];
        await offlineDB.replaceSyncedHoldSales(branchId, serverHolds);
        setHoldSales(await loadLocalHolds(branchId));
      } catch (error) {
        console.error("Failed to load hold sales from API:", error);
        setHoldSales(await loadLocalHolds(branchId));
      }
    } finally {
      setLoading(false);
    }
  }, [getBranchId, loadLocalHolds]);

  useEffect(() => {
    refreshHoldSales();
  }, [refreshHoldSales]);

  const holdSale = useCallback(async (cart: CartItem[], customerId?: string) => {
    if (!cart.length) return false;

    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") return false;

    const clientHoldId = crypto.randomUUID();
    const branchName = getBranchName();
    let customer: HoldSaleCustomer | null = null;
    if (customerId) {
      const cached = await offlineDB.getCustomer(customerId);
      if (cached) {
        customer = {
          id: cached.id,
          name: cached.name,
          email: cached.email ?? null,
          phone_number: cached.phone ?? cached.data?.phone_number ?? null,
          phone: cached.phone ?? null,
          is_active: cached.data?.is_active !== false,
        };
      } else {
        customer = { id: customerId };
      }
    }

    const offlineRow = await offlineDB.saveHoldSale({
      id: clientHoldId,
      clientHoldId,
      branchId,
      branchName,
      customerId: customerId || null,
      customer,
      items: cart,
      synced: false,
    });

    const tryOnline = navigator.onLine && syncManager.canMakeRequest();
    if (tryOnline) {
      try {
        const response = await apiClient.post("/sale/hold", {
          branchId,
          customerId: customerId || null,
          items: cart,
          clientHoldId,
        });
        const created = response?.data?.data ? mapHoldSale(response.data.data) : null;
        if (created) {
          await offlineDB.markHoldSynced(offlineRow.id, response.data.data);
          setHoldSales((prev) => [created, ...prev.filter((h) => h.id !== offlineRow.id)]);
          return true;
        }
      } catch (error) {
        if (!isNetworkFailure(error)) {
          await offlineDB.deleteHoldSaleLocal(offlineRow.id);
          console.error("Failed to hold sale in DB:", error);
          return false;
        }
        // Network blip — keep local hold and continue offline path.
      }
    }

    const local = mapHoldSale(
      {
        id: offlineRow.id,
        items: offlineRow.items,
        subtotal: offlineRow.subtotal,
        total_items: offlineRow.totalItems,
        branch_id: offlineRow.branchId,
        branchName: offlineRow.branchName,
        created_at: offlineRow.createdAt,
        customerId: offlineRow.customerId,
        customer: offlineRow.customer,
      },
      true,
    );
    setHoldSales((prev) => [local, ...prev.filter((h) => h.id !== local.id)]);
    return true;
  }, [getBranchId, getBranchName]);

  const retrieveHoldSale = useCallback(async (index: number): Promise<HoldSaleRecord | null> => {
    if (index < 0 || index >= holdSales.length) return null;
    const holdSaleRecord = holdSales[index];
    const branchId = getBranchId();

    const finishLocal = async () => {
      await offlineDB.markHoldPendingDelete(holdSaleRecord.id);
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
      return holdSaleRecord;
    };

    if (!navigator.onLine || !syncManager.canMakeRequest() || holdSaleRecord.offlinePending) {
      return finishLocal();
    }

    try {
      const response = await apiClient.post(`/sale/hold/${holdSaleRecord.id}/retrieve`, {
        branchId,
      });
      const retrieved = response?.data?.data ? mapHoldSale(response.data.data) : holdSaleRecord;
      await offlineDB.deleteHoldSaleLocal(holdSaleRecord.id);
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
      return retrieved;
    } catch (error) {
      if (isNetworkFailure(error)) {
        return finishLocal();
      }
      console.error("Failed to retrieve hold sale from DB:", error);
      return null;
    }
  }, [getBranchId, holdSales]);

  const deleteHoldSale = useCallback(async (index: number) => {
    if (index < 0 || index >= holdSales.length) return;
    const holdSaleRecord = holdSales[index];
    const branchId = getBranchId();

    const finishLocal = async () => {
      await offlineDB.markHoldPendingDelete(holdSaleRecord.id);
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
    };

    if (!navigator.onLine || !syncManager.canMakeRequest() || holdSaleRecord.offlinePending) {
      await finishLocal();
      return;
    }

    try {
      await apiClient.delete(`/sale/hold/${holdSaleRecord.id}`, {
        data: { branchId },
      });
      await offlineDB.deleteHoldSaleLocal(holdSaleRecord.id);
      setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
    } catch (error) {
      if (isNetworkFailure(error)) {
        await finishLocal();
        return;
      }
      console.error("Failed to delete hold sale from DB:", error);
    }
  }, [getBranchId, holdSales]);

  const clearAllHoldSales = useCallback(async () => {
    const snapshot = [...holdSales];
    const branchId = getBranchId();
    for (const hold of snapshot) {
      // eslint-disable-next-line no-await-in-loop
      await offlineDB.markHoldPendingDelete(hold.id);
      if (navigator.onLine && syncManager.canMakeRequest() && !hold.offlinePending) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await apiClient.delete(`/sale/hold/${hold.id}`, {
            data: { branchId },
          });
          // eslint-disable-next-line no-await-in-loop
          await offlineDB.deleteHoldSaleLocal(hold.id);
        } catch {
          /* pending delete kept for sync */
        }
      }
    }
    setHoldSales([]);
  }, [getBranchId, holdSales]);

  return {
    holdSales,
    holdSale,
    retrieveHoldSale,
    deleteHoldSale,
    clearAllHoldSales,
    refreshHoldSales,
    holdSalesLoading: loading,
  };
}
