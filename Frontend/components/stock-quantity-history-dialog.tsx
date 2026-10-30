"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { cn } from "@/lib/utils";

type Movement = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: string | number;
  previous_qty: string | number;
  new_qty: string | number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  branch?: { name?: string | null } | null;
};

function n(v: unknown) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function typeLabel(type: string, ref?: string | null) {
  if (ref === "purchase_delete") return "Stock In deleted";
  if (ref === "purchase_edit") return "Stock In edited";
  if (ref === "stock_import") return "Opening stock import";
  if (ref === "purchase_return") return "Return to supplier";
  if (ref === "sale_edit") return "Sale edit";
  if (ref === "exchange") return type === "RETURN" ? "Exchange return" : "Exchange sale";
  if (ref === "return") return "Customer return";
  if (ref === "purchase") return "Stock In (purchase)";
  switch (type) {
    case "PURCHASE":
      return "Stock In (purchase)";
    case "PURCHASE_RETURN":
      return "Return to supplier";
    case "SALE":
      return "Sale";
    case "RETURN":
      return "Customer return";
    case "ADJUSTMENT":
      return "Adjustment";
    case "DAMAGE":
      return "Damage / stock out";
    case "TRANSFER_IN":
      return "Transfer in";
    case "TRANSFER_OUT":
      return "Transfer out";
    default:
      return type;
  }
}

function typeTone(type: string, change: number) {
  if (change > 0) return "bg-emerald-50 text-emerald-800 ring-emerald-600/20";
  if (change < 0) return "bg-rose-50 text-rose-800 ring-rose-600/20";
  return "bg-slate-50 text-slate-700 ring-slate-500/20";
}

export function StockQuantityHistoryDialog({
  open,
  onOpenChange,
  productId,
  productName,
  sku,
  availableQty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  sku: string;
  availableQty: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Movement[]>([]);

  useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`${API_BASE}/inventory/movements`, {
          params: { productId, page: 1, limit: 500 },
        });
        const list = Array.isArray(res.data?.data) ? (res.data.data as Movement[]) : [];
        if (!cancelled) setRows(list);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.response?.data?.message || e?.message || "Failed to load history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  // Oldest → newest so the story reads like the ledger
  const timeline = useMemo(() => [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [rows]);
  const net = useMemo(() => timeline.reduce((s, m) => s + n(m.quantity_change), 0), [timeline]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-slate-500" />
            Stock history
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-left text-sm text-muted-foreground">
              <p className="font-medium text-slate-800">{productName}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                {sku} · Available now {availableQty} · Net from history {net}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading movements…
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-rose-600">{error}</p>
          ) : timeline.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No stock movements recorded for this dress.</p>
          ) : (
            <ol className="relative space-y-0 border-l border-slate-200 pl-4">
              {timeline.map((m, i) => {
                const change = n(m.quantity_change);
                const prev = n(m.previous_qty);
                const next = n(m.new_qty);
                const label = typeLabel(m.movement_type, m.reference_type);
                const isLast = i === timeline.length - 1;
                return (
                  <li key={m.id} className="relative pb-5 last:pb-0">
                    <span
                      className={cn(
                        "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white",
                        change > 0 ? "bg-emerald-500" : change < 0 ? "bg-rose-500" : "bg-slate-400",
                      )}
                    />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", typeTone(m.movement_type, change))}>
                            {label}
                          </span>
                          <span className={cn("text-sm font-semibold tabular-nums", change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-700")}>
                            {change > 0 ? `+${change}` : change}
                          </span>
                          <span className="text-xs tabular-nums text-slate-500">
                            {prev} → {next}
                          </span>
                        </div>
                        {m.notes ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{m.notes}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {m.branch?.name ? `${m.branch.name} · ` : ""}
                          {m.reference_type ? `${m.reference_type}` : m.movement_type}
                          {m.reference_id ? ` · ${m.reference_id.slice(0, 8)}…` : ""}
                        </p>
                      </div>
                      <time className="shrink-0 text-[11px] tabular-nums text-slate-500">
                        {format(new Date(m.created_at), "dd MMM yyyy · HH:mm")}
                      </time>
                    </div>
                    {isLast ? (
                      <p className="mt-2 text-[11px] font-medium text-slate-500">
                        Final on-hand after this step: <span className="tabular-nums text-slate-800">{next}</span>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-9 gap-1.5 border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900", className)}
      onClick={onClick}
      title="View complete stock history"
    >
      <History className="h-3.5 w-3.5" />
      History
    </Button>
  );
}
