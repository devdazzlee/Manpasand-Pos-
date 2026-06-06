"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface KpiItem {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
}

function toneClass(tone: KpiItem["tone"]) {
  switch (tone) {
    case "warning":
      return "border-amber-200 bg-amber-50/40";
    case "danger":
      return "border-red-200 bg-red-50/40";
    case "success":
      return "border-green-200 bg-green-50/40";
    default:
      return "border-gray-200 bg-white";
  }
}

export function InventoryKpiGrid({
  items,
  loading,
  columns = 3,
}: {
  items: KpiItem[];
  loading?: boolean;
  columns?: 2 | 3 | 4 | 6;
}) {
  const gridClass =
    columns === 6
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      : columns === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={cn("grid gap-4", gridClass)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.label}
            className={cn("p-4 border", toneClass(item.tone))}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-700">{item.label}</p>
              {Icon ? <Icon className="h-4 w-4 text-gray-400 shrink-0" /> : null}
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-gray-100 animate-pulse rounded mt-2" />
            ) : (
              <p className="text-2xl font-semibold text-black mt-1 tabular-nums">
                {item.value}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
