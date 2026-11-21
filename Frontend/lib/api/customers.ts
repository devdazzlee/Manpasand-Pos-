import { getList, getOne, post, put, del, cleanParams, type ListResult } from "./http";
import { offlineDB } from "@/lib/offline-db";
import { isNetworkFailure, syncManager } from "@/lib/offline-sync";

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  default_discount_percent?: number | string | null;
  // Lifetime loyalty/giveaway-winner discount — see Customer.is_loyalty_winner
  // in the backend schema.
  is_loyalty_winner?: boolean;
  loyalty_cnic?: string | null;
  loyalty_branch_id?: string | null;
  loyalty_discount_percent?: number | string | null;
  loyalty_discount_cap?: number | string | null;
  loyalty_monthly_limit?: number | null;
  loyalty_registered_at?: string | null;
  [key: string]: unknown;
}

export interface LoyaltyStatus {
  isWinner: boolean;
  eligible: boolean;
  reason: string | null;
  discountPercent?: number;
  discountCap?: number;
  monthlyLimit?: number;
  usedThisMonth?: number | null;
  offlineEstimate?: boolean;
}

export interface CustomerQuery {
  search?: string;
  page?: number;
  limit?: number;
  isActive?: boolean;
  createdAfter?: string;
  isLoyaltyWinner?: boolean;
}

function rowToCustomer(row: {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  data?: any;
}): Customer {
  const data = row.data || {};
  return {
    ...data,
    id: row.id,
    name: data.name || row.name,
    email: data.email || row.email,
    phone: data.phone_number || data.phone || row.phone,
    phone_number: data.phone_number || data.phone || row.phone,
    is_active: data.is_active !== false,
  };
}

async function fetchCustomersOffline(q: CustomerQuery): Promise<ListResult<Customer>> {
  const limit = q.limit ?? 20;
  const rows = await offlineDB.searchCustomers(q.search || "", limit * 3);
  let customers = rows.map(rowToCustomer);
  if (q.isActive === true) {
    customers = customers.filter((c) => c.is_active !== false);
  } else if (q.isActive === false) {
    customers = customers.filter((c) => c.is_active === false);
  }
  if (q.isLoyaltyWinner === true) {
    customers = customers.filter((c) => Boolean(c.is_loyalty_winner));
  }
  customers = customers.slice(0, limit);
  return {
    data: customers,
    meta: {
      total: customers.length,
      page: q.page ?? 1,
      limit,
      totalPages: 1,
    },
  };
}

export async function fetchCustomers(
  q: CustomerQuery,
  signal?: AbortSignal,
): Promise<ListResult<Customer>> {
  const offlineFirst = typeof navigator !== "undefined" && !navigator.onLine;

  if (offlineFirst || !syncManager.canMakeRequest()) {
    return fetchCustomersOffline(q);
  }

  try {
    const result = await getList<Customer>(
      "/customer",
      cleanParams({
        page: q.page ?? 1,
        limit: q.limit ?? 20,
        is_loyalty_winner: q.isLoyaltyWinner,
        search: q.search?.trim() || undefined,
        is_active: q.isActive,
        created_after: q.createdAfter,
      }),
      signal,
    );

    // Merge freshly created offline customers so the picker still sees them.
    const pending = await offlineDB.getUnsyncedCustomers();
    if (pending.length) {
      const pendingCustomers = pending.map(rowToCustomer);
      const search = q.search?.trim().toLowerCase();
      const filteredPending = search
        ? pendingCustomers.filter(
            (c) =>
              c.name?.toLowerCase().includes(search) ||
              String(c.phone || c.phone_number || "").includes(search),
          )
        : pendingCustomers;
      const seen = new Set(result.data.map((c) => c.id));
      result.data = [
        ...filteredPending.filter((c) => !seen.has(c.id)),
        ...result.data,
      ].slice(0, q.limit ?? 20);
    }

    if (result.data.length) {
      void offlineDB.saveCustomers(result.data);
    }
    return result;
  } catch (error) {
    if (isNetworkFailure(error)) {
      return fetchCustomersOffline(q);
    }
    throw error;
  }
}

export async function fetchCustomerPurchases(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/purchases`, { signal });
}

export async function fetchCustomerLedger(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/ledger`, { signal });
}

export interface StatementRange {
  from?: string;
  to?: string;
}

export async function fetchCustomerStatement(
  id: string,
  range: StatementRange = {},
  signal?: AbortSignal,
) {
  return getOne<any>(`/customer/${id}/statement`, {
    params: cleanParams({ from: range.from, to: range.to }),
    signal,
  });
}

