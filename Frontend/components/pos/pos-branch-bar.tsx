"use client";

import { useId } from "react";
import { AlertTriangle, Building2, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchOption } from "@/lib/branch-utils";
import { cn } from "@/lib/utils";

interface PosBranchBarProps {
  adminMode: boolean;
  branches: BranchOption[];
  selectedBranchId: string;
  branchName: string;
  loading?: boolean;
  disabled?: boolean;
  onSelect: (branchId: string) => void;
  /** Set when the admin tried to bill without choosing a branch. */
  error?: boolean;
  className?: string;
}

/**
 * Always-visible answer to "which branch is this bill going to?".
 *
 * - Branch staff: a locked badge — their branch comes from their account and
 *   cannot be changed from the browser (the server enforces the same rule).
 * - Admins: an explicit picker. Nothing is pre-selected by guesswork; until a
 *   branch is chosen the bar is highlighted and checkout stays disabled.
 */
export function PosBranchBar({
  adminMode,
  branches,
  selectedBranchId,
  branchName,
  loading,
  disabled,
  onSelect,
  error,
  className,
}: PosBranchBarProps) {
  const hintId = useId();
  if (loading) {
    return (
      <div
        className={cn("h-10 w-full animate-pulse rounded-md bg-gray-100 sm:w-[240px]", className)}
        aria-hidden
      />
    );
  }

  if (!adminMode) {
    if (!selectedBranchId) {
      return (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
            className
          )}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          No branch is assigned to your account. Ask the owner to assign one.
        </div>
      );
    }
    return (
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm",
          className
        )}
        title="Your sales are always recorded in your own branch"
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="truncate font-medium text-slate-900">{branchName || "Your branch"}</span>
        <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Locked to your account" />
      </div>
    );
  }

  const unselected = !selectedBranchId;
  const showError = unselected && error;

  return (
    <div className={cn("flex flex-col gap-1", className)} data-pos-branch-bar>
      <Select value={selectedBranchId || undefined} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger
          className={cn(
            "h-10 w-full gap-0 sm:w-[240px] [&>span]:flex-1 [&>span]:text-left",
            showError
              ? "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-300"
              : unselected
                ? "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                : "border-blue-300 bg-blue-50 font-medium text-blue-900"
          )}
          aria-label="Branch this sale will be recorded in"
          aria-invalid={unselected}
          aria-describedby={unselected ? hintId : undefined}
        >
          {/* Direct children: SelectTrigger line-clamps child <span>s. */}
          <Building2 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
          <SelectValue placeholder="Choose billing branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
              {b.branch_type === "WAREHOUSE" ? " (Warehouse)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unselected && (
        <p
          id={hintId}
          role={showError ? "alert" : undefined}
          className={cn("text-xs", showError ? "font-medium text-red-600" : "text-amber-700")}
        >
          {showError ? "Select a branch — the sale can't be saved without one." : "Choose the branch before billing."}
        </p>
      )}
    </div>
  );
}
