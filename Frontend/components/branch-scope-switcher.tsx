"use client";

import { useEffect, useState } from "react";
import { Building2, Globe2, Lock, MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import apiClient from "@/lib/apiClient";
import { isAdminRole, mapBranchOption, type BranchOption } from "@/lib/branch-utils";
import { useBranchScope } from "@/lib/branch-scope";
import { cn } from "@/lib/utils";

/**
 * Header branch switcher for the back office.
 *  - Admin, branch-specific page: pick "All branches" or one branch; every page follows it.
 *  - Admin, company-wide page (catalog, suppliers, tax…): shows "Company-wide" (nothing to filter).
 *  - Branch account: shows its own branch, locked.
 */
export function BranchScopeSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { branchId, applies, setBranchId } = useBranchScope();
  const [admin, setAdmin] = useState(false);
  const [ownBranchName, setOwnBranchName] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    const isAdmin = isAdminRole(localStorage.getItem("role"));
    setAdmin(isAdmin);
    if (!isAdmin) {
      setOwnBranchName(localStorage.getItem("branchName") || "Your branch");
      return;
    }
    apiClient
      .get("/branches", { params: { page: 1, limit: 100, is_active: true } })
      .then((res) => {
        const raw = Array.isArray(res?.data?.data) ? res.data.data : [];
        const list: BranchOption[] = raw.map(mapBranchOption).filter((b: BranchOption) => b.id && b.is_active !== false);
        // Shops first, warehouses after.
        list.sort((a, b) => Number(a.branch_type === "WAREHOUSE") - Number(b.branch_type === "WAREHOUSE") || a.name.localeCompare(b.name));
        setBranches(list);
        // A remembered branch that was deleted / deactivated falls back to All branches.
        if (branchId && !list.some((b) => b.id === branchId)) setBranchId(null);
      })
      .catch(() => setBranches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pill = "flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm";

  if (!admin) {
    if (!ownBranchName) return null;
    return (
      <div className={cn(pill, "border-slate-200 bg-white text-slate-700", className)} title="Your account is locked to this branch">
        <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="max-w-[180px] truncate">{ownBranchName}</span>
        <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      </div>
    );
  }

  if (!applies) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(pill, "cursor-default border-dashed border-slate-300 bg-slate-50 text-slate-500", className)}>
              <Globe2 className="h-4 w-4 shrink-0" aria-hidden />
              {!compact && <span>Company-wide</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] text-xs">
            This page isn&apos;t split by branch, so the branch filter doesn&apos;t apply here.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const selected = branches.find((b) => b.id === branchId);

  return (
    <Select value={branchId ?? "all"} onValueChange={(v) => setBranchId(v === "all" ? null : v)}>
      <SelectTrigger
        aria-label="Branch shown on every page"
        className={cn(
          "h-9 gap-0 text-sm font-medium shadow-sm [&>span]:flex-1 [&>span]:truncate [&>span]:text-left",
          compact ? "w-[170px]" : "w-[230px]",
          branchId ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700",
          className,
        )}
      >
        {branchId ? (
          <MapPin className="mr-2 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        ) : (
          <Building2 className="mr-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        )}
        <SelectValue placeholder="All Branches">{selected ? selected.name : branchId ? "Branch" : "All Branches"}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all">All Branches</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
            {b.branch_type === "WAREHOUSE" ? " (Warehouse)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
