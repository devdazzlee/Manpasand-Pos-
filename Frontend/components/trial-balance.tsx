"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Landmark,
  Printer,
  RefreshCw,
  Scale,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { rangeForPreset } from "@/lib/business-timezone";
import { CompactReportFilters } from "@/components/report-filters-shell";
import { downloadTrialBalancePdf } from "@/lib/trial-balance-pdf";
import { money, moneyOrDash, moneyWithScale } from "@/lib/report-money";
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

type Preset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";

interface TrialBalanceData {
  period: { from: string; to: string };
  asOf: string;
  branches: { id: string; name: string; code: string }[];
  accounts: {
    code: string;
    account: string;
    type: string;
    debit: number;
    credit: number;
  }[];
  totals: {
    debit: number;
    credit: number;
    difference: number;
    balanced: boolean;
    accountCount: number;
  };
  byType: {
    asset: number;
    liability: number;
    equity: number;
    income: number;
    expense: number;
  };
  memo: {
    periodNetProfit: number;
    grossProfit: number;
    netRevenue: number;
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

const TYPE_LABELS: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Expense",
};

const rangeFor = (preset: Exclude<Preset, "custom">) => rangeForPreset(preset);

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function TrialBalance() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [report, setReport] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/trial-balance", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load trial balance",
        description: error?.response?.data?.message || error?.message || "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, toast]);

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
    setBranchId("all");
  };

  const branchLabel =
    branchId === "all"
      ? "All branches"
      : report?.branches.find((branch) => branch.id === branchId)?.name || "Branch";

  const asOfLabel = format(new Date(`${to}T00:00:00`), "dd MMM yyyy");

  const printReport = () => {
    if (!report) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = report.accounts
      .map(
        (row) => `<tr>
          <td>${row.code}</td>
          <td>${row.account}</td>
          <td>${TYPE_LABELS[row.type] || row.type}</td>
          <td style="text-align:right">${row.debit ? moneyWithScale(row.debit) : "—"}</td>
          <td style="text-align:right">${row.credit ? moneyWithScale(row.credit) : "—"}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Trial Balance</title>
      <style>
        body{font-family:system-ui,sans-serif;color:#0f172a;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#f8fafc;color:#64748b;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}
        td{border-bottom:1px solid #f1f5f9;padding:8px}
        tfoot td{font-weight:600;background:#f8fafc}
        .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e2e8f0;padding:12px;background:#fff;border-radius:8px}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Pehnawa" />
      <div style="text-align:right"><h1 style="margin:0">Trial Balance</h1>
      <p style="margin:4px 0 0;color:#64748b">As of ${format(new Date(`${report.asOf}T00:00:00`), "dd MMM yyyy")} · ${branchLabel}</p>
      <p style="margin:2px 0 0;color:#64748b">${periodLabel(from, to)}</p></div></div>
      <div class="cards">
        <div class="card"><div>Total debit</div><strong>${moneyWithScale(report.totals.debit)}</strong></div>
        <div class="card"><div>Total credit</div><strong>${moneyWithScale(report.totals.credit)}</strong></div>
        <div class="card"><div>Status</div><strong>${report.totals.balanced ? "Balanced" : "Check"}</strong></div>
      </div>
      <table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${moneyWithScale(report.totals.debit)}</td><td style="text-align:right">${moneyWithScale(report.totals.credit)}</td></tr></tfoot>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <ReportShell>
      <ReportHeader
        icon={Scale}
        iconClassName="bg-indigo-600"
        title="Trial Balance"
        subtitle={
          <p className="flex flex-wrap items-center gap-x-1.5">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              As of {asOfLabel}
            </span>
            <span className="text-slate-300">•</span>
            <span className="truncate">{branchLabel}</span>
            <span className="text-slate-300">•</span>
            <span className="truncate">{periodLabel(from, to)}</span>
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
              onClick={() => report && downloadTrialBalancePdf(report, { from, to, branchLabel })}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </>
        }
      />

      <CompactReportFilters
        summary={`${periodLabel(from, to)} · ${branchLabel}`}
        loading={loading && !!report}
        actions={
          <>
            <Button size="sm" className="h-8" onClick={applyCustom}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearFilters}
            >
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
      />

      {loading && !report ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <PageLoader message="Loading trial balance..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
            <KpiCard
              label="Total debit"
              value={money(report?.totals.debit || 0)}
              rawValue={report?.totals.debit || 0}
              hint="Sum of debit balances"
              accent="bg-sky-500"
              tone="bg-sky-50 text-sky-600"
              icon={Wallet}
              loading={loading}
            />
            <KpiCard
              label="Total credit"
              value={money(report?.totals.credit || 0)}
              rawValue={report?.totals.credit || 0}
              hint="Sum of credit balances"
              accent="bg-violet-500"
              tone="bg-violet-50 text-violet-600"
              icon={Landmark}
              loading={loading}
            />
            <KpiCard
              label="Accounts"
              value={String(report?.totals.accountCount || 0)}
              hint="Lines in this trial balance"
              accent="bg-amber-500"
              tone="bg-amber-50 text-amber-600"
              icon={FileSpreadsheet}
              loading={loading}
            />
            <KpiCard
              label="Status"
              value={report?.totals.balanced ? "Balanced" : "Check"}
              hint={report ? `Difference ${money(report.totals.difference)}` : undefined}
              accent={report?.totals.balanced ? "bg-emerald-500" : "bg-rose-500"}
              tone={
                report?.totals.balanced
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600"
              }
              icon={CheckCircle2}
              loading={loading}
              emphasis
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Accounts"
              caption="Debits and credits by ledger account"
            >
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={reportThCls}>Code</TableHead>
                      <TableHead className={reportThCls}>Account</TableHead>
                      <TableHead className={reportThCls}>Type</TableHead>
                      <TableHead className={cn(reportThCls, "text-right")}>Debit</TableHead>
                      <TableHead className={cn(reportThCls, "text-right")}>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!report || report.accounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                          No accounts for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {report.accounts.map((row, i) => (
                          <TableRow
                            key={`${row.code}-${row.account}`}
                            className={i % 2 === 1 ? "bg-slate-50/40" : undefined}
                          >
                            <TableCell className="font-mono text-xs text-slate-600">{row.code}</TableCell>
                            <TableCell className="font-medium text-slate-800">{row.account}</TableCell>
                            <TableCell className="text-slate-600">
                              {TYPE_LABELS[row.type] || row.type}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-800">
                              {moneyOrDash(row.debit) === "—" ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <MoneyCell value={row.debit} />
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-800">
                              {moneyOrDash(row.credit) === "—" ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <MoneyCell value={row.credit} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-slate-50 font-semibold">
                          <TableCell colSpan={3} className="text-slate-900">
                            Total
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-900">
                            <MoneyCell value={report.totals.debit} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-900">
                            <MoneyCell value={report.totals.credit} />
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            <div className="space-y-4">
              <SnapshotCard title="By type" caption="Net by account class">
                <MetricRow label="Assets" value={money(report?.byType.asset || 0)} rawValue={report?.byType.asset || 0} />
                <MetricRow label="Liabilities" value={money(report?.byType.liability || 0)} rawValue={report?.byType.liability || 0} />
                <MetricRow label="Equity" value={money(report?.byType.equity || 0)} rawValue={report?.byType.equity || 0} />
                <MetricRow label="Income" value={money(report?.byType.income || 0)} rawValue={report?.byType.income || 0} />
                <MetricRow label="Expenses" value={money(report?.byType.expense || 0)} rawValue={report?.byType.expense || 0} muted />
              </SnapshotCard>
              <SnapshotCard title="Period memo" caption="P&L figures for the selected range">
                <MetricRow label="Net revenue" value={money(report?.memo.netRevenue || 0)} rawValue={report?.memo.netRevenue || 0} />
                <MetricRow label="Gross profit" value={money(report?.memo.grossProfit || 0)} rawValue={report?.memo.grossProfit || 0} />
                <MetricRow label="Net profit" value={money(report?.memo.periodNetProfit || 0)} rawValue={report?.memo.periodNetProfit || 0} />
                <p className="py-2.5 text-xs text-slate-500">
                  Balance-sheet accounts use the end date. Income and expense accounts use the selected date range.
                </p>
              </SnapshotCard>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}
