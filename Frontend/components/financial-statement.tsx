"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateField } from "@/components/ui/date-picker";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { ymd, rangeForPreset } from "@/lib/business-timezone";
import { downloadFinancialStatementPdf } from "@/lib/financial-statement-pdf";
import { CompactReportFilters } from "@/components/report-filters-shell";

type Preset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

interface StatementData {
  period: { from: string; to: string };
  branches: { id: string; name: string; code: string }[];
  expenseCategories: { id: string; name: string }[];
  cashiers: { id: string; name: string; email: string; role: string }[];
  paymentMethods: string[];
  income: {
    grossSales: number;
    discounts: number;
    returns: number;
    tax: number;
    netRevenue: number;
    billCount: number;
  };
  cogs: {
    soldCost: number;
    purchasesInPeriod: number;
    purchaseReturnsInPeriod: number;
  };
  grossProfit: number;
  marginPercent: number;
  expenses: {
    operating: number;
    salaries: number;
    total: number;
    byCategory: { name: string; amount: number; count: number }[];
  };
  netProfit: number;
  byBranch: { id: string; name: string; code: string; revenue: number; cogs: number; grossProfit: number; bills: number }[];
  byPaymentMethod: { method: string; revenue: number; bills: number }[];
  byCashier: { id: string; name: string; revenue: number; bills: number; cogs: number; grossProfit: number }[];
  lines: { label: string; amount: number; section: string; emphasis?: boolean }[];
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "thisWeek", label: "This Week" },
  { id: "lastWeek", label: "Last Week" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "last90", label: "Last 90 Days" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CREDIT: "Credit",
};

