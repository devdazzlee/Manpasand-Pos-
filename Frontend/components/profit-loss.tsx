"use client";

import { useCallback, useEffect, useState } from "react";
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
import { rangeForPreset } from "@/lib/business-timezone";
import { downloadProfitLossPdf } from "@/lib/profit-loss-pdf";
import { money, moneyWithScale, signedMoney } from "@/lib/report-money";
import {
  KpiCard,
  MetricRow,
  MoneyCell,
  ReportHeader,
  ReportShell,
  SectionCard,
  SnapshotCard,
  reportThCls,
} from "@/components/report-chrome";
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

interface PnLData {
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
  pnl: {
    lines: { label: string; amount: number; section: string; emphasis?: boolean }[];
    monthly: {
      month: string;
      label: string;
      revenue: number;
      cogs: number;
      expenses: number;
      grossProfit: number;
      netProfit: number;
      bills: number;
    }[];
    operatingProfit: number;
    netMarginPercent: number;
  };
  previous: {
    period: { from: string; to: string };
    lines: { label: string; amount: number; section: string; emphasis?: boolean }[];
    comparison: {
      netRevenue: { delta: number; percent: number };
      grossProfit: { delta: number; percent: number };
      expenses: { delta: number; percent: number };
      netProfit: { delta: number; percent: number };
    };
  } | null;
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

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

const isDeductionLine = (line: { label: string; amount: number; section: string }) =>
  line.amount < 0 || line.section === "cogs" || line.section === "expense";

export function ProfitLoss() {
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
  const [comparePrevious, setComparePrevious] = useState("yes");
  const [report, setReport] = useState<PnLData | null>(null);
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
        comparePrevious: comparePrevious === "yes" ? "true" : "false",
      };
      if (branchId !== "all") params.branchId = branchId;
      if (paymentMethod !== "ALL") params.paymentMethod = paymentMethod;
      if (cashierId !== "all") params.cashierId = cashierId;
      if (categoryId !== "all") params.categoryId = categoryId;
      const response = await apiClient.get("/profit-loss", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load profit & loss",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [
    from,
    to,
    branchId,
    paymentMethod,
    cashierId,
    categoryId,
    saleType,
    includeSalaries,
    includePurchases,
    comparePrevious,
    toast,
  ]);

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
    setComparePrevious("yes");
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
    const lines = report.pnl?.lines || [];
    const rows = lines
      .map(
        (line) => `<tr class="${line.emphasis ? "emph" : ""}">
          <td>${line.label}</td>
          <td style="text-align:right">${moneyWithScale(line.amount)}</td>
          ${
            report.previous
              ? `<td style="text-align:right">${moneyWithScale(
                  report.previous.lines.find((row) => row.label === line.label)?.amount || 0,
                )}</td>`
              : ""
          }
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Profit & Loss</title>
      <style>
        body{font-family:Georgia,serif;color:#2a2012;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a67c2e;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#2a2012;color:#fff;text-align:left;padding:8px}
        td{border-bottom:1px solid #e8dcc4;padding:8px}
        tr.emph td{font-weight:bold;background:#fcf8f2}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e8dcc4;padding:12px;background:#fcf8f2}
        .meta{color:#786448;margin:4px 0 0;font-size:12px}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Profit & Loss</h1>
      <p class="meta">${periodLabel(from, to)} · ${branchLabel}</p>
      <p class="meta">${paymentLabel}</p></div></div>
      <div class="cards">
        <div class="card"><div>Revenue</div><strong>${moneyWithScale(report.income.netRevenue)}</strong></div>
        <div class="card"><div>Gross profit</div><strong>${moneyWithScale(report.grossProfit)}</strong></div>
        <div class="card"><div>Operating profit</div><strong>${moneyWithScale(report.pnl.operatingProfit)}</strong></div>
        <div class="card"><div>Net profit</div><strong>${moneyWithScale(report.netProfit)}</strong></div>
      </div>
      <table><thead><tr><th>Particulars</th><th>Current</th>${report.previous ? "<th>Previous</th>" : ""}</tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <ReportShell>
      <ReportHeader
        icon={TrendingUp}
        iconClassName="bg-emerald-600"
        title="Profit & Loss"
        subtitle={
          <p className="flex flex-wrap items-center gap-x-1.5">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {periodLabel(from, to)}
            </span>
            <span className="text-slate-300">•</span>
            <span className="truncate">{branchLabel}</span>
          </p>
        }
        actions={
          <>
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
                downloadProfitLossPdf(
                  {
                    lines: report.pnl.lines,
                    income: report.income,
                    grossProfit: report.grossProfit,
                    netProfit: report.netProfit,
                    marginPercent: report.marginPercent,
                    pnl: report.pnl,
                  },
                  { from, to, branchLabel: `${branchLabel} · ${paymentLabel}` },
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </>
        }
      />

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
            <div className="space-y-1">
              <Label>Compare previous period</Label>
              <Select value={comparePrevious} onValueChange={setComparePrevious}>
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
            <PageLoader message="Loading profit & loss..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
            <KpiCard
              label="Revenue"
              value={money(report?.income.netRevenue || 0)}
              rawValue={report?.income.netRevenue || 0}
              hint={report ? `${report.income.billCount} bills` : undefined}
              accent="bg-emerald-500"
              tone="bg-emerald-50 text-emerald-600"
              icon={Wallet}
              loading={loading}
            />
            <KpiCard
              label="Gross profit"
              value={money(report?.grossProfit || 0)}
              rawValue={report?.grossProfit || 0}
              hint={report ? `Margin ${report.marginPercent.toFixed(1)}%` : undefined}
              accent="bg-amber-500"
              tone="bg-amber-50 text-amber-600"
              icon={TrendingUp}
              loading={loading}
            />
            <KpiCard
              label="Operating profit"
              value={money(report?.pnl?.operatingProfit || 0)}
              rawValue={report?.pnl?.operatingProfit || 0}
              accent="bg-sky-500"
              tone="bg-sky-50 text-sky-600"
              icon={FileSpreadsheet}
              loading={loading}
            />
            <KpiCard
              label="Net profit / (loss)"
              value={money(report?.netProfit || 0)}
              rawValue={report?.netProfit || 0}
              hint={report ? `Net margin ${(report.pnl?.netMarginPercent || 0).toFixed(1)}%` : undefined}
              accent="bg-[#a67c2e]"
              tone="bg-[#fcf8f2] text-[#a67c2e]"
              icon={FileSpreadsheet}
              loading={loading}
              emphasis
            />
          </div>

          {report?.previous ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
              <KpiCard
                label="Revenue vs previous"
                value={signedMoney(report.previous.comparison.netRevenue.delta)}
                rawValue={report.previous.comparison.netRevenue.delta}
                hint={`${report.previous.comparison.netRevenue.percent.toFixed(1)}% · ${periodLabel(report.previous.period.from, report.previous.period.to)}`}
                accent="bg-emerald-500"
                tone="bg-emerald-50 text-emerald-600"
                icon={TrendingUp}
                loading={loading}
              />
              <KpiCard
                label="Gross profit vs previous"
                value={signedMoney(report.previous.comparison.grossProfit.delta)}
                rawValue={report.previous.comparison.grossProfit.delta}
                hint={`${report.previous.comparison.grossProfit.percent.toFixed(1)}%`}
                accent="bg-amber-500"
                tone="bg-amber-50 text-amber-600"
                icon={TrendingUp}
                loading={loading}
              />
              <KpiCard
                label="Expenses vs previous"
                value={signedMoney(report.previous.comparison.expenses.delta)}
                rawValue={report.previous.comparison.expenses.delta}
                hint={`${report.previous.comparison.expenses.percent.toFixed(1)}%`}
                accent="bg-rose-500"
                tone="bg-rose-50 text-rose-600"
                icon={TrendingDown}
                loading={loading}
              />
              <KpiCard
                label="Net profit vs previous"
                value={signedMoney(report.previous.comparison.netProfit.delta)}
                rawValue={report.previous.comparison.netProfit.delta}
                hint={`${report.previous.comparison.netProfit.percent.toFixed(1)}%`}
                accent="bg-[#a67c2e]"
                tone="bg-[#fcf8f2] text-[#a67c2e]"
                icon={FileSpreadsheet}
                loading={loading}
                emphasis
              />
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Profit & loss statement"
              caption="Current and previous period when comparison is enabled"
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Particulars</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Current</TableHead>
                    {report?.previous ? (
                      <TableHead className={cn(reportThCls, "text-right")}>Previous</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!report || (report.pnl?.lines || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={report?.previous ? 3 : 2} className="py-10 text-center text-slate-500">
                        No activity in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.pnl.lines.map((line, index) => {
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
                          {report.previous ? (
                            <TableCell className="text-right tabular-nums text-slate-600">
                              <MoneyCell
                                value={
                                  report.previous.lines.find((row) => row.label === line.label)?.amount || 0
                                }
                              />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <div className="space-y-4">
              <SnapshotCard title="P&L snapshot" caption="Bills, revenue, and costs">
                <MetricRow label="Bills" value={String(report?.income.billCount || 0)} />
                <MetricRow
                  label="Gross sales"
                  value={money(report?.income.grossSales || 0)}
                  rawValue={report?.income.grossSales || 0}
                />
                <MetricRow label="Discounts" value={money(report?.income.discounts || 0)} muted />
                <MetricRow label="Returns" value={money(report?.income.returns || 0)} muted />
                <MetricRow
                  label="COGS"
                  value={money(report?.cogs.soldCost || 0)}
                  rawValue={report?.cogs.soldCost || 0}
                  muted
                />
                <MetricRow
                  label="Operating expenses"
                  value={money(report?.expenses.operating || 0)}
                  rawValue={report?.expenses.operating || 0}
                  muted
                />
                <MetricRow label="Salaries" value={money(report?.expenses.salaries || 0)} muted />
              </SnapshotCard>
              <SnapshotCard title="Buying memo" caption="Purchases in the selected period">
                <MetricRow
                  label="Purchases in period"
                  value={money(report?.cogs.purchasesInPeriod || 0)}
                  rawValue={report?.cogs.purchasesInPeriod || 0}
                />
                <MetricRow
                  label="Purchase returns"
                  value={money(report?.cogs.purchaseReturnsInPeriod || 0)}
                  muted
                />
              </SnapshotCard>
            </div>
          </div>

          <SectionCard title="Monthly profit & loss" caption="Revenue, costs, and profit by month">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={reportThCls}>Month</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>Bills</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>Revenue</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>COGS</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>Expenses</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>Gross profit</TableHead>
                  <TableHead className={cn(reportThCls, "text-right")}>Net profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.pnl?.monthly || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      No monthly activity in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  report?.pnl.monthly.map((row, i) => (
                    <TableRow key={row.month} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                      <TableCell className="font-medium text-slate-800">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">{row.bills}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-800">
                        <MoneyCell value={row.revenue} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700">
                        <MoneyCell value={row.cogs} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700">
                        <MoneyCell value={row.expenses} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-800">
                        <MoneyCell value={row.grossProfit} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-slate-900">
                        <MoneyCell value={row.netProfit} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Expenses by category" caption="Operating spend by category">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Category</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Entries</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Amount</TableHead>
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
            </SectionCard>

            <SectionCard title="By payment method" caption="Revenue collected by tender">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Method</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Bills</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byPaymentMethod || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No payment breakdown.
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
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="By branch" caption="Revenue and gross profit by store">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Branch</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Revenue</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Gross profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byBranch || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No branch sales.
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
            </SectionCard>

            <SectionCard title="By cashier" caption="Sales performance by cashier">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Cashier</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Bills</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Revenue</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Gross profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.byCashier || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        No cashier sales.
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
            </SectionCard>
          </div>
        </>
      )}
    </ReportShell>
  );
}
