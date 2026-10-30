"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Briefcase,
  ChevronRight,
  Download,
  Gift,
  HandCoins,
  Info,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { rangeForPreset, type DatePreset } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { Bone } from "./coa-ui";
import { apiError, money } from "./coa-shared";
import { PaidFromSelect, useMoneyAccounts, type PaymentRouting } from "@/components/expense-account-select";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type FlowAccount = {
  id: string;
  code: string;
  name: string;
  kind: "CASH" | "BANK";
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
};
type FlowSource = {
  key: string;
  label: string;
  direction: "in" | "out" | "both";
  moneyIn: number;
  moneyOut: number;
  net: number;
  count: number;
  byAccount: Record<string, { in: number; out: number }>;
};
type FlowLine = {
  source: string;
  accountId: string;
  date: string | null;
  kind: string;
  reference: string | null;
  description: string;
  moneyIn: number;
  moneyOut: number;
};
type FlowData = {
  from: string;
  to: string;
  totals: { opening: number; moneyIn: number; moneyOut: number; closing: number };
  accounts: FlowAccount[];
  sources: FlowSource[];
  lines: FlowLine[];
  truncated: boolean;
};

type Icon = ComponentType<{ className?: string }>;

/** Every place money can come from / go to — always listed, even at zero. */
const IN_ROWS: { key: string; label: string; hint: string; icon: Icon }[] = [
  { key: "SALES", label: "Sales", hint: "Cash, card and wallet tenders", icon: ShoppingBag },
  { key: "CUSTOMER_RECEIPTS", label: "Customer payments", hint: "Received on credit accounts", icon: HandCoins },
  { key: "GIFT_CARDS", label: "Gift cards sold", hint: "Cards sold or reloaded", icon: Gift },
  { key: "SUPPLIERS", label: "Supplier refunds", hint: "Money back from suppliers", icon: Truck },
  { key: "STAFF_ADVANCES", label: "Advances repaid", hint: "Staff paying back in cash", icon: Banknote },
  { key: "JOURNALS", label: "Journal entries", hint: "Manual vouchers into cash / bank", icon: BookOpen },
];
const OUT_ROWS: { key: string; label: string; hint: string; icon: Icon }[] = [
  { key: "EXPENSES", label: "Expenses", hint: "Approved bills, from their “Paid from”", icon: Receipt },
  { key: "SUPPLIERS", label: "Supplier payments", hint: "Stock In and supplier payments", icon: Truck },
  { key: "SALARIES", label: "Salaries", hint: "Net salary paid", icon: Users },
  { key: "COMMISSIONS", label: "Commissions", hint: "Commission paid", icon: Briefcase },
  { key: "STAFF_ADVANCES", label: "Staff advances", hint: "Advances given to staff", icon: Banknote },
  { key: "SALE_REFUNDS", label: "Sale refunds", hint: "Money returned on returns", icon: RotateCcw },
  { key: "CUSTOMER_RECEIPTS", label: "Customer refunds", hint: "Refunds on customer accounts", icon: HandCoins },
  { key: "JOURNALS", label: "Journal entries", hint: "Manual vouchers out of cash / bank", icon: BookOpen },
];

const PRESETS: { id: Exclude<DatePreset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "thisWeek", label: "This week" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All time" },
];

type Drill = { key: string; label: string; side: "in" | "out" } | { account: FlowAccount };

const pct = (part: number, whole: number) => (whole > 0.005 ? Math.round((part / whole) * 100) : 0);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Money Flow — where money came into Cash in Hand / Bank from, and where it
 * went, for a period. Same postings as the Chart of Accounts ledger.
 */
