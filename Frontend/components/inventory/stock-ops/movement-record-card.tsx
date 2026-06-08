"use client";

import React from "react";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface MovementRecordCardProps {
  date: string;
  productName: string;
  branch?: string | null;
  movementType: React.ReactNode;
  quantityChange: number;
  previousQty?: number;
  newQty?: number;
  user?: string | null;
  notes?: string | null;
  className?: string;
}

function fmtQty(v: number) {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function MovementRecordCard({
  date,
  productName,
  branch,
  movementType,
  quantityChange,
  previousQty,
  newQty,
  user,
  notes,
  className,
}: MovementRecordCardProps) {
  const positive = quantityChange > 0;

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{date}</p>
          <h3 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-2">
            {productName}
          </h3>
          {branch && (
            <p className="text-xs text-slate-500 mt-1">{branch}</p>
          )}
        </div>
        <div className="shrink-0">{movementType}</div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Change</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              positive ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {positive ? "+" : ""}
            {fmtQty(quantityChange)}
          </p>
        </div>

        {previousQty != null && newQty != null && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono">
              {fmtQty(previousQty)}
            </span>
            <ArrowRightLeft className="h-3.5 w-3.5 text-slate-300" />
            <span className="rounded-md bg-slate-900 text-white px-2 py-1 font-mono">
              {fmtQty(newQty)}
            </span>
          </div>
        )}
      </div>

      {(user || notes) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{user || "System"}</span>
          {notes && <span className="truncate max-w-[50%]">{notes}</span>}
        </div>
      )}
    </article>
  );
}
