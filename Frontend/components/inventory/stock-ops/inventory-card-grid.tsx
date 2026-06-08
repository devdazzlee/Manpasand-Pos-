"use client";

import React from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface InventoryCardGridProps {
  children: React.ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  skeletonCount?: number;
  className?: string;
}

export function InventoryCardGrid({
  children,
  empty = false,
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting your filters or add new data.",
  loading = false,
  skeletonCount = 8,
  className,
}: InventoryCardGridProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3",
          className,
        )}
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className="h-[168px] rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Package className="h-7 w-7 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-900">{emptyTitle}</p>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
