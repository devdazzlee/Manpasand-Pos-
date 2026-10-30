"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HandCoins,
  History,
  Info,
  Landmark,
  Loader2,
  Lock,
  Pencil,
  PiggyBank,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  Trash2,
  Undo2,
  Wallet,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { YmdDatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { businessTodayYmd, formatBusinessDate, formatBusinessDateTime, shiftBusinessYmd } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { Bone, Panel } from "./coa-ui";
import { apiError } from "./coa-shared";
import { useMoneyAccounts, type MoneyAccountOption } from "@/components/expense-account-select";

/* ================================================================== */
/* Money Check — the owner fixes money mistakes without a developer:   */
/* match Cash / Bank to the real money, fix detected problems, move    */
/* money, and correct any line of a day. Everything is logged + undo.  */
/* ================================================================== */

type MoneyRow = { id: string; code: string; name: string; kind: "CASH" | "BANK"; opening: number; moneyIn: number; moneyOut: number; closing: number };
type IssueAction = Record<string, unknown> & { type: string };
type Issue = { id: string; kind: string; severity: "high" | "medium" | "low"; title: string; detail: string; date: string | null; amount?: number | null; action: IssueAction };
type DayLine = { accountId: string; date: string | null; kind: string; reference: string | null; description: string; moneyIn: number; moneyOut: number; action: IssueAction };
type DayRegister = { id: string; status: string; openedAt: string; closedAt: string | null; closing: number | null; expected: number | null; rows: { method: string; expected: number; actual: number; variance: number }[] };
type DayBook = { date: string; accounts: MoneyRow[]; lines: DayLine[]; registers: DayRegister[] };
type RegisterForm = {
  id: string;
  day: string;
  branch: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  closing: number | null;
  expectedCash: number;
  cashSales: number;
  cashRefunds: number;
  cashOut: number;
  salesByMethod: Record<string, number>;
  expensesByMethod: Record<string, number>;
  expectedByMethod: Record<string, number>;
  rows: { method: string; expected: number; actual: number; variance: number }[];
  note: string | null;
};
type HistoryRow = { id: string; at: string; by: string | null; action: string; summary: string; undoVoucherId: string | null };

const api = {
  summary: (date: string) => apiClient.get("/money-check/summary", { params: { date } }).then((r) => r.data.data as { date: string; accounts: MoneyRow[] }),
  reconcile: (body: Record<string, unknown>) => apiClient.post("/money-check/reconcile", body).then((r) => r.data.data),
  move: (body: Record<string, unknown>) => apiClient.post("/money-check/move", body).then((r) => r.data.data),
  undo: (voucherId: string) => apiClient.delete(`/money-check/entries/${voucherId}`).then((r) => r.data.data),
  issues: () => apiClient.get("/money-check/issues").then((r) => r.data.data as Issue[]),
  dismiss: (issueId: string) => apiClient.post("/money-check/issues/dismiss", { issueId }).then((r) => r.data.data),
  register: (id: string) => apiClient.get(`/money-check/registers/${id}`).then((r) => r.data.data as RegisterForm),
  closeRegister: (id: string, body: Record<string, unknown>) => apiClient.post(`/money-check/registers/${id}/close`, body).then((r) => r.data.data),
  editClosing: (id: string, body: Record<string, unknown>) => apiClient.patch(`/money-check/registers/${id}/closing`, body).then((r) => r.data.data),
  paidFrom: (body: Record<string, unknown>) => apiClient.post("/money-check/paid-from", body).then((r) => r.data.data),
  drawer: (id: string, fromDrawer: boolean) => apiClient.post(`/money-check/supplier-payments/${id}/drawer`, { fromDrawer }).then((r) => r.data.data),
  day: (date: string) => apiClient.get("/money-check/day", { params: { date } }).then((r) => r.data.data as DayBook),
  history: () => apiClient.get("/money-check/history").then((r) => r.data.data as HistoryRow[]),
  updateExpense: (id: string, body: Record<string, unknown>) => apiClient.patch(`/expenses/${id}`, body).then((r) => r.data.data),
  deleteExpense: (id: string) => apiClient.delete(`/expenses/${id}`).then((r) => r.data.data),
  updateSupplierPayment: (supplierId: string, id: string, body: Record<string, unknown>) =>
    apiClient.patch(`/suppliers/${supplierId}/payments/${id}`, body).then((r) => r.data.data),
};

const rs = (v: number | null | undefined) =>
  v == null ? "—" : `Rs ${(Math.round(Number(v) * 100) / 100).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${rs(Math.abs(v))}`;
const isBank = (a: { kind?: string; system_key?: string | null; name: string }) =>
  a.kind ? a.kind === "BANK" : a.system_key === "BANK" || (a.system_key !== "CASH" && /bank/i.test(a.name));
const METHOD_NAME: Record<string, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank transfer", MOBILE_MONEY: "Wallet" };
const timeOf = (iso: string | null) => (iso ? formatBusinessDateTime(iso).split(" · ")[1] ?? "" : "");
/** "13:05" on a business day (Pakistan, UTC+5) → ISO instant. */
const businessInstant = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`).toISOString();
const businessHHMM = (iso: string) => {
  const t = formatBusinessDateTime(iso).split(" · ")[1] ?? "23:59 PM";
  const [hm, ap] = t.split(" ");
  const [h, m] = hm.split(":").map(Number);
  const h24 = ap === "PM" ? (h % 12) + 12 : h % 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

type Section = "match" | "problems" | "move" | "day" | "history";
const SECTIONS: { id: Section; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "match", label: "Match balance", hint: "Books vs real money", icon: Scale },
  { id: "problems", label: "Fix problems", hint: "Found automatically", icon: Wrench },
  { id: "move", label: "Move money", hint: "Deposit, owner, charges", icon: ArrowLeftRight },
  { id: "day", label: "Day book", hint: "Every line of a day", icon: BookOpen },
  { id: "history", label: "History", hint: "Who changed what", icon: History },
];

export function MoneyCheck({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [section, setSection] = useState<Section>("problems");
  const [issueCount, setIssueCount] = useState<{ total: number; high: number } | null>(null);
  const [focusAccount, setFocusAccount] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Problem count for the tab badge, refreshed after every change.
  useEffect(() => {
    api.issues().then((list) => setIssueCount({ total: list.length, high: list.filter((i) => i.severity === "high").length })).catch(() => undefined);
  }, [version]);

  return (
    <div className="min-h-full bg-[#f8f6f2] pb-10">
      <div className="border-b border-gray-200/70 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-5 md:px-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#2a2012]">
              <ShieldCheck className="h-6 w-6 text-[#a67c2e]" /> Money Check
            </h1>
            <p className="text-sm text-gray-500">Find and fix money mistakes yourself. Every change is recorded and can be undone.</p>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={bump}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-left transition-colors",
                  active ? "border-[#a67c2e] text-[#2a2012]" : "border-transparent text-gray-500 hover:text-gray-800",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>
                  <span className="block text-sm font-semibold leading-tight">
                    {s.label}
                    {s.id === "problems" && issueCount && issueCount.total > 0 && (
                      <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white", issueCount.high ? "bg-rose-600" : "bg-amber-500")}>{issueCount.total}</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-gray-400">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 px-4 py-5 md:px-6">
        {section === "match" && <MatchBalance key={`m${version}`} focusAccount={focusAccount} onChanged={bump} />}
        {section === "problems" && (
          <FixProblems
            key={`p${version}`}
            onChanged={bump}
            onReconcile={(accountId) => {
              setFocusAccount(accountId);
              setSection("match");
            }}
          />
        )}
        {section === "move" && <MoveMoney key={`v${version}`} onChanged={bump} />}
        {section === "day" && <DayBookView key={`d${version}`} onChanged={bump} onNavigate={onNavigate} />}
        {section === "history" && <HistoryView key={`h${version}`} onChanged={bump} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-[#a67c2e]/25 bg-[#fcf8f2] px-4 py-3 text-sm text-[#5b4521]">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#a67c2e]" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function AccountIcon({ bank }: { bank: boolean }) {
  const Icon = bank ? Landmark : Wallet;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fcf8f2] text-[#a67c2e]">
      <Icon className="h-5 w-5" />
    </span>
  );
}

function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-gray-700">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

function MoneyInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Rs</span>
      <Input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className="h-10 pl-9 text-right tabular-nums" />
    </div>
  );
}

function AccountSelect({ value, onChange, accounts, exclude }: { value: string; onChange: (v: string) => void; accounts: MoneyAccountOption[]; exclude?: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder="Choose account" />
      </SelectTrigger>
      <SelectContent>
        {accounts
          .filter((a) => a.id !== exclude)
          .map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                {isBank(a) ? <Landmark className="h-3.5 w-3.5 text-gray-400" /> : <Wallet className="h-3.5 w-3.5 text-gray-400" />}
                {a.name}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function DayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = businessTodayYmd();
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(shiftBusinessYmd(value, -1))} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <YmdDatePicker value={value} onChange={(v) => v && onChange(v)} className="h-9 w-40" />
      <Button variant="outline" size="icon" className="h-9 w-9" disabled={value >= today} onClick={() => onChange(shiftBusinessYmd(value, 1))} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {value !== today && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-gray-600">{body}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className={danger ? "bg-rose-600 hover:bg-rose-700" : "bg-[#2a2012] hover:bg-[#3b2e1a]"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Bone key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Match balance                                                    */
/* ------------------------------------------------------------------ */

type Reason = "OWNER_TOOK" | "OWNER_ADDED" | "TRANSFER" | "BANK_CHARGES" | "UNKNOWN";
const REASONS: { id: Reason; label: string; when: "less" | "more" | "both"; bankOnly?: boolean; help: string }[] = [
  { id: "OWNER_TOOK", label: "Owner took the money", when: "less", help: "Cash / bank the owner kept or spent outside the shop" },
  { id: "OWNER_ADDED", label: "Owner put money in", when: "more", help: "Money the owner added from his own pocket" },
  { id: "TRANSFER", label: "Moved to / from the other account", when: "both", help: "e.g. cash deposited in the bank that was never recorded" },
  { id: "BANK_CHARGES", label: "Bank charges / tax", when: "less", bankOnly: true, help: "Charges the bank took that were never entered" },
  { id: "UNKNOWN", label: "Don't know (short / over)", when: "both", help: "Booked as Cash Short & Over so the balance is right" },
];

function MatchBalance({ focusAccount, onChanged }: { focusAccount: string | null; onChanged: () => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState(businessTodayYmd());
  const [rows, setRows] = useState<MoneyRow[] | null>(null);
  const { accounts } = useMoneyAccounts(true);

  const load = useCallback(() => {
    setRows(null);
    api
      .summary(date)
      .then((d) => setRows(d.accounts))
      .catch((e) => toast({ variant: "destructive", title: "Could not load balances", description: apiError(e) }));
  }, [date, toast]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <HowItWorks>
        <p>
          <b>Count the real money</b> — cash in the drawer <i>plus</i> cash with the owner / in the safe — and check the <b>bank app or statement</b>. Type the real
          amount below.
        </p>
        <p>If it is different from the books, pick the reason and save. The difference is recorded properly, so Accounts shows the real money from then on.</p>
      </HowItWorks>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700">Balance at the end of {formatBusinessDate(`${date}T12:00:00+05:00`)}</p>
        <DayPicker value={date} onChange={setDate} />
      </div>
      {!rows ? (
        <LoadingRows rows={2} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <MatchCard key={r.id} row={r} date={date} accounts={accounts} highlight={focusAccount === r.id} onSaved={() => (load(), onChanged())} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ row, date, accounts, highlight, onSaved }: { row: MoneyRow; date: string; accounts: MoneyAccountOption[]; highlight: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState<Reason | "">("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const bank = row.kind === "BANK";
  const real = actual === "" ? null : Number(actual);
  const diff = real == null || Number.isNaN(real) ? null : Math.round((real - row.closing) * 100) / 100;
  const options = REASONS.filter((r) => (diff == null || diff === 0 ? false : r.when === "both" || (diff < 0 ? r.when === "less" : r.when === "more")) && (!r.bankOnly || bank));
  useEffect(() => {
    if (reason && !options.some((o) => o.id === reason)) setReason("");
  }, [options, reason]);
  useEffect(() => {
    if (reason === "TRANSFER" && !other) setOther(accounts.find((a) => a.id !== row.id && isBank(a) !== bank)?.id ?? "");
  }, [reason, other, accounts, row.id, bank]);

  const save = async () => {
    if (diff == null) return toast({ variant: "destructive", title: "Type the real amount" });
    if (Math.abs(diff) < 0.01) return toast({ title: `${row.name} already matches`, description: "Nothing to record." });
    if (!reason) return toast({ variant: "destructive", title: "Pick why it is different" });
    if (reason === "TRANSFER" && !other) return toast({ variant: "destructive", title: "Pick the other account" });
    setBusy(true);
    try {
      await api.reconcile({ accountId: row.id, actual: real, date, reason, otherAccountId: reason === "TRANSFER" ? other : null, note: note.trim() || null });
      toast({ title: `${row.name} matched`, description: `${signed(diff)} recorded. You can undo it in History.` });
      setActual("");
      setReason("");
      setNote("");
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className={cn(highlight && "ring-2 ring-[#a67c2e]")} bodyClassName="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AccountIcon bank={bank} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{row.name}</p>
          <p className="text-[11px] text-gray-500">
            This day: in {rs(row.moneyIn)} · out {rs(row.moneyOut)} · started at {rs(row.opening)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Books say</p>
          <p className={cn("text-xl font-semibold tabular-nums", row.closing < 0 ? "text-rose-700" : "text-gray-900")}>{rs(row.closing)}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={bank ? "Really in the bank (app / statement)" : "Really have (drawer + owner / safe)"}>
          <MoneyInput value={actual} onChange={setActual} placeholder={String(Math.round(row.closing))} />
        </Field>
        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Difference</p>
          <p className={cn("text-lg font-semibold tabular-nums", diff == null || diff === 0 ? "text-gray-400" : diff > 0 ? "text-emerald-700" : "text-rose-700")}>
            {diff == null ? "—" : diff === 0 ? "Matches ✓" : signed(diff)}
          </p>
          <p className="text-[11px] text-gray-500">{diff == null ? "Type the real amount" : diff > 0 ? "More than the books" : diff < 0 ? "Less than the books" : "Nothing to fix"}</p>
        </div>
      </div>
      {diff != null && Math.abs(diff) >= 0.01 && (
        <div className="space-y-3">
          <Field label="Why is it different?">
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setReason(o.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    reason === o.id ? "border-[#a67c2e] bg-[#fcf8f2] ring-1 ring-[#a67c2e]" : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                  <span className="block text-[11px] text-gray-500">{o.help}</span>
                </button>
              ))}
            </div>
          </Field>
          {reason === "TRANSFER" && (
            <Field label={diff < 0 ? "Moved to" : "Came from"}>
              <AccountSelect value={other} onChange={setOther} accounts={accounts} exclude={row.id} />
            </Field>
          )}
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. owner took cash for home" className="h-9" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Record {signed(diff)} and match
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Fix problems                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY: Record<Issue["severity"], { label: string; cls: string; icon: ComponentType<{ className?: string }> }> = {
  high: { label: "Fix now", cls: "bg-rose-50 text-rose-700 ring-rose-200", icon: AlertTriangle },
  medium: { label: "Check", cls: "bg-amber-50 text-amber-800 ring-amber-200", icon: AlertTriangle },
  low: { label: "Confirm", cls: "bg-sky-50 text-sky-700 ring-sky-200", icon: Info },
};

function FixProblems({ onChanged, onReconcile }: { onChanged: () => void; onReconcile: (accountId: string) => void }) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [registerFor, setRegisterFor] = useState<{ id: string; mode: "close" | "edit"; suggestedClosedAt?: string } | null>(null);
  const [paidFor, setPaidFor] = useState<Issue | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .issues()
      .then(setIssues)
      .catch((e) => toast({ variant: "destructive", title: "Could not check for problems", description: apiError(e) }));
  }, [toast]);
  useEffect(load, [load]);
  const done = () => (load(), onChanged());

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast({ title: ok });
      done();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not fix", description: apiError(e) });
    } finally {
      setBusyId(null);
    }
  };

  if (!issues) return <LoadingRows />;
  return (
    <div className="space-y-4">
      <HowItWorks>
        <p>
          The system checks the last 60 days for money mistakes: registers left open, payments taken from the wrong account, closings that are off, and
          balances below zero. Fix each one here — no developer needed.
        </p>
        <p>If something is actually correct (for example a real cash shortage), press <b>It&apos;s correct</b> to hide it.</p>
      </HowItWorks>
      {issues.length === 0 ? (
        <Panel bodyClassName="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-base font-semibold text-gray-900">Everything looks right</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">No money problems found. To compare with the real cash and bank, use Match balance.</p>
        </Panel>
      ) : (
        <div className="space-y-2.5">
          {issues.map((i) => {
            const sev = SEVERITY[i.severity];
            const SevIcon = sev.icon;
            const a = i.action;
            const busy = busyId === i.id;
            return (
              <Panel key={i.id} bodyClassName="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className={cn("mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset", sev.cls)}>
                    <SevIcon className="h-3.5 w-3.5" /> {sev.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{i.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{i.detail}</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {i.date ? formatBusinessDate(`${i.date}T12:00:00+05:00`) : ""}
                      {i.amount != null ? ` · ${rs(i.amount)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {a.type === "CLOSE_REGISTER" && (
                    <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setRegisterFor({ id: String(a.sessionId), mode: "close", suggestedClosedAt: String(a.suggestedClosedAt) })}>
                      <Lock className="mr-1.5 h-4 w-4" /> Close register
                    </Button>
                  )}
                  {a.type === "EDIT_CLOSING" && (
                    <Button size="sm" variant="outline" onClick={() => setRegisterFor({ id: String(a.sessionId), mode: "edit" })}>
                      <Pencil className="mr-1.5 h-4 w-4" /> Correct the count
                    </Button>
                  )}
                  {a.type === "SET_PAID_FROM" && (
                    <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => setPaidFor(i)}>
                      <Wallet className="mr-1.5 h-4 w-4" /> Choose account
                    </Button>
                  )}
                  {a.type === "RECONCILE" && (
                    <Button size="sm" className="bg-[#2a2012] hover:bg-[#3b2e1a]" onClick={() => onReconcile(String(a.accountId))}>
                      <Scale className="mr-1.5 h-4 w-4" /> Match balance
                    </Button>
                  )}
                  {a.type === "DRAWER_SOURCE" && (
                    <>
                      <Button
                        size="sm"
                        variant={a.fromDrawer ? "default" : "outline"}
                        className={a.fromDrawer ? "bg-[#2a2012] hover:bg-[#3b2e1a]" : ""}
                        disabled={busy}
                        onClick={() => run(i.id, () => api.drawer(String(a.paymentId), true), "Marked as taken from that day's drawer")}
                      >
                        From that day&apos;s drawer
                      </Button>
                      <Button
                        size="sm"
                        variant={!a.fromDrawer ? "default" : "outline"}
                        className={!a.fromDrawer ? "bg-[#2a2012] hover:bg-[#3b2e1a]" : ""}
                        disabled={busy}
                        onClick={() => run(i.id, () => api.drawer(String(a.paymentId), false), "Marked as paid from cash already taken out")}
                      >
                        From cash taken out earlier
                      </Button>
                    </>
                  )}
                  {a.type !== "CLOSE_REGISTER" && a.type !== "DRAWER_SOURCE" && (
                    <Button size="sm" variant="ghost" className="text-gray-500" disabled={busy} onClick={() => run(i.id, () => api.dismiss(i.id), "Hidden — marked as correct")}>
                      It&apos;s correct
                    </Button>
                  )}
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {registerFor && <RegisterDialog {...registerFor} onClose={() => setRegisterFor(null)} onSaved={done} />}
      {paidFor && (
        <PaidFromDialog
          issue={paidFor}
          onClose={() => setPaidFor(null)}
          onSaved={() => {
            setPaidFor(null);
            done();
          }}
        />
      )}
    </div>
  );
}

