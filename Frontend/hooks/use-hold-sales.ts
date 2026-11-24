import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/apiClient";
import { normalizeBranchId } from "@/lib/branch-utils";
import { pendingPayloads } from "@/lib/offline/local-effects";
import { deleteHoldSaleOffline, holdSaleOffline } from "@/lib/offline/mutations";

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

  const mapHoldSale = (holdSale: any): HoldSaleRecord => {
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
      holdSale.customer_id || holdSale.customerId || customer?.id || null;

    return {
      id: holdSale.id,
      items: Array.isArray(holdSale.items) ? holdSale.items.map(normalizeItem) : [],
      subtotal: Number(holdSale.subtotal || 0),
      totalItems: Number(holdSale.total_items || holdSale.items?.length || 0),
      branchId: holdSale.branch_id || holdSale.branchId || getBranchId(),
      branchName: holdSale.branch?.name || "Unknown Branch",
      createdAt: holdSale.created_at || holdSale.createdAt || new Date().toISOString(),
      customerId: customerId ? String(customerId) : null,
      customer,
    };
  };

  const holdFromPayload = (payload: any): HoldSaleRecord => {
    const items = Array.isArray(payload.items) ? payload.items.map(normalizeItem) : [];
    return {
      id: payload.id,
      items,
      subtotal: items.reduce(
        (sum: number, item: CartItem) => sum + (item.actualUnitPrice || item.price) * item.quantity,
        0,
      ),
      totalItems: items.length,
      branchId: payload.branchId || getBranchId(),
      branchName: "This till",
      createdAt: payload._entry?.createdAt || new Date().toISOString(),
      customerId: payload.customerId || null,
      customer: null,
    };
  };

  const refreshHoldSales = useCallback(async () => {
    const branchId = getBranchId();
    if (!branchId || branchId === "Not Found") {
      setHoldSales([]);
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.get("/sale/hold", { params: { branchId } });
      const holds: HoldSaleRecord[] = Array.isArray(response?.data?.data)
        ? response.data.data.map(mapHoldSale)
        : [];
      const [created, deleted] = await Promise.all([
        pendingPayloads("holdSale.create"),
        pendingPayloads<{ id: string }>("holdSale.delete"),
      ]);
      const deletedIds = new Set(deleted.map((d) => d.id));
      const known = new Set(holds.map((h) => h.id));
      const localOnly = created
        .filter((c: any) => !known.has(c.id))
        .map(holdFromPayload);
      setHoldSales([...localOnly.reverse(), ...holds].filter((h) => !deletedIds.has(h.id)));
    } catch (error) {
      console.error("Failed to load hold sales from API:", error);
      try {
        const created = await pendingPayloads("holdSale.create");
        setHoldSales(created.map(holdFromPayload).reverse());
      } catch {
        setHoldSales([]);
      }
    } finally {
      setLoading(false);
    }
  }, [getBranchId]);

  useEffect(() => {
    refreshHoldSales();
  }, [refreshHoldSales]);

  const holdSale = useCallback(
    async (cart: CartItem[], customerId?: string) => {
      if (!cart.length) return false;
      const branchId = getBranchId();
      if (!branchId || branchId === "Not Found") return false;

      try {
        const subtotal = cart.reduce(
          (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
          0,
        );
        const { id, outcome } = await holdSaleOffline({
          customerId,
          items: cart.map((c) => ({ ...c })) as any,
          subtotal,
          branchId,
        });
        const created =
          outcome.status === "synced" && (outcome.data as any)?.id
            ? mapHoldSale(outcome.data)
            : holdFromPayload({ id, customerId, items: cart, branchId });
        setHoldSales((prev) => [created, ...prev.filter((h) => h.id !== created.id)]);
        return true;
      } catch (error) {
        console.error("Failed to hold sale:", error);
        return false;
      }
    },
    [getBranchId],
  );

  const retrieveHoldSale = useCallback(
    async (index: number): Promise<HoldSaleRecord | null> => {
      if (index < 0 || index >= holdSales.length) return null;
      const holdSaleRecord = holdSales[index];
      try {
        await deleteHoldSaleOffline(holdSaleRecord.id);
        setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
        return holdSaleRecord;
      } catch (error) {
        console.error("Failed to retrieve hold sale:", error);
        return null;
      }
    },
    [holdSales],
  );

  const deleteHoldSale = useCallback(
    async (index: number) => {
      if (index < 0 || index >= holdSales.length) return;
      const holdSaleRecord = holdSales[index];
      try {
        await deleteHoldSaleOffline(holdSaleRecord.id);
        setHoldSales((prev) => prev.filter((item) => item.id !== holdSaleRecord.id));
      } catch (error) {
        console.error("Failed to delete hold sale:", error);
      }
    },
    [holdSales],
  );

  const clearAllHoldSales = useCallback(async () => {
    const holdIds = holdSales.map((sale) => sale.id);
    for (const holdId of holdIds) {
      try {
        await deleteHoldSaleOffline(holdId);
      } catch (error) {
        console.error("Failed to delete hold sale:", error);
      }
    }
    setHoldSales([]);
  }, [holdSales]);

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
