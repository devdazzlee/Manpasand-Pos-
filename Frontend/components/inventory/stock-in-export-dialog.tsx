"use client";

import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  LayoutList,
  Loader2,
  ReceiptText,
  Sigma,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  billReference,
  dayKey,
  downloadStockInReportPdf,
  formatMoney,
  formatQty,
  paymentLabel,
  summarizeByProduct,
  type StockInExportBill,
  type StockInReportLayout,
} from "@/lib/stock-in-report-pdf";

type PaymentFilter = "all" | "CASH" | "CREDIT" | "MIX";
type DeliveryFilter = "all" | "COMPLETE" | "PARTIAL";

const PAYMENT_LABELS: Record<Exclude<PaymentFilter, "all">, string> = {
  CASH: "Paid",
  CREDIT: "Credit (unpaid)",
  MIX: "Part paid",
};

type Period =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "last_month"
  | "day"
  | "range"
  | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "day", label: "Specific date" },
  { id: "range", label: "Date range" },
  { id: "all", label: "All time" },
];

const LAYOUTS: { id: StockInReportLayout; label: string; hint: string; icon: typeof ReceiptText }[] = [
  { id: "bills", label: "Bill-wise detail", hint: "Every bill with all its products, grouped by day", icon: ReceiptText },
  { id: "lines", label: "Product lines", hint: "One row per product received (register)", icon: LayoutList },
  { id: "summary", label: "Product summary", hint: "Total quantity and value per product", icon: Sigma },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolvePeriod(period: Period, day?: Date, from?: Date, to?: Date): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now), label: format(now, "EEEE, dd MMM yyyy") };
    case "yesterday": {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y), label: format(y, "EEEE, dd MMM yyyy") };
    }
    case "week": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      return { start: startOfDay(s), end: endOfDay(now), label: `${format(s, "dd MMM")} – ${format(now, "dd MMM yyyy")}` };
    }
    case "month":
      return { start: startOfMonth(now), end: endOfDay(now), label: format(now, "MMMM yyyy") };
    case "last_month": {
      const m = subMonths(now, 1);
      return { start: startOfMonth(m), end: endOfMonth(m), label: format(m, "MMMM yyyy") };
    }
    case "day":
      return day
        ? { start: startOfDay(day), end: endOfDay(day), label: format(day, "EEEE, dd MMM yyyy") }
        : { label: "Pick a date" };
    case "range":
      if (!from && !to) return { label: "Pick dates" };
      return {
        start: from ? startOfDay(from) : undefined,
        end: to ? endOfDay(to) : undefined,
        label: `${from ? format(from, "dd MMM yyyy") : "Start"} – ${to ? format(to, "dd MMM yyyy") : "Today"}`,
      };
    default:
      return { label: "All time" };
  }
}

/** Matches the history screen's filters so the dialog opens on what you were looking at. */
function initialPeriod(start?: Date, end?: Date): { period: Period; day?: Date; from?: Date; to?: Date } {
  if (!start && !end) return { period: "month" };
  if (start && end && dayKey(start.toISOString()) === dayKey(end.toISOString())) {
    return { period: "day", day: start };
  }
  return { period: "range", from: start, to: end };
}