function PaidFromDialog({ issue, onClose, onSaved }: { issue: Issue; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { accounts } = useMoneyAccounts(true);
  const [choice, setChoice] = useState(String(issue.action.currentAccountId ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!choice) return toast({ variant: "destructive", title: "Choose where the money came from" });
    setBusy(true);
    try {
      await api.paidFrom({ entity: issue.action.entity, id: issue.action.id, accountId: choice });
      toast({ title: "Fixed", description: "The register and the books now agree." });
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Where did the money come from?</DialogTitle>
          <DialogDescription>{issue.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setChoice(a.id)}
              className={cn("flex items-center gap-3 rounded-lg border px-3 py-3 text-left", choice === a.id ? "border-[#a67c2e] bg-[#fcf8f2] ring-1 ring-[#a67c2e]" : "border-gray-200 hover:bg-gray-50")}
            >
              <AccountIcon bank={isBank(a)} />
              <span>
                <span className="block text-sm font-semibold text-gray-900">{a.name}</span>
                <span className="block text-[11px] text-gray-500">{isBank(a) ? "Paid by card / bank transfer — the drawer is not touched" : "Paid in cash — comes out of cash in hand"}</span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Close a forgotten register, or correct a closed register's count — no reopen needed. */
function RegisterDialog({ id, mode, suggestedClosedAt, onClose, onSaved }: { id: string; mode: "close" | "edit"; suggestedClosedAt?: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<RegisterForm | null>(null);
  const [cash, setCash] = useState("");
  const [rows, setRows] = useState<Record<string, string>>({});
  const [time, setTime] = useState("23:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .register(id)
      .then((f) => {
        setForm(f);
        setCash(f.closing != null ? String(f.closing) : "");
        const methods = ["CARD", "BANK_TRANSFER", "MOBILE_MONEY"].filter(
          (m) => (f.salesByMethod[m] || 0) !== 0 || (f.expensesByMethod[m] || 0) !== 0 || f.rows.some((r) => r.method === m),
        );
        setRows(Object.fromEntries(methods.map((m) => [m, String(f.rows.find((r) => r.method === m)?.actual ?? f.expectedByMethod[m] ?? 0)])));
        if (suggestedClosedAt) setTime(businessHHMM(suggestedClosedAt));
        setNote(f.note ?? "");
      })
      .catch((e) => toast({ variant: "destructive", title: "Could not load the register", description: apiError(e) }));
  }, [id, suggestedClosedAt, toast]);

  const cashDiff = form && cash !== "" ? Math.round((Number(cash) - form.expectedCash) * 100) / 100 : null;
  const save = async () => {
    if (!form) return;
    if (cash === "" || Number(cash) < 0) return toast({ variant: "destructive", title: "Type the cash counted" });
    setBusy(true);
    try {
      const reconciliations = Object.entries(rows).map(([method, v]) => ({ method, actual: Number(v || 0) }));
      if (mode === "close") {
        // A time before the opening means after midnight (still that business day).
        let closedAt = businessInstant(form.day, time);
        if (new Date(closedAt) <= new Date(form.openedAt)) closedAt = businessInstant(shiftBusinessYmd(form.day, 1), time);
        await api.closeRegister(id, { closing: Number(cash), reconciliations, closedAt, note: note.trim() || null });
        toast({ title: "Register closed", description: `${form.day} is now closed with these counts.` });
      } else {
        await api.editClosing(id, { closing: Number(cash), reconciliations, note: note.trim() || null });
        toast({ title: "Closing corrected", description: "Expected, difference and the books were updated." });
      }
      onSaved();
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "close" ? "Close the register left open" : "Correct the closing count"}</DialogTitle>
          <DialogDescription>
            {form ? `${form.branch ?? "Register"} · ${formatBusinessDate(`${form.day}T12:00:00+05:00`)}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {!form ? (
          <LoadingRows rows={2} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <MiniStat label="Cash sales" value={rs(form.cashSales - form.cashRefunds)} />
              <MiniStat label="Cash out (expenses)" value={rs(form.cashOut)} tone="out" />
              <MiniStat label="Should be in drawer" value={rs(form.expectedCash)} strong />
            </div>
            <Field label="Cash counted in the drawer" hint={cashDiff == null ? undefined : cashDiff === 0 ? "Matches ✓" : `${cashDiff > 0 ? "Extra" : "Short"} ${rs(Math.abs(cashDiff))}`}>
              <MoneyInput value={cash} onChange={setCash} autoFocus />
            </Field>
            {Object.keys(rows).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-700">Card / bank — what is really in the bank for this day</Label>
                {Object.keys(rows).map((m) => {
                  const sales = form.salesByMethod[m] || 0;
                  const spent = form.expensesByMethod[m] || 0;
                  const should = form.expectedByMethod[m] ?? sales - spent;
                  const d = Math.round((Number(rows[m] || 0) - should) * 100) / 100;
                  return (
                    <div key={m} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {METHOD_NAME[m]} · should be {rs(should)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          sales {rs(sales)}
                          {spent ? ` − expenses paid by ${METHOD_NAME[m].toLowerCase()} ${rs(spent)}` : ""}
                          {Math.abs(d) >= 0.5 ? ` · ${d > 0 ? "extra" : "short"} ${rs(Math.abs(d))}` : " · matches"}
                        </p>
                      </div>
                      <div className="w-40">
                        <MoneyInput value={rows[m]} onChange={(v) => setRows({ ...rows, [m]: v })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {mode === "close" && (
              <Field label="Closing time (that day)" hint="Set after the last sale / payment of that day, so later days stay out.">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-36" />
              </Field>
            )}
            <Field label="Note (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. count was typed wrong, corrected from the shop sheet" />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "close" ? "Close register" : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "out" }) {
  return (
    <div className={cn("rounded-lg border px-2 py-2", strong ? "border-[#2a2012] bg-[#2a2012] text-white" : "border-gray-200 bg-gray-50")}>
      <p className={cn("text-[11px]", strong ? "text-stone-300" : "text-gray-500")}>{label}</p>
      <p className={cn("font-semibold tabular-nums", tone === "out" && !strong && "text-rose-700")}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Move money                                                       */
/* ------------------------------------------------------------------ */

type MoveType = "CASH_TO_BANK" | "BANK_TO_CASH" | "OWNER_TOOK" | "OWNER_ADDED" | "BANK_CHARGES";
const MOVES: { id: MoveType; label: string; help: string; icon: ComponentType<{ className?: string }>; from?: "CASH" | "BANK"; to?: "CASH" | "BANK" }[] = [
  { id: "CASH_TO_BANK", label: "Cash deposited in bank", help: "Cash taken to the bank", icon: ArrowUpRight, from: "CASH", to: "BANK" },
  { id: "BANK_TO_CASH", label: "Cash withdrawn from bank", help: "ATM / cheque cash for the shop", icon: ArrowDownLeft, from: "BANK", to: "CASH" },
  { id: "OWNER_TOOK", label: "Owner took money", help: "Owner kept cash or used shop money", icon: HandCoins, from: "CASH" },
  { id: "OWNER_ADDED", label: "Owner put money in", help: "From the owner's own pocket", icon: PiggyBank, to: "CASH" },
  { id: "BANK_CHARGES", label: "Bank charges / tax", help: "Charges the bank deducted", icon: Receipt, from: "BANK" },
];

function MoveMoney({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const { accounts } = useMoneyAccounts(true);
  const [type, setType] = useState<MoveType | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(businessTodayYmd());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<HistoryRow[] | null>(null);
  const meta = MOVES.find((m) => m.id === type);
  const byKind = (k?: "CASH" | "BANK") => (k ? accounts.find((a) => (k === "BANK" ? isBank(a) : !isBank(a)))?.id ?? "" : "");

  const loadRecent = useCallback(() => {
    api
      .history()
      .then((h) => setRecent(h.filter((r) => r.action === "money_check.move").slice(0, 8)))
      .catch(() => setRecent([]));
  }, []);
  useEffect(loadRecent, [loadRecent]);

  const pick = (m: MoveType) => {
    const mm = MOVES.find((x) => x.id === m)!;
    setType(m);
    setFrom(byKind(mm.from));
    setTo(byKind(mm.to));
    setAmount("");
    setNote("");
  };
  const save = async () => {
    if (!type) return;
    if (!(Number(amount) > 0)) return toast({ variant: "destructive", title: "Type the amount" });
    setBusy(true);
    try {
      await api.move({ type, amount: Number(amount), date, fromAccountId: meta?.from ? from : null, toAccountId: meta?.to ? to : null, note: note.trim() || null });
      toast({ title: "Recorded", description: `${meta?.label} · ${rs(Number(amount))}` });
      setType(null);
      loadRecent();
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not record", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <HowItWorks>
        <p>Money that moves outside a sale or expense — deposits, the owner taking or adding money, bank charges. Record it here and Cash in Hand / Bank stay equal to the real money.</p>
      </HowItWorks>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {MOVES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className={cn("flex flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition-colors", type === m.id ? "border-[#a67c2e] ring-1 ring-[#a67c2e]" : "border-gray-200 hover:border-[#a67c2e]/60")}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fcf8f2] text-[#a67c2e]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-gray-900">{m.label}</span>
              <span className="text-[11px] text-gray-500">{m.help}</span>
            </button>
          );
        })}
      </div>
      {type && meta && (
        <Panel title={meta.label} subtitle="Fill in and save" icon={meta.icon} bodyClassName="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Date">
            <YmdDatePicker value={date} onChange={(v) => v && setDate(v)} className="h-10" />
          </Field>
          {meta.from && (
            <Field label="From">
              <AccountSelect value={from} onChange={setFrom} accounts={accounts} exclude={to} />
            </Field>
          )}
          {meta.to && (
            <Field label="To">
              <AccountSelect value={to} onChange={setTo} accounts={accounts} exclude={from} />
            </Field>
          )}
          <Field label="Note (optional)" className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" placeholder="e.g. deposited at Meezan Bank" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => setType(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </Panel>
      )}
      <Panel title="Recent movements" icon={ArrowLeftRight} bodyClassName="divide-y divide-gray-100">
        {!recent ? (
          <div className="p-4">
            <Bone className="h-10 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing recorded yet.</p>
        ) : (
          recent.map((r) => <HistoryLine key={r.id} row={r} onChanged={() => (loadRecent(), onChanged())} />)
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Day book                                                         */
/* ------------------------------------------------------------------ */

function DayBookView({ onChanged, onNavigate }: { onChanged: () => void; onNavigate?: (tab: string) => void }) {
  const { toast } = useToast();
  const [date, setDate] = useState(businessTodayYmd());
  const [book, setBook] = useState<DayBook | null>(null);
  const [only, setOnly] = useState<"ALL" | "CASH" | "BANK">("ALL");
  const [hideSales, setHideSales] = useState(true);
  const [expense, setExpense] = useState<IssueAction | null>(null);
  const [payment, setPayment] = useState<IssueAction | null>(null);
  const [register, setRegister] = useState<string | null>(null);
  const [undo, setUndo] = useState<DayLine | null>(null);

  const load = useCallback(() => {
    setBook(null);
    api
      .day(date)
      .then(setBook)
      .catch((e) => toast({ variant: "destructive", title: "Could not load the day", description: apiError(e) }));
  }, [date, toast]);
  useEffect(load, [load]);
  const done = () => (load(), onChanged());

  const kindOf = useMemo(() => new Map((book?.accounts ?? []).map((a) => [a.id, a.kind])), [book]);
  const lines = (book?.lines ?? []).filter((l) => (only === "ALL" || kindOf.get(l.accountId) === only) && (!hideSales || l.action.type !== "SALE"));
  const salesLines = (book?.lines ?? []).filter((l) => l.action.type === "SALE");
  const salesIn = salesLines.reduce((t, l) => t + l.moneyIn - l.moneyOut, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700">Everything that moved cash or bank on {formatBusinessDate(`${date}T12:00:00+05:00`)}</p>
        <DayPicker value={date} onChange={setDate} />
      </div>
      {!book ? (
        <LoadingRows />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {book.accounts.map((a) => (
              <Panel key={a.id} bodyClassName="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AccountIcon bank={a.kind === "BANK"} />
                  <p className="text-sm font-semibold text-gray-900">{a.name}</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Start of day" value={rs(a.opening)} />
                  <MiniStat label="In" value={`+${rs(a.moneyIn)}`} />
                  <MiniStat label="Out" value={`−${rs(a.moneyOut)}`} tone="out" />
                  <MiniStat label="End of day" value={rs(a.closing)} strong />
                </div>
                <p className="mt-2 text-[11px] text-gray-500">This day&apos;s net: {signed(Math.round((a.moneyIn - a.moneyOut) * 100) / 100)}</p>
              </Panel>
            ))}
          </div>

          {book.registers.map((r) => (
            <Panel
              key={r.id}
              title={`Register ${r.status === "OPEN" ? "(still open)" : "closing"}`}
              subtitle={`Opened ${timeOf(r.openedAt)}${r.closedAt ? ` · closed ${timeOf(r.closedAt)}` : ""}`}
              icon={ClipboardCheck}
              actions={
                r.status === "CLOSED" ? (
                  <Button size="sm" variant="outline" onClick={() => setRegister(r.id)}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Correct the count
                  </Button>
                ) : null
              }
              bodyClassName="grid gap-2 p-4 sm:grid-cols-3"
            >
              {r.rows.length === 0 ? (
                <p className="text-sm text-gray-500">No closing yet.</p>
              ) : (
                r.rows.map((row) => (
                  <div key={row.method} className="rounded-lg border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{METHOD_NAME[row.method] ?? row.method}</p>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {rs(row.actual)} <span className="text-xs font-normal text-gray-500">/ should be {rs(row.expected)}</span>
                    </p>
                    <p className={cn("text-[11px] font-medium", Math.abs(row.variance) < 0.5 ? "text-emerald-700" : row.variance > 0 ? "text-sky-700" : "text-rose-700")}>
                      {Math.abs(row.variance) < 0.5 ? "Matches" : `${row.variance > 0 ? "Extra" : "Short"} ${rs(Math.abs(row.variance))}`}
                    </p>
                  </div>
                ))
              )}
            </Panel>
          ))}

          <Panel
            title="Every money line"
            subtitle={hideSales && salesLines.length ? `${salesLines.length} sales (${rs(salesIn)}) folded — show them to see each bill` : `${lines.length} lines`}
            icon={BookOpen}
            actions={
              <>
                <div className="flex rounded-lg bg-gray-100 p-0.5">
                  {(["ALL", "CASH", "BANK"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setOnly(k)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", only === k ? "bg-white shadow-sm" : "text-gray-500")}>
                      {k === "ALL" ? "All" : k === "CASH" ? "Cash" : "Bank"}
                    </button>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setHideSales((v) => !v)}>
                  {hideSales ? "Show each sale" : "Fold sales"}
                </Button>
              </>
            }
            bodyClassName="overflow-x-auto"
          >
            {lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Nothing here for this day.</p>
            ) : (
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">What</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">In</th>
                    <th className="px-3 py-2 text-right font-medium">Out</th>
                    <th className="px-4 py-2 text-right font-medium">Fix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, idx) => {
                    const bank = kindOf.get(l.accountId) === "BANK";
                    const a = l.action;
                    return (
                      <tr key={`${idx}-${l.reference}-${l.description}`} className="hover:bg-[#fcf8f2]">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{timeOf(l.date)}</td>
                        <td className="max-w-[320px] px-3 py-2">
                          <p className="truncate text-gray-900" title={l.description}>
                            {l.description}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", bank ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>
                            {bank ? <Landmark className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                            {bank ? "Bank" : "Cash"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-700">{l.moneyIn ? `+${rs(l.moneyIn)}` : ""}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-rose-700">{l.moneyOut ? `−${rs(l.moneyOut)}` : ""}</td>
                        <td className="whitespace-nowrap px-4 py-1.5 text-right">
                          {a.type === "EDIT_EXPENSE" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpense(a)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                          )}
                          {a.type === "EDIT_SUPPLIER_PAYMENT" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPayment(a)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                          )}
                          {a.type === "EDIT_CLOSING" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRegister(String(a.sessionId))}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Count
                            </Button>
                          )}
                          {a.type === "UNDO" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-700" onClick={() => setUndo(l)}>
                              <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
                            </Button>
                          )}
                          {a.type === "OPEN" && onNavigate && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onNavigate(a.where === "adjustments" ? "journal-vouchers" : String(a.where))}>
                              Open
                            </Button>
                          )}
                          {a.type === "SALE" && <span className="text-[11px] text-gray-400">sale</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
      {expense && <ExpenseDialog action={expense} onClose={() => setExpense(null)} onSaved={done} />}
      {payment && <SupplierPaymentDialog action={payment} onClose={() => setPayment(null)} onSaved={done} />}
      {register && <RegisterDialog id={register} mode="edit" onClose={() => setRegister(null)} onSaved={done} />}
      <ConfirmDialog
        open={!!undo}
        title="Undo this entry?"
        body={<>{undo?.description} — {rs((undo?.moneyIn || 0) + (undo?.moneyOut || 0))}. Cash / Bank go back to how they were.</>}
        confirmLabel="Undo"
        danger
        onClose={() => setUndo(null)}
        onConfirm={async () => {
          try {
            await api.undo(String(undo?.action.voucherId));
            toast({ title: "Undone" });
            done();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not undo", description: apiError(e) });
          }
        }}
      />
    </div>
  );
}

function ExpenseDialog({ action, onClose, onSaved }: { action: IssueAction; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { accounts } = useMoneyAccounts(true);
  const [particular, setParticular] = useState(String(action.particular ?? ""));
  const [amount, setAmount] = useState(String(action.amount ?? ""));
  const [from, setFrom] = useState(String(action.paidFromAccountId ?? ""));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async () => {
    if (!particular.trim() || !(Number(amount) > 0)) return toast({ variant: "destructive", title: "Description and amount are needed" });
    setBusy(true);
    try {
      const acc = accounts.find((a) => a.id === from);
      await api.updateExpense(String(action.id), {
        particular: particular.trim(),
        amount: Number(amount),
        ...(acc ? { paid_from_account_id: acc.id, payment_method: isBank(acc) ? (action.method === "CASH" ? "BANK" : action.method) : "CASH" } : {}),
      });
      toast({ title: "Expense updated", description: action.inRegister ? "That day's register and the books were updated too." : undefined });
      onSaved();
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Fix the amount, or where the money came from.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Description">
            <Input value={particular} onChange={(e) => setParticular(e.target.value)} className="h-9" />
          </Field>
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Paid from">
            <AccountSelect value={from} onChange={setFrom} accounts={accounts} />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-rose-700" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </DialogFooter>
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this expense?"
          body={<>{particular} — {rs(Number(amount))}. The money goes back to {accounts.find((a) => a.id === from)?.name ?? "its account"}.</>}
          confirmLabel="Delete expense"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await api.deleteExpense(String(action.id));
              toast({ title: "Expense deleted" });
              onSaved();
              onClose();
            } catch (e) {
              toast({ variant: "destructive", title: "Could not delete", description: apiError(e) });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SupplierPaymentDialog({ action, onClose, onSaved }: { action: IssueAction; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { accounts } = useMoneyAccounts(true);
  const [amount, setAmount] = useState(String(action.amount ?? ""));
  const [from, setFrom] = useState(String(action.paidFromAccountId ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!(Number(amount) > 0)) return toast({ variant: "destructive", title: "Type the amount" });
    setBusy(true);
    try {
      await api.updateSupplierPayment(String(action.supplierId), String(action.id), { amount: Number(amount), paidFromAccountId: from || null });
      toast({ title: "Payment updated", description: "The supplier balance, register and books follow." });
      onSaved();
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not save", description: apiError(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit supplier payment</DialogTitle>
          <DialogDescription>{String(action.supplier ?? "Supplier")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Amount">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Paid from" hint="Bank = card / transfer (the drawer is not touched). Cash in Hand = paid in cash.">
            <AccountSelect value={from} onChange={setFrom} accounts={accounts} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="bg-[#2a2012] hover:bg-[#3b2e1a]">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 5. History                                                          */
/* ------------------------------------------------------------------ */

function HistoryLine({ row, onChanged }: { row: HistoryRow; onChanged: () => void }) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <History className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">{row.summary}</p>
        <p className="text-[11px] text-gray-500">
          {formatBusinessDateTime(row.at)}
          {row.by ? ` · ${row.by}` : ""}
        </p>
      </div>
      {row.undoVoucherId && (
        <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs text-rose-700" onClick={() => setConfirm(true)}>
          <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        title="Undo this change?"
        body={row.summary}
        confirmLabel="Undo"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await api.undo(String(row.undoVoucherId));
            toast({ title: "Undone" });
            onChanged();
          } catch (e) {
            toast({ variant: "destructive", title: "Could not undo", description: apiError(e) });
          }
        }}
      />
    </div>
  );
}

function HistoryView({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    api
      .history()
      .then(setRows)
      .catch((e) => toast({ variant: "destructive", title: "Could not load history", description: apiError(e) }));
  }, [toast]);
  return (
    <div className="space-y-4">
      <HowItWorks>
        <p>Every change made in Money Check — who did it, when, and what. Balance matches and money movements can be undone from here.</p>
      </HowItWorks>
      <Panel title="Changes" icon={History} bodyClassName="divide-y divide-gray-100">
        {!rows ? (
          <div className="p-4">
            <Bone className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No changes yet.</p>
        ) : (
          rows.map((r) => <HistoryLine key={r.id} row={r} onChanged={onChanged} />)
        )}
      </Panel>
    </div>
  );
}
