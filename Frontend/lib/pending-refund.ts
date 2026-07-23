/** Cross-tab handoff: Sales History → Returns (survives React Strict Mode remounts). */

export type PendingRefundLookup = {
  saleId: string;
  saleNumber: string;
};

let pendingRefund: PendingRefundLookup | null = null;

export function queuePendingRefund(sale: { id: string; sale_number: string }) {
  pendingRefund = { saleId: sale.id, saleNumber: sale.sale_number };
  try {
    sessionStorage.setItem("returns_lookup_sale_id", sale.id);
    sessionStorage.setItem("returns_lookup_sale", sale.sale_number);
  } catch {
    /* ignore */
  }
}

export function getPendingRefund(): PendingRefundLookup | null {
  if (pendingRefund?.saleId) return pendingRefund;
  try {
    const saleId = sessionStorage.getItem("returns_lookup_sale_id");
    const saleNumber = sessionStorage.getItem("returns_lookup_sale");
    if (saleId) {
      return { saleId, saleNumber: saleNumber || "" };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPendingRefund() {
  pendingRefund = null;
  try {
    sessionStorage.removeItem("returns_lookup_sale_id");
    sessionStorage.removeItem("returns_lookup_sale");
  } catch {
    /* ignore */
  }
}
