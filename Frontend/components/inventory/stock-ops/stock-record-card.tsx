"use client";

import React from "react";
import { Package, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockStatusBadge } from "@/components/inventory/stock-ops/stock-status-badge";

interface StockRecordCardProps {
  productName: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  branch?: string | null;
  imageUrl?: string | null;
  cost?: number | string | null;
  sell?: number | string | null;
  quantity?: number;
  reserved?: number;
  available?: number;
  value?: number | string | null;
  minQty?: number;
  onView?: () => void;
  className?: string;
}

function fmtMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtQty(v: number) {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function StockRecordCard({
  productName,
  sku,
  barcode,
  category,
  branch,
  imageUrl,
  cost,
  sell,
  quantity = 0,
  reserved = 0,
  available,
  value,
  minQty = 10,
  onView,
  className,
}: StockRecordCardProps) {
  const avail = available ?? quantity - reserved;
  const isNegative = quantity < 0 || avail < 0;
  const meta = [branch, category].filter(Boolean).join(" | ");
  const idLine = sku || barcode;

  return (
    <article
      role={onView ? "button" : undefined}
      tabIndex={onView ? 0 : undefined}
      onClick={onView}
      onKeyDown={
        onView
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onView();
              }
            }
          : undefined
      }
      className={cn(
        "flex flex-col rounded-lg border bg-white p-3 transition-colors",
        "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50",
        onView && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        isNegative && "border-rose-200 bg-rose-50/30",
        className,
      )}
    >
      {/* Row 1: product identity */}
      <div className="flex items-start gap-2.5 min-w-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-9 w-9 rounded-md object-cover border border-slate-200 shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2 pr-1">
            {productName}
          </h3>
          {idLine && (
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">{idLine}</p>
          )}
        </div>
        <StockStatusBadge qty={quantity} minQty={minQty} />
      </div>

      {/* Row 2: location context — one line only */}
      {meta && (
        <p className="mt-2 text-[11px] text-slate-500 truncate" title={meta}>
          {meta}
        </p>
      )}

      {/* Row 3: the numbers that matter */}
      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Stock
          </p>
          <p
            className={cn(
              "text-base font-bold tabular-nums leading-none mt-0.5",
              isNegative ? "text-rose-600" : "text-slate-900",
            )}
          >
            {fmtQty(avail)}
          </p>
          {reserved > 0 && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              {fmtQty(quantity)} on hand, {fmtQty(reserved)} reserved
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Value
          </p>
          <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
            {fmtMoney(value ?? 0)}
          </p>
        </div>
      </div>

      {/* Row 4: pricing footer */}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">
          Cost {fmtMoney(cost)} / Sell {fmtMoney(sell)}
        </span>
        {onView && (
          <span className="inline-flex items-center shrink-0 text-slate-600 font-medium">
            View
            <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </span>
        )}
      </div>
    </article>
  );
}
