"use client";

import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { money, moneyScale } from "@/lib/report-money";

export const reportThCls =
  "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

export function ReportShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">{children}</div>
  );
}

export function ReportHeader({
  icon: Icon,
  iconClassName = "bg-slate-800",
  title,
  subtitle,
  actions,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
            iconClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
          <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  rawValue,
  hint,
  accent,
  tone,
  icon: Icon,
  loading,
  emphasis,
}: {
  label: string;
  value: string;
  rawValue?: number;
  hint?: string;
  accent: string;
  tone: string;
  icon: ComponentType<{ className?: string }>;
  loading?: boolean;
  emphasis?: boolean;
}) {
  const scale = rawValue != null ? moneyScale(rawValue) : null;
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border bg-white p-5 shadow-sm",
        emphasis ? "border-[#a67c2e]/35" : "border-slate-200",
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", accent)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p
            className={cn(
              "mt-2 break-words text-xl font-semibold leading-snug tracking-tight tabular-nums text-slate-900 sm:text-2xl",
              loading && "opacity-40",
            )}
            title={value}
          >
            {value}
          </p>
          {scale ? (
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-700">≈ {scale}</p>
          ) : null}
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  caption,
  children,
  className,
  footer,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden border-slate-200 shadow-sm", className)}>
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
        </div>
        {children}
        {footer ? <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SnapshotCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
        </div>
        <div className="divide-y divide-slate-100 px-4 py-1">{children}</div>
      </CardContent>
    </Card>
  );
}

export function MetricRow({
  label,
  value,
  rawValue,
  muted,
}: {
  label: string;
  value: string;
  rawValue?: number;
  muted?: boolean;
}) {
  const scale = rawValue != null ? moneyScale(rawValue) : null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="min-w-0 text-right">
        <span
          className={cn(
            "block font-semibold tabular-nums",
            muted ? "text-rose-700" : "text-slate-900",
          )}
        >
          {value}
        </span>
        {scale ? (
          <span className="block text-[10px] font-medium text-emerald-700">≈ {scale}</span>
        ) : null}
      </span>
    </div>
  );
}

export function MoneyCell({ value, dashZero }: { value: number; dashZero?: boolean }) {
  if (dashZero && Math.abs(value) < 0.005) {
    return <span className="text-slate-400">—</span>;
  }
  const scale = moneyScale(value);
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{money(value)}</span>
      {scale ? <span className="text-[10px] font-medium text-emerald-700">≈ {scale}</span> : null}
    </span>
  );
}
