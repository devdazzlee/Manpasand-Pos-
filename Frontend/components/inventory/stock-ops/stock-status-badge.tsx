"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export type StockStatusTone = "in" | "low" | "out" | "negative";

export interface StockStatusDisplay {
  label: string;
  tone: StockStatusTone;
  className: string;
}

export function getStockStatusDisplay(
  qty: number,
  minQty = 10,
): StockStatusDisplay {
  if (qty < 0) {
    return {
      label: "Negative",
      tone: "negative",
      className: "bg-red-100 text-red-800 border-red-200",
    };
  }
  if (qty <= 0) {
    return {
      label: "Out of stock",
      tone: "out",
      className: "bg-gray-100 text-gray-700 border-gray-300",
    };
  }
  if (minQty > 0 && qty <= minQty) {
    return {
      label: "Low stock",
      tone: "low",
      className: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }
  return {
    label: "In stock",
    tone: "in",
    className: "bg-green-50 text-green-800 border-green-200",
  };
}

export const STOCK_STATUS_BADGE_CLASS =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 gap-1";

const STATUS_ICONS = {
  in: CheckCircle2,
  low: AlertTriangle,
  out: XCircle,
  negative: AlertTriangle,
} as const;

export function StockStatusBadge({
  qty,
  minQty = 10,
  showIcon = false,
}: {
  qty: number;
  minQty?: number;
  showIcon?: boolean;
}) {
  const status = getStockStatusDisplay(qty, minQty);
  const Icon = STATUS_ICONS[status.tone];
  return (
    <Badge variant="outline" className={cn(STOCK_STATUS_BADGE_CLASS, status.className)}>
      {showIcon ? <Icon className="h-3 w-3 shrink-0" /> : null}
      {status.label}
    </Badge>
  );
}
