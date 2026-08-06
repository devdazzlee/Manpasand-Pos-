"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  CalendarIcon,
  Loader2,
  PackagePlus,
  FileSpreadsheet,
  Receipt,
  Plus,
  List,
  LayoutGrid,
  X,
  Eye,
  DollarSign,
  Boxes,
  ShoppingCart,
  FileText,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { ExcelUploadDialog, type ExcelField } from "@/components/inventory/excel-upload-dialog";
import { STOCK_IN_SOURCES } from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { StockSelectSkeleton } from "@/components/inventory/stock-ops/stock-operation-dialog";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { z } from "zod";
import { usePosData } from "@/hooks/use-pos-data";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";

const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  warehouseBranchId: z.string().min(1, "Pick a warehouse or branch"),
  lines: z.array(z.any()).min(1, "Add at least one product line before saving"),
});

type PurchaseFieldErrors = Partial<
  Record<"supplierId" | "warehouseBranchId" | "lines", string>
>;

interface Product {
  id: string;
  name: string;
  sku?: string | null;
}

interface Supplier {
  id: string;
  name: string;
  code?: string | null;
}

interface Branch {
  id: string;
  name: string;
  branch_type?: string | null;
}

interface DraftLine {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPrice: number;
}

interface PurchaseRow {
  id: string;
  purchase_date: string;
  invoice_ref?: string | null;
  quantity: string | number;
  cost_price: string | number;
  delivery_status?: string | null;
  notes?: string | null;
  product?: Product | null;
  supplier?: { id: string; name: string } | null;
  warehouse_branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

interface PurchaseMonthStats {
  totalPurchases: number;
  totalQuantity: number;
  totalValue: number;
}

function isUnknownName(name?: string | null) {
  return (name || "").trim().toLowerCase() === "unknown";
}

function parsePurchaseNotes(notes?: string | null) {
  if (!notes) return { batchNo: "", expiryDate: "", userNotes: "" };
  const parts = notes.split(" | ");
  let batchNo = "";
  let expiryDate = "";
  const remaining: string[] = [];
  parts.forEach((p) => {
    if (p.startsWith("Batch: ")) {
      batchNo = p.replace("Batch: ", "");
    } else if (p.startsWith("Expiry: ")) {
      expiryDate = p.replace("Expiry: ", "");
    } else {
      remaining.push(p);
    }
  });
  return {
    batchNo,
    expiryDate,
    userNotes: remaining.join(" | "),
  };
}

export function Purchases({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  void onNavigate;
  const { stats: dashboardStats, loading: dashboardLoading } = useInventoryDashboard();
  const {
    products,
    categories,
    suppliers,
    branches,
    productsLoading,
    suppliersLoading,
    branchesLoading,
    fetchProducts,
    fetchSuppliers,
    fetchBranches,
    fetchCategories,
    refreshProducts,
  } = usePosData();
  const logoDataUri = useLogoDataUri();

  const metaLoading = productsLoading || suppliersLoading || branchesLoading;

  const visibleSuppliers = useMemo(
    () => suppliers.filter((s) => !isUnknownName(s.name)),
    [suppliers],
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => !isUnknownName(c.name)),
    [categories],
  );

  // Shared POS store — cache-aware. Reuses products/suppliers/branches across
  // Stock In / Out / Management instead of re-hitting APIs on every tab open.
  useEffect(() => {
    void Promise.all([
      fetchProducts(),
      fetchSuppliers(),
      fetchBranches(),
      fetchCategories(),
    ]);
  }, [fetchProducts, fetchSuppliers, fetchBranches, fetchCategories]);

  const [tab, setTab] = useState<"history" | "new">("history");

  // ------- history -------
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>(undefined);
  const [filterEnd, setFilterEnd] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [monthStats, setMonthStats] = useState<PurchaseMonthStats>({
    totalPurchases: 0,
    totalQuantity: 0,
    totalValue: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ------- detail modal -------
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewPurchase = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setPurchaseDetail(null);
    try {
      const res = await apiClient.get(`${API_BASE}/purchases/${id}`);
      setPurchaseDetail(res.data?.data || null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load purchase details");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(
    async (pg = page) => {
      setHistoryLoading(true);
      try {
        const params: any = { page: pg, limit: PAGE_SIZE };
        if (filterSupplier !== "all") params.supplierId = filterSupplier;
        if (filterBranch !== "all") params.branchId = filterBranch;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }
        const res = await apiClient.get(`${API_BASE}/purchases`, { params });
        setRows(res.data?.data || []);
        setTotal(res.data?.meta?.total ?? 0);
        setTotalPages(res.data?.meta?.totalPages ?? 1);
      } catch (e: any) {
        toast.error(e?.response?.data?.message || "Failed to load purchases");
      } finally {
        setHistoryLoading(false);
      }
    },
    [filterSupplier, filterBranch, filterStart, filterEnd, page],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/purchases/stats`);
      const data = res.data?.data || {};
      setMonthStats({
        totalPurchases: Number(data.totalPurchases) || 0,
        totalQuantity: Number(data.totalQuantity) || 0,
        totalValue: Number(data.totalValue) || 0,
      });
    } catch {
      setMonthStats({ totalPurchases: 0, totalQuantity: 0, totalValue: 0 });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const product = (r.product?.name || "").toLowerCase();
      const invoice = (r.invoice_ref || "").toLowerCase();
      const supplier = (r.supplier?.name || "").toLowerCase();
      return product.includes(q) || invoice.includes(q) || supplier.includes(q);
    });
  }, [rows, searchQuery]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterSupplier !== "all" ||
    filterBranch !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterSupplier("all");
    setFilterBranch("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const exportHeaders = [
    "Date",
    "Product",
    "Supplier",
    "Branch",
    "Qty",
    "Cost",
    "Value",
    "Invoice",
    "Status",
  ];

  const buildExportRows = () =>
    filteredRows.map((r) => {
      const qty = Number(r.quantity) || 0;
      const cost = Number(r.cost_price) || 0;
      return [
        r.purchase_date ? new Date(r.purchase_date).toLocaleString() : "",
        r.product?.name || "",
        r.supplier?.name || "",
        r.warehouse_branch?.name || "",
        qty,
        cost,
        qty * cost,
        r.invoice_ref || "",
        r.delivery_status || "COMPLETE",
      ];
    });

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `purchases-${Date.now()}.xlsx`,
        "Purchases",
        exportHeaders,
        buildExportRows(),
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
      const pdfRows = filteredRows.map((r) => {
        const qty = Number(r.quantity) || 0;
        const cost = Number(r.cost_price) || 0;
        return [
          r.purchase_date
            ? new Date(r.purchase_date).toLocaleDateString()
            : "",
          r.product?.name || "",
          r.supplier?.name || "",
          r.warehouse_branch?.name || "",
          formatQty(qty),
          formatMoney(cost),
          formatMoney(qty * cost),
        ];
      });

      await downloadBrandedPdf({
        filename: `purchases-${Date.now()}.pdf`,
        title: "Stock In — Purchases",
        subtitle: "Supplier delivery history",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          {
            label: "This month",
            value: monthStats.totalPurchases.toLocaleString(),
          },
          { label: "Month value", value: formatMoney(monthStats.totalValue) },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2.2 },
          { header: "Supplier", width: 1.4 },
          { header: "Branch", width: 1.2 },
          { header: "Qty", align: "right", width: 0.8 },
          { header: "Cost", align: "right", width: 1 },
          { header: "Value", align: "right", width: 1.1 },
        ],
        rows: pdfRows,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  // ------- Excel import -------
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  const downloadStockInTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "Product Name",
        "Unit",
        "Category",
        "Purchase Rate",
        "Sales Rate",
        "Min Stock",
        "Stock",
      ],
      ["Sample Product A", "PCS", "Grocery", 80, 100, 10, 50],
      ["Sample Product B", "Kg", "Grocery", 250, 320, 5, 20],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock In");
    XLSX.writeFile(wb, "stock-in-template.xlsx");
  };

  const STOCK_IN_FIELDS: ExcelField[] = [
    {
      name: "Product Name",
      required: true,
      description: 'Same as Add Product. Column can also be "Name".',
    },
    {
      name: "Unit",
      description: 'Same as Select unit — unit name (e.g. PCS). Auto-created if new.',
    },
    {
      name: "Category",
      description: "Same as Select category — category name. Auto-created if new.",
    },
    {
      name: "Purchase Rate",
      required: true,
      description: "Same as Add Product (required). Aliases: Buy Price (Rs), purchase_rate.",
    },
    {
      name: "Sales Rate",
      required: true,
      description:
        'Same as Add Product (required). Aliases: Sell Price (Rs), selling_price, sales_rate_inc_dis_and_tax, or column "Sales Rate".',
    },
    {
      name: "Min Stock",
      description:
        "Same as Add Product. Defaults to 10 on Stock In Excel import if omitted; 0 if empty in this bulk dialog.",
    },
    {
      name: "Stock",
      description:
        "Same as Add Product — opening quantity. Aliases: Initial Stock Qty, Opening Stock, Quantity, stock.",
    },
  ];

  // ------- new entry form -------
  const [supplierId, setSupplierId] = useState<string>("");
  const [warehouseBranchId, setWarehouseBranchId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [invoiceRef, setInvoiceRef] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [stockInSource, setStockInSource] = useState<string>("SUPPLIER_DELIVERY");
  const [batchNo, setBatchNo] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<PurchaseFieldErrors>({});
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  /** Cash = pay full now · Credit = pay later · Mix = partial now */
  const [paymentMode, setPaymentMode] = useState<"CASH" | "CREDIT" | "MIX">(
    "CASH",
  );
  const [paidNowInput, setPaidNowInput] = useState("");
  const [settleMethod, setSettleMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER"
  >("CASH");
  const [settleReference, setSettleReference] = useState("");

  const clearError = (key: keyof PurchaseFieldErrors) =>
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  useEffect(() => {
    if (!warehouseBranchId && branches.length > 0) {
      const warehouse =
        branches.find((b) => (b.branch_type || "").toUpperCase() === "WAREHOUSE") ||
        branches[0];
      if (warehouse) setWarehouseBranchId(warehouse.id);
    }
  }, [branches, warehouseBranchId]);

  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!warehouseBranchId) {
      setStockMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`${API_BASE}/stock`, {
          params: { branchId: warehouseBranchId, limit: 5000 },
        });
        if (cancelled) return;
        const map: Record<string, number> = {};
        (res.data?.data || []).forEach((s: any) => {
          const pid = s.product_id || s.product?.id;
          if (pid) map[pid] = Number(s.current_quantity || 0);
        });
        setStockMap(map);
      } catch {
        if (!cancelled) setStockMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseBranchId]);

  const pickerLines: StockLineItem[] = useMemo(
    () =>
      lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        unitCost: l.costPrice,
        currentQty: stockMap[l.productId] ?? 0,
      })),
    [lines, stockMap],
  );

  const onPickerLinesChange = (next: StockLineItem[]) => {
    setLines(
      next.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: Number(l.quantity) || 0,
        costPrice: Number(l.unitCost) || 0,
      })),
    );
    clearError("lines");
  };

  const totals = useMemo(() => {
    const lineCount = lines.length;
    const units = lines.reduce((s, l) => s + l.quantity, 0);
    const value = lines.reduce((s, l) => s + l.quantity * l.costPrice, 0);
    return { lineCount, units, value };
  }, [lines]);

  const paidNowAmount = useMemo(() => {
    if (paymentMode === "CASH") return totals.value;
    if (paymentMode === "CREDIT") return 0;
    const n = Number(paidNowInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [paymentMode, paidNowInput, totals.value]);

  const creditRemaining = Math.max(0, totals.value - paidNowAmount);

  const detailsReady = Boolean(supplierId && warehouseBranchId);
  const paymentValid =
    paymentMode !== "MIX" ||
    (paidNowAmount > 0 && paidNowAmount < totals.value);
  const canSave =
    detailsReady && lines.length > 0 && !saving && paymentValid;

  const resetDraft = () => {
    setLines([]);
    setNotes("");
    setInvoiceRef("");
    setReferenceNumber("");
    setBatchNo("");
    setExpiryDate(undefined);
    setStockInSource("SUPPLIER_DELIVERY");
    setPurchaseDate(new Date());
    setFormErrors({});
    setShowMoreDetails(false);
    setPaymentMode("CASH");
    setPaidNowInput("");
    setSettleMethod("CASH");
    setSettleReference("");
  };

  const handleSave = async () => {
    if (saving) return;

    const parsed = purchaseSchema.safeParse({
      supplierId,
      warehouseBranchId,
      lines,
    });
    if (!parsed.success) {
      const next: PurchaseFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PurchaseFieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFormErrors(next);
      return;
    }
    setFormErrors({});

    if (paymentMode === "MIX") {
      if (paidNowAmount <= 0) {
        toast.error("Enter how much you paid now for a mix payment");
        return;
      }
      if (paidNowAmount >= totals.value) {
        toast.error("For full payment, choose Cash instead of Mix");
        return;
      }
    }

    setSaving(true);
    try {
      const sourceLabel =
        STOCK_IN_SOURCES.find((s) => s.value === stockInSource)?.label ||
        stockInSource;
      const composedNotes = [
        `Source: ${sourceLabel}`,
        referenceNumber ? `Ref: ${referenceNumber}` : "",
        batchNo ? `Batch: ${batchNo}` : "",
        expiryDate ? `Expiry: ${format(expiryDate, "PPP")}` : "",
        notes || "",
      ]
        .filter(Boolean)
        .join(" | ");

      const res = await apiClient.post(`${API_BASE}/purchases/bulk`, {
        supplierId,
        warehouseBranchId,
        purchaseDate: purchaseDate.toISOString(),
        invoiceRef: invoiceRef || undefined,
        notes: composedNotes || undefined,
        batchNo: batchNo || undefined,
        expiryDate: expiryDate ? expiryDate.toISOString() : undefined,
        paymentMode,
        paidAmount: paymentMode === "MIX" ? paidNowAmount : undefined,
        paymentMethod:
          paymentMode === "CREDIT" ? undefined : settleMethod,
        paymentReference:
          paymentMode === "CREDIT"
            ? undefined
            : settleReference.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPrice: l.costPrice,
        })),
      });

      const result = res.data?.data || {};
      const paid = Number(result.paidAmount) || paidNowAmount;
      const remaining =
        Number(result.creditRemaining) ?? creditRemaining;
      if (paymentMode === "CASH") {
        toast.success(`Saved & paid in full (${formatMoney(paid)})`);
      } else if (paymentMode === "CREDIT") {
        toast.success(
          `Saved on credit (${formatMoney(totals.value)} balance due)`,
        );
      } else {
        toast.success(
          `Saved · paid ${formatMoney(paid)} · remaining ${formatMoney(remaining)}`,
        );
      }
      setLines([]);
      setNotes("");
      setInvoiceRef("");
      setReferenceNumber("");
      setStockInSource("SUPPLIER_DELIVERY");
      setBatchNo("");
      setExpiryDate(undefined);
      setPaymentMode("CASH");
      setPaidNowInput("");
      setSettleMethod("CASH");
      setSettleReference("");
      setTab("history");
      setPage(1);
      fetchHistory(1);
      fetchStats();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  if (metaLoading && products.length === 0 && suppliers.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading stock in..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <PackagePlus className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Purchases
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Stock In
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Record supplier deliveries and purchase receipts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {tab === "history" ? (
            <Button
              size="sm"
              className="h-9 text-sm"
              onClick={() => setTab("new")}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New entry
            </Button>
          ) : null}
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={historyLoading || filteredRows.length === 0}
            exporting={exporting}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm text-black"
            onClick={() => setExcelDialogOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Import products
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "history" | "new")}
        className="space-y-5"
      >
        <TabsList className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-10 shrink-0 w-full max-w-xs grid grid-cols-2">
          <TabsTrigger
            value="history"
            className="rounded-lg h-8 text-xs sm:text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value="new"
            className="rounded-lg h-8 text-xs sm:text-sm data-[state=active]:bg-gray-900 data-[state=active]:text-white"
          >
            New entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0 space-y-5 focus-visible:outline-none">
          <InventoryKpiGrid
            columns={4}
            loading={statsLoading || dashboardLoading}
            items={[
              {
                label: "Purchases (month)",
                value: monthStats.totalPurchases.toLocaleString(),
                icon: ShoppingCart,
                hint: "This calendar month",
              },
              {
                label: "Quantity (month)",
                value: formatQty(monthStats.totalQuantity),
                icon: Boxes,
              },
              {
                label: "Value (month)",
                value: formatMoney(monthStats.totalValue),
                icon: DollarSign,
              },
              {
                label: "Records shown",
                value: total.toLocaleString(),
                icon: FileText,
                hint: "Matching current filters",
              },
            ]}
          />

          <p className="text-xs text-gray-500 -mt-2">
            Inventory value {formatMoney(dashboardStats.totalInventoryValue)} · GRN
            receipts from New entry appear here. Excel product imports are catalog /
            opening stock only.
          </p>

          {/* Filters */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              <div className="relative md:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search product, invoice, supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 text-sm text-black"
                />
              </div>

              <Select
                value={filterSupplier}
                onValueChange={(v) => {
                  setFilterSupplier(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-sm text-black">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-sm">
                    All suppliers
                  </SelectItem>
                  {visibleSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-sm">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterBranch}
                onValueChange={(v) => {
                  setFilterBranch(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 text-sm text-black">
                  <SelectValue placeholder="All branches" />
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
                  className="h-10 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Clear filters
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-gray-500">
              Showing {filteredRows.length.toLocaleString()} of {total.toLocaleString()}{" "}
              records
              {searchQuery.trim() ? " (client search on this page)" : ""}
            </p>
          </div>

          {/* List header + view toggle */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Purchase history</h2>
              <p className="text-xs text-gray-500">
                Supplier deliveries recorded as GRN receipts
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
              {historyLoading && rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  <p className="text-sm text-gray-500 mt-3">Loading purchases...</p>
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <Receipt className="h-8 w-8 text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-900">No purchases found</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {hasActiveFilters
                      ? "Try clearing filters or adjusting your search."
                      : "Save a supplier delivery from New entry to see it here."}
                  </p>
                </div>
              ) : (
                <>
                  {historyLoading ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                        <p className="text-xs text-gray-500">Updating...</p>
                      </div>
                    </div>
                  ) : null}

                  {viewMode === "table" ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="text-xs font-semibold text-gray-600 pl-3 pr-2">
                              Date
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Product
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Supplier
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Branch
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Qty
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Cost
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right px-2">
                              Value
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 px-2">
                              Status
                            </TableHead>
                            <TableHead className="text-xs font-semibold text-gray-600 text-right pl-2 pr-3">
                              Action
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRows.map((r) => {
                            const qty = Number(r.quantity) || 0;
                            const cost = Number(r.cost_price) || 0;
                            const ts = new Date(r.purchase_date);
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="py-2.5 pl-3 pr-2 whitespace-nowrap text-sm text-gray-700">
                                  <div>{ts.toLocaleDateString()}</div>
                                  <div className="text-[11px] text-gray-400">
                                    {ts.toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5 px-2">
                                  <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                    {r.product?.name || "—"}
                                  </p>
                                  {r.invoice_ref ? (
                                    <p className="text-[11px] text-gray-400 font-mono">
                                      {r.invoice_ref}
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-gray-700">
                                  {r.supplier?.name || "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-gray-700">
                                  {r.warehouse_branch?.name || "—"}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums text-gray-900">
                                  {formatQty(qty)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums text-gray-700">
                                  {formatMoney(cost)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2 text-sm text-right tabular-nums font-medium text-gray-900">
                                  {formatMoney(qty * cost)}
                                </TableCell>
                                <TableCell className="py-2.5 px-2">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200"
                                  >
                                    {r.delivery_status || "COMPLETE"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-2.5 pl-2 pr-3 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => handleViewPurchase(r.id)}
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
                    <InventoryCardGrid empty={false} loading={false}>
                      {filteredRows.map((r) => {
                        const ts = new Date(r.purchase_date);
                        const qty = Number(r.quantity) || 0;
                        const cost = Number(r.cost_price) || 0;
                        const value = qty * cost;
                        const status = (r.delivery_status || "COMPLETE").toUpperCase();
                        return (
                          <TransactionRecordCard
                            key={r.id}
                            date={`${ts.toLocaleDateString(undefined, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })} · ${ts.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`}
                            title={r.product?.name || "Purchase line"}
                            subtitle={
                              r.invoice_ref
                                ? `Invoice ${r.invoice_ref}`
                                : r.product?.sku
                                  ? `SKU ${r.product.sku}`
                                  : undefined
                            }
                            amount={formatMoney(value)}
                            amountLabel="Value"
                            meta={
                              <div className="space-y-1">
                                <p>
                                  <span className="text-gray-400">Supplier · </span>
                                  <span className="font-medium text-gray-800">
                                    {r.supplier?.name || "—"}
                                  </span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Branch · </span>
                                  <span className="font-medium text-gray-800">
                                    {r.warehouse_branch?.name || "—"}
                                  </span>
                                </p>
                              </div>
                            }
                            badge={
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  status === "COMPLETE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200",
                                )}
                              >
                                {status}
                              </span>
                            }
                            highlights={[
                              { label: "Qty", value: formatQty(qty) },
                              { label: "Cost", value: formatMoney(cost) },
                              {
                                label: "Value",
                                value: formatMoney(value),
                                tone: "success",
                              },
                            ]}
                            actions={
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleViewPurchase(r.id)}
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
            </CardContent>

            {total > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200">
                <p className="text-sm text-black">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(1)}
                    disabled={page === 1 || historyLoading}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || historyLoading}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-black px-3">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || historyLoading}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages || historyLoading}
                  >
                    Last
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="new" className="mt-0 space-y-3 focus-visible:outline-none">
          {/* Compact delivery strip — one screen with catalog below */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  New supplier receipt
                </h2>
                <p className="text-[11px] text-gray-500">
                  Set delivery info, pick products on the left, save from the bill panel
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-black"
                  onClick={() => setExcelDialogOpen(true)}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                  Import products
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-gray-600"
                  onClick={resetDraft}
                  disabled={saving}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">
                    Supplier <span className="text-red-500">*</span>
                  </Label>
                  {metaLoading ? (
                    <StockSelectSkeleton label="Loading suppliers" className="h-9" />
                  ) : (
                    <Select
                      value={supplierId}
                      onValueChange={(v) => {
                        setSupplierId(v);
                        clearError("supplierId");
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-sm text-black",
                          formErrors.supplierId && "border-red-500",
                        )}
                      >
                        <SelectValue placeholder="Choose supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-sm">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formErrors.supplierId ? (
                    <p className="text-[11px] text-red-600">{formErrors.supplierId}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">
                    Branch <span className="text-red-500">*</span>
                  </Label>
                  {metaLoading ? (
                    <StockSelectSkeleton label="Loading branches" className="h-9" />
                  ) : (
                    <Select
                      value={warehouseBranchId}
                      onValueChange={(v) => {
                        setWarehouseBranchId(v);
                        clearError("warehouseBranchId");
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-9 text-sm text-black",
                          formErrors.warehouseBranchId && "border-red-500",
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
                  {formErrors.warehouseBranchId ? (
                    <p className="text-[11px] text-red-600">
                      {formErrors.warehouseBranchId}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">
                    Date <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                        {format(purchaseDate, "dd MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={purchaseDate}
                        onSelect={(d) => d && setPurchaseDate(d)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Source</Label>
                  <Select value={stockInSource} onValueChange={setStockInSource}>
                    <SelectTrigger className="h-9 text-sm text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_IN_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-sm">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Invoice / GRN</Label>
                  <Input
                    placeholder="INV-1024"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    className="h-9 text-sm text-black"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMoreDetails((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showMoreDetails && "rotate-180",
                  )}
                />
                {showMoreDetails ? "Hide" : "More"} options
              </button>

              {showMoreDetails ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 border-t border-dashed border-gray-200">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">PO / Ref</Label>
                    <Input
                      placeholder="Delivery note"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Batch / lot</Label>
                    <Input
                      placeholder="Lot #"
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Expiry</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                          {expiryDate ? (
                            format(expiryDate, "dd MMM yyyy")
                          ) : (
                            <span className="text-gray-400">None</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={expiryDate}
                          onSelect={setExpiryDate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs text-gray-600">Notes</Label>
                    <Input
                      placeholder="Optional notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="h-9 text-sm text-black"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Split workspace: catalog | bill — no scrolling through steps */}
          <StockProductPicker
            layout="split"
            products={products}
            categories={visibleCategories}
            loading={productsLoading}
            lines={pickerLines}
            onLinesChange={onPickerLinesChange}
            quantityLabel="Qty"
            showUnitCost
            unitCostLabel="Cost / unit"
            showCurrentQty
            disabled={!detailsReady}
            disabledHint="Choose supplier and branch above to unlock the catalog"
            getCurrentQty={(id) =>
              warehouseBranchId ? (stockMap[id] ?? 0) : null
            }
            error={formErrors.lines}
            cartFooter={
              <div className="space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Lines</span>
                    <span className="font-medium tabular-nums text-gray-900">
                      {totals.lineCount}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Quantity</span>
                    <span className="font-medium tabular-nums text-gray-900">
                      {formatQty(totals.units)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1 border-t border-slate-200">
                    <span className="text-gray-600">Bill total</span>
                    <span className="text-lg font-bold tabular-nums text-gray-900">
                      {formatMoney(totals.value)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-gray-200 bg-slate-50/80 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Supplier payment
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        {
                          key: "CASH" as const,
                          label: "Cash",
                          hint: "Pay full now",
                        },
                        {
                          key: "CREDIT" as const,
                          label: "Credit",
                          hint: "Pay later",
                        },
                        {
                          key: "MIX" as const,
                          label: "Mix",
                          hint: "Part paid",
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setPaymentMode(opt.key);
                          if (opt.key !== "MIX") setPaidNowInput("");
                        }}
                        className={cn(
                          "rounded-md border px-2 py-2 text-left transition-colors",
                          paymentMode === opt.key
                            ? "border-blue-400 bg-white shadow-sm"
                            : "border-gray-200 bg-white/70 hover:border-gray-300",
                        )}
                      >
                        <span className="block text-xs font-semibold text-gray-900">
                          {opt.label}
                        </span>
                        <span className="block text-[10px] text-gray-500 leading-tight">
                          {opt.hint}
                        </span>
                      </button>
                    ))}
                  </div>

                  {paymentMode === "MIX" ? (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-600">
                        Paid now <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paidNowInput}
                        onChange={(e) => setPaidNowInput(e.target.value)}
                        placeholder="Amount paid today"
                        className="h-8 text-sm bg-white"
                      />
                    </div>
                  ) : null}

                  {paymentMode !== "CREDIT" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-600">
                          Method
                        </Label>
                        <Select
                          value={settleMethod}
                          onValueChange={(v) =>
                            setSettleMethod(
                              v as typeof settleMethod,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="BANK_TRANSFER">
                              Bank transfer
                            </SelectItem>
                            <SelectItem value="CHEQUE">Cheque</SelectItem>
                            <SelectItem value="CARD">Card</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-gray-600">
                          Txn ref
                        </Label>
                        <Input
                          value={settleReference}
                          onChange={(e) => setSettleReference(e.target.value)}
                          placeholder="Optional"
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1 text-xs pt-1 border-t border-gray-200">
                    <div className="flex justify-between text-gray-600">
                      <span>Paying now</span>
                      <span className="font-semibold tabular-nums text-green-700">
                        {formatMoney(paidNowAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Remaining on credit</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          creditRemaining > 0
                            ? "text-red-700"
                            : "text-gray-900",
                        )}
                      >
                        {formatMoney(creditRemaining)}
                      </span>
                    </div>
                  </div>
                </div>

                {!detailsReady ? (
                  <p className="text-[11px] text-amber-700">
                    Select supplier &amp; branch to continue
                  </p>
                ) : lines.length === 0 ? (
                  <p className="text-[11px] text-amber-700">
                    Add at least one product from the catalog
                  </p>
                ) : paymentMode === "MIX" && !paymentValid ? (
                  <p className="text-[11px] text-red-600">
                    Mix needs a paid amount greater than 0 and less than bill
                    total
                  </p>
                ) : Object.keys(formErrors).length > 0 ? (
                  <p className="text-[11px] text-red-600">Fix highlighted fields</p>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 text-sm text-black flex-1"
                    onClick={() => setTab("history")}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave}
                    size="sm"
                    className="h-10 text-sm flex-[1.4]"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Save purchase
                  </Button>
                </div>
              </div>
            }
          />
        </TabsContent>
      </Tabs>

      <ExcelUploadDialog
        open={excelDialogOpen}
        onOpenChange={setExcelDialogOpen}
        title="Import new products from Excel"
        description={
          <>
            Upload a spreadsheet to add new products with prices and opening stock. This
            updates the product catalog only — it does not create a supplier receipt.
          </>
        }
        fields={STOCK_IN_FIELDS}
        footnote={
          <>
            Optional columns: Subcategory, Brand, Supplier, Tax, SKU, Description. Item
            codes are auto-generated when SKU is omitted. Header aliases such as{" "}
            <span className="font-medium">Name</span>,{" "}
            <span className="font-medium">purchase_rate</span>, and{" "}
            <span className="font-medium">sales_rate_inc_dis_and_tax</span> are also
            accepted.
          </>
        }
        onRow={async (row) => {
          try {
            await apiClient.post(`${API_BASE}/products/import-row`, { row });
            return { ok: true };
          } catch (err: any) {
            return {
              ok: false,
              error:
                err?.response?.data?.message ||
                err?.response?.data?.errors?.[0]?.message ||
                err?.message ||
                "Failed",
            };
          }
        }}
        onBatchComplete={({ ok, failed, total }) => {
          void refreshProducts();
          if (failed === 0) {
            toast.success(`Imported ${ok} of ${total} product${total === 1 ? "" : "s"}`);
          } else if (ok === 0) {
            toast.error(`All ${total} rows failed — see the list for details`);
          } else {
            toast.warning(`Imported ${ok} of ${total}, ${failed} failed`);
          }
        }}
        onDownloadTemplate={downloadStockInTemplate}
      />

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[min(96vw,720px)] max-w-[720px] sm:max-w-[720px] max-h-[90vh] overflow-y-auto border border-gray-200 p-0 gap-0 bg-white">
          <DialogHeader className="px-6 py-4 border-b border-gray-200">
            <DialogTitle className="text-lg font-bold text-black">
              Purchase detail
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {purchaseDetail?.product?.name
                ? `${purchaseDetail.product.name} · supplier receipt`
                : "Stock In receipt details"}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading purchase details...</p>
            </div>
          ) : purchaseDetail ? (
            (() => {
              const { batchNo: detailBatch, expiryDate: detailExpiry, userNotes } =
                parsePurchaseNotes(purchaseDetail.notes);
              const ts = new Date(purchaseDetail.purchase_date);
              const qty = Number(purchaseDetail.quantity) || 0;
              const cost = Number(purchaseDetail.cost_price) || 0;
              const valuation = qty * cost;

              return (
                <div className="px-6 py-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                        Document reference
                      </p>
                      <p className="text-base font-semibold font-mono text-gray-900 mt-0.5">
                        {purchaseDetail.invoice_ref || "— (Direct)"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      {purchaseDetail.delivery_status || "COMPLETE"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <DetailRow
                      label="Branch"
                      value={purchaseDetail.warehouse_branch?.name || "—"}
                    />
                    <DetailRow
                      label="Supplier"
                      value={
                        purchaseDetail.supplier?.name &&
                        !isUnknownName(purchaseDetail.supplier.name)
                          ? purchaseDetail.supplier.name
                          : "—"
                      }
                    />
                    <DetailRow
                      label="Date"
                      value={`${ts.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${ts.toLocaleTimeString(undefined, { timeStyle: "short" })}`}
                    />
                    <DetailRow
                      label="Recorded by"
                      value={purchaseDetail.user?.email || "—"}
                    />
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Line item
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white">
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-center">
                            SKU
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Cost
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-sm font-medium text-gray-900">
                            {purchaseDetail.product?.name || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 font-mono text-center">
                            {purchaseDetail.product?.sku || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {formatQty(qty)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {formatMoney(cost)}
                          </TableCell>
                          <TableCell className="text-sm font-semibold text-right tabular-nums">
                            {formatMoney(valuation)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-t border-gray-200">
                      <span className="text-sm font-semibold text-gray-700">
                        Total valuation
                      </span>
                      <span className="text-base font-bold text-black tabular-nums">
                        {formatMoney(valuation)}
                      </span>
                    </div>
                  </div>

                  {(detailBatch || detailExpiry || userNotes) && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        {detailBatch ? (
                          <DetailRow label="Batch number" value={detailBatch} />
                        ) : null}
                        {detailExpiry ? (
                          <DetailRow label="Expiry date" value={detailExpiry} />
                        ) : null}
                      </div>
                      {userNotes ? (
                        <div>
                          <p className="text-xs text-gray-500">Notes</p>
                          <p className="text-sm text-gray-800 mt-0.5 leading-relaxed">
                            {userNotes}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="flex justify-end border-t border-gray-100 pt-4">
                    <Button
                      variant="outline"
                      className="text-sm h-9 text-gray-700"
                      onClick={() => setDetailOpen(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm font-medium">Failed to retrieve details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5 break-words">{value}</p>
    </div>
  );
}
