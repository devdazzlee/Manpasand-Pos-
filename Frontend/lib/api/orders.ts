import { getOne, post, put, del, cleanParams } from "./http";
import apiClient from "@/lib/apiClient";

export interface OrderItem {
  productId: string;
  quantity: number;
  product: { name: string };
}

export interface Order {
  id: string;
  order_number: string;
  total_amount: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

export interface OrderQuery {
  status?: string;
}

export interface CreateOrderBody {
  customerId: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}

/**
 * The `/order` list endpoint answers `{ data: { data: Order[] } }` (double
 * nested) rather than the usual envelope, so it is unwrapped by hand here.
 */
export async function fetchOrders(q: OrderQuery = {}, signal?: AbortSignal): Promise<Order[]> {
  const res = await apiClient.get("/order", { params: cleanParams({ status: q.status }), signal });
  return res.data?.data?.data ?? res.data?.data ?? [];
}

export function fetchOrderById(id: string, signal?: AbortSignal): Promise<Order> {
  return getOne<Order>(`/order/${id}`, { signal });
}

export function createOrder(body: CreateOrderBody) {
  return post<Order>("/order", body);
}

export function updateOrderStatus(id: string, status: string) {
  return apiClient.patch(`/order/${id}/status`, { status }).then((r) => r.data);
}

export function cancelOrder(id: string) {
  return del<void>(`/order/${id}`);
}
