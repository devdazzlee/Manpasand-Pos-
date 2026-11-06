export interface BranchOption {
  id: string;
  name: string;
  address?: string;
  is_active?: boolean;
  /** "BRANCH" (a shop that sells) or "WAREHOUSE". */
  branch_type?: string | null;
  /**
   * From backend branch-discount-policy (read-only preview; server enforces on sale).
   */
  pos_policy?: {
    auto_bill_discount_percent: number;
    label: string;
  } | null;
}

export const isAdminRole = (role?: string | null) =>
  role === "ADMIN" || role === "SUPER_ADMIN";

export const normalizeBranchId = (raw?: string | null): string => {
  if (!raw) return "";

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "Not Found") {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return parsed.trim();
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "id" in parsed &&
      typeof (parsed as { id?: unknown }).id === "string"
    ) {
      return ((parsed as { id: string }).id || "").trim();
    }
  } catch {
    // Stored branch is a plain string in most cases.
  }

  return trimmed;
};

export const mapBranchOption = (branch: any): BranchOption => ({
  id: String(branch?.id || ""),
  name: String(branch?.name || "Unknown Branch"),
  address: typeof branch?.address === "string" ? branch.address : "",
  is_active: branch?.is_active !== false,
  branch_type: typeof branch?.branch_type === "string" ? branch.branch_type : null,
  pos_policy:
    branch?.pos_policy && typeof branch.pos_policy === "object"
      ? {
          auto_bill_discount_percent: Number(
            branch.pos_policy.auto_bill_discount_percent,
          ) || 0,
          label: String(branch.pos_policy.label || ""),
        }
      : null,
});
