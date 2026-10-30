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
