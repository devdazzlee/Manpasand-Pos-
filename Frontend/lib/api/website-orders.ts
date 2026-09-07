import apiClient from "@/lib/apiClient";
import { getOne, del, cleanParams } from "./http";

/**
 * Guest / website checkout orders. Rows are screen-shaped (weight parsing,
 * delivery fields, several key spellings) so they stay loosely typed here and
 * the screen normalises them.
 */
export interface WebsiteOrderRecord {
  id: string;
  order_number?: string;
  status?: string;
  [key: string]: unknown;
}

export interface WebsiteOrdersQuery {
  status?: string;
}

/**
 * `GET /guest/order` — the old screen always sent `page=1` and `pageSize=500`
 * and did its own client-side filter / sort / paginate over the full pull.
 * The response is double-nested: `{ data: { data: Order[] } }`.
 */
export async function fetchWebsiteOrders(
  q: WebsiteOrdersQuery,
  signal?: AbortSignal,
): Promise<WebsiteOrderRecord[]> {
  const res = await apiClient.get("/guest/order", {
    params: cleanParams({ status: q.status, page: "1", pageSize: "500" }),
    signal,
  });
  const raw = res.data?.data?.data ?? res.data?.data ?? [];
  return Array.isArray(raw) ? raw : [];
}

export function fetchWebsiteOrderById(
  id: string,
  signal?: AbortSignal,
): Promise<WebsiteOrderRecord> {
  return getOne<WebsiteOrderRecord>(`/guest/order/${id}`, { signal });
}

export function updateWebsiteOrderStatus(id: string, status: string) {
  return apiClient.patch(`/order/${id}/status`, { status }).then((r) => r.data);
}

export function reopenWebsiteOrder(id: string) {
  return apiClient.patch(`/order/${id}/reopen`).then((r) => r.data);
}

export function deleteWebsiteOrder(id: string) {
  return del<void>(`/order/${id}`);
}
