import { API_BASE } from "@/config/constants";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { approvalHeaders, requestApproval } from "@/lib/approval";
import { getActiveBranchScope } from "@/lib/branch-scope";
import { cacheKeyFor, readCachedResponse, saveResponse } from "@/lib/offline/http-cache";
import {
  isNetworkError,
  isOnline,
  reportServerReachable,
  reportServerUnreachable,
} from "@/lib/offline/network";

/**
 * API areas whose data belongs to a branch and whose endpoints accept a
 * branch filter. Company-wide data (branches, catalog, suppliers, tax, users…)
 * is deliberately absent, so dropdown lists are never cut down to one branch.
 */
const BRANCH_SCOPED_API = [
  "/dashboard", "/reports", "/sales-report", "/register-report", "/sale", "/cash-register", "/till",
  "/expenses", "/products", "/stock", "/stock-out", "/stock-adjustments", "/stock-assemblies", "/stock-imports", "/transfers",
  "/purchases", "/purchase-orders", "/purchase-invoices", "/purchase-returns", "/purchase-report",
  "/inventory", "/stock-quantity-report", "/product-sales-profit", "/commissions", "/payroll",
  "/financial-statement", "/profit-loss", "/balance-sheet", "/trial-balance", "/chart-of-accounts",
  "/finance", "/analytics", "/order", "/employee", "/salaries", "/shift-assignment", "/audit",
];

function isBranchScopedUrl(url?: string): boolean {
  if (!url) return false;
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v\d+/, "").split("?")[0];
  return BRANCH_SCOPED_API.some((p) => path === p || path.startsWith(`${p}/`));
}

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");

    // Sync engine may send a specific cashier's token.
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const scope = getActiveBranchScope();
    if (scope && (config.method ?? "get").toLowerCase() === "get" && isBranchScopedUrl(config.url)) {
      const params = (config.params ?? {}) as Record<string, unknown>;
      if (params.branchId == null && params.branch_id == null && !/[?&]branch_?[iI]d=/.test(config.url ?? "")) {
        config.params = { ...params, branchId: scope, branch_id: scope };
      }
    }

    // Known offline: answer GET from IndexedDB cache immediately.
    const key = cacheKeyFor(config);
    (config as any).offlineKey = key;
    if (key && !isOnline()) {
      const cached = await readCachedResponse(key, config);
      if (cached) config.adapter = async () => cached;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    reportServerReachable();
    const key = (response.config as any)?.offlineKey as string | null | undefined;
    if (key && (response.config.method ?? "get").toLowerCase() === "get") {
      void saveResponse(key, response);
    }
    return response;
  },
  async (error) => {
    if (isNetworkError(error)) {
      reportServerUnreachable();
      const key = error?.config ? ((error.config as any).offlineKey ?? cacheKeyFor(error.config)) : null;
      if (key && error.config) {
        const cached = await readCachedResponse(key, error.config);
        if (cached) return cached;
      }
    }

    const info = error?.response?.status === 403 ? error.response.data?.errors?.[0] : null;
    const config = error?.config as (InternalAxiosRequestConfig & { __approvalAttempts?: number }) | undefined;
    if (info && (info.code === "APPROVAL_REQUIRED" || info.code === "APPROVAL_INVALID") && config && typeof window !== "undefined") {
      const attempts = config.__approvalAttempts ?? 0;
      if (attempts < 3) {
        const creds = await requestApproval({
          label: info.label || "do this",
          message: info.message,
          error: info.code === "APPROVAL_INVALID" ? error.response.data?.message : undefined,
        });
        if (creds) {
          config.__approvalAttempts = attempts + 1;
          Object.entries(approvalHeaders(creds)).forEach(([k, v]) => config.headers.set(k, v));
          return apiClient.request(config);
        }
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