const SALE_TYPES = [
  { id: "ALL", label: "All sales & returns" },
  { id: "SALES", label: "Sales only" },
  { id: "RETURNS", label: "Returns only" },
];

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Compact Lac / Crore label for large totals (1 Lac = 1,00,000 · 1 Cr = 1,00,00,000). */
const moneyScale = (value: number): string | null => {
  const n = Math.abs(Number(value || 0));
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} Lac`;
  return null;
};

const moneyWithScale = (value: number) => {
  const scale = moneyScale(value);
  return scale ? `${money(value)} (≈ ${scale})` : money(value);
};

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

const thCls =
  "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

const isDeductionLine = (line: { label: string; amount: number; section: string }) =>
  line.amount < 0 || line.section === "cogs" || line.section === "expense";

export function FinancialStatement() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [cashierId, setCashierId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [saleType, setSaleType] = useState("ALL");
  const [includeSalaries, setIncludeSalaries] = useState("yes");
  const [includePurchases, setIncludePurchases] = useState("yes");
  const [report, setReport] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from,
        to,
        saleType,
        includeSalaries: includeSalaries === "yes" ? "true" : "false",
        includePurchases: includePurchases === "yes" ? "true" : "false",
      };
      if (branchId !== "all") params.branchId = branchId;
      if (paymentMethod !== "ALL") params.paymentMethod = paymentMethod;
      if (cashierId !== "all") params.cashierId = cashierId;
      if (categoryId !== "all") params.categoryId = categoryId;
      const response = await apiClient.get("/financial-statement", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load financial statement",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, paymentMethod, cashierId, categoryId, saleType, includeSalaries, includePurchases, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustomDates = () => {
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
    setBranchId("all");
    setPaymentMethod("ALL");
    setCashierId("all");
    setCategoryId("all");
    setSaleType("ALL");
    setIncludeSalaries("yes");
    setIncludePurchases("yes");
  };

  const branchLabel =
    branchId === "all"
      ? "All branches"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Branch";
  const paymentLabel = paymentMethod === "ALL" ? "All payments" : PAYMENT_LABELS[paymentMethod] || paymentMethod;

  const printReport = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.lines
      .map(
        (line) => `<tr class="${line.emphasis ? "emph" : ""}">
          <td>${line.label}</td>
          <td style="text-align:right">${moneyWithScale(line.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Financial Statement</title>
      <style>
        body{font-family:system-ui,sans-serif;color:#0f172a;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#f8fafc;color:#64748b;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
        td{border-bottom:1px solid #f1f5f9;padding:8px}
        tr.emph td{font-weight:600;background:#f8fafc}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e2e8f0;padding:12px;background:#fff;border-radius:8px}
        .meta{color:#64748b;margin:4px 0 0;font-size:12px}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Manpasand" />
      <div style="text-align:right"><h1 style="margin:0">Financial Statement</h1>
      <p class="meta">${periodLabel(from, to)} · ${branchLabel}</p>
      <p class="meta">${paymentLabel}</p></div></div>
      <div class="cards">
        <div class="card"><div>Net revenue</div><strong>${moneyWithScale(report.income.netRevenue)}</strong></div>
        <div class="card"><div>Gross profit</div><strong>${moneyWithScale(report.grossProfit)}</strong></div>
        <div class="card"><div>Expenses</div><strong>${moneyWithScale(report.expenses.total)}</strong></div>
        <div class="card"><div>Net profit</div><strong>${moneyWithScale(report.netProfit)}</strong></div>
      </div>
      <table><thead><tr><th>Particulars</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const kpiCards = [
    {
      label: "Net revenue",
      value: report?.income.netRevenue ?? 0,
      hint: report ? `${report.income.billCount} bills` : "—",
      accent: "bg-emerald-500",
      tone: "bg-emerald-50 text-emerald-600",
      icon: Wallet,
    },
    {
      label: "Gross profit",
      value: report?.grossProfit ?? 0,
      hint: report ? `After COGS ${money(report.cogs.soldCost)}` : "—",
      accent: "bg-amber-500",
      tone: "bg-amber-50 text-amber-600",
      icon: TrendingUp,
    },
    {
      label: "Expenses",
      value: report?.expenses.total ?? 0,
      hint: report ? `${report.expenses.byCategory.length} categories` : "—",
      accent: "bg-rose-500",
      tone: "bg-rose-50 text-rose-600",
      icon: TrendingDown,
    },
    {
      label: "Net profit",
      value: report?.netProfit ?? 0,
      hint: report ? `Margin ${report.marginPercent.toFixed(1)}%` : "—",
      accent: "bg-[#a67c2e]",
      tone: "bg-[#fcf8f2] text-[#a67c2e]",
      icon: FileSpreadsheet,
      emphasis: true,
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
              Financial Statement
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {periodLabel(from, to)}
              </span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{branchLabel}</span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{paymentLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-9 bg-white shadow-sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            variant="outline"
            className="h-9 bg-white shadow-sm"
            onClick={printReport}
            disabled={!report || loading}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button
            className="h-9 shadow-sm"
            disabled={!report || loading}
            onClick={() =>
              report &&
              downloadFinancialStatementPdf(report, {
                from,
                to,
                branchLabel: `${branchLabel} · ${paymentLabel}`,
              })
            }
          >
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <CompactReportFilters
        summary={`${periodLabel(from, to)} · ${branchLabel} · ${paymentLabel}`}
        actions={
          <>
            <Button size="sm" className="h-8" onClick={applyCustomDates}>
              Apply
            </Button>
            <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
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
                    <SelectValue />
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
        advanced={
          <>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All payments</SelectItem>
                  {(report?.paymentMethods || Object.keys(PAYMENT_LABELS)).map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_LABELS[method] || method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cashier</Label>
              <Select value={cashierId} onValueChange={setCashierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cashiers</SelectItem>
                  {(report?.cashiers || []).map((cashier) => (
                    <SelectItem key={cashier.id} value={cashier.id}>
                      {cashier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sale type</Label>
              <Select value={saleType} onValueChange={setSaleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALE_TYPES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expense category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(report?.expenseCategories || []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Include salaries</Label>
              <Select value={includeSalaries} onValueChange={setIncludeSalaries}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Include purchases memo</Label>
              <Select value={includePurchases} onValueChange={setIncludePurchases}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {loading && !report ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <PageLoader message="Loading financial statement..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const scale = moneyScale(card.value);
              return (
                <div
                  key={card.label}
                  className={cn(
                    "relative min-w-0 overflow-hidden rounded-xl border bg-white p-5 shadow-sm",
                    "emphasis" in card && card.emphasis
                      ? "border-[#a67c2e]/35"
                      : "border-slate-200",
                  )}
                >
                  <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {card.label}
                      </p>
                      <p
                        className="mt-2 break-words text-xl font-semibold leading-snug tracking-tight tabular-nums text-slate-900 sm:text-2xl"
                        title={money(card.value)}
                      >
                        {money(card.value)}
                      </p>
                      {scale ? (
                        <p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-700">
                          ≈ {scale}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                    </div>
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        card.tone,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="overflow-hidden border-slate-200 shadow-sm xl:col-span-2">
              <CardContent className="p-0">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Income statement</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Revenue through net profit for the selected period
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={thCls}>Particulars</TableHead>
                      <TableHead className={cn(thCls, "text-right")}>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!report || report.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-10 text-center text-slate-500">
                          No financial activity in this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.lines.map((line, index) => {
                        const deduction = isDeductionLine(line);
                        return (
                          <TableRow
                            key={`${line.label}-${index}`}
                            className={cn(
                              line.emphasis && "bg-slate-50/90",
                              !line.emphasis && index % 2 === 1 && "bg-slate-50/40",
                            )}
                          >
                            <TableCell
                              className={cn(
                                "text-slate-700",
                                line.emphasis && "font-semibold text-slate-900",
                              )}
                            >
                              {line.label}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right tabular-nums",
                                line.emphasis
                                  ? "font-semibold text-slate-900"
                                  : deduction
                                    ? "text-rose-700"
                                    : "text-slate-800",
                              )}
                            >
                              <MoneyCell value={line.amount} />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <SnapshotCard title="Sales snapshot" caption="Bills and revenue mix">
                <MetricRow label="Bills" value={String(report?.income.billCount || 0)} />
                <MetricRow label="Gross sales" value={money(report?.income.grossSales || 0)} scale={moneyScale(report?.income.grossSales || 0)} />
                <MetricRow label="Discounts" value={money(report?.income.discounts || 0)} muted />
                <MetricRow label="Returns" value={money(report?.income.returns || 0)} muted />
                <MetricRow label="Tax collected" value={money(report?.income.tax || 0)} />
              </SnapshotCard>
              <SnapshotCard title="Cost & buying" caption="COGS and period purchases">
                <MetricRow label="COGS (sold pieces)" value={money(report?.cogs.soldCost || 0)} scale={moneyScale(report?.cogs.soldCost || 0)} muted />
                <MetricRow label="Purchases in period" value={money(report?.cogs.purchasesInPeriod || 0)} scale={moneyScale(report?.cogs.purchasesInPeriod || 0)} />
                <MetricRow label="Purchase returns" value={money(report?.cogs.purchaseReturnsInPeriod || 0)} muted />
              </SnapshotCard>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BreakdownCard title="Expenses by category" caption="Operating spend by category">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Category</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Entries</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.expenses.byCategory || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No expenses in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.expenses.byCategory.map((row, i) => (
                      <TableRow key={row.name} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell className="font-medium text-slate-800">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-rose-700">
                          <MoneyCell value={row.amount} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </BreakdownCard>

            <BreakdownCard title="By payment method" caption="Revenue collected by tender">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Method</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Bills</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byPaymentMethod || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No payment breakdown in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.byPaymentMethod.map((row, i) => (
                      <TableRow key={row.method} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell className="font-medium text-slate-800">
                          {PAYMENT_LABELS[row.method] || row.method}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{row.bills}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.revenue} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </BreakdownCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BreakdownCard title="By branch" caption="Revenue and gross profit by store">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Branch</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Revenue</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Gross profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byBranch || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No branch sales in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.byBranch.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.bills} bills</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.revenue} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.grossProfit} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </BreakdownCard>

            <BreakdownCard title="By cashier" caption="Sales performance by cashier">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Cashier</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Bills</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Revenue</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Gross profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byCashier || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        No cashier sales in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.byCashier.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell className="font-medium text-slate-800">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-600">{row.bills}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.revenue} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.grossProfit} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </BreakdownCard>
          </div>
        </>
      )}
    </div>
  );
}

function MoneyCell({ value }: { value: number }) {
  const scale = moneyScale(value);
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{money(value)}</span>
      {scale ? <span className="text-[10px] font-medium text-emerald-700">≈ {scale}</span> : null}
    </span>
  );
}

function SnapshotCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{caption}</p>
        </div>
        <div className="divide-y divide-slate-100 px-4 py-1">{children}</div>
      </CardContent>
    </Card>
  );
}

function MetricRow({
  label,
  value,
  scale,
  muted,
}: {
  label: string;
  value: string;
  scale?: string | null;
  muted?: boolean;
}) {
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

function BreakdownCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{caption}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
