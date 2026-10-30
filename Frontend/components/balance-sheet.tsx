"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  Download,
  Landmark,
  Package,
  Printer,
  Receipt,
  RefreshCw,
  Scale,
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
import { CompactReportFilters } from "@/components/report-filters-shell";
import { downloadBalanceSheetPdf } from "@/lib/balance-sheet-pdf";
import { money, moneyWithScale } from "@/lib/report-money";
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

interface BalanceSheetData {
  period: { from: string; to: string };
  asOf: string;
  branches: { id: string; name: string; code: string }[];
  assets: {
    /** Cash in Hand from the Chart of Accounts ledger */
    cashOnHand: number;
    bank: number;
    /** What the open / last-closed register drawers hold (memo) */
    cashInRegisters: number;
    moneyAccounts: { id: string; code: string; name: string; kind: "CASH" | "BANK"; balance: number }[];
    inventory: number;
    inventoryQty: number;
    accountsReceivable: number;
    total: number;
    cashByBranch: { id: string; name: string; code: string; amount: number; status: string }[];
    inventoryByBranch: { id: string; name: string; code: string; value: number; qty: number }[];
    topReceivables: { id: string; name: string; balance: number }[];
  };
  liabilities: {
    accountsPayable: number;
    customerCredits: number;
    total: number;
    topPayables: { id: string; supplier: string; invoice: string; balance: number }[];
  };
  equity: {
    ownersEquity: number;
    periodNetProfit: number;
    total: number;
  };
  totals: {
    assets: number;
    liabilitiesAndEquity: number;
    balanced: boolean;
  };
  lines: { side: string; label: string; amount: number; emphasis?: boolean }[];
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

const periodLabel = (from: string, to: string) =>
  from === "2000-01-01"
    ? "All dates"
    : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

export function BalanceSheet() {
  const { toast } = useToast();
  const initial = rangeFor("last30");
  const [preset, setPreset] = useState<Preset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("all");
  const [report, setReport] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (branchId !== "all") params.branchId = branchId;
      const response = await apiClient.get("/balance-sheet", { params });
      setReport(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load balance sheet",
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
    setFrom(draftFrom);
    setTo(draftTo);
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
    const rows = report.lines
      .map(
        (line) => `<tr class="${line.emphasis ? "emph" : ""}">
          <td>${line.label}</td>
          <td style="text-align:right">${moneyWithScale(line.amount)}</td>
        </tr>`,
      )
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Balance Sheet</title>
      <style>
        body{font-family:system-ui,sans-serif;color:#0f172a;padding:28px}
        .top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #e2e8f0;padding-bottom:12px}
        img{height:56px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th{background:#f8fafc;color:#64748b;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}
        td{border-bottom:1px solid #f1f5f9;padding:8px}
        tr.emph td{font-weight:600;background:#f8fafc}
        .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}
        .card{border:1px solid #e2e8f0;padding:12px;background:#fff;border-radius:8px}
      </style></head><body>
      <div class="top"><img src="${window.location.origin}/logo.png" alt="Manpasand" />
      <div style="text-align:right"><h1 style="margin:0">Balance Sheet</h1>
      <p style="margin:4px 0 0;color:#64748b">As of ${format(new Date(`${report.asOf}T00:00:00`), "dd MMM yyyy")} · ${branchLabel}</p>
      <p style="margin:2px 0 0;color:#64748b">${periodLabel(from, to)}</p></div></div>
      <div class="cards">
        <div class="card"><div>Cash in hand</div><strong>${moneyWithScale(report.assets.cashOnHand)}</strong></div>
        <div class="card"><div>Bank</div><strong>${moneyWithScale(report.assets.bank)}</strong></div>
        <div class="card"><div>Inventory</div><strong>${moneyWithScale(report.assets.inventory)}</strong></div>
        <div class="card"><div>Receivables</div><strong>${moneyWithScale(report.assets.accountsReceivable)}</strong></div>
        <div class="card"><div>Total assets</div><strong>${moneyWithScale(report.assets.total)}</strong></div>
      </div>
      <table><thead><tr><th>Particulars</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <ReportShell>
      <ReportHeader
        icon={Landmark}
        iconClassName="bg-slate-800"
        title="Balance Sheet"
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
            <span className="hidden text-slate-400 sm:inline">(net profit memo)</span>
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
              onClick={() => report && downloadBalanceSheetPdf(report, { from, to, branchLabel })}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </>
        }
      />

      <CompactReportFilters
        summary={`As of ${asOfLabel} · ${branchLabel}`}
        loading={loading && !!report}
        actions={
          <>
            {preset === "custom" ? (
              <Button size="sm" className="h-8" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={() => applyPreset("last30")}
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

      {loading && !report ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <PageLoader message="Loading balance sheet..." />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 md:gap-4">
            <KpiCard
              label="Cash in hand"
              value={money(report?.assets.cashOnHand || 0)}
              rawValue={report?.assets.cashOnHand || 0}
              hint="Chart of Accounts"
              accent="bg-emerald-500"
              tone="bg-emerald-50 text-emerald-600"
              icon={Wallet}
              loading={loading}
            />
            <KpiCard
              label="Bank"
              value={money(report?.assets.bank || 0)}
              rawValue={report?.assets.bank || 0}
              hint="Chart of Accounts"
              accent="bg-sky-500"
              tone="bg-sky-50 text-sky-600"
              icon={Landmark}
              loading={loading}
            />
            <KpiCard
              label="Inventory"
              value={money(report?.assets.inventory || 0)}
              rawValue={report?.assets.inventory || 0}
              hint={report ? `${report.assets.inventoryQty.toLocaleString()} pcs` : undefined}
              accent="bg-amber-500"
              tone="bg-amber-50 text-amber-600"
              icon={Package}
              loading={loading}
            />
            <KpiCard
              label="Receivables"
              value={money(report?.assets.accountsReceivable || 0)}
              rawValue={report?.assets.accountsReceivable || 0}
              accent="bg-violet-500"
              tone="bg-violet-50 text-violet-600"
              icon={Receipt}
              loading={loading}
            />
            <KpiCard
              label="Total assets"
              value={money(report?.assets.total || 0)}
              rawValue={report?.assets.total || 0}
              accent="bg-[#a67c2e]"
              tone="bg-amber-50 text-[#8a6524]"
              icon={Scale}
              loading={loading}
              emphasis
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Statement of financial position"
              footer={
                report
                  ? report.totals.balanced
                    ? "Assets balance with liabilities + equity."
                    : "Totals need review — assets and liabilities + equity differ."
                  : undefined
              }
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Particulars</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!report || report.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-10 text-center text-slate-500">
                        No balances available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.lines.map((line, index) => (
                      <TableRow
                        key={`${line.label}-${index}`}
                        className={
                          line.emphasis ? "bg-slate-50 font-semibold" : index % 2 === 1 ? "bg-slate-50/40" : undefined
                        }
                      >
                        <TableCell className={line.emphasis ? "text-slate-900" : "text-slate-800"}>
                          {line.label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={line.amount} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <div className="space-y-4">
              <SnapshotCard title="Assets" caption="Summary as of end date">
                <MetricRow
                  label="Cash in hand"
                  value={money(report?.assets.cashOnHand || 0)}
                  rawValue={report?.assets.cashOnHand || 0}
                />
                <MetricRow label="Bank" value={money(report?.assets.bank || 0)} rawValue={report?.assets.bank || 0} />
                <MetricRow
                  label="Inventory"
                  value={money(report?.assets.inventory || 0)}
                  rawValue={report?.assets.inventory || 0}
                />
                <MetricRow
                  label="Accounts receivable"
                  value={money(report?.assets.accountsReceivable || 0)}
                  rawValue={report?.assets.accountsReceivable || 0}
                />
                <MetricRow
                  label="Total assets"
                  value={money(report?.assets.total || 0)}
                  rawValue={report?.assets.total || 0}
                />
              </SnapshotCard>
              <SnapshotCard title="Liabilities & equity" caption="Obligations and owner position">
                <MetricRow
                  label="Accounts payable"
                  value={money(report?.liabilities.accountsPayable || 0)}
                  rawValue={report?.liabilities.accountsPayable || 0}
                />
                <MetricRow
                  label="Customer credits"
                  value={money(report?.liabilities.customerCredits || 0)}
                  rawValue={report?.liabilities.customerCredits || 0}
                />
                <MetricRow
                  label="Owner's equity"
                  value={money(report?.equity.ownersEquity || 0)}
                  rawValue={report?.equity.ownersEquity || 0}
                />
                <MetricRow
                  label="Period net profit (memo)"
                  value={money(report?.equity.periodNetProfit || 0)}
                  rawValue={report?.equity.periodNetProfit || 0}
                />
                <p className="py-2.5 text-xs text-slate-500">
                  Position is as of the end date. Period range feeds the net profit memo only.
                </p>
              </SnapshotCard>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              title="Cash & bank accounts"
              caption="Ledger balances from Chart of Accounts: opening balance + sales and customer receipts − refunds, expenses, supplier, salary and advance payments."
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Account</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.assets.moneyAccounts || []).map((row, i) => (
                    <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                      <TableCell>
                        <div className="font-medium text-slate-800">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.code} · {row.kind === "BANK" ? "Bank" : "Cash"}
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.balance < 0 ? "text-rose-700" : "text-slate-800",
                        )}
                      >
                        <MoneyCell value={row.balance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-y border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">In register drawers (memo)</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Counted / expected cash in each till — part of Cash in hand. Total{" "}
                  {money(report?.assets.cashInRegisters || 0)}.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Branch</TableHead>
                    <TableHead className={reportThCls}>Status</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.assets.cashByBranch || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No till sessions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.assets.cashByBranch.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.code}</div>
                        </TableCell>
                        <TableCell className="text-slate-600">{row.status}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.amount} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <SectionCard title="Inventory by branch">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Branch</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Qty</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.assets.inventoryByBranch || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                        No inventory value as of this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.assets.inventoryByBranch.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.code}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          {row.qty.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.value} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Top receivables">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Customer</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.assets.topReceivables || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-slate-500">
                        No receivables as of this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.assets.topReceivables.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell className="text-slate-800">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.balance} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <SectionCard title="Top payables">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={reportThCls}>Supplier / invoice</TableHead>
                    <TableHead className={cn(reportThCls, "text-right")}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.liabilities.topPayables || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-slate-500">
                        No payables as of this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report?.liabilities.topPayables.map((row, i) => (
                      <TableRow key={row.id} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                        <TableCell>
                          <div className="font-medium text-slate-800">{row.supplier}</div>
                          <div className="text-xs text-slate-500">{row.invoice}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-800">
                          <MoneyCell value={row.balance} />
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
