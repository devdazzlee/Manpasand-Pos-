"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Landmark, Loader2, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Expense accounts (Chart of Accounts type 5)                         */
/* ------------------------------------------------------------------ */

export type ExpenseAccountOption = {
  id: string;
  code: string;
  name: string;
  expense_category_id: string | null;
  employee_id: string | null;
  control: { id: string; code: string; name: string; system_key?: string | null };
};

let cache: ExpenseAccountOption[] | null = null;
let inflight: Promise<ExpenseAccountOption[]> | null = null;

export function loadExpenseAccounts(force = false): Promise<ExpenseAccountOption[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = apiClient
      .get("/chart-of-accounts/expense-accounts")
      .then((res) => {
        cache = res.data.data as ExpenseAccountOption[];
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useExpenseAccounts(open = true) {
  const [accounts, setAccounts] = useState<ExpenseAccountOption[]>(cache || []);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(!cache);
    loadExpenseAccounts(true)
      .then((rows) => alive && setAccounts(rows))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open]);
  return { accounts, setAccounts, loading };
}

type ExpenseGroup = { id: string; code: string; name: string; system_key: string | null };

const NEW_GROUP = "__new__";
const isAdmin = () => {
  try {
    const role = localStorage.getItem("role");
    return role === "ADMIN" || role === "SUPER_ADMIN";
  } catch {
    return false;
  }
};

/**
 * The one place an expense's destination is chosen: Chart of Accounts expense
 * accounts grouped by head (Utilities › Electricity, ...). "+ New expense
 * account" creates it in Chart of Accounts (and its report category) on the spot.
 * Payroll / cost-of-sales accounts are filled automatically and hidden.
 */
export function ExpenseAccountPicker({
  value,
  onChange,
  accounts,
  onAccountsChange,
  loading,
  triggerClassName,
}: {
  value: string;
  onChange: (account: ExpenseAccountOption | null) => void;
  accounts: ExpenseAccountOption[];
  onAccountsChange?: (accounts: ExpenseAccountOption[]) => void;
  loading?: boolean;
  triggerClassName?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [saving, setSaving] = useState(false);

  const usable = useMemo(
    () =>
      accounts.filter(
        (a) => !a.employee_id && a.control.system_key !== "PAYROLL" && a.control.system_key !== "COST_OF_SALES",
      ),
    [accounts],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: ExpenseAccountOption[] }>();
    for (const a of usable) {
      const g = map.get(a.control.id) || { label: a.control.name, items: [] };
      g.items.push(a);
      map.set(a.control.id, g);
    }
    return [...map.values()];
  }, [usable]);
  const selected = usable.find((a) => a.id === value) || accounts.find((a) => a.id === value) || null;

  const startCreate = () => {
    setCreating(true);
    setName(query.trim());
    setNewGroup("");
    setGroupId(selected?.control.id || "");
    apiClient
      .get("/chart-of-accounts/expense-groups")
      .then((res) => {
        const rows: ExpenseGroup[] = res.data?.data || [];
        setGroups(rows);
        setGroupId((current) => current || rows.find((g) => g.system_key === "GENERAL_EXPENSES")?.id || rows[0]?.id || "");
      })
      .catch(() => setGroups([]));
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ variant: "destructive", title: "Enter an account name (at least 2 characters)" });
      return;
    }
    if (groupId === NEW_GROUP && newGroup.trim().length < 2) {
      toast({ variant: "destructive", title: "Enter the new group name" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post("/chart-of-accounts/expense-accounts", {
        name: trimmed,
        ...(groupId === NEW_GROUP ? { new_group_name: newGroup.trim() } : { control_id: groupId || null }),
      });
      const fresh = await loadExpenseAccounts(true);
      onAccountsChange?.(fresh);
      const created = fresh.find((a) => a.id === res.data?.data?.id) || null;
      onChange(created);
      toast({
        title: "Expense account added",
        description: `${res.data?.data?.code} ${trimmed} — now in Chart of Accounts under ${created?.control.name ?? "Expenses"}.`,
      });
      setCreating(false);
      setOpen(false);
      setQuery("");
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.response?.data?.message || "Couldn't add the account" });
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">New expense account</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electricity Bill" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Group in Chart of Accounts</Label>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </SelectItem>
              ))}
              {isAdmin() ? <SelectItem value={NEW_GROUP}>+ New group…</SelectItem> : null}
            </SelectContent>
          </Select>
          {groupId === NEW_GROUP ? (
            <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Utilities" className="mt-1.5 h-9" />
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Add account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", triggerClassName)}>
          {selected ? (
            <span className="truncate">
              <span className="text-muted-foreground">{selected.control.name} › </span>
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{loading ? "Loading accounts…" : "Choose expense account"}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-72">
            <CommandEmpty>No account found.</CommandEmpty>
            {grouped.map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.name} ${a.code} ${g.label}`}
                    onSelect={() => {
                      onChange(a);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", a.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{a.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{a.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <CommandSeparator />
          <div className="p-1">
            <button
              type="button"
              onClick={startCreate}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
            >
              <Plus className="mr-2 h-4 w-4" />
              {query.trim() ? `New expense account "${query.trim()}"` : "New expense account"}
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Plain grouped select, kept for places that only need to pick an existing
 * account (filters).
 */
export function ExpenseAccountSelect({
  value,
  onChange,
  accounts,
  loading,
  triggerClassName,
}: {
  value: string;
  onChange: (accountId: string) => void;
  accounts: ExpenseAccountOption[];
  loading?: boolean;
  triggerClassName?: string;
}) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={loading ? "Loading accounts…" : "All accounts"} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">All accounts</SelectItem>
        {accounts
          .filter((a) => !a.employee_id)
          .map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.control.name} › {a.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/* Paid from (Cash & Bank accounts)                                    */
/* ------------------------------------------------------------------ */

export type MoneyAccountOption = { id: string; code: string; name: string; system_key: string | null };

let moneyCache: MoneyAccountOption[] | null = null;

/** Settings → Payment accounts: which account each non-cash method lands in. */
export type PaymentRouting = Partial<Record<"CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CHEQUE", string>>;
let routingCache: PaymentRouting = {};

export function useMoneyAccounts(open = true) {
  const [accounts, setAccounts] = useState<MoneyAccountOption[]>(moneyCache || []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([
      apiClient.get("/chart-of-accounts/money-accounts"),
      apiClient.get("/chart-of-accounts/payment-routing").catch(() => null),
    ])
      .then(([res, routing]) => {
        routingCache = (routing?.data?.data as PaymentRouting) || {};
        // New array so pickers re-run their default with the routing loaded.
        moneyCache = [...(res.data?.data || [])];
        if (alive) setAccounts(moneyCache!);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);
  return accounts;
}

const CASH_METHODS = new Set(["CASH", "OTHER"]);

const routedMethod = (method: string): keyof PaymentRouting | null => {
  const m = method.toUpperCase();
  if (m === "CARD") return "CARD";
  if (m === "BANK" || m === "BANK_TRANSFER") return "BANK_TRANSFER";
  if (m === "MOBILE_MONEY") return "MOBILE_MONEY";
  if (m === "CHEQUE") return "CHEQUE";
  return null;
};

/**
 * Default "paid from" for a payment method: Cash in Hand for cash; for card /
 * transfer / wallet / cheque the account set in Payment accounts, else the main Bank.
 */
export function defaultPaidFrom(accounts: MoneyAccountOption[], method: string) {
  if (!CASH_METHODS.has(method)) {
    const routed = routedMethod(method);
    const configured = routed ? routingCache[routed] : undefined;
    if (configured && accounts.some((a) => a.id === configured)) return configured;
  }
  const key = CASH_METHODS.has(method) ? "CASH" : "BANK";
  return accounts.find((a) => a.system_key === key)?.id || accounts.find((a) => a.system_key === "CASH")?.id || "";
}

export function PaidFromSelect({
  value,
  onChange,
  accounts,
  triggerClassName,
}: {
  value: string;
  onChange: (accountId: string) => void;
  accounts: MoneyAccountOption[];
  triggerClassName?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={cn("min-w-0", triggerClassName)}>
        <SelectValue placeholder="Choose cash or bank account" />
      </SelectTrigger>
      <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
        {accounts.map((a) => {
          const bank = a.system_key === "BANK" || (a.system_key !== "CASH" && /bank/i.test(a.name));
          return (
            <SelectItem key={a.id} value={a.id} className="pr-8">
              <span className="flex min-w-0 items-center gap-2">
                {bank ? (
                  <Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{a.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                  {a.code}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * State for a "Paid from" picker in a pay dialog: follows the payment method
 * (Cash → Cash in Hand, anything else → Bank) until the user picks another.
 */
export function usePaidFrom(method: string, open = true) {
  const accounts = useMoneyAccounts(open);
  const [paidFrom, setPaidFrom] = useState("");
  useEffect(() => {
    if (open) setPaidFrom(defaultPaidFrom(accounts, method));
  }, [open, accounts, method]);
  return { accounts, paidFrom, setPaidFrom };
}
