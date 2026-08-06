"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface TransactionRecordCardProps {
  date: string;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  highlights?: Array<{
    label: string;
    value: React.ReactNode;
    tone?: "default" | "danger" | "success";
  }>;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Optional large amount shown top-right (e.g. bill value). */
  amount?: React.ReactNode;
  amountLabel?: string;
}

export function TransactionRecordCard({
  date,
  title,
  subtitle,
  meta,
  badge,
  highlights = [],
  footer,
  actions,
  className,
  amount,
  amountLabel = "Value",
}: TransactionRecordCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm",
        "hover:border-gray-300 hover:shadow-md transition-all",
        className,
      )}
    >
      {/* Header band */}
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-slate-50/80 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <p className="text-[11px] text-gray-500 tabular-nums">{date}</p>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-mono text-gray-500 truncate">{subtitle}</p>
          ) : null}
        </div>
        {amount != null ? (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {amountLabel}
            </p>
            <p className="text-base font-bold tabular-nums text-gray-900 mt-0.5">
              {amount}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-4 py-3 gap-3">
        {meta ? (
          <div className="text-xs text-gray-600 leading-relaxed">{meta}</div>
        ) : null}

        {highlights.length > 0 ? (
          <div
            className={cn(
              "grid gap-2 rounded-lg bg-gray-50 border border-gray-100 p-2.5",
              highlights.length === 2 && "grid-cols-2",
              highlights.length >= 3 && "grid-cols-3",
            )}
          >
            {highlights.map((h) => (
              <div key={h.label} className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  {h.label}
                </p>
                <p
                  className={cn(
                    "text-sm font-semibold mt-0.5 tabular-nums truncate",
                    h.tone === "danger" && "text-rose-600",
                    h.tone === "success" && "text-emerald-600",
                    (!h.tone || h.tone === "default") && "text-gray-900",
                  )}
                >
                  {h.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {(footer || actions) && (
          <div className="mt-auto pt-1 flex items-center justify-between gap-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 min-w-0 truncate">{footer}</div>
            <div className="shrink-0 flex items-center gap-1">{actions}</div>
          </div>
        )}
      </div>
    </article>
  );
}