function DateButton({ value, onChange, placeholder }: { value?: Date; onChange: (d?: Date) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-start bg-white text-left text-sm font-normal">
          <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
          {value ? format(value, "dd MMM yyyy") : <span className="text-slate-400">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent mode="single" selected={value} onSelect={onChange} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

export function StockInExportDialog({
  open,
  onOpenChange,
  suppliers,
  branches,
  initial,
  logoDataUri,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  initial: {
    supplierId: string;
    branchId: string;
    start?: Date;
    end?: Date;
    search: string;
    paymentMode: PaymentFilter;
    deliveryStatus: DeliveryFilter;
  };
  logoDataUri?: string;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [day, setDay] = useState<Date | undefined>();
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [supplierId, setSupplierId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentFilter>("all");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryFilter>("all");
  const [layout, setLayout] = useState<StockInReportLayout>("bills");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const [bills, setBills] = useState<StockInExportBill[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);

  // Reset to the screen's filters each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const p = initialPeriod(initial.start, initial.end);
    setPeriod(p.period);
    setDay(p.day);
    setFrom(p.from);
    setTo(p.to);
    setSupplierId(initial.supplierId || "all");
    setBranchId(initial.branchId || "all");
    setSearch(initial.search || "");
    setPaymentMode(initial.paymentMode || "all");
    setDeliveryStatus(initial.deliveryStatus || "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const range = useMemo(() => resolvePeriod(period, day, from, to), [period, day, from, to]);
  const needsDate = (period === "day" && !day) || (period === "range" && !from && !to);

  // Load the data behind the preview counts; the same rows are used for the files.
  useEffect(() => {
    if (!open || needsDate) {
      setBills(null);
      setLoading(false);
      return;
    }
    // Show the loader right away (not after the debounce), so old or empty
    // totals never flash as "0" while the new numbers are on their way.
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params: Record<string, string> = { sortOrder: order };
        if (supplierId !== "all") params.supplierId = supplierId;
        if (branchId !== "all") params.branchId = branchId;
        if (search) params.search = search;
        if (paymentMode !== "all") params.paymentMode = paymentMode;
        if (deliveryStatus !== "all") params.deliveryStatus = deliveryStatus;
        if (range.start) params.startDate = range.start.toISOString();
        if (range.end) params.endDate = range.end.toISOString();
        const res = await apiClient.get(`${API_BASE}/purchases/export`, { params });
        if (cancelled) return;
        const data: StockInExportBill[] = res.data?.data || [];
        // Group by business day (a back-dated bill belongs to its own day),
        // keeping entry order inside each day.
        const dir = order === "asc" ? 1 : -1;
        const sorted = data
          .map((b, i) => ({ b, i, k: dayKey(b.purchase_date) }))
          .sort((a, c) => (a.k === c.k ? a.i - c.i : a.k < c.k ? -dir : dir))
          .map((x) => x.b);
        setBills(sorted);
        setTruncated(Boolean(res.data?.meta?.truncated));
      } catch (e: any) {
        if (!cancelled) {
          setBills(null);
          toast.error(e?.response?.data?.message || "Failed to load Stock In for export");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, needsDate, supplierId, branchId, search, paymentMode, deliveryStatus, range.start?.getTime(), range.end?.getTime(), order]);

  const totals = useMemo(() => {
    const list = bills ?? [];
    return {
      bills: list.length,
      lines: list.reduce((s, b) => s + b.line_count, 0),
      qty: list.reduce((s, b) => s + b.quantity, 0),
      value: list.reduce((s, b) => s + b.value, 0),
    };
  }, [bills]);

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name;
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const filterLabels = [
    `Supplier: ${supplierName || "All"}`,
    `Branch: ${branchName || "All"}`,
    ...(paymentMode !== "all" ? [`Payment: ${PAYMENT_LABELS[paymentMode]}`] : []),
    ...(deliveryStatus !== "all" ? [`Delivery: ${deliveryStatus === "PARTIAL" ? "Partial" : "Complete"}`] : []),
    ...(search ? [`Search: "${search}"`] : []),
  ];
  const orderLabel = order === "asc" ? "Order: first stocked in first" : "Order: latest stocked in first";
  const fileBase = `stock-in-${layout}-${range.start ? format(range.start, "yyyy-MM-dd") : "all"}${
    range.end && range.start && dayKey(range.start.toISOString()) !== dayKey(range.end.toISOString())
      ? `_to_${format(range.end, "yyyy-MM-dd")}`
      : ""
  }`;

  const downloadPdf = async () => {
    if (!bills) return;
    setBusy("pdf");
    try {
      await downloadStockInReportPdf({
        layout,
        bills,
        periodLabel: range.label,
        filterLabels,
        orderLabel,
        logoDataUri,
        filename: `${fileBase}.pdf`,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to create PDF");
    } finally {
      setBusy(null);
    }
  };

  const downloadExcel = () => {
    if (!bills) return;
    setBusy("excel");
    try {
      const wb = XLSX.utils.book_new();
      const lineRows: (string | number)[][] = [];
      bills.forEach((bill, bi) =>
        bill.lines.forEach((line, li) =>
          lineRows.push([
            bi + 1,
            li + 1,
            format(new Date(bill.purchase_date), "yyyy-MM-dd HH:mm"),
            billReference(bill),
            bill.supplier,
            bill.branch,
            line.product_name,
            line.code || "",
            line.barcode || "",
            line.unit || "",
            line.quantity,
            line.cost_price,
            line.sale_price,
            line.value,
            paymentLabel(bill),
            (bill.delivery_status || "COMPLETE").toUpperCase(),
          ]),
        ),
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Bill #", "Line #", "Date", "Invoice", "Supplier", "Branch", "Product", "Code", "Barcode", "Unit", "Qty", "Cost", "Sale price", "Value", "Payment", "Status"],
          ...lineRows,
        ]),
        "Product lines",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Bill #", "Date", "Invoice", "Supplier", "Branch", "Products", "Qty", "Value", "Payment", "Status", "Recorded by"],
          ...bills.map((b, i) => [
            i + 1,
            format(new Date(b.purchase_date), "yyyy-MM-dd HH:mm"),
            billReference(b),
            b.supplier,
            b.branch,
            b.line_count,
            b.quantity,
            b.value,
            paymentLabel(b),
            (b.delivery_status || "COMPLETE").toUpperCase(),
            b.recorded_by || "",
          ]),
        ]),
        "Bills",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Product", "Code", "Unit", "Bills", "Qty received", "Avg cost", "Value"],
          ...summarizeByProduct(bills).map((r) => [
            r.name,
            r.code,
            r.unit,
            r.bills.size,
            r.qty,
            r.qty > 0 ? Math.round((r.value / r.qty) * 100) / 100 : 0,
            Math.round(r.value * 100) / 100,
          ]),
        ]),
        "Summary by product",
      );
      XLSX.writeFile(wb, `${fileBase}.xlsx`);
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to create Excel");
    } finally {
      setBusy(null);
    }
  };

  const ready = !!bills && !loading && !needsDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto text-black">
        <DialogHeader>
          <DialogTitle>Export Stock In</DialogTitle>
          <DialogDescription>
            Choose the period and the report you need. All matching bills are included, not just the page on screen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</Label>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    period === p.id
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === "day" ? (
              <div className="max-w-xs pt-1">
                <DateButton value={day} onChange={setDay} placeholder="Choose date" />
              </div>
            ) : null}
            {period === "range" ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <DateButton value={from} onChange={setFrom} placeholder="From" />
                <DateButton value={to} onChange={setTo} placeholder="To (today)" />
              </div>
            ) : null}
            <p className="text-xs text-slate-500">{range.label}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</Label>
              <SearchableSelect
                value={supplierId}
                onValueChange={setSupplierId}
                options={[{ value: "all", label: "All suppliers" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                placeholder="All suppliers"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</Label>
              <SearchableSelect
                value={branchId}
                onValueChange={setBranchId}
                options={[{ value: "all", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                placeholder="All branches"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentFilter)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  {(["CASH", "CREDIT", "MIX"] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery</Label>
              <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as DeliveryFilter)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="COMPLETE">Complete</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {search ? (
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>Only rows matching search &ldquo;{search}&rdquo;</span>
              <button type="button" className="font-medium text-emerald-700 hover:underline" onClick={() => setSearch("")}>
                Include everything
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {LAYOUTS.map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayout(l.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      layout === l.id ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <Icon className={cn("mb-1.5 h-4 w-4", layout === l.id ? "text-emerald-700" : "text-slate-500")} />
                    <div className="text-sm font-semibold text-slate-900">{l.label}</div>
                    <div className="mt-0.5 text-xs leading-snug text-slate-500">{l.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Order</Label>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(
                [
                  ["asc", "First stocked in first"],
                  ["desc", "Latest first"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrder(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    order === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            aria-busy={loading}
            className="relative grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4"
          >
            {[
              ["Bills", totals.bills.toLocaleString()],
              ["Products", totals.lines.toLocaleString()],
              ["Quantity", formatQty(totals.qty)],
              ["Value (Rs)", formatMoney(totals.value)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-white px-3 py-2.5">
                <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 flex h-6 items-center truncate text-base font-semibold tabular-nums text-slate-900">
                  {loading ? (
                    <span className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                  ) : needsDate || !bills ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    value
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="-mt-3 flex h-4 items-center gap-1.5 text-xs text-slate-500">
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading Stock In for this period…
              </>
            ) : needsDate ? (
              "Pick a date to see the totals."
            ) : bills && bills.length === 0 ? (
              "No Stock In found for these options."
            ) : null}
          </p>
          {truncated ? (
            <p className="text-xs text-amber-700">Very large period: only the first 20,000 product lines are included. Pick a shorter period.</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" disabled={!ready || totals.bills === 0 || busy !== null} onClick={downloadExcel}>
            {busy === "excel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />}
            Excel
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={!ready || totals.bills === 0 || busy !== null}
            onClick={downloadPdf}
          >
            {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
