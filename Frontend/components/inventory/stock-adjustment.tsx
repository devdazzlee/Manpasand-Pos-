"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  ClipboardCheck,
  CalendarIcon,
  History,
  TrendingDown,
  TrendingUp,
  Search,
  List,
  LayoutGrid,
  X,
  Eye,
  Loader2,
  Package,
  MapPin,
  ArrowRightLeft,
  Scale,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
  StockSelectSkeleton,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type AdjustmentType = "RECONCILIATION" | "ADDITION" | "SUBTRACTION";
type AdjustmentCategory =
  | "CORRECTION"
  | "DAMAGE"
  | "EXPIRED"
  | "THEFT"
  | "RETURN_TO_SUPPLIER"
  | "ADMINISTRATIVE";

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; hint: string }[] = [
  {
    value: "RECONCILIATION",
    label: "Reconciliation",
    hint: "Set physical count — system computes variance",
  },
  {
    value: "ADDITION",
    label: "Addition",
    hint: "Increase on-hand quantity",
  },
  {
    value: "SUBTRACTION",
    label: "Subtraction",
    hint: "Decrease on-hand quantity",
  },
];

const ADJUSTMENT_CATEGORIES: { value: AdjustmentCategory; label: string }[] = [
  { value: "CORRECTION", label: "Standard correction" },
  { value: "DAMAGE", label: "Damaged / broken" },
  { value: "EXPIRED", label: "Expired stock" },
  { value: "THEFT", label: "Missing / theft" },
  { value: "RETURN_TO_SUPPLIER", label: "Return to supplier" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
];

const DEFAULT_FORM = {
  branchId: "",
  adjustmentType: "RECONCILIATION" as AdjustmentType,
  adjustmentCategory: "CORRECTION" as AdjustmentCategory,
  referenceNo: "",
  reason: "",
};

interface AdjustmentRow {
  id: string;
  adjustment_date: string;
  adjustment_type: AdjustmentType | string;
  adjustment_category: AdjustmentCategory | string;
  system_quantity: string | number;
  physical_count?: string | number | null;
  change_quantity?: string | number | null;
  difference: string | number;
  reason?: string | null;
  reference_no?: string | null;
  product?: { id: string; name: string; sku?: string | null } | null;
  branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

function typeLabel(t: string) {
  return ADJUSTMENT_TYPES.find((x) => x.value === t)?.label || t;
}

function categoryLabel(c: string) {
  return ADJUSTMENT_CATEGORIES.find((x) => x.value === c)?.label || c;
}

function typeTone(t: string) {
  switch (t) {
    case "RECONCILIATION":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "ADDITION":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "SUBTRACTION":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function varianceTone(diff: number) {
  if (diff > 0) return "text-emerald-700";
  if (diff < 0) return "text-rose-700";
  return "text-gray-700";
}

function quantityLabelForType(type: AdjustmentType) {
  if (type === "RECONCILIATION") return "Physical count";
  if (type === "ADDITION") return "Qty to add";
  return "Qty to remove";
}

export function StockAdjustment() {
  const logoDataUri = useLogoDataUri();
  const {
    products,
    categories,
    branches,
    productsLoading,
    branchesLoading,
    fetchProducts,
    fetchBranches,
  } = usePosData();

  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adjustLines, setAdjustLines] = useState<StockLineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<AdjustmentRow | null>(null);

  const fetchAdjustments = useCallback(
    async (pg = page) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pg,
          limit: PAGE_SIZE,
        };
        if (filterBranch !== "all") params.branchId = filterBranch;
        if (filterType !== "all") params.adjustmentType = filterType;
        if (filterCategory !== "all") params.adjustmentCategory = filterCategory;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
        const res = await apiClient.get(`${API_BASE}/stock-adjustments`, {
          params,
        });
        setAdjustments(res.data?.data || []);
        setTotal(res.data?.meta?.total ?? res.data?.data?.length ?? 0);
        setTotalPages(res.data?.meta?.totalPages ?? 1);
      } catch (e: any) {
        toast.error(
          e?.response?.data?.message || "Failed to load adjustment history",
        );
      } finally {
        setLoading(false);
      }
    },
    [page, filterBranch, filterType, filterCategory, filterStart, filterEnd],
  );

  const fetchStockLevels = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/stock`, {
        params: { limit: 5000 },
      });
      const map: Record<string, number> = {};
      (res.data?.data || []).forEach((s: any) => {
        const pid = s.product_id || s.product?.id;
        const bid = s.branch_id || s.branch?.id;
        if (pid && bid) map[`${pid}-${bid}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchBranches();
    fetchStockLevels();
  }, [fetchProducts, fetchBranches, fetchStockLevels]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  const getStockQty = useCallback(
    (productId: string) => {
      if (!form.branchId) return null;
      return stocks[`${productId}-${form.branchId}`] ?? 0;
    },
    [form.branchId, stocks],
  );

  const resetForm = useCallback(() => {
    setForm(DEFAULT_FORM);
    setAdjustLines([]);
    setFormErrors({});
    setShowMoreDetails(false);
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return adjustments;
    return adjustments.filter((a) => {
      const product = (a.product?.name || "").toLowerCase();
      const sku = (a.product?.sku || "").toLowerCase();
      const branch = (a.branch?.name || "").toLowerCase();
      const reason = (a.reason || "").toLowerCase();
      const ref = (a.reference_no || "").toLowerCase();
      const type = typeLabel(a.adjustment_type).toLowerCase();
      const cat = categoryLabel(a.adjustment_category).toLowerCase();
      return (
        product.includes(q) ||
        sku.includes(q) ||
        branch.includes(q) ||
        reason.includes(q) ||
        ref.includes(q) ||
        type.includes(q) ||
        cat.includes(q)
      );
    });
  }, [adjustments, searchQuery]);

  const stats = useMemo(() => {
    let shrink = 0;
    let gain = 0;
    let recon = 0;
    for (const a of filteredRows) {
      const diff = Number(a.difference) || 0;
      if (diff < 0) shrink += Math.abs(diff);
      else if (diff > 0) gain += diff;
      if (a.adjustment_type === "RECONCILIATION") recon += 1;
    }
    return {
      shrink,
      gain,
      net: gain - shrink,
      recon,
    };
  }, [filteredRows]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterBranch !== "all" ||
    filterType !== "all" ||
    filterCategory !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterType("all");
    setFilterCategory("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const linePreviewDiff = useCallback(
    (line: StockLineItem) => {
      const systemQty = getStockQty(line.productId) ?? 0;
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty)) return null;
      if (form.adjustmentType === "RECONCILIATION") return qty - systemQty;
      if (form.adjustmentType === "ADDITION") return qty;
      return -Math.abs(qty);
    },
    [form.adjustmentType, getStockQty],
  );

  const cartPreview = useMemo(() => {
    let net = 0;
    let counted = 0;
    for (const line of adjustLines) {
      const d = linePreviewDiff(line);
      if (d === null) continue;
      counted += 1;
      net += d;
    }
    return { net, counted };
  }, [adjustLines, linePreviewDiff]);

  const detailsReady = Boolean(form.branchId);

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.branchId) errors.branchId = "Branch is required";
    if (adjustLines.length === 0) errors.lines = "Add at least one product";

    for (const line of adjustLines) {
      const qty = Number(line.quantity);
      if (form.adjustmentType === "RECONCILIATION") {
        if (line.quantity === "" || !Number.isFinite(qty)) {
          errors.lines = `Physical count required for ${line.productName}`;
          break;
        }
        const systemQty = getStockQty(line.productId) ?? 0;
        if (qty === systemQty) {
          errors.lines = `No variance for ${line.productName} — physical equals system`;
          break;
        }
      } else if (!Number.isFinite(qty) || qty === 0) {
        errors.lines = `Change cannot be zero for ${line.productName}`;
        break;
      } else if (qty < 0) {
        errors.lines = `Quantity must be positive for ${line.productName}`;
        break;
      }
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    try {
      setSubmitting(true);
      let ok = 0;
      for (const line of adjustLines) {
        const systemQty = getStockQty(line.productId) ?? 0;
        const payload: Record<string, unknown> = {
          productId: line.productId,
          branchId: form.branchId,
          systemQuantity: systemQty,
          adjustmentType: form.adjustmentType,
          adjustmentCategory: form.adjustmentCategory,
          reason:
            form.reason ||
            `${typeLabel(form.adjustmentType)} · ${categoryLabel(form.adjustmentCategory)}`,
          referenceNo: form.referenceNo || undefined,
        };

        if (form.adjustmentType === "RECONCILIATION") {
          payload.physicalCount = Number(line.quantity);
        } else if (form.adjustmentType === "ADDITION") {
          payload.changeQuantity = Number(line.quantity);
        } else {
          payload.changeQuantity = -Math.abs(Number(line.quantity));
        }

        await apiClient.post(`${API_BASE}/stock-adjustments`, payload);
        ok++;
      }

      toast.success(
        `Adjusted ${ok} product${ok === 1 ? "" : "s"} successfully.`,
      );
      setDialogOpen(false);
      resetForm();
      if (page !== 1) setPage(1);
      else fetchAdjustments(1);
      fetchStockLevels();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          e?.message ||
          "Failed to execute stock adjustment",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = (row: AdjustmentRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `stock-adjustments-${Date.now()}.xlsx`,
        "Adjustments",
        [
          "Date",
          "Product",
          "SKU",
          "Branch",
          "Type",
          "Category",
          "System qty",
          "Physical / Change",
          "Difference",
          "Reference",
          "Reason",
          "Staff",
        ],
        filteredRows.map((a) => [
          a.adjustment_date
            ? new Date(a.adjustment_date).toLocaleString()
            : "",
          a.product?.name || "",
          a.product?.sku || "",
          a.branch?.name || "",
          typeLabel(a.adjustment_type),
          categoryLabel(a.adjustment_category),
          Number(a.system_quantity) || 0,
          a.adjustment_type === "RECONCILIATION"
            ? Number(a.physical_count) || 0
            : Number(a.change_quantity) || 0,
          Number(a.difference) || 0,
          a.reference_no || "",
          a.reason || "",
          a.user?.email || "",
        ]),
      );
      toast.success("Excel downloaded");
    } catch {
      toast.error("Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      await downloadBrandedPdf({
        filename: `stock-adjustments-${Date.now()}.pdf`,
        title: "Stock Adjustments",
        subtitle: "Physical counts & inventory corrections",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          { label: "Shrinkage", value: `-${formatQty(stats.shrink)}` },
          { label: "Gains", value: `+${formatQty(stats.gain)}` },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.3 },
          { header: "Type", width: 1.2 },
          { header: "Variance", align: "right", width: 0.9 },
          { header: "Category", width: 1.2 },
        ],
        rows: filteredRows.map((a) => {
          const diff = Number(a.difference) || 0;
          return [
            a.adjustment_date
              ? new Date(a.adjustment_date).toLocaleDateString()
              : "",
            a.product?.name || "",
            a.branch?.name || "",
            typeLabel(a.adjustment_type),
            `${diff > 0 ? "+" : ""}${formatQty(diff)}`,
            categoryLabel(a.adjustment_category),
          ];
        }),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading && adjustments.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading stock adjustments..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-teal-700 mb-1">
            <ClipboardCheck className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Inventory audit
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Stock Adjustments
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Reconcile physical counts and correct on-hand quantities
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <Button
            size="sm"
            className="h-9 text-sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New adjustment
          </Button>
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || filteredRows.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      {/* New adjustment modal */}
      <StockOperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
        title="New stock adjustment"
        description="Correct quantities for one or more products at a branch."
        onSubmit={handleSubmit}
        submitting={submitting}
        submitDisabled={!detailsReady || adjustLines.length === 0}
        submitLabel={
          adjustLines.length > 0
            ? `Submit ${adjustLines.length} item${adjustLines.length === 1 ? "" : "s"}`
            : "Submit adjustment"
        }
        footerHint={
          !detailsReady
            ? "Select a branch first"
            : adjustLines.length > 0
              ? `${adjustLines.length} product${adjustLines.length === 1 ? "" : "s"} · preview net ${cartPreview.net > 0 ? "+" : ""}${formatQty(cartPreview.net)}`
              : "Add products from the catalog"
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>
              Adjustment type <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ADJUSTMENT_TYPES.map((t) => {
                const active = form.adjustmentType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, adjustmentType: t.value }));
                      setAdjustLines([]);
                    }}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white hover:bg-gray-50 text-gray-800",
                    )}
                  >
                    <p className="text-sm font-semibold leading-none">{t.label}</p>
                    <p
                      className={cn(
                        "text-[11px] mt-1.5 leading-snug",
                        active ? "text-gray-300" : "text-gray-500",
                      )}
                    >
                      {t.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>
                Branch <span className="text-red-500">*</span>
              </Label>
              {branchesLoading ? (
                <StockSelectSkeleton label="Loading branches" />
              ) : (
                <Select
                  value={form.branchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, branchId: v }));
                    setFormErrors((e) => ({ ...e, branchId: "" }));
                    setAdjustLines((prev) =>
                      prev.map((l) => ({
                        ...l,
                        currentQty: stocks[`${l.productId}-${v}`] ?? 0,
                      })),
                    );
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-10 text-sm text-black",
                      formErrors.branchId && "border-red-400",
                    )}
                  >
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-sm">
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formErrors.branchId ? (
                <p className="text-xs text-red-500">{formErrors.branchId}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className={STOCK_DLG.label}>Category</Label>
              <Select
                value={form.adjustmentCategory}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    adjustmentCategory: v as AdjustmentCategory,
                  }))
                }
              >
                <SelectTrigger className="h-10 text-sm text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-sm">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMoreDetails((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            {showMoreDetails ? "Hide" : "Show"} reference & reason
          </button>

          {showMoreDetails ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-3">
              <div className="space-y-1.5">
                <Label className={STOCK_DLG.label}>Reference / batch</Label>
                <Input
                  placeholder="REF-XXXXX"
                  value={form.referenceNo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, referenceNo: e.target.value }))
                  }
                  className="h-9 text-sm text-black bg-white"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className={STOCK_DLG.label}>Reason / remarks</Label>
                <Textarea
                  placeholder="Audit explanation for this adjustment…"
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  className="text-sm text-black min-h-[64px] resize-none bg-white"
                />
              </div>
            </div>
          ) : null}

          <StockProductPicker
            layout="split"
            products={products}
            categories={categories}
            loading={productsLoading}
            lines={adjustLines}
            onLinesChange={(next) => {
              setAdjustLines(
                next.map((l) => ({
                  ...l,
                  currentQty: getStockQty(l.productId),
                })),
              );
              setFormErrors((e) => ({ ...e, lines: "" }));
            }}
            quantityLabel={quantityLabelForType(form.adjustmentType)}
            showCurrentQty
            getCurrentQty={getStockQty}
            disabled={!form.branchId}
            disabledHint="Select a branch above to unlock the catalog"
            error={formErrors.lines}
            cartFooter={
              adjustLines.length > 0 ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-500 inline-flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5" />
                    Preview variance
                  </span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      varianceTone(cartPreview.net),
                    )}
                  >
                    {cartPreview.net > 0 ? "+" : ""}
                    {formatQty(cartPreview.net)} units
                  </span>
                </div>
              ) : null
            }
          />
        </div>
      </StockOperationDialog>

      <InventoryKpiGrid
        columns={4}
        loading={loading && adjustments.length === 0}
        items={[
          {
            label: "Total (filtered)",
            value: total.toLocaleString(),
            icon: History,
          },
          {
            label: "Shrinkage (page)",
            value: `-${formatQty(stats.shrink)}`,
            icon: TrendingDown,
            tone: "danger",
          },
          {
            label: "Gains (page)",
            value: `+${formatQty(stats.gain)}`,
            icon: TrendingUp,
            tone: "success",
          },
          {
            label: "Reconciliations (page)",
            value: stats.recon.toLocaleString(),
            icon: ClipboardCheck,
          },
        ]}
      />

      {/* Type chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All types" },
          ...ADJUSTMENT_TYPES.map((t) => ({
            value: t.value,
            label: t.label,
          })),
        ].map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              setFilterType(s.value);
              setPage(1);
            }}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filterType === s.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search product, SKU, branch, ref, reason…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm text-black"
            />
          </div>

          <Select
            value={filterBranch}
            onValueChange={(v) => {
              setFilterBranch(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">
                All branches
              </SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterCategory}
            onValueChange={(v) => {
              setFilterCategory(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">
                All categories
              </SelectItem>
              {ADJUSTMENT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-sm">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full justify-start text-left text-sm font-normal text-black"
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                {filterStart ? (
                  format(filterStart, "dd MMM yyyy")
                ) : (
                  <span className="text-gray-400">From date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filterStart}
                onSelect={(d) => {
                  setFilterStart(d);
                  setPage(1);
                }}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full justify-start text-left text-sm font-normal text-black"
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                {filterEnd ? (
                  format(filterEnd, "dd MMM yyyy")
                ) : (
                  <span className="text-gray-400">To date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filterEnd}
                onSelect={(d) => {
                  setFilterEnd(d);
                  setPage(1);
                }}
              />
            </PopoverContent>
          </Popover>

          {hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={clearFilters}
            >
              <X className="h-4 w-4 mr-1.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-gray-500">
          Showing {filteredRows.length.toLocaleString()} of{" "}
          {total.toLocaleString()} records
          {searchQuery.trim() ? " (client search on this page)" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Adjustment history
          </h2>
          <p className="text-xs text-gray-500">
            Audit trail of reconciliations and quantity corrections
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
              viewMode === "table"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50",
            )}
          >
            <List className="h-3.5 w-3.5" />
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
              viewMode === "grid"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
        </div>
      </div>

      <Card className="border border-gray-200 overflow-hidden bg-white shadow-sm">
        <CardContent className="p-0 relative">
          {loading && adjustments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">
                Loading adjustments...
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Package className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No adjustments found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try clearing filters or adjusting your search."
                  : "Create an adjustment to reconcile or correct stock."}
              </p>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : null}

              {viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                          Date
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Product
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Branch
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          System
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Count / Δ
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Variance
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((a) => {
                        const ts = new Date(a.adjustment_date);
                        const diff = Number(a.difference) || 0;
                        const countOrChange =
                          a.adjustment_type === "RECONCILIATION"
                            ? Number(a.physical_count) || 0
                            : Number(a.change_quantity) || 0;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="py-2.5 pl-3 whitespace-nowrap text-sm text-gray-700">
                              <div>{ts.toLocaleDateString()}</div>
                              <div className="text-[11px] text-gray-400">
                                {ts.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                {a.product?.name || "—"}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">
                                {a.reference_no || a.product?.sku || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                {a.branch?.name || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  typeTone(a.adjustment_type),
                                )}
                              >
                                {typeLabel(a.adjustment_type)}
                              </Badge>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {categoryLabel(a.adjustment_category)}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              {formatQty(Number(a.system_quantity) || 0)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                              {formatQty(countOrChange)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-sm text-right tabular-nums font-semibold",
                                varianceTone(diff),
                              )}
                            >
                              {diff > 0 ? "+" : ""}
                              {formatQty(diff)}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => openDetail(a)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <InventoryCardGrid
                  empty={false}
                  emptyTitle=""
                  emptyDescription=""
                  loading={false}
                >
                  {filteredRows.map((a) => {
                    const diff = Number(a.difference) || 0;
                    return (
                      <TransactionRecordCard
                        key={a.id}
                        date={`${new Date(a.adjustment_date).toLocaleDateString()} · ${new Date(a.adjustment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        title={a.product?.name || "Product"}
                        subtitle={a.product?.sku}
                        meta={
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {a.branch?.name}
                          </span>
                        }
                        badge={
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold",
                              typeTone(a.adjustment_type),
                            )}
                          >
                            {typeLabel(a.adjustment_type)}
                          </Badge>
                        }
                        highlights={[
                          {
                            label: "Variance",
                            value: `${diff > 0 ? "+" : ""}${formatQty(diff)}`,
                            tone:
                              diff > 0
                                ? "success"
                                : diff < 0
                                  ? "danger"
                                  : "default",
                          },
                          {
                            label: "Category",
                            value: categoryLabel(a.adjustment_category),
                          },
                          {
                            label: "Count / Δ",
                            value: formatQty(
                              a.adjustment_type === "RECONCILIATION"
                                ? Number(a.physical_count) || 0
                                : Number(a.change_quantity) || 0,
                            ),
                          },
                        ]}
                        footer={
                          a.reason || a.reference_no
                            ? `${a.reason || ""}${a.reference_no ? ` · #${a.reference_no}` : ""}`
                            : undefined
                        }
                        actions={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => openDetail(a)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                        }
                      />
                    );
                  })}
                </InventoryCardGrid>
              )}
            </>
          )}

          {total > 0 ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || loading}
                  className="text-sm text-black"
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="text-sm text-black"
                >
                  Previous
                </Button>
                <span className="text-sm text-black px-3">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="text-sm text-black"
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || loading}
                  className="text-sm text-black"
                >
                  Last
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[560px] border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-black">
              Adjustment detail
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Audit record for this stock correction
            </DialogDescription>
          </DialogHeader>

          {detailRow ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900 truncate">
                    {detailRow.product?.name || "Product"}
                  </p>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">
                    {detailRow.product?.sku || "—"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold shrink-0",
                    typeTone(detailRow.adjustment_type),
                  )}
                >
                  {typeLabel(detailRow.adjustment_type)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Branch
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5 inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {detailRow.branch?.name || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Category
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {categoryLabel(detailRow.adjustment_category)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Date
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {new Date(detailRow.adjustment_date).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Staff
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5 truncate">
                    {detailRow.user?.email || "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Quantity movement
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] text-gray-500">System</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatQty(Number(detailRow.system_quantity) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">
                      {detailRow.adjustment_type === "RECONCILIATION"
                        ? "Physical"
                        : "Change"}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatQty(
                        detailRow.adjustment_type === "RECONCILIATION"
                          ? Number(detailRow.physical_count) || 0
                          : Number(detailRow.change_quantity) || 0,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Variance</p>
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        varianceTone(Number(detailRow.difference) || 0),
                      )}
                    >
                      {(Number(detailRow.difference) || 0) > 0 ? "+" : ""}
                      {formatQty(Number(detailRow.difference) || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {(detailRow.reference_no || detailRow.reason) && (
                <div className="space-y-2 text-sm">
                  {detailRow.reference_no ? (
                    <p>
                      <span className="text-gray-500">Reference: </span>
                      <span className="font-mono text-gray-900">
                        {detailRow.reference_no}
                      </span>
                    </p>
                  ) : null}
                  {detailRow.reason ? (
                    <p>
                      <span className="text-gray-500">Reason: </span>
                      <span className="text-gray-900">{detailRow.reason}</span>
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