export function MoneyFlow() {
  const { toast } = useToast();
  const [preset, setPreset] = useState<DatePreset>("thisMonth");
  const [range, setRange] = useState(() => rangeForPreset("thisMonth"));
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/chart-of-accounts/money-flow", { params: { from: range.from, to: range.to } });
      setData(res.data?.data ?? null);
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't load money flow", description: apiError(e) });
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountName = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a.name])), [data]);
  const sourceBy = useMemo(() => new Map((data?.sources ?? []).map((s) => [s.key, s])), [data]);
  const totals = data?.totals ?? { opening: 0, moneyIn: 0, moneyOut: 0, closing: 0 };
  const net = totals.moneyIn - totals.moneyOut;
  const quiet = !!data && totals.moneyIn < 0.005 && totals.moneyOut < 0.005;

  const drillLines = useMemo(() => {
    if (!data || !drill) return [];
    if ("account" in drill) return data.lines.filter((l) => l.accountId === drill.account.id);
    return data.lines.filter((l) => l.source === drill.key && (drill.side === "in" ? l.moneyIn > 0 : l.moneyOut > 0));
  }, [data, drill]);

  const exportDrill = () => {
    const ws = XLSX.utils.json_to_sheet(
      drillLines.map((l) => ({
        Date: l.date ? l.date.slice(0, 10) : "",
        Account: accountName.get(l.accountId) ?? "",
        Description: l.description,
        Reference: l.reference ?? "",
        "Money in": l.moneyIn || "",
        "Money out": l.moneyOut || "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Money flow");
    XLSX.writeFile(wb, `money-flow_${range.from}_${range.to}.xlsx`);
  };

  const sideRows = (side: "in" | "out") =>
    (side === "in" ? IN_ROWS : OUT_ROWS).map((row) => {
      const src = sourceBy.get(row.key);
      const amount = src ? (side === "in" ? src.moneyIn : src.moneyOut) : 0;
      const split = src
        ? Object.entries(src.byAccount)
            .map(([id, v]) => ({ name: accountName.get(id) ?? "Account", value: side === "in" ? v.in : v.out }))
            .filter((x) => x.value > 0.005)
        : [];
      return { ...row, amount, split };
    });
  const inRows = sideRows("in");
  const outRows = sideRows("out");

  return (
    <div className="min-h-full bg-[#f8f6f2]">
      {/* Header band — same as Accounts */}
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 md:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2a2012]">Money Flow</h1>
            <p className="text-sm text-gray-500">Where money came into Cash in Hand and Bank from — and where it went.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Payment accounts
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#f8f6f2] p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPreset(p.id);
                  setRange(rangeForPreset(p.id));
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  preset === p.id ? "bg-white text-[#2a2012] shadow-sm" : "text-gray-500 hover:text-gray-800",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <YmdDatePicker
              value={range.from}
              max={range.to}
              onChange={(v) => {
                setPreset("custom");
                setRange((r) => ({ ...r, from: v }));
              }}
              className="h-9 w-[150px]"
            />
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <YmdDatePicker
              value={range.to}
              min={range.from}
              onChange={(v) => {
                setPreset("custom");
                setRange((r) => ({ ...r, to: v }));
              }}
              className="h-9 w-[150px]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 md:px-6">
        {/* Summary strip */}
        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
          <div className="grid grid-cols-2 divide-gray-100 lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-gray-100 lg:[&>*:nth-child(-n+2)]:border-b-0">
            <Summary label="Opening balance" value={totals.opening} hint={`Cash + bank before ${range.from}`} loading={loading && !data} />
            <Summary label="Money in" value={totals.moneyIn} tone="in" icon={ArrowDownLeft} loading={loading && !data} />
            <Summary label="Money out" value={totals.moneyOut} tone="out" icon={ArrowUpRight} loading={loading && !data} />
            <Summary
              label="Closing balance"
              value={totals.closing}
              tone="brand"
              hint={`${net >= 0 ? "+" : "−"}${money(Math.abs(net))} this period`}
              loading={loading && !data}
            />
          </div>
        </div>

        {quiet ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#a67c2e]/25 bg-[#fcf8f2] px-4 py-3 text-sm text-[#5c4520]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
            <span>
              No money moved {preset === "today" ? "today" : "in this period"}. Sales, expenses, salaries and supplier payments show up here
              as soon as they are recorded — try <button className="font-semibold underline" onClick={() => { setPreset("all"); setRange(rangeForPreset("all")); }}>All time</button>.
            </span>
          </div>
        ) : null}

        {/* Flow board */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)_minmax(0,1fr)]">
          <FlowColumn
            title="Money in"
            subtitle="Where it came from"
            side="in"
            total={totals.moneyIn}
            rows={inRows}
            loading={loading && !data}
            onOpen={(row) => setDrill({ key: row.key, label: row.label, side: "in" })}
          />

          {/* Cash & bank */}
          <section className="rounded-xl bg-[#2a2012] p-4 text-white shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold">Cash &amp; Bank</h2>
                <p className="text-xs text-stone-400">{data?.accounts.length ?? 0} account{data?.accounts.length === 1 ? "" : "s"}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums">{money(totals.closing)}</span>
            </div>
            <div className="space-y-2.5">
              {loading && !data ? <Bone className="h-32 bg-white/10" /> : null}
              {(data?.accounts ?? []).map((a) => {
                const AccountIcon = a.kind === "BANK" ? Landmark : Wallet;
                const share = pct(Math.max(0, a.closing), Math.max(0.01, (data?.accounts ?? []).reduce((t, x) => t + Math.max(0, x.closing), 0)));
                return (
                  <button
                    key={a.id}
                    onClick={() => setDrill({ account: a })}
                    className="group w-full rounded-lg bg-white/[0.06] p-3 text-left ring-1 ring-white/10 transition hover:bg-white/[0.1]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#a67c2e]/25 text-[#e6c88f]">
                        <AccountIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="font-mono text-[10px] text-stone-400">{a.code}</p>
                      </div>
                      <p className={cn("text-base font-semibold tabular-nums", a.closing < 0 && "text-rose-300")}>{money(a.closing)}</p>
                      <ChevronRight className="h-4 w-4 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-stone-300" />
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                      <MiniStat label="Opening" value={a.opening} />
                      <MiniStat label="In" value={a.moneyIn} tone="in" />
                      <MiniStat label="Out" value={a.moneyOut} tone="out" />
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[#c9a25a]" style={{ width: `${share}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
              Card, transfer and wallet money lands in the account set in <span className="text-stone-200">Payment accounts</span>. Moving cash
              between the safe and a till is still Cash in Hand.
            </p>
          </section>

          <FlowColumn
            title="Money out"
            subtitle="Where it went"
            side="out"
            total={totals.moneyOut}
            rows={outRows}
            loading={loading && !data}
            onOpen={(row) => setDrill({ key: row.key, label: row.label, side: "out" })}
          />
        </div>

        {data?.truncated ? (
          <p className="text-xs text-amber-700">Details show the latest 3,000 transactions — narrow the dates to see older ones.</p>
        ) : null}
      </div>

      {/* Drill-down */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill && "account" in drill ? drill.account.name : drill ? `${drill.label} — money ${drill.side}` : ""}</DialogTitle>
            <DialogDescription>
              {range.from} → {range.to} · {drillLines.length.toLocaleString()} transaction{drillLines.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportDrill} disabled={!drillLines.length}>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {drillLines.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{l.date ? l.date.slice(0, 10) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{accountName.get(l.accountId)}</td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{l.description}</div>
                      {l.reference ? <div className="text-[11px] text-gray-500">{l.reference}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700">{l.moneyIn ? money(l.moneyIn) : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-rose-700">{l.moneyOut ? money(l.moneyOut) : ""}</td>
                  </tr>
                ))}
                {!drillLines.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-gray-500">
                      No transactions in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentAccountsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={() => void load()} />

      {loading && data ? (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-600 shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating…
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Summary({
  label,
  value,
  hint,
  tone,
  icon: SummaryIcon,
  loading,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "in" | "out" | "brand";
  icon?: Icon;
  loading?: boolean;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5">
        {SummaryIcon ? (
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded",
              tone === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
            )}
          >
            <SummaryIcon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      {loading ? (
        <Bone className="mt-2 h-7 w-32" />
      ) : (
        <p
          className={cn(
            "mt-1 text-xl font-semibold tabular-nums",
            tone === "in" && "text-emerald-700",
            tone === "out" && "text-rose-700",
            tone === "brand" && "text-[#2a2012]",
            !tone && "text-gray-900",
          )}
        >
          {money(value)}
        </p>
      )}
      {hint ? <p className="mt-0.5 truncate text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "in" | "out" }) {
  return (
    <div>
      <p className="text-stone-400">{label}</p>
      <p className={cn("tabular-nums", tone === "in" ? "text-emerald-300" : tone === "out" ? "text-rose-300" : "text-stone-200")}>
        {tone === "in" ? "+" : tone === "out" ? "−" : ""}
        {money(value)}
      </p>
    </div>
  );
}

function FlowColumn({
  title,
  subtitle,
  side,
  total,
  rows,
  loading,
  onOpen,
}: {
  title: string;
  subtitle: string;
  side: "in" | "out";
  total: number;
  rows: { key: string; label: string; hint: string; icon: Icon; amount: number; split: { name: string; value: number }[] }[];
  loading?: boolean;
  onOpen: (row: { key: string; label: string }) => void;
}) {
  const isIn = side === "in";
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            isIn ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600",
          )}
        >
          {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <p className={cn("text-base font-semibold tabular-nums", isIn ? "text-emerald-700" : "text-rose-700")}>
          {isIn ? "+" : "−"}
          {money(total)}
        </p>
      </header>
      <div className="divide-y divide-gray-100">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3">
                <Bone className="h-9" />
              </div>
            ))
          : sorted.map((row) => {
              const RowIcon = row.icon;
              const active = row.amount > 0.005;
              const share = pct(row.amount, total);
              return (
                <button
                  key={`${row.key}-${row.label}`}
                  onClick={() => active && onOpen(row)}
                  disabled={!active}
                  className={cn(
                    "group flex w-full items-center gap-3 px-4 py-3 text-left transition",
                    active ? "hover:bg-[#fcf8f2]" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      active ? (isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700") : "bg-gray-50 text-gray-300",
                    )}
                  >
                    <RowIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm font-medium", active ? "text-gray-900" : "text-gray-400")}>{row.label}</span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          !active ? "text-gray-300" : isIn ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {money(row.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={cn("h-full rounded-full", isIn ? "bg-emerald-500" : "bg-rose-500")}
                          style={{ width: `${active ? Math.max(2, share) : 0}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">{active ? `${share}%` : ""}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-gray-500">
                      {active && row.split.length ? row.split.map((x) => `${x.name} ${money(x.value)}`).join(" · ") : row.hint}
                    </p>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition", active ? "text-gray-300 group-hover:translate-x-0.5 group-hover:text-gray-500" : "text-transparent")} />
                </button>
              );
            })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Payment accounts setting                                            */
/* ------------------------------------------------------------------ */

const ROUTED: { key: keyof PaymentRouting; label: string; hint: string }[] = [
  { key: "CARD", label: "Card payments", hint: "Card machine settlements (sales, refunds, card-paid bills)" },
  { key: "BANK_TRANSFER", label: "Bank transfers", hint: "Online / IBFT transfers in and out" },
  { key: "MOBILE_MONEY", label: "Mobile wallet", hint: "JazzCash, Easypaisa and similar" },
  { key: "CHEQUE", label: "Cheques", hint: "Cheques given and received" },
];

/**
 * Which cash / bank account each non-cash method lands in. New sales and
 * refunds post there, and every "Paid from" picker defaults to it.
 */
function PaymentAccountsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast();
  const accounts = useMoneyAccounts(open);
  const [value, setValue] = useState<PaymentRouting>({});
  const [saving, setSaving] = useState(false);
  const mainBank = accounts.find((a) => a.system_key === "BANK");

  useEffect(() => {
    if (!open) return;
    apiClient
      .get("/chart-of-accounts/payment-routing")
      .then((res) => setValue(res.data?.data || {}))
      .catch(() => setValue({}));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      for (const r of ROUTED) body[r.key] = value[r.key] || null;
      await apiClient.put("/chart-of-accounts/payment-routing", body);
      toast({ title: "Payment accounts saved", description: "New sales and payments will post to these accounts." });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't save", description: apiError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment accounts</DialogTitle>
          <DialogDescription>
            Choose which bank account each payment method goes to. Cash always goes to Cash in Hand. Anything not set uses
            {mainBank ? ` ${mainBank.name}` : " the main Bank account"}. Add more bank accounts in Chart of Accounts under Cash &amp; Bank.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-lg border">
          {ROUTED.map((r) => (
            <div key={r.key} className="grid items-center gap-2 p-3 sm:grid-cols-[170px_1fr]">
              <div>
                <p className="text-sm font-medium text-gray-900">{r.label}</p>
                <p className="text-[11px] text-gray-500">{r.hint}</p>
              </div>
              <PaidFromSelect
                value={value[r.key] || mainBank?.id || ""}
                onChange={(id) => setValue((v) => ({ ...v, [r.key]: id }))}
                accounts={accounts.filter((a) => a.system_key !== "CASH")}
              />
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-[#fcf8f2] px-3 py-2 text-[11px] text-gray-600">
          Applies to sales and payments from now on. Sales already posted stay in the account they went to — move them with a journal
          voucher if needed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
