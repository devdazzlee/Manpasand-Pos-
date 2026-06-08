"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface TransactionRecordCardProps {
  date: string;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  highlights?: Array<{ label: string; value: React.ReactNode; tone?: "default" | "danger" | "success" }>;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
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
}: TransactionRecordCardProps) {
  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{date}</p>
          <h3 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-2">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{subtitle}</p>
          )}
          {meta && <div className="mt-2 text-xs text-slate-600">{meta}</div>}
        </div>
        {badge}
      </div>

      {highlights.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
          {highlights.map((h) => (
            <div key={h.label}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                {h.label}
              </p>
              <p
                className={cn(
                  "text-sm font-semibold mt-0.5",
                  h.tone === "danger" && "text-rose-600",
                  h.tone === "success" && "text-emerald-600",
                  (!h.tone || h.tone === "default") && "text-slate-900",
                )}
              >
                {h.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {(footer || actions) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 min-w-0 truncate">{footer}</div>
          {actions}
        </div>
      )}
    </article>
  );
}
