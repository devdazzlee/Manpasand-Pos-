import apiClient from "@/lib/apiClient";
import { post, put, del } from "./http";

/** Employee types (a.k.a. "designations") — reference lookup data. */
export interface EmployeeType {
  id: string;
  name: string;
  is_active: boolean;
  employee_count?: number;
  [key: string]: unknown;
}

/** `GET /employee/types` — flat array, no pagination. */
export async function fetchEmployeeTypes(signal?: AbortSignal): Promise<EmployeeType[]> {
  const res = await apiClient.get("/employee/types", { signal });
  const raw = res.data?.data;
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}

export type EmployeeTypePayload = Record<string, unknown>;

export function createEmployeeType(body: EmployeeTypePayload) {
  return post<EmployeeType>("/employee/type", body);
}

export function updateEmployeeType(id: string, body: EmployeeTypePayload) {
  return put<EmployeeType>(`/employee/type/${id}`, body);
}

export function deleteEmployeeType(id: string) {
  return del<void>(`/employee/type/${id}`);
}

export function toggleEmployeeTypeStatus(id: string) {
  return apiClient
    .patch(`/employee/type/${id}/toggle-status`)
    .then((r) => r.data);
}
