"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Printer, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { CompactReportFilters } from "@/components/report-filters-shell";
import { rangeForPreset } from "@/lib/business-timezone";
import {
  CatalogFilterBar,
  EMPTY_CATALOG_FILTERS,
  catalogFilterParams,
  useCatalogFilterLabel,
  type CatalogFilters,
} from "@/components/catalog-filter-bar";

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface Row {
  productId: string;
  product: string;
  sku: string;
  category: string;
  orders: number;
  grossQty: number;
  returnsQty: number;
  netQty: number;
  remainingQty: number;
  grossSales: number;
  discounts: number;
  returnsValue: number;
  netSales: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
}

interface ReportData {
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; code: string }[];
  rows: Row[];
  totals: {
    products: number;
    orders: number;
    grossQty: number;
    returnsQty: number;
    netQty: number;
    remainingQty: number;
    grossSales: number;
    discounts: number;
    returnsValue: number;
    netSales: number;
    cost: number;
    grossProfit: number;
    marginPercent: number;
  };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(
        new Date(`${to}T00:00:00`),
        "dd MMM yyyy",
      )}`;

export function ProductSalesProfit() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [catalog, setCatalog] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const catalogLabel = useCatalogFilterLabel(catalog);
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      Object.assign(params, catalogFilterParams(catalog));
      if (branchId !== "all") params.branchId = branchId;
      if (search.trim()) params.search = search.trim();
      const response = await apiClient.get("/product-sales-profit", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load product sales & profit",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, catalog, branchId, search, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustom = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To Date cannot be earlier than From Date" });
      return;
    }
    setPreset("custom");
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const clearFilters = () => {
    const range = rangeFor("last30");
    setPreset("last30");
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setCatalog(EMPTY_CATALOG_FILTERS);
    setBranchId("all");
    setSearch("");
  };

  const rows = report?.rows || [];
  const totals = report?.totals;
  const categoryName = catalogLabel || "All categories";
  const branchName =
    branchId === "all"
      ? "All locations"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Location";
  const filterLabel = `${categoryName} · ${branchName}`;

  const printMoney = (value: number) => `Rs. ${money(value)}`;

  const printReport = () => {
    const win = window.open("", "_blank");
    if (!win || !report) return;
    const body = rows
      .map(
        (row) => `<tr>
          <td>${row.product}<div style="color:#786448;font-size:11px">${row.sku} · ${row.category}</div></td>
          <td style="text-align:right">${row.orders}</td>
          <td style="text-align:right">${qty(row.grossQty)}</td>
          <td style="text-align:right;color:${row.returnsQty ? "#b91c1c" : "#64748b"}">${row.returnsQty ? `-${qty(row.returnsQty)}` : "0"}</td>
          <td style="text-align:right">${qty(row.netQty)}</td>
          <td style="text-align:right">${qty(row.remainingQty)}</td>
          <td style="text-align:right">${printMoney(row.grossSales)}</td>
          <td style="text-align:right">${printMoney(row.discounts)}</td>
          <td style="text-align:right;color:${row.returnsValue ? "#b91c1c" : "#64748b"}">${row.returnsValue ? `-${printMoney(row.returnsValue)}` : printMoney(0)}</td>
          <td style="text-align:right;font-weight:700">${printMoney(row.netSales)}</td>
          <td style="text-align:right">${printMoney(row.cost)}</td>
          <td style="text-align:right;color:${row.grossProfit >= 0 ? "#15803d" : "#b91c1c"}">${printMoney(row.grossProfit)}</td>
          <td style="text-align:right;color:#a67c2e">${row.marginPercent.toFixed(1)}%</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Product Sales & Profit</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:24px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px;margin-bottom:16px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#1e3a5f;color:#fff;text-align:left;padding:8px 6px;white-space:nowrap}
        td{border-bottom:1px solid #e8dcc4;padding:7px 6px;vertical-align:top}
        tfoot td{font-weight:bold;border-top:2px solid #a67c2e;background:#fcf8f2}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Manpasand" />
      <div style="text-align:right"><h1 style="margin:0;font-size:22px">Product Sales & Profit</h1>
      <p style="margin:4px 0 0;color:#786448">${periodLabel(from, to)} · ${filterLabel}</p></div></div>
      <table><thead><tr>
        <th>Product</th><th>Orders</th><th>Gross Qty</th><th>Returns Qty</th><th>Net Qty</th><th>Remaining</th>
        <th>Gross Sales</th><th>Discounts</th><th>Returns Value</th><th>Net Sales</th>
        <th>Cost</th><th>Gross Profit</th><th>Margin %</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="13">No product sales in this period.</td></tr>`}</tbody>
      ${
        totals
          ? `<tfoot><tr>
        <td>${totals.products} products</td>
        <td style="text-align:right">${totals.orders}</td>
        <td style="text-align:right">${qty(totals.grossQty)}</td>
        <td style="text-align:right">-${qty(totals.returnsQty)}</td>
        <td style="text-align:right">${qty(totals.netQty)}</td>
        <td style="text-align:right">${qty(totals.remainingQty)}</td>
        <td style="text-align:right">${printMoney(totals.grossSales)}</td>
        <td style="text-align:right">${printMoney(totals.discounts)}</td>
        <td style="text-align:right">-${printMoney(totals.returnsValue)}</td>
        <td style="text-align:right">${printMoney(totals.netSales)}</td>
        <td style="text-align:right">${printMoney(totals.cost)}</td>
        <td style="text-align:right">${printMoney(totals.grossProfit)}</td>
        <td style="text-align:right">${totals.marginPercent.toFixed(1)}%</td>
      </tr></tfoot>`
          : ""
      }
      </table></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Sales & Profit</h1>
          <p className="text-sm text-gray-500">
            Per dress: orders, returns, remaining stock, net sales, cost, profit & margin ·{" "}
            {periodLabel(from, to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" onClick={printReport} disabled={!report || loading}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <CompactReportFilters
        defaultOpen
        summary={`${periodLabel(from, to)} · ${filterLabel}`}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1 sm:col-span-2">
              <Label>Dress / product</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search dress name, SKU, or code…"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
        catalog={<CatalogFilterBar value={catalog} onChange={setCatalog} />}
        advanced={
          <>
            <DateField
              label="From date"
              value={draftFrom}
              onChange={(value) => {
                setDraftFrom(value);
                setPreset("custom");
              }}
            />
            <DateField
              label="To date"
              value={draftTo}
              onChange={(value) => {
                setDraftTo(value);
                setPreset("custom");
              }}
            />
            <div className="space-y-1">
              <Label>Branch</Label>
              {loading && !report ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {(report?.branches || []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <PageLoader message="Loading product sales & profit..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Products" value={String(totals?.products || 0)} />
            <SummaryCard label="Orders" value={String(totals?.orders || 0)} />
            <SummaryCard label="Net qty" value={qty(totals?.netQty || 0)} />
            <SummaryCard label="Net sales" value={`Rs ${money(totals?.netSales || 0)}`} />
            <SummaryCard
              label="Gross profit"
              value={`Rs ${money(totals?.grossProfit || 0)}`}
              hint={totals ? `${totals.marginPercent.toFixed(1)}% margin` : undefined}
              emphasis
              tone={(totals?.grossProfit || 0) >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-slate-900">
                  Dress-wise performance
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  One card per product · no sideways scrolling
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                Amounts in Rs · {rows.length} shown
              </span>
            </div>

            {totals && rows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Period total
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {totals.products} products · {totals.orders} orders ·{" "}
                      {qty(totals.netQty)} net qty
                    </p>
                  </div>
                  <div className="flex flex-wrap items-stretch gap-2 sm:gap-3">
                    <TotalChip label="Net sales" value={money(totals.netSales)} />
                    <TotalChip label="Cost" value={money(totals.cost)} />
                    <TotalChip
                      label="Profit"
                      value={money(totals.grossProfit)}
                      emphasis
                    />
                    <div className="flex items-center rounded-xl bg-emerald-600 px-3.5 py-2 text-white shadow-sm shadow-emerald-600/20">
                      <span className="text-sm font-bold tabular-nums">
                        {totals.marginPercent.toFixed(1)}%
                      </span>
                      <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-100">
                        margin
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {rows.length === 0 ? (
              <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="px-5 py-16 text-center text-sm text-slate-500">
                  No product sales in this period. Try another date range or clear filters.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((row) => (
                  <ProductProfitCard key={row.productId} row={row} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-200/80 shadow-sm",
        emphasis && "border-amber-200 bg-gradient-to-br from-amber-50/80 to-white",
      )}
    >
      <CardContent className="relative p-4">
        {emphasis ? (
          <span className="absolute inset-x-0 top-0 h-0.5 bg-amber-400/80" aria-hidden />
        ) : null}
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p
          className={cn(
            "mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-slate-900",
            tone === "good" && "text-emerald-700",
            tone === "bad" && "text-rose-600",
          )}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function marginTone(marginPercent: number) {
  if (marginPercent >= 40) return "good" as const;
  if (marginPercent >= 20) return "mid" as const;
  if (marginPercent >= 0) return "low" as const;
  return "bad" as const;
}

function TotalChip({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[7.5rem] rounded-xl border px-3.5 py-2",
        emphasis
          ? "border-emerald-200 bg-emerald-50/90"
          : "border-slate-200/80 bg-white",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          emphasis ? "text-emerald-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ProductProfitCard({ row }: { row: Row }) {
  const lowStock = row.remainingQty < 0;
  const tone = marginTone(row.marginPercent);
  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,23,42,0.28)]",
        tone === "good" && "border-emerald-200/60",
        tone === "mid" && "border-slate-200",
        tone === "low" && "border-amber-200/70",
        tone === "bad" && "border-rose-200/70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          tone === "good" && "bg-emerald-500",
          tone === "mid" && "bg-slate-300",
          tone === "low" && "bg-amber-400",
          tone === "bad" && "bg-rose-500",
        )}
      />

      <div className="flex items-start justify-between gap-3 bg-gradient-to-br from-slate-50/90 via-white to-white pl-5 pr-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-tight text-slate-900"
            title={row.product}
          >
            {row.product}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
              {row.sku || "—"}
            </span>
            {row.category ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200/90">
                {row.category}
              </span>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col items-end rounded-xl px-2.5 py-1.5",
            tone === "good" && "bg-emerald-50 text-emerald-700",
            tone === "mid" && "bg-slate-100 text-slate-700",
            tone === "low" && "bg-amber-50 text-amber-800",
            tone === "bad" && "bg-rose-50 text-rose-700",
          )}
        >
          <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
            Margin
          </span>
          <span className="text-sm font-bold tabular-nums leading-none">
            {row.marginPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mx-4 mb-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50/90 p-2 ring-1 ring-slate-100">
        <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm shadow-slate-900/5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Net sales
          </p>
          <p className="mt-1 text-[13px] font-bold tabular-nums tracking-tight text-slate-900">
            {money(row.netSales)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm shadow-slate-900/5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Cost</p>
          <p className="mt-1 text-[13px] font-semibold tabular-nums tracking-tight text-slate-600">
            {money(row.cost)}
          </p>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm shadow-slate-900/5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Profit
          </p>
          <p
            className={cn(
              "mt-1 text-[13px] font-bold tabular-nums tracking-tight",
              row.grossProfit >= 0 ? "text-emerald-700" : "text-rose-600",
            )}
          >
            {row.grossProfit < 0 ? "−" : ""}
            {money(Math.abs(row.grossProfit))}
          </p>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-y-2.5 border-t border-slate-100 px-4 py-3">
        <Metric label="Orders" value={String(row.orders)} />
        <Metric label="Net qty" value={qty(row.netQty)} strong />
        <Metric
          label="Stock left"
          value={qty(row.remainingQty)}
          className={lowStock ? "text-rose-700" : undefined}
        />
        <Metric label="Gross sales" value={money(row.grossSales)} />
        <Metric
          label="Discount"
          value={row.discounts > 0 ? money(row.discounts) : "—"}
          muted={row.discounts <= 0}
        />
        <Metric
          label="Returns"
          value={
            row.returnsQty > 0
              ? `${qty(row.returnsQty)} · −${money(row.returnsValue)}`
              : "—"
          }
          className={row.returnsQty > 0 ? "text-rose-600" : undefined}
          muted={row.returnsQty <= 0}
        />
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  strong,
  muted,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-[12px] tabular-nums text-slate-700",
          strong ? "font-semibold text-slate-900" : "font-medium",
          muted && "text-slate-300",
          className,
        )}
      >
        {value}
      </p>
    </div>
  );
}
