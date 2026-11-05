import { API_BASE } from "@/config/constants";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { approvalHeaders, requestApproval } from "@/lib/approval";
import { getActiveBranchScope } from "@/lib/branch-scope";

/**
 * API areas whose data belongs to a branch and whose endpoints accept a
 * branch filter. Company-wide data (branches, catalog, suppliers, tax, users…)
 * is deliberately absent, so dropdown lists are never cut down to one branch.
 */
const BRANCH_SCOPED_API = [
  "/dashboard", "/reports", "/sales-report", "/register-report", "/sale", "/cash-register", "/till",
  "/expenses", "/products", "/stock", "/stock-out", "/stock-adjustments", "/stock-imports", "/transfers",
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

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes – large base64 image payloads need more time
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token and prevent stale HTTP cache hits.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Back-office branch scope (admin header switcher): scope every read of
    // branch-specific data to the chosen branch, unless the caller already
    // asked for a specific branch. Writes are never touched.
    const scope = getActiveBranchScope();
    if (scope && (config.method ?? "get").toLowerCase() === "get" && isBranchScopedUrl(config.url)) {
      const params = (config.params ?? {}) as Record<string, unknown>;
      if (params.branchId == null && params.branch_id == null && !/[?&]branch_?[iI]d=/.test(config.url ?? "")) {
        config.params = { ...params, branchId: scope, branch_id: scope };
      }
    }

    // Cache busting is handled via `_t` query params and server response headers.
    // Do NOT set Cache-Control on requests — it triggers CORS preflight and is
    // not listed in the backend allowedHeaders, which blocks all API calls.

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor.
//
// Intentionally does NOT auto-logout on 401. The backend issues JWTs with no
// expiration (see auth.service.ts / customer.service.ts), so the user should
// remain signed in until they explicitly click Logout. A spurious 401 from a
// single endpoint — Redis blip, a misconfigured route, etc. — must not wipe
// the session and reload the whole app. The 401 still bubbles up to the
// caller so individual screens can render their own error states.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    // Restricted action (discount, void, refund, cash out…): ask a manager to
    // approve, then replay the same request with their credentials attached.
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
