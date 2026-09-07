/**
 * Single source of truth for the signed-in identity.
 *
 * Before this module, `localStorage.getItem("branch")` + `JSON.parse` with a
 * try/catch fallback was copy-pasted across the store, hooks and screens — each
 * copy subtly different. Everything that needs the token / role / branch should
 * import from here instead so the parsing rules live in one place.
 */

import { isAdminRole, normalizeBranchId } from "./branch-utils";
import { normalizeUserRole, type UserRole } from "./role-utils";

export interface Session {
  token: string | null;
  role: UserRole | null;
  /** Empty string when the user has no branch (e.g. an admin). */
  branchId: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const EMPTY_SESSION: Session = {
  token: null,
  role: null,
  branchId: "",
  isAdmin: false,
  isAuthenticated: false,
};

/** Read the current session synchronously. Safe to call during SSR (returns empty). */
export function getSession(): Session {
  if (typeof window === "undefined") return EMPTY_SESSION;

  const token = localStorage.getItem("token");
  const role = normalizeUserRole(localStorage.getItem("role"));
  const branchId = normalizeBranchId(localStorage.getItem("branch"));

  return {
    token,
    role,
    branchId,
    isAdmin: isAdminRole(role),
    isAuthenticated: Boolean(token),
  };
}

/**
 * The `branch_id` query param a list request should carry.
 * Admins see every branch, so they send nothing; everyone else is scoped.
 */
export function getBranchScopeParam(): { branch_id?: string } {
  const { isAdmin, branchId } = getSession();
  return !isAdmin && branchId ? { branch_id: branchId } : {};
}
