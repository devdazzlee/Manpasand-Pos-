"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  PopoverAnchor,
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  CalendarIcon,
  Loader2,
  PackagePlus,
  FileSpreadsheet,
  Info,
  Receipt,
  FileText,
  Trash2,
  Box,
  Printer,
  Building,
  User,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { ExcelUploadDialog, type ExcelField } from "@/components/inventory/excel-upload-dialog";
import { STOCK_IN_SOURCES } from "@/components/inventory/stock-ops/constants";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { StockModuleToolbar } from "@/components/inventory/stock-ops/stock-module-toolbar";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import { formatMoney } from "@/components/inventory/stock-ops/export-utils";
import * as XLSX from "xlsx";
import { z } from "zod";
import { usePosData } from "@/hooks/use-pos-data";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";

// Zod schema for the supplier-delivery form. Limited to the inputs the user
// commonly misses — supplier, warehouse, and at least one line. Inline errors
// guide the user to the offending field instead of a disabled Save button.
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

export function Purchases({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { stats: dashboardStats, loading: dashboardLoading } = useInventoryDashboard();
  const { categories, productsLoading } = usePosData();
  // ------- shared metadata -------
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [p, s, b] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/suppliers`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
      ]);
      const productList = Array.isArray(p.data?.data)
        ? p.data.data
        : p.data?.data?.products || [];
      setProducts(productList.filter((x: any) => x?.id));
      setSuppliers(Array.isArray(s.data?.data) ? s.data.data : []);
      setBranches(Array.isArray(b.data?.data) ? b.data.data : []);
    } catch {
      // toast handled per-row
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  // ------- tab -------
  const [tab, setTab] = useState<"history" | "new">("history");

  // ------- history -------
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>(undefined);
  const [filterEnd, setFilterEnd] = useState<Date | undefined>(undefined);

  // ------- detail modal -------
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewPurchase = useCallback(async (id: string) => {
    setSelectedPurchaseId(id);
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
    [filterSupplier, filterStart, filterEnd, page],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ------- new entry: step 1 (Excel new products) -------
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

  // ------- new entry: step 2 (Supplier delivery / GRN) -------
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

  const clearError = (key: keyof PurchaseFieldErrors) =>
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // Auto-pick first warehouse branch if none selected.
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

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  };

  const totals = useMemo(() => {
    const lineCount = lines.length;
    const units = lines.reduce((s, l) => s + l.quantity, 0);
    const value = lines.reduce((s, l) => s + l.quantity * l.costPrice, 0);
    return { lineCount, units, value };
  }, [lines]);

  const handleSave = async () => {
    if (saving) return;

    // Inline-error pattern — pinpoint exactly what the user missed instead of
    // greying out the Save button on a form this long.
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

      await apiClient.post(`${API_BASE}/purchases/bulk`, {
        supplierId,
        warehouseBranchId,
        purchaseDate: purchaseDate.toISOString(),
        invoiceRef: invoiceRef || undefined,
        notes: composedNotes || undefined,
        batchNo: batchNo || undefined,
        expiryDate: expiryDate ? expiryDate.toISOString() : undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPrice: l.costPrice,
        })),
      });
      toast.success(
        `Saved ${lines.length} line${lines.length === 1 ? "" : "s"} to the bill`,
      );
      // Reset and bounce to history.
      setLines([]);
      setNotes("");
      setInvoiceRef("");
      setReferenceNumber("");
      setStockInSource("SUPPLIER_DELIVERY");
      setBatchNo("");
      setExpiryDate(undefined);
      setTab("history");
      setPage(1);
      fetchHistory(1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save purchase");
    } finally {
      setSaving(false);
    }
  };

  if (metaLoading) {
    return <PageLoader message="Loading stock in..." />;
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 text-black">
      <div className="flex items-start gap-3">
        <div className="bg-gray-900 text-white p-2.5 rounded-lg shrink-0">
          <PackagePlus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">Stock In</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Record purchase orders, supplier deliveries, returns, opening stock, adjustments, and production receipts with GRN workflow.
          </p>
        </div>
      </div>

      <StockModuleToolbar
        tabs={[
          { id: "history", label: "History" },
          { id: "new", label: "New entry" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as "history" | "new")}
      >
        <StockOpsActions
          onNavigate={onNavigate}
          onImport={() => setExcelDialogOpen(true)}
          disabled={false}
        />
      </StockModuleToolbar>

      {tab === "new" ? (
        <InventoryKpiGrid
          columns={4}
          loading={dashboardLoading}
          items={[
            { label: "Inventory Value", value: formatMoney(dashboardStats.totalInventoryValue) },
            { label: "Low Stock Alerts", value: dashboardStats.lowStockCount, tone: "warning" },
            { label: "Pending Transfers", value: dashboardStats.pendingTransferCount },
            { label: "Out of Stock", value: dashboardStats.outOfStockCount, tone: "danger" },
          ]}
        />
      ) : null}

      {tab === "history" ? (
        <HistoryView
          rows={rows}
          loading={historyLoading}
          page={page}
          totalPages={totalPages}
          total={total}
          setPage={setPage}
          suppliers={suppliers}
          filterSupplier={filterSupplier}
          setFilterSupplier={(v) => {
            setFilterSupplier(v);
            setPage(1);
          }}
          filterStart={filterStart}
          setFilterStart={(d) => {
            setFilterStart(d);
            setPage(1);
          }}
          filterEnd={filterEnd}
          setFilterEnd={(d) => {
            setFilterEnd(d);
            setPage(1);
          }}
          onSearch={() => fetchHistory()}
          onViewDetail={handleViewPurchase}
        />
      ) : (
        <>
        <NewEntryView
          // step 1
          onOpenExcelDialog={() => setExcelDialogOpen(true)}
          // step 2
          suppliers={suppliers}
          branches={branches}
          supplierId={supplierId}
          setSupplierId={(v) => {
            setSupplierId(v);
            clearError("supplierId");
          }}
          warehouseBranchId={warehouseBranchId}
          setWarehouseBranchId={(v) => {
            setWarehouseBranchId(v);
            clearError("warehouseBranchId");
          }}
          purchaseDate={purchaseDate}
          setPurchaseDate={setPurchaseDate}
          invoiceRef={invoiceRef}
          setInvoiceRef={setInvoiceRef}
          stockInSource={stockInSource}
          setStockInSource={setStockInSource}
          referenceNumber={referenceNumber}
          setReferenceNumber={setReferenceNumber}
          batchNo={batchNo}
          setBatchNo={setBatchNo}
          expiryDate={expiryDate}
          setExpiryDate={setExpiryDate}
          products={products}
          categories={categories}
          productsLoading={productsLoading || metaLoading}
          pickerLines={pickerLines}
          onPickerLinesChange={onPickerLinesChange}
          stockMap={stockMap}
          lines={lines}
          removeLine={removeLine}
          // sidebar
          notes={notes}
          setNotes={setNotes}
          totals={totals}
          saving={saving}
          formErrors={formErrors}
          onSave={handleSave}
        />
        <ExcelUploadDialog
          open={excelDialogOpen}
          onOpenChange={setExcelDialogOpen}
          title="Import new products from Excel"
          description={
            <>
              Upload a spreadsheet to add new products with prices and opening stock. This
              updates the product catalog only — it does not create a supplier receipt (use
              Step 2 for that).
            </>
          }
          fields={STOCK_IN_FIELDS}
          footnote={
            <>
              Optional columns: Subcategory, Brand, Supplier, Tax, SKU, Description. Item
              codes are auto-generated when SKU is omitted. Header aliases such as{" "}
              <span className="font-medium">Name</span>,{" "}
              <span className="font-medium">purchase_rate</span>, and{" "}
              <span className="font-medium">sales_rate_inc_dis_and_tax</span> are also accepted.
            </>
          }
          onRow={async (row) => {
            // Each row goes to the per-row import endpoint so the dialog
            // can update its progress list one product at a time.
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
            // Refresh the picker so newly-imported products are selectable
            // in Step 2 immediately.
            fetchMeta();
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
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 text-black">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-slate-900 text-white p-2 rounded-xl">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-black">Stock In Detail</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Full purchase receipt details and item valuation
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="h-9 w-9 animate-spin text-slate-500" />
              <p className="text-sm font-semibold text-slate-600">Fetching stock details...</p>
              <p className="text-xs text-slate-400">Please wait a moment</p>
            </div>
          ) : purchaseDetail ? (() => {
            const { batchNo, expiryDate, userNotes } = parsePurchaseNotes(purchaseDetail.notes);
            const ts = new Date(purchaseDetail.purchase_date);
            const valuation = Number(purchaseDetail.quantity) * Number(purchaseDetail.cost_price);

            return (
              <div className="space-y-6 mt-4">
                {/* Status and Doc Ref Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">Document Reference</span>
                    <span className="text-lg font-bold font-mono text-black">
                      {purchaseDetail.invoice_ref || "— (Direct)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-3 py-1 text-xs font-semibold bg-white text-emerald-700 border-emerald-200">
                      {purchaseDetail.delivery_status || "COMPLETE"}
                    </Badge>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-3 border border-slate-100 p-4 rounded-xl bg-white shadow-sm">
                    <div className="flex items-start gap-2">
                      <Building className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-slate-400 font-medium block">Branch / Location</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {purchaseDetail.warehouse_branch?.name || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-slate-400 font-medium block">Supplier / Vendor</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {purchaseDetail.supplier?.name || "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-3 border border-slate-100 p-4 rounded-xl bg-white shadow-sm">
                    <div className="flex items-start gap-2">
                      <CalendarIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-slate-400 font-medium block">Timestamp</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {ts.toLocaleDateString(undefined, { dateStyle: "long" })} at {ts.toLocaleTimeString(undefined, { timeStyle: "short" })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-slate-400 font-medium block">Recorded By</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {purchaseDetail.user?.email || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items & Valuation Table */}
                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Item Details</span>
                    <span className="text-xs font-semibold text-slate-500">1 Line Item</span>
                  </div>
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="text-xs font-bold text-slate-600">Product</TableHead>
                        <TableHead className="text-xs font-bold text-slate-600 text-center">SKU</TableHead>
                        <TableHead className="text-xs font-bold text-slate-600 text-right">Quantity</TableHead>
                        <TableHead className="text-xs font-bold text-slate-600 text-right">Cost Price</TableHead>
                        <TableHead className="text-xs font-bold text-slate-600 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="hover:bg-slate-50/30">
                        <TableCell className="text-sm font-medium text-slate-900">
                          {purchaseDetail.product?.name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 font-mono text-center">
                          {purchaseDetail.product?.sku || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-900 text-right">
                          {purchaseDetail.quantity}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 text-right">
                          Rs {Number(purchaseDetail.cost_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-slate-900 text-right">
                          Rs {valuation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-t border-slate-100">
                    <span className="text-sm font-bold text-slate-700">Total Valuation</span>
                    <span className="text-base font-extrabold text-black">
                      Rs {valuation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Batch, Expiry & Notes */}
                {(batchNo || expiryDate || userNotes) && (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {batchNo && (
                        <div>
                          <span className="text-xs text-slate-400 font-medium block">Batch Number</span>
                          <span className="text-sm font-semibold text-slate-800">{batchNo}</span>
                        </div>
                      )}
                      {expiryDate && (
                        <div>
                          <span className="text-xs text-slate-400 font-medium block">Expiry Date</span>
                          <span className="text-sm font-semibold text-slate-800">{expiryDate}</span>
                        </div>
                      )}
                    </div>
                    {userNotes && (
                      <div className="border-t border-slate-100 pt-2 mt-2">
                        <span className="text-xs text-slate-400 font-medium block">Notes / Remarks</span>
                        <p className="text-sm text-slate-700 leading-relaxed mt-0.5">{userNotes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Modal Actions */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                  <Button
                    variant="outline"
                    className="text-xs font-semibold h-9 text-slate-700 border-slate-200"
                    onClick={() => setDetailOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    className="text-xs font-semibold h-9 bg-slate-900 hover:bg-slate-800 text-white"
                    onClick={() => {
                      window.print();
                    }}
                  >
                    <Printer className="h-4 w-4 mr-2" /> Print Receipt
                  </Button>
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm font-medium">Failed to retrieve details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- History sub-component ----------
interface HistoryViewProps {
  rows: PurchaseRow[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  suppliers: Supplier[];
  filterSupplier: string;
  setFilterSupplier: (v: string) => void;
  filterStart?: Date;
  setFilterStart: (d?: Date) => void;
  filterEnd?: Date;
  setFilterEnd: (d?: Date) => void;
  onSearch: () => void;
  onViewDetail: (id: string) => void;
}

function HistoryView({
  rows,
  loading,
  page,
  totalPages,
  total,
  setPage,
  suppliers,
  filterSupplier,
  setFilterSupplier,
  filterStart,
  setFilterStart,
  filterEnd,
  setFilterEnd,
  onSearch,
  onViewDetail,
}: HistoryViewProps) {
  return (
    <div className="space-y-4">
      {/* Info banner */}
      <Card className="p-4 border border-blue-100 bg-blue-50/50 shadow-sm rounded-xl">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs md:text-sm text-slate-700 leading-relaxed space-y-1">
            <h4 className="font-bold text-slate-900">What this list shows</h4>
            <p>
              This list logs <span className="font-semibold text-slate-900">supplier deliveries</span> recorded manually under the <strong>New Entry</strong> tab.
            </p>
            <p className="text-slate-500 text-xs mt-1 border-t border-blue-100/50 pt-1">
              Note: Bulk product imports (opening stock) added via Excel are registered as <span className="font-medium">stock movements</span> rather than supplier purchases. You can review Excel imports under <span className="font-medium text-slate-900">Inventory → Stock Management → Movement Log</span>.
            </p>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4 border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Supplier */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <Label className="text-sm text-black">Supplier</Label>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="h-9 text-sm text-black w-full">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  All Sources
                </SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
            <Label className="text-sm text-black">From date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                  {filterStart ? (
                    format(filterStart, "dd MMM yyyy")
                  ) : (
                    <span className="text-gray-400">Start date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filterStart}
                  onSelect={setFilterStart}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
            <Label className="text-sm text-black">To date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                  {filterEnd ? (
                    format(filterEnd, "dd MMM yyyy")
                  ) : (
                    <span className="text-gray-400">End date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filterEnd}
                  onSelect={setFilterEnd}
                />
              </PopoverContent>
            </Popover>
          </div>
          {/* Actions */}
          <div className="flex flex-col gap-1 justify-end">
            <Label className="text-sm text-transparent select-none hidden lg:block">Action</Label>
            <div className="flex items-center gap-2">
              <Button onClick={onSearch} size="sm" className="h-9 text-sm px-4">
                <Search className="h-4 w-4 mr-2" /> Search
              </Button>
              {(filterStart || filterEnd || filterSupplier !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-sm text-black"
                  onClick={() => {
                    setFilterSupplier("all");
                    setFilterStart(undefined);
                    setFilterEnd(undefined);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="border border-gray-200 overflow-hidden">
        <InventoryCardGrid
          empty={!loading && rows.length === 0}
          emptyTitle="No supplier purchases in this list"
          emptyDescription="GRN receipts saved from Step 2 will show up here."
          loading={loading}
        >
          {rows.map((r) => {
            const ts = new Date(r.purchase_date);
            const value = Number(r.quantity) * Number(r.cost_price);
            return (
              <TransactionRecordCard
                key={r.id}
                date={`${ts.toLocaleDateString()} · ${ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                title={r.product?.name || "Purchase line"}
                subtitle={r.invoice_ref || undefined}
                meta={`${r.supplier?.name || "—"} · ${r.warehouse_branch?.name || "—"}`}
                badge={
                  <Badge variant="outline" className="text-xs">
                    {r.delivery_status || "COMPLETE"}
                  </Badge>
                }
                highlights={[
                  { label: "Qty", value: r.quantity },
                  {
                    label: "Value",
                    value: `Rs ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  },
                ]}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => onViewDetail(r.id)}
                  >
                    View
                  </Button>
                }
              />
            );
          })}
        </InventoryCardGrid>
        {/* Pagination */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-black">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-sm text-black"
                onClick={() => setPage(1)}
                disabled={page === 1 || loading}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-sm text-black"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
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
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-sm text-black"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || loading}
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
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

// ---------- New Entry sub-component ----------
interface NewEntryViewProps {
  onOpenExcelDialog: () => void;

  suppliers: Supplier[];
  branches: Branch[];
  supplierId: string;
  setSupplierId: (v: string) => void;
  warehouseBranchId: string;
  setWarehouseBranchId: (v: string) => void;
  purchaseDate: Date;
  setPurchaseDate: (d: Date) => void;
  invoiceRef: string;
  setInvoiceRef: (v: string) => void;
  stockInSource: string;
  setStockInSource: (v: string) => void;
  referenceNumber: string;
  setReferenceNumber: (v: string) => void;
  batchNo: string;
  setBatchNo: (v: string) => void;
  expiryDate?: Date;
  setExpiryDate: (d?: Date) => void;

  products: Product[];
  categories: Array<{ id: string; name: string }>;
  productsLoading: boolean;
  pickerLines: StockLineItem[];
  onPickerLinesChange: (lines: StockLineItem[]) => void;
  stockMap: Record<string, number>;

  lines: DraftLine[];
  removeLine: (productId: string) => void;

  notes: string;
  setNotes: (v: string) => void;
  totals: { lineCount: number; units: number; value: number };
  saving: boolean;
  formErrors: PurchaseFieldErrors;
  onSave: () => void;
}

function NewEntryView(props: NewEntryViewProps) {
  const {
    onOpenExcelDialog,
    suppliers,
    branches,
    supplierId,
    setSupplierId,
    warehouseBranchId,
    setWarehouseBranchId,
    purchaseDate,
    setPurchaseDate,
    invoiceRef,
    setInvoiceRef,
    stockInSource,
    setStockInSource,
    referenceNumber,
    setReferenceNumber,
    batchNo,
    setBatchNo,
    expiryDate,
    setExpiryDate,
    products,
    categories,
    productsLoading,
    pickerLines,
    onPickerLinesChange,
    stockMap,
    lines,
    removeLine,
    notes,
    setNotes,
    totals,
    saving,
    formErrors,
    onSave,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Step 1 — Excel new products */}
        <Card className="p-6 border border-slate-200 bg-white shadow-sm rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Step 1 — Bulk Import New Products (Optional)
                </h2>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                If you have a spreadsheet of new products with prices and opening stock, upload it here. 
                This populates the <span className="font-semibold text-slate-800">product catalog</span> only (opening stock) — it does not create a supplier purchase receipt (use Step 2 below).
              </p>
            </div>
            <div className="flex flex-col items-stretch md:items-end gap-2 shrink-0 min-w-[200px]">
              <Button
                onClick={onOpenExcelDialog}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold transition-colors shadow-sm h-10 px-4 rounded-lg flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                Upload Excel file
              </Button>
              <span className="text-xs text-slate-400 text-left md:text-right font-medium">
                See required columns in the upload dialog
              </span>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500 flex items-start gap-1.5 leading-relaxed">
            <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Click <span className="font-semibold text-slate-700">Upload Excel file</span> to see required columns and download a template. Skip this step if you only need a supplier bill — use Step 2.
            </span>
          </div>
        </Card>

        {/* Step 2 — Supplier delivery (GRN) */}
        <Card className="p-5 border border-gray-200">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-black">
                Step 2 — Supplier delivery (GRN)
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Use this for a real purchase: choose supplier and date, add each
                product and quantity, then{" "}
                <span className="font-medium">Save purchase</span> on the right. Only
                lines you add here appear on the invoice.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger
                    className={`h-9 text-sm text-black ${formErrors.supplierId ? "border-red-500 focus:ring-red-500" : ""}`}
                  >
                    <SelectValue placeholder="Choose supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-sm">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.supplierId && (
                  <p className="text-xs text-red-600">{formErrors.supplierId}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Delivery date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                      {format(purchaseDate, "PPP")}
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
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Stock In source</Label>
                <Select value={stockInSource} onValueChange={setStockInSource}>
                  <SelectTrigger className="h-9 text-sm text-black">
                    <SelectValue placeholder="Select source" />
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
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Reference number</Label>
                <Input
                  placeholder="PO / delivery note ref"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="h-9 text-sm text-black"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Invoice / GRN reference</Label>
                <Input
                  placeholder="e.g. INV-1024"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="h-9 text-sm text-black"
                />
              </div>
            </div>

            {/* Branch — auto-picked but the user can override */}
            <div className="space-y-1.5 max-w-sm">
              <Label className="text-sm text-black">Warehouse / Branch</Label>
              <Select value={warehouseBranchId} onValueChange={setWarehouseBranchId}>
                <SelectTrigger
                  className={`h-9 text-sm text-black ${formErrors.warehouseBranchId ? "border-red-500 focus:ring-red-500" : ""}`}
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
              {formErrors.warehouseBranchId && (
                <p className="text-xs text-red-600">{formErrors.warehouseBranchId}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Batch / lot (optional)</Label>
                <Input
                  placeholder="Lot number"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  className="h-9 text-sm text-black"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-black">Expiry (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                      {expiryDate ? format(expiryDate, "PPP") : (
                        <span className="text-gray-500">None</span>
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
            </div>

            <StockProductPicker
              products={products}
              categories={categories}
              loading={productsLoading}
              lines={pickerLines}
              onLinesChange={onPickerLinesChange}
              quantityLabel="Qty"
              showUnitCost
              unitCostLabel="Cost / unit (Rs)"
              showCurrentQty
              disabled={!warehouseBranchId}
              getCurrentQty={(id) =>
                warehouseBranchId ? (stockMap[id] ?? 0) : null
              }
              error={formErrors.lines}
            />
          </div>
        </Card>
      </div>

      {/* Sidebar — Receipt summary */}
      <div className="space-y-4">
        <Card className="p-5 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-gray-500" />
            <div>
              <h3 className="text-base font-semibold text-black">Receipt summary</h3>
              <p className="text-xs text-gray-500">
                Step 2 only — Excel lines are not counted here.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-600">Line count</span>
              <span className="text-sm text-black">{totals.lineCount}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-600">Total quantity</span>
              <span className="text-sm text-black">{totals.units}</span>
            </div>
            <div>
              <p className="text-sm text-gray-600">Bill total</p>
              <p className="text-2xl font-semibold text-black mt-1">
                Rs{" "}
                {totals.value.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <Label className="text-sm text-black">Notes (optional)</Label>
            <Textarea
              placeholder="Delivery notes, vehicle, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm text-black min-h-[80px] resize-none"
            />
          </div>

          <Button
            onClick={onSave}
            disabled={saving}
            size="sm"
            className="w-full mt-4 text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save purchase
          </Button>
          {Object.keys(formErrors).length > 0 && (
            <p className="mt-2 text-xs text-red-600">
              Please fix the highlighted fields above.
            </p>
          )}

          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-2 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Saving records this supplier bill and updates stock for the lines above.
              Add all products before saving.
            </span>
          </p>
        </Card>
      </div>
    </div>
  );
}
