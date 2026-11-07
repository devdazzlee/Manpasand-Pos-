"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/lib/apiClient";
import { rangeForPreset, type DatePreset } from "@/lib/business-timezone";
import { cn } from "@/lib/utils";
import { PrintClosingSlipButton } from "./print-closing-slip-button";

type ReprintPreset = Extract<DatePreset, "all" | "today" | "yesterday" | "last7" | "last30" | "custom">;

export type ClosedSessionRow = {
  id: string;
  registerName: string;
  registerNumber: string;
  branchId?: string | null;
  cashierName: string;
  closedBy?: string | null;
  openedAt: string;
  closedAt: string;
  opening: number;
  closing: number | null;
  expectedCash?: number | null;
  variance?: number | null;
  varianceLabel?: "Over" | "Short" | "Balanced" | null;
};

type ClosedSessionsPayload = {
  period: { from: string; to: string };
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  sessions: ClosedSessionRow[];
};

const PRESETS: { id: ReprintPreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

const money = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `PKR ${Number(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;

const when = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
};

const varianceTone = (label: ClosedSessionRow["varianceLabel"]) => {
  if (label === "Short") return "bg-rose-50 text-rose-700 ring-rose-600/15";
  if (label === "Over") return "bg-amber-50 text-amber-800 ring-amber-600/15";
  if (label === "Balanced") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  return "bg-slate-100 text-slate-600 ring-slate-500/15";
};

function SessionSkeleton() {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReprintClosingReceiptDialog({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Scoped branch id, or "all" / empty for every branch the user can see. */
  branchId?: string;
}) {
  const { toast } = useToast();
  const initial = rangeForPreset("last30");
  const [preset, setPreset] = useState<ReprintPreset>("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ClosedSessionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const applyPreset = (next: ReprintPreset) => {
    setPreset(next);
    setPage(1);
    if (next === "custom") return;
    const range = rangeForPreset(next);
    setFrom(range.from);
    setTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  };

  const applyCustom = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To date cannot be earlier than from date" });
      return;
    }
    setPreset("custom");
    setFrom(draftFrom);
    setTo(draftTo);
    setPage(1);
  };

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { from, to, page, pageSize: 40 };
      if (branchId && branchId !== "all") params.branchId = branchId;
      const res = await apiClient.get("/cash-register/closed-sessions", { params });
      if (requestId !== requestIdRef.current) return;
      setPayload(res.data?.data as ClosedSessionsPayload);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      const message = err?.response?.data?.message || err?.message || "Could not load closed registers";
      setError(message);
      setPayload(null);
      toast({ variant: "destructive", title: "Could not load closings", description: message });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [from, to, page, branchId, toast]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      setLoading(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const sessions = payload?.sessions || [];
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = [
        s.registerName,
        s.registerNumber,
        s.cashierName,
        s.closedBy || "",
        when(s.closedAt),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payload?.sessions, query]);

  const periodLabel =
    from === to
      ? format(new Date(`${from}T00:00:00`), "dd MMM yyyy")
      : `${format(new Date(`${from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${to}T00:00:00`), "dd MMM yyyy")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,760px)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b border-slate-100 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Printer className="h-4 w-4" />
            </span>
            Reprint closing receipt
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Same receipt that prints when a register closes. Choose any past closing — sent to your receipt print
            server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  preset === p.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <DateField label="From" value={draftFrom} onChange={setDraftFrom} triggerClassName="h-9 bg-white" />
              <DateField label="To" value={draftTo} onChange={setDraftTo} triggerClassName="h-9 bg-white" />
              <Button type="button" className="h-9" onClick={applyCustom}>
                Apply
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search branch, cashier, closed by…"
                className="h-9 bg-white pl-8 pr-8"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 bg-white"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {periodLabel}
            </span>
            <span className="tabular-nums">
              {loading && !payload
                ? "Loading…"
                : payload
                  ? `${payload.total} closed · page ${payload.page} of ${payload.pageCount}`
                  : "—"}
            </span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {loading && payload ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-slate-100">
              <div className="h-full w-full origin-left animate-pulse bg-slate-900/80" />
            </div>
          ) : null}

          <ScrollArea className="h-[min(22rem,46vh)] px-4 py-3">
            {loading && !payload ? (
              <SessionSkeleton />
            ) : error && !payload ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-800">{error}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => void load()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Try again
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Inbox className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-800">
                  {query.trim() ? "No closings match your search" : "No closed registers in this date range"}
                </p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  {query.trim()
                    ? "Clear the search or widen the dates."
                    : "Try All dates, or pick a custom range that covers the day you closed."}
                </p>
              </div>
            ) : (
              <ul className="space-y-2 pb-1">
                {filtered.map((session) => (
                  <li
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{session.registerName}</p>
                          <span className="font-mono text-[10px] text-slate-400">{session.registerNumber}</span>
                          {session.varianceLabel ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                                varianceTone(session.varianceLabel),
                              )}
                            >
                              {session.varianceLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">
                          Closed {when(session.closedAt)}
                          {session.closedBy ? ` · by ${session.closedBy}` : ""}
                        </p>
                        <p className="text-xs tabular-nums text-slate-600">
                          Counted {money(session.closing)}
                          {session.expectedCash != null ? ` · Expected ${money(session.expectedCash)}` : ""}
                          {session.variance != null ? ` · Variance ${signed(session.variance)}` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Opened {when(session.openedAt)} · cashier {session.cashierName || "—"}
                        </p>
                      </div>
                      <PrintClosingSlipButton
                        sessionId={session.id}
                        label="Print closing receipt"
                        className="h-9 w-full shrink-0 sm:w-auto"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={loading || !payload || payload.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={loading || !payload || payload.page >= payload.pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <Button type="button" variant="outline" className="h-8" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
