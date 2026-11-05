export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "BRANCH_MANAGER"
  | "WAREHOUSE_MANAGER"
  | "PURCHASE_MANAGER"
  | "SUPERVISOR"
  | "CASHIER"
  | "INVENTORY_VIEWER";

const KNOWN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BRANCH_MANAGER",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
  "SUPERVISOR",
  "CASHIER",
  "INVENTORY_VIEWER",
];

/** View-only account: products and stock, no changes. */
export const isReadOnlyRole = (role?: string | null) => role === "INVENTORY_VIEWER";

/**
 * Inventory screens are view-only for this role: the inventory viewer, and
 * branch accounts (manager / supervisor / cashier), whose stock is changed
 * centrally. The server enforces the same rule; this only hides the controls.
 */
export const isInventoryReadOnly = (role?: string | null) =>
  role === "INVENTORY_VIEWER" || role === "BRANCH_MANAGER" || role === "SUPERVISOR" || role === "CASHIER";

/**
 * Purchase price / cost / stock value are owner-level figures. Branch accounts
 * never see them (the server strips them from responses too).
 */
export const isCostHidden = (role?: string | null) =>
  role === "BRANCH_MANAGER" || role === "SUPERVISOR" || role === "CASHIER";

export const getHideCost = () =>
  typeof window !== "undefined" && isCostHidden(localStorage.getItem("role"));

/** Read the signed-in role's inventory access (safe during SSR). */
export const getInventoryReadOnly = () =>
  typeof window !== "undefined" && isInventoryReadOnly(localStorage.getItem("role"));

export const normalizeUserRole = (role?: string | null): UserRole | null => {
  if (!role) {
    return null;
  }

  return KNOWN_ROLES.includes(role as UserRole) ? (role as UserRole) : null;
};

export const getDefaultDashboardTab = (role?: string | null): string => {
  const normalizedRole = normalizeUserRole(role);

  if (
    normalizedRole === "WAREHOUSE_MANAGER" ||
    normalizedRole === "PURCHASE_MANAGER"
  ) {
    return "inventory-dashboard";
  }

  if (normalizedRole === "INVENTORY_VIEWER") {
    return "inventory";
  }

  if (normalizedRole === "CASHIER") {
    return "new-sale";
  }

  return "dashboard";
};