export async function fetchCustomerActivity(id: string, signal?: AbortSignal) {
  return getOne<any>(`/customer/${id}/activity`, { params: { limit: 50 }, signal });
}

function estimateLoyaltyFromCustomer(
  customer: Customer | null | undefined,
  branchId: string | undefined,
  cached?: LoyaltyStatus | null,
): LoyaltyStatus {
  if (cached) {
    return { ...cached, offlineEstimate: true };
  }

  if (!customer?.is_loyalty_winner) {
    return { isWinner: false, eligible: false, reason: null, offlineEstimate: true };
  }

  const percent = Number(customer.loyalty_discount_percent ?? 25);
  const cap = Number(customer.loyalty_discount_cap ?? 3000);
  const monthlyLimit = customer.loyalty_monthly_limit ?? 4;

  if (!customer.loyalty_branch_id || customer.loyalty_branch_id !== branchId) {
    return {
      isWinner: true,
      eligible: false,
      reason: "Not valid at this branch",
      discountPercent: percent,
      discountCap: cap,
      monthlyLimit,
      usedThisMonth: null,
      offlineEstimate: true,
    };
  }

  // Monthly usage can't be verified offline; show eligible from cached winner
  // fields. Server recomputes on sale sync and may drop the discount if the
  // monthly cap was already reached.
  return {
    isWinner: true,
    eligible: true,
    reason: null,
    discountPercent: percent,
    discountCap: cap,
    monthlyLimit,
    usedThisMonth: null,
    offlineEstimate: true,
  };
}

export async function fetchCustomerLoyaltyStatus(
  id: string,
  branchId: string | undefined,
  signal?: AbortSignal,
): Promise<LoyaltyStatus> {
  const cacheKey = `loyalty:${id}:${branchId || ""}`;

  const loadOfflineEstimate = async (): Promise<LoyaltyStatus> => {
    const cached = (await offlineDB.getCachedData(cacheKey)) as LoyaltyStatus | null;
    const row = await offlineDB.getCustomer(id);
    const customer = row ? rowToCustomer(row) : null;
    return estimateLoyaltyFromCustomer(customer, branchId, cached);
  };

  if (
    offlineDB.isOfflineCustomerId(id) ||
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    !syncManager.canMakeRequest()
  ) {
    return loadOfflineEstimate();
  }

  try {
    const status = await getOne<LoyaltyStatus>(`/customer/${id}/loyalty-status`, {
      params: cleanParams({ branchId }),
      signal,
    });
    // Cache for offline till reopen / brief outages (24h).
    await offlineDB.setCachedData(cacheKey, status, 24 * 60 * 60 * 1000);
    return status;
  } catch (error) {
    if (isNetworkFailure(error)) {
      return loadOfflineEstimate();
    }
    throw error;
  }
}

/** Mutation payloads are screen-shaped; keep them loose but explicit. */
export type CustomerPayload = Record<string, unknown>;

export async function createCustomer(body: CustomerPayload) {
  const tryOnline = typeof navigator === "undefined" || (navigator.onLine && syncManager.canMakeRequest());

  if (tryOnline) {
    try {
      const created = await post<any>("/customer", body);
      const customer = (created?.customer ?? created) as Customer;
      if (customer?.id) {
        await offlineDB.saveCustomers([customer]);
      }
      return created as Customer;
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      // fall through to offline create
    }
  }

  const pending = await offlineDB.savePendingCustomer({
    name: String(body.name || ""),
    phone_number: body.phone_number ? String(body.phone_number) : undefined,
    email: body.email ? String(body.email) : undefined,
    address: body.address ? String(body.address) : undefined,
    default_discount_percent:
      body.default_discount_percent === undefined || body.default_discount_percent === null
        ? undefined
        : Number(body.default_discount_percent),
    is_active: body.is_active !== false,
  });

  // Match online shape: `{ customer }` so New Sale can select immediately.
  return { customer: pending } as unknown as Customer;
}

export async function updateCustomer(id: string, body: CustomerPayload) {
  return put<Customer>(`/customer/${id}`, body);
}

export async function deleteCustomer(id: string) {
  return del<void>(`/customer/${id}`);
}

export async function createCustomerPayment(id: string, body: CustomerPayload) {
  return post<unknown>(`/customer/${id}/payments`, body);
}

export async function deleteCustomerPayment(id: string, paymentId: string) {
  return del<void>(`/customer/${id}/payments/${paymentId}`);
}
