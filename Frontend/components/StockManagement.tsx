"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Package,
  Loader2,
  Calendar,
  Edit,
  MapPin,
  Filter,
  Trash2,
  X,
  FileDown,
  Eye,
  AlertTriangle,
  Boxes,
  DollarSign,
  MinusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_BRANCHES,
  ALL_BRANDS,
  ALL_CATEGORIES,
  ALL_STOCK_STATUS,
  ALL_SUPPLIERS,
  STOCK_STATUS_OPTIONS,
} from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockManagementToolbar } from "@/components/inventory/stock-ops/stock-management-toolbar";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import {
  downloadCsv,
  downloadExcel,
  getProductBarcode,
  getStockRowImage,
  printHtmlDocument,
} from "@/components/inventory/stock-ops/export-utils";
import {
  getStockStatusDisplay,
  StockStatusBadge,
} from "@/components/inventory/stock-ops/stock-status-badge";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { StockRecordCard } from "@/components/inventory/stock-ops/stock-record-card";
import { MovementRecordCard } from "@/components/inventory/stock-ops/movement-record-card";

const DLG = {
  content: "max-w-2xl border border-gray-200 p-0 gap-0 max-h-[90vh] overflow-y-auto",
  header: "px-5 py-4 border-b border-gray-200",
  title: "text-base text-black font-normal",
  desc: "text-sm text-gray-600 font-normal",
  body: "px-5 py-4 space-y-4",
  label: "text-sm text-black font-normal",
  field: "h-9 text-sm text-black border-gray-200",
  footer: "flex justify-end gap-2 px-5 py-4 border-t border-gray-200",
  dropdown:
    "absolute left-0 right-0 z-[100] mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md",
  pickRow: "flex w-full flex-col px-3 py-2 text-left hover:bg-gray-50 text-sm text-black",
  pickSku: "text-xs text-gray-500",
};

function validateStockLines(
  lines: StockLineItem[],
  mode: "positive" | "signed",
): string | null {
  if (lines.length === 0) return "Add at least one product";
  for (const line of lines) {
    const q = Number(line.quantity);
    if (!Number.isFinite(q)) {
      return `Invalid quantity for ${line.productName}`;
    }
    if (mode === "signed" && q === 0) {
      return `Change cannot be zero for ${line.productName}`;
    }
    if (mode === "positive" && q <= 0) {
      return `Quantity must be greater than 0 for ${line.productName}`;
    }
  }
  return null;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm text-black text-right">{value ?? "-"}</dd>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <Card className="p-4 border border-gray-200">
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      {loading ? (
        <div className="h-7 w-20 bg-gray-100 animate-pulse rounded mt-2" />
      ) : (
        <p className="text-xl text-black mt-1">{value}</p>
      )}
    </Card>
  );
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stock {
  id: string;
  product: Product & {
    purchase_rate?: number | string;
    sales_rate_inc_dis_and_tax?: number | string;
    brand?: { id: string; name: string } | null;
    category?: { id: string; name: string } | null;
    supplier?: { id: string; name: string } | null;
    ProductImage?: { image: string }[];
    code?: string;
  };
  branch: Branch;
  current_quantity: number;
  reserved_quantity?: number | string;
  last_updated: string;
}

interface StockManagementProps {
  onNavigate?: (tab: string) => void;
}

interface Movement {
  id: string;
  product: Product;
  branch: Branch;
  movement_type: string;
  quantity_change: number;
  previous_qty: number;
  new_qty: number;
  created_at: string;
  notes?: string;
  user?: { email: string };
}

export function StockManagement({ onNavigate }: StockManagementProps) {
  const { stats: dashboardStats, loading: dashboardLoading, refresh: refreshDashboard } =
    useInventoryDashboard();

  // Global store data
  const { 
    products: globalProducts, 
    categories,
    isAnyLoading: globalLoading,
    refreshAllData: triggerGlobalRefresh,
  } = usePosData();
  
  // Data lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [todayMovements, setTodayMovements] = useState<Movement[]>([]);
  
  // Pagination and meta
  const [totalStocks, setTotalStocks] = useState(0);
  const [stockMeta, setStockMeta] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalQuantity: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    negativeStockCount: 0,
    totalInventoryValue: 0,
    totalProducts: 0,
  });

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>(ALL_BRANCHES);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [brandFilter, setBrandFilter] = useState<string>(ALL_BRANDS);
  const [supplierFilter, setSupplierFilter] = useState<string>(ALL_SUPPLIERS);
  const [stockStatusFilter, setStockStatusFilter] = useState<string>(ALL_STOCK_STATUS);
  const [searchTerm, setSearchTerm] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Apply the filter bar to Movement Log + Today too - currently only the
  // Stock List respects it. Filter is client-side over the already-fetched
  // arrays. SKU + name search, branch by id, category via product.category_id.
  const filterMovement = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (m: Movement) => {
      if (branchFilter !== ALL_BRANCHES && m.branch?.id !== branchFilter) return false;
      if (
        categoryFilter !== ALL_CATEGORIES &&
        m.product?.category_id !== categoryFilter
      )
        return false;
      if (term) {
        const name = (m.product?.name || "").toLowerCase();
        const sku = (m.product?.sku || "").toLowerCase();
        if (!name.includes(term) && !sku.includes(term)) return false;
      }
      return true;
    };
  }, [branchFilter, categoryFilter, searchTerm]);
  const filteredHistory = useMemo(
    () => history.filter(filterMovement),
    [history, filterMovement],
  );
  const filteredTodayMovements = useMemo(
    () => todayMovements.filter(filterMovement),
    [todayMovements, filterMovement],
  );
  const [isTransferring, setIsTransferring] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<Stock | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewProduct, setViewProduct] = useState<Record<string, unknown> | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  // Multi-product line items per operation modal
  const [addLines, setAddLines] = useState<StockLineItem[]>([]);
  const [adjustLines, setAdjustLines] = useState<StockLineItem[]>([]);
  const [removeLines, setRemoveLines] = useState<StockLineItem[]>([]);
  const [transferLines, setTransferLines] = useState<StockLineItem[]>([]);

  // Pagination for stock table
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Dialog state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  // --- Per-field validation errors ---------------------------------------â”€â”€
  type FieldErrors = Record<string, string>;
  const [addErrors,      setAddErrors]      = useState<FieldErrors>({});
  const [adjustErrors,   setAdjustErrors]   = useState<FieldErrors>({});
  const [removeErrors,   setRemoveErrors]   = useState<FieldErrors>({});
  const [transferErrors, setTransferErrors] = useState<FieldErrors>({});

  // Form metadata (branch, reason, notes - quantities live on line items)
  const [transferForm, setTransferForm] = useState({
    fromBranchId: "",
    toBranchId: "",
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    branchId: "",
    supplierId: "",
    invoiceRef: "",
    notes: "",
  });

  const [adjustForm, setAdjustForm] = useState({
    branchId: "",
    reason: "CORRECTION",
    notes: "",
  });

  const [removeForm, setRemoveForm] = useState({
    branchId: "",
    reason: "WASTE",
    notes: "",
  });

  const getStockQty = useCallback(
    (productId: string, branchId: string) => {
      const row = allStocks.find(
        (s) => s.product?.id === productId && s.branch?.id === branchId,
      );
      return row ? Number(row.current_quantity) : 0;
    },
    [allStocks],
  );

  const refreshLineStock = useCallback(
    (
      lines: StockLineItem[],
      branchId: string,
      setter: React.Dispatch<React.SetStateAction<StockLineItem[]>>,
    ) => {
      if (!branchId) return;
      setter(
        lines.map((l) => ({
          ...l,
          currentQty: getStockQty(l.productId, branchId),
        })),
      );
    },
    [getStockQty],
  );

  // 1) Fetch branches on mount
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const [bRes, brandRes, supplierRes] = await Promise.all([
          apiClient.get(`${API_BASE}/branches?fetch_all=true`),
          apiClient.get(`${API_BASE}/brands`, { params: { limit: 1000 } }),
          apiClient.get(`${API_BASE}/suppliers`, { params: { fetch_all: true } }),
        ]);
        setBranches(bRes.data.data);
        setBrands(brandRes.data?.data || brandRes.data || []);
        setSupplierOptions(supplierRes.data?.data || supplierRes.data || []);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load branches");
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadMeta();
  }, []);

  const showErrorToast = (e: any) => {
    console.error("Inventory Operation Error:", e);
    const message = e.response?.data?.message || e.message || "An unexpected operation failure occurred";
    toast.error(message);
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setStockPage(1);
  }, [searchTerm, skuSearch, barcodeSearch, brandFilter, supplierFilter, stockStatusFilter]);

  const combinedSearch = useMemo(() => {
    return [searchTerm, skuSearch, barcodeSearch].filter(Boolean).join(" ").trim();
  }, [searchTerm, skuSearch, barcodeSearch]);

  const refreshAllData = useCallback(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: stockPage.toString(),
          limit: stockPageSize.toString(),
        });
        
        if (branchFilter && branchFilter !== ALL_BRANCHES) params.append('branchId', branchFilter);
        if (categoryFilter && categoryFilter !== ALL_CATEGORIES) params.append('categoryId', categoryFilter);
        if (brandFilter && brandFilter !== ALL_BRANDS) params.append('brandId', brandFilter);
        if (supplierFilter && supplierFilter !== ALL_SUPPLIERS) params.append('supplierId', supplierFilter);
        if (stockStatusFilter && stockStatusFilter !== ALL_STOCK_STATUS) params.append('stockStatus', stockStatusFilter);
        if (combinedSearch) params.append('search', combinedSearch);
        
        const [sRes, hRes, tRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/history?${params}`),
          apiClient.get(`${API_BASE}/stock/today?${params}`),
        ]);
        
        setAllStocks(sRes.data.data || []);
        setTotalStocks(sRes.data.meta?.total || 0);
        if (sRes.data.meta) setStockMeta(sRes.data.meta);
        setHistory(hRes.data.data || []);
        setTodayMovements(tRes.data.data || []);
        refreshDashboard();
      } catch (e: any) {
        toast.error("Failed to load stock data");
      } finally {
        setIsLoading(false);
      }
    }, [
      branchFilter,
      categoryFilter,
      brandFilter,
      supplierFilter,
      stockStatusFilter,
      combinedSearch,
      stockPage,
      stockPageSize,
      refreshDashboard,
    ]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const buildExportRows = useCallback(() => {
    return allStocks.map((s) => {
      const qty = Number(s.current_quantity || 0);
      const reserved = Number(s.reserved_quantity || 0);
      const cost = Number(s.product?.purchase_rate || 0);
      const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
      return [
        s.product?.name || "",
        s.product?.sku || "",
        getProductBarcode(s.product),
        s.product?.category?.name || categories.find((c) => c.id === s.product?.category_id)?.name || "",
        s.product?.brand?.name || "",
        cost,
        sell,
        qty,
        reserved,
        qty - reserved,
        qty * cost,
        s.branch?.name || "",
      ];
    });
  }, [allStocks, categories]);

  const exportHeaders = [
    "Product",
    "SKU",
    "Barcode",
    "Category",
    "Brand",
    "Cost Price",
    "Selling Price",
    "Current Stock",
    "Reserved",
    "Available",
    "Inventory Value",
    "Branch",
  ];

  const handleExport = () => {
    if (allStocks.length === 0) return;
    downloadCsv(
      `inventory_export_${new Date().toISOString().split("T")[0]}.csv`,
      exportHeaders,
      buildExportRows(),
    );
    toast.success("CSV downloaded");
  };

  const handleExportExcel = () => {
    if (allStocks.length === 0) return;
    downloadExcel(
      `inventory_export_${new Date().toISOString().split("T")[0]}.xlsx`,
      "Inventory",
      exportHeaders,
      buildExportRows(),
    );
    toast.success("Excel downloaded");
  };

  const handlePrintReport = () => {
    if (allStocks.length === 0) return;
    const rows = buildExportRows()
      .map(
        (row) =>
          `<tr>${row
            .map((cell, idx) =>
              `<td class="${idx >= 5 ? "num" : ""}">${cell}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("");
    printHtmlDocument(
      "Inventory Report",
      `<h1>Inventory Report</h1>
      <p class="meta">Generated ${new Date().toLocaleString()}  |  ${totalStocks} records</p>
      <table><thead><tr>${exportHeaders.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
    );
  };
  // Derived analytics
  const paginationOptions = [20, 50, 100, 500];
  const totalUnits = stockMeta.totalQuantity || 0;
  const alerts = stockMeta.lowStockCount || 0;
  const totalStockPages = stockMeta.totalPages || 1;

  const runBatchStockOps = async (
    lines: StockLineItem[],
    worker: (line: StockLineItem) => Promise<void>,
  ) => {
    let ok = 0;
    let fail = 0;
    let lastError: unknown = null;
    for (const line of lines) {
      try {
        await worker(line);
        ok++;
      } catch (e) {
        fail++;
        lastError = e;
      }
    }
    return { ok, fail, lastError };
  };

  const handleAddStock = async () => {
    const errors: FieldErrors = {};
    if (!addForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(addLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }
    setAddErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(addLines, (line) =>
        apiClient.post(`${API_BASE}/stock`, {
          productId: line.productId,
          branchId: addForm.branchId,
          quantity: Number(line.quantity),
          supplierId: addForm.supplierId || undefined,
          unitCost: line.unitCost ? Number(line.unitCost) : undefined,
          invoiceRef: addForm.invoiceRef || undefined,
          notes: addForm.notes || undefined,
        }),
      );
      if (ok > 0) {
        setIsAddOpen(false);
        clearProductUI();
        refreshAllData();
        toast.success(`Stock added for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    const errors: FieldErrors = {};
    if (!adjustForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(adjustLines, "signed");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setAdjustErrors(errors);
      return;
    }
    setAdjustErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(adjustLines, (line) =>
        apiClient.patch(`${API_BASE}/stock/adjust`, {
          productId: line.productId,
          branchId: adjustForm.branchId,
          quantityChange: Number(line.quantity),
          reason: adjustForm.reason || undefined,
          notes: adjustForm.notes || undefined,
        }),
      );
      if (ok > 0) {
        setIsAdjustOpen(false);
        clearProductUI();
        refreshAllData();
        toast.success(`Stock adjusted for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRemoveStock = async () => {
    const errors: FieldErrors = {};
    if (!removeForm.branchId) errors.branchId = "Branch is required";
    const lineErr = validateStockLines(removeLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setRemoveErrors(errors);
      return;
    }
    setRemoveErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(removeLines, (line) =>
        apiClient.delete(`${API_BASE}/stock/remove`, {
          data: {
            productId: line.productId,
            branchId: removeForm.branchId,
            quantity: Number(line.quantity),
            reason: removeForm.reason,
            notes: removeForm.notes || undefined,
          },
        }),
      );
      if (ok > 0) {
        setIsRemoveOpen(false);
        clearProductUI();
        refreshAllData();
        toast.success(`Stock removed for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleTransfer = async () => {
    const errors: FieldErrors = {};
    if (!transferForm.fromBranchId) errors.fromBranchId = "From branch is required";
    if (!transferForm.toBranchId) errors.toBranchId = "To branch is required";
    if (
      transferForm.fromBranchId &&
      transferForm.toBranchId &&
      transferForm.fromBranchId === transferForm.toBranchId
    ) {
      errors.toBranchId = "From and To branch must be different";
    }
    const lineErr = validateStockLines(transferLines, "positive");
    if (lineErr) errors.lines = lineErr;
    if (Object.keys(errors).length > 0) {
      setTransferErrors(errors);
      return;
    }
    setTransferErrors({});
    setIsTransferring(true);
    try {
      const { ok, fail, lastError } = await runBatchStockOps(transferLines, (line) =>
        apiClient.post(`${API_BASE}/stock/transfer`, {
          productId: line.productId,
          fromBranchId: transferForm.fromBranchId,
          toBranchId: transferForm.toBranchId,
          quantity: Number(line.quantity),
          notes: transferForm.notes,
        }),
      );
      if (ok > 0) {
        setIsTransferOpen(false);
        clearProductUI();
        refreshAllData();
        toast.success(`Stock transferred for ${ok} product${ok === 1 ? "" : "s"}`);
      }
      if (fail > 0) showErrorToast(lastError);
    } finally {
      setIsTransferring(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const incoming = ["PURCHASE", "TRANSFER_IN", "RETURN"];
    const outgoing = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED"];
    if (incoming.includes(type)) return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{type}</Badge>;
    if (outgoing.includes(type)) return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{type}</Badge>;
    if (type === "ADJUSTMENT") return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{type}</Badge>;
    return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">{type}</Badge>;
  };

  const formatQty = (value: number) => {
    const num = Number(value || 0);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const getStockStatusMeta = (qty: number, minQty = 10) => getStockStatusDisplay(qty, minQty);

  const openStockView = useCallback(async (row: Stock) => {
    setViewRow(row);
    setViewOpen(true);
    setViewLoading(true);
    setViewProduct(null);
    setViewError(null);
    try {
      const res = await apiClient.get(`${API_BASE}/products/${row.product.id}`);
      setViewProduct(res.data?.data ?? res.data ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setViewError(err?.response?.data?.message || "Could not load product details");
    } finally {
      setViewLoading(false);
    }
  }, []);

  const closeStockView = () => {
    setViewOpen(false);
    setViewRow(null);
    setViewProduct(null);
    setViewError(null);
    setViewLoading(false);
  };

  const viewMovements = useMemo(() => {
    if (!viewRow) return [];
    return history
      .filter(
        (m) =>
          m.product?.id === viewRow.product.id &&
          m.branch?.id === viewRow.branch?.id,
      )
      .slice(0, 10);
  }, [history, viewRow]);

  const formatMoney = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "-";
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const clearProductUI = () => {
    setAddLines([]);
    setAdjustLines([]);
    setRemoveLines([]);
    setTransferLines([]);
    setAddForm({ branchId: "", supplierId: "", invoiceRef: "", notes: "" });
    setAdjustForm({ branchId: "", reason: "CORRECTION", notes: "" });
    setRemoveForm({ branchId: "", reason: "WASTE", notes: "" });
    setTransferForm({ fromBranchId: "", toBranchId: "", notes: "" });
  };

  if (isInitialLoading) {
    return (
      <PageLoader message="Loading stock..." />
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 text-black min-h-screen">
      <div className="flex items-start gap-3">
        <div className="bg-gray-900 text-white p-2.5 rounded-lg shrink-0">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">Stock Management</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Central inventory dashboard - stock levels, valuation, adjustments, and movement history.
          </p>
        </div>
      </div>

      <StockManagementToolbar
        onAddStock={() => setIsAddOpen(true)}
        onAdjustStock={() => setIsAdjustOpen(true)}
        onRemoveStock={() => setIsRemoveOpen(true)}
        onTransferStock={() => setIsTransferOpen(true)}
        onNavigate={onNavigate}
        onExportCsv={handleExport}
        onExportExcel={handleExportExcel}
        onPrint={handlePrintReport}
        onImport={() => onNavigate?.("purchases")}
        exportDisabled={allStocks.length === 0}
      />

      <StockOperationDialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            clearProductUI();
            setAddErrors({});
          }
        }}
        title="Add stock"
        description="Add quantity for one or more products at a branch."
        onSubmit={handleAddStock}
        submitting={isTransferring}
        submitLabel={addLines.length > 0 ? `Save ${addLines.length} item${addLines.length === 1 ? "" : "s"}` : "Save"}
        footerHint={addLines.length > 0 ? `${addLines.length} product${addLines.length === 1 ? "" : "s"} selected` : null}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            <Select
              value={addForm.branchId}
              onValueChange={(v) => {
                setAddForm({ ...addForm, branchId: v });
                setAddErrors((e) => ({ ...e, branchId: "" }));
                refreshLineStock(addLines, v, setAddLines);
              }}
            >
              <SelectTrigger className={`h-9 border text-sm text-black ${addErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
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
            {addErrors.branchId && <p className="text-xs text-red-500">{addErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Supplier (optional)</Label>
            <Select value={addForm.supplierId} onValueChange={(v) => setAddForm({ ...addForm, supplierId: v })}>
              <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {supplierOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Invoice / GRN reference (optional)</Label>
            <Input
              placeholder="e.g. INV-1024"
              value={addForm.invoiceRef}
              onChange={(e) => setAddForm({ ...addForm, invoiceRef: e.target.value })}
              className="h-9 text-sm text-black"
            />
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Notes (optional)</Label>
            <Input
              placeholder="Delivery note, vehicle, etc."
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              className="h-9 text-sm text-black"
            />
          </div>
        </div>

        <StockProductPicker
          products={globalProducts}
          categories={categories}
          loading={globalLoading}
          lines={addLines}
          onLinesChange={(next) => {
            setAddLines(next);
            setAddErrors((e) => ({ ...e, lines: "" }));
            if (addForm.branchId) {
              refreshLineStock(next, addForm.branchId, setAddLines);
            }
          }}
          quantityLabel="Qty to add"
          showUnitCost
          showCurrentQty
          getCurrentQty={(id) => (addForm.branchId ? getStockQty(id, addForm.branchId) : null)}
          error={addErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isAdjustOpen}
        onOpenChange={(open) => {
          setIsAdjustOpen(open);
          if (!open) {
            clearProductUI();
            setAdjustErrors({});
          }
        }}
        title="Adjust stock"
        description="Apply quantity corrections for multiple products at once."
        onSubmit={handleAdjustStock}
        submitting={isTransferring}
        submitLabel={adjustLines.length > 0 ? `Save ${adjustLines.length} item${adjustLines.length === 1 ? "" : "s"}` : "Save"}
        footerHint={adjustLines.length > 0 ? `${adjustLines.length} product${adjustLines.length === 1 ? "" : "s"} selected` : null}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            <Select
              value={adjustForm.branchId}
              onValueChange={(v) => {
                setAdjustForm({ ...adjustForm, branchId: v });
                setAdjustErrors((e) => ({ ...e, branchId: "" }));
                refreshLineStock(adjustLines, v, setAdjustLines);
              }}
            >
              <SelectTrigger className={`h-9 border text-sm text-black ${adjustErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
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
            {adjustErrors.branchId && <p className="text-xs text-red-500">{adjustErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Reason</Label>
            <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
              <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CORRECTION" className="text-sm">Correction</SelectItem>
                <SelectItem value="LOST" className="text-sm">Lost / Unaccounted</SelectItem>
                <SelectItem value="FOUND" className="text-sm">Found / Surprise Entry</SelectItem>
                <SelectItem value="PROMOTIONAL" className="text-sm">Promotional Redistribution</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Textarea
            placeholder="Add any additional details..."
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
            className="text-sm text-black min-h-[64px] resize-none border-gray-200"
          />
        </div>

        <StockProductPicker
          products={globalProducts}
          categories={categories}
          loading={globalLoading}
          lines={adjustLines}
          onLinesChange={(next) => {
            setAdjustLines(next);
            setAdjustErrors((e) => ({ ...e, lines: "" }));
            if (adjustForm.branchId) {
              refreshLineStock(next, adjustForm.branchId, setAdjustLines);
            }
          }}
          quantityLabel="Change (+ / âˆ’)"
          quantityPlaceholder="e.g. -5 or 10"
          allowSignedQuantity
          showCurrentQty
          getCurrentQty={(id) => (adjustForm.branchId ? getStockQty(id, adjustForm.branchId) : null)}
          error={adjustErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isRemoveOpen}
        onOpenChange={(open) => {
          setIsRemoveOpen(open);
          if (!open) {
            clearProductUI();
            setRemoveErrors({});
          }
        }}
        title="Remove stock"
        description="Reduce quantity for multiple products (damage, waste, loss, or expiry)."
        onSubmit={handleRemoveStock}
        submitting={isTransferring}
        submitLabel={removeLines.length > 0 ? `Save ${removeLines.length} item${removeLines.length === 1 ? "" : "s"}` : "Save"}
        footerHint={removeLines.length > 0 ? `${removeLines.length} product${removeLines.length === 1 ? "" : "s"} selected` : null}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Branch</Label>
            <Select
              value={removeForm.branchId}
              onValueChange={(v) => {
                setRemoveForm({ ...removeForm, branchId: v });
                setRemoveErrors((e) => ({ ...e, branchId: "" }));
                refreshLineStock(removeLines, v, setRemoveLines);
              }}
            >
              <SelectTrigger className={`h-9 border text-sm text-black ${removeErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
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
            {removeErrors.branchId && <p className="text-xs text-red-500">{removeErrors.branchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Reason</Label>
            <Select value={removeForm.reason} onValueChange={(v) => setRemoveForm({ ...removeForm, reason: v })}>
              <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAMAGE" className="text-sm">Damaged / Defected</SelectItem>
                <SelectItem value="WASTE" className="text-sm">Wastage / Garbage</SelectItem>
                <SelectItem value="THEFT" className="text-sm">Theft / Loss</SelectItem>
                <SelectItem value="EXPIRED" className="text-sm">Expired Goods</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Textarea
            placeholder="Add reference, batch, vehicle, etc."
            value={removeForm.notes}
            onChange={(e) => setRemoveForm({ ...removeForm, notes: e.target.value })}
            className="text-sm text-black min-h-[64px] resize-none border-gray-200"
          />
        </div>

        <StockProductPicker
          products={globalProducts}
          categories={categories}
          loading={globalLoading}
          lines={removeLines}
          onLinesChange={(next) => {
            setRemoveLines(next);
            setRemoveErrors((e) => ({ ...e, lines: "" }));
            if (removeForm.branchId) {
              refreshLineStock(next, removeForm.branchId, setRemoveLines);
            }
          }}
          quantityLabel="Qty to remove"
          showCurrentQty
          getCurrentQty={(id) => (removeForm.branchId ? getStockQty(id, removeForm.branchId) : null)}
          error={removeErrors.lines}
        />
      </StockOperationDialog>

      <StockOperationDialog
        open={isTransferOpen}
        onOpenChange={(open) => {
          setIsTransferOpen(open);
          if (!open) {
            clearProductUI();
            setTransferErrors({});
          }
        }}
        title="Transfer stock"
        description="Move quantity for multiple products between branches."
        onSubmit={handleTransfer}
        submitting={isTransferring}
        submitLabel={transferLines.length > 0 ? `Save ${transferLines.length} item${transferLines.length === 1 ? "" : "s"}` : "Save"}
        footerHint={transferLines.length > 0 ? `${transferLines.length} product${transferLines.length === 1 ? "" : "s"} selected` : null}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>From branch</Label>
            <Select
              value={transferForm.fromBranchId}
              onValueChange={(v) => {
                setTransferForm({ ...transferForm, fromBranchId: v });
                setTransferErrors((e) => ({ ...e, fromBranchId: "" }));
                if (v) refreshLineStock(transferLines, v, setTransferLines);
              }}
            >
              <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.fromBranchId ? "border-red-400" : "border-gray-200"}`}>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.toBranchId} className="text-sm">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {transferErrors.fromBranchId && <p className="text-xs text-red-500">{transferErrors.fromBranchId}</p>}
          </div>
          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>To branch</Label>
            <Select
              value={transferForm.toBranchId}
              onValueChange={(v) => {
                setTransferForm({ ...transferForm, toBranchId: v });
                setTransferErrors((e) => ({ ...e, toBranchId: "" }));
              }}
            >
              <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.toBranchId ? "border-red-400" : "border-gray-200"}`}>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.fromBranchId} className="text-sm">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {transferErrors.toBranchId && <p className="text-xs text-red-500">{transferErrors.toBranchId}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label className={STOCK_DLG.label}>Notes (optional)</Label>
          <Input
            placeholder="Carrier name or reference..."
            value={transferForm.notes}
            onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
            className="h-9 text-sm text-black"
          />
        </div>

        <StockProductPicker
          products={globalProducts}
          categories={categories}
          loading={globalLoading}
          lines={transferLines}
          onLinesChange={(next) => {
            setTransferLines(next);
            setTransferErrors((e) => ({ ...e, lines: "" }));
            if (transferForm.fromBranchId) {
              refreshLineStock(next, transferForm.fromBranchId, setTransferLines);
            }
          }}
          quantityLabel="Qty to transfer"
          showCurrentQty
          getCurrentQty={(id) =>
            transferForm.fromBranchId ? getStockQty(id, transferForm.fromBranchId) : null
          }
          error={transferErrors.lines}
        />
      </StockOperationDialog>


      <InventoryKpiGrid
        columns={6}
        loading={dashboardLoading || isLoading}
        items={[
          { label: "Total Products", value: dashboardStats.totalSkus.toLocaleString(), icon: Package },
          {
            label: "Total Stock Quantity",
            value: formatQty(dashboardStats.totalStockQuantity),
            icon: Boxes,
          },
          {
            label: "Inventory Value",
            value: formatMoney(dashboardStats.totalInventoryValue),
            icon: DollarSign,
          },
          {
            label: "Low Stock Products",
            value: dashboardStats.lowStockCount.toLocaleString(),
            icon: AlertTriangle,
            tone: "warning",
          },
          {
            label: "Out of Stock",
            value: dashboardStats.outOfStockCount.toLocaleString(),
            icon: MinusCircle,
            tone: "danger",
          },
          {
            label: "Negative Stock",
            value: dashboardStats.negativeStockCount.toLocaleString(),
            icon: TrendingDown,
            tone: "danger",
          },
        ]}
      />

      <Card className="p-4 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm text-black"
            />
          </div>
          <Input
            placeholder="SKU..."
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            className="h-9 text-sm text-black"
          />
          <Input
            placeholder="Barcode / code..."
            value={barcodeSearch}
            onChange={(e) => setBarcodeSearch(e.target.value)}
            className="h-9 text-sm text-black"
          />
          <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
            <SelectTrigger className="h-9 text-sm text-black">
              <SelectValue placeholder="Stock status" />
            </SelectTrigger>
            <SelectContent>
              {STOCK_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-sm">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 text-sm text-black">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES} className="text-sm">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-sm text-black">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES} className="text-sm">All categories</SelectItem>
              {categories.map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="h-9 text-sm text-black">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS} className="text-sm">All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="h-9 text-sm text-black">
              <SelectValue placeholder="All suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUPPLIERS} className="text-sm">All suppliers</SelectItem>
              {supplierOptions.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(searchTerm ||
          skuSearch ||
          barcodeSearch ||
          branchFilter !== ALL_BRANCHES ||
          categoryFilter !== ALL_CATEGORIES ||
          brandFilter !== ALL_BRANDS ||
          supplierFilter !== ALL_SUPPLIERS ||
          stockStatusFilter !== ALL_STOCK_STATUS) && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm text-black"
              onClick={() => {
                setSearchTerm("");
                setSkuSearch("");
                setBarcodeSearch("");
                setBranchFilter(ALL_BRANCHES);
                setCategoryFilter(ALL_CATEGORIES);
                setBrandFilter(ALL_BRANDS);
                setSupplierFilter(ALL_SUPPLIERS);
                setStockStatusFilter(ALL_STOCK_STATUS);
              }}
            >
              <X className="h-4 w-4 mr-1.5" />
              Clear all filters
            </Button>
          </div>
        )}
      </Card>

      <p className="text-xs text-gray-500 px-1">
        Filtered view: {totalStocks.toLocaleString()} rows |{" "}
        {formatQty(stockMeta.totalQuantity || 0)} units | value{" "}
        {formatMoney(stockMeta.totalInventoryValue || 0)}
      </p>

      {/* Tabs for Stock and History */}
      <Tabs defaultValue="stock" className="space-y-6">
        <div className="flex px-1">
          <TabsList className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm h-11 shrink-0 w-full max-w-md grid grid-cols-3">
            <TabsTrigger value="stock" className="rounded-lg h-9 text-sm data-[state=active]:bg-black data-[state=active]:text-white transition-all">Stock List</TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg h-9 text-sm data-[state=active]:bg-black data-[state=active]:text-white transition-all">Movement Log</TabsTrigger>
            <TabsTrigger value="today" className="rounded-lg h-9 text-sm data-[state=active]:bg-black data-[state=active]:text-white transition-all">Today</TabsTrigger>
          </TabsList>
        </div>

        {/* Current Stock Tab Content */}
        <TabsContent value="stock" className="mt-0 outline-none animate-in fade-in duration-500">
          <Card className="border border-gray-200 overflow-hidden bg-white">
            <CardHeader className="px-6 py-4 border-b border-gray-200">
               <div className="flex items-center justify-between">
                 <div>
                   <CardTitle className="text-base font-bold text-black">Inventory List</CardTitle>
                   <p className="text-sm text-gray-600 mt-0.5">{totalStocks.toLocaleString()} stock records</p>
                 </div>
               </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              {isLoading && (
                <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[2px]">
                  <PageLoader message="Loading..." />
                </div>
              )}
              
              <InventoryCardGrid
                empty={allStocks.length === 0}
                emptyTitle="No stock found"
                emptyDescription="Adjust filters or add stock to see records here."
                loading={isLoading && allStocks.length === 0}
              >
                {allStocks.map((s) => {
                  const qty = Number(s.current_quantity || 0);
                  const reserved = Number(s.reserved_quantity || 0);
                  const available = qty - reserved;
                  const cost = Number(s.product?.purchase_rate || 0);
                  const sell = Number(s.product?.sales_rate_inc_dis_and_tax || 0);
                  const minQty = Number(
                    (s.product as { min_qty?: number }).min_qty ?? 10,
                  );
                  const imageUrl = getStockRowImage(s.product);
                  return (
                    <StockRecordCard
                      key={s.id}
                      productName={s.product.name}
                      sku={s.product.sku}
                      barcode={getProductBarcode(s.product)}
                      category={
                        s.product.category?.name ||
                        categories.find((c) => c.id === s.product.category_id)?.name
                      }
                      brand={s.product.brand?.name}
                      branch={s.branch?.name}
                      imageUrl={imageUrl}
                      cost={cost}
                      sell={sell}
                      quantity={qty}
                      reserved={reserved}
                      available={available}
                      value={qty * cost}
                      minQty={minQty}
                      onView={() => openStockView(s)}
                    />
                  );
                })}
              </InventoryCardGrid>
              
              {/* Pagination - First / Prev / Page X of Y / Next / Last with
                  an inline rows-per-page selector and a "Showing 1-20 of N"
                  caption. Same pattern as the other inventory tables. */}
              {totalStocks > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-black">
                      Showing {(stockPage - 1) * stockPageSize + 1} to{" "}
                      {Math.min(stockPage * stockPageSize, totalStocks)} of {totalStocks}
                    </p>
                    <span className="text-gray-300">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-600">Rows:</span>
                      <Select
                        value={String(stockPageSize)}
                        onValueChange={(v) => {
                          setStockPageSize(Number(v));
                          setStockPage(1);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[72px] text-sm text-black">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {paginationOptions.map((size) => (
                            <SelectItem key={size} value={String(size)} className="text-sm">
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage(1)}
                      disabled={stockPage === 1}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage((p) => Math.max(1, p - 1))}
                      disabled={stockPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-black px-3">
                      Page {stockPage} of {totalStockPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() =>
                        setStockPage((p) => Math.min(totalStockPages, p + 1))
                      }
                      disabled={stockPage >= totalStockPages}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-sm text-black"
                      onClick={() => setStockPage(totalStockPages)}
                      disabled={stockPage >= totalStockPages}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movement History Tab Content */}
        <TabsContent value="history" className="mt-0 outline-none animate-in fade-in duration-500">
           <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
              <InventoryCardGrid
                empty={filteredHistory.length === 0}
                emptyTitle="No movement history"
                emptyDescription="Stock changes will appear here once recorded."
              >
                {filteredHistory.map((m) => (
                  <MovementRecordCard
                    key={m.id}
                    date={new Date(m.created_at).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    productName={m.product.name}
                    branch={m.branch?.name}
                    movementType={getMovementBadge(m.movement_type)}
                    quantityChange={Number(m.quantity_change)}
                    previousQty={Number(m.previous_qty)}
                    newQty={Number(m.new_qty)}
                    user={m.user?.email?.split("@")[0] || "System"}
                  />
                ))}
              </InventoryCardGrid>
           </Card>
        </TabsContent>

        {/* Today's Movement Tab */}
        <TabsContent value="today" className="mt-0 outline-none animate-in fade-in duration-500">
           <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
              <InventoryCardGrid
                empty={filteredTodayMovements.length === 0}
                emptyTitle="No events today"
                emptyDescription="Today's stock movements will show up here."
              >
                {filteredTodayMovements.map((m) => (
                  <MovementRecordCard
                    key={m.id}
                    date={new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    productName={m.product.name}
                    branch={m.branch?.name}
                    movementType={getMovementBadge(m.movement_type)}
                    quantityChange={Number(m.quantity_change)}
                    newQty={Number(m.new_qty)}
                    notes={m.notes || undefined}
                  />
                ))}
              </InventoryCardGrid>
           </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={viewOpen}
        onOpenChange={(open) => {
          if (!open) closeStockView();
        }}
      >
        <DialogContent className={DLG.content}>
          <DialogHeader className={DLG.header}>
            <DialogTitle className={DLG.title}>Stock details</DialogTitle>
            <DialogDescription className={DLG.desc}>
              {viewRow
                ? `${viewRow.product?.name ?? "Product"} | ${viewRow.branch?.name ?? "Branch"}`
                : "Product and branch stock information"}
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading details...</p>
            </div>
          ) : viewError ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-600">{viewError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-sm text-black"
                onClick={() => viewRow && openStockView(viewRow)}
              >
                Try again
              </Button>
            </div>
          ) : viewRow ? (
            <div className={DLG.body}>
              <dl>
                <DetailRow label="Product" value={viewRow.product?.name} />
                <DetailRow
                  label="SKU"
                  value={
                    (viewProduct?.sku as string) ||
                    viewRow.product?.sku ||
                    "-"
                  }
                />
                <DetailRow
                  label="Barcode"
                  value={(viewProduct?.code as string) || viewRow.product?.barcode || "-"}
                />
                <DetailRow label="Branch" value={viewRow.branch?.name} />
                <DetailRow
                  label="Category"
                  value={
                    (viewProduct?.category as { name?: string })?.name ||
                    categories.find((c) => c.id === viewRow.product?.category_id)?.name ||
                    "-"
                  }
                />
                <DetailRow
                  label="Subcategory"
                  value={(viewProduct?.subcategory as { name?: string })?.name || "-"}
                />
                <DetailRow
                  label="Unit"
                  value={(viewProduct?.unit as { name?: string })?.name || "-"}
                />
                <DetailRow
                  label="Quantity on hand"
                  value={formatQty(Number(viewRow.current_quantity || 0))}
                />
                <DetailRow
                  label="Minimum stock"
                  value={formatQty(Number(viewProduct?.min_qty ?? 0))}
                />
                <DetailRow
                  label="Maximum stock"
                  value={formatQty(Number(viewProduct?.max_qty ?? 0))}
                />
                <DetailRow
                  label="Purchase rate"
                  value={formatMoney(viewProduct?.purchase_rate)}
                />
                <DetailRow
                  label="Sales rate"
                  value={formatMoney(
                    viewProduct?.sales_rate_inc_dis_and_tax ??
                      viewProduct?.sales_rate_exc_dis_and_tax,
                  )}
                />
                <DetailRow
                  label="Status"
                  value={
                    getStockStatusMeta(
                      Number(viewRow.current_quantity || 0),
                      Number(viewProduct?.min_qty ?? 10),
                    ).label
                  }
                />
                <DetailRow
                  label="Last updated"
                  value={new Date(viewRow.last_updated).toLocaleString()}
                />
                <DetailRow
                  label="Active"
                  value={viewProduct?.is_active === false ? "No" : "Yes"}
                />
              </dl>

              {viewMovements.length > 0 && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Recent movements at this branch</p>
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {viewMovements.map((m) => (
                      <li
                        key={m.id}
                        className="text-sm text-black flex justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                      >
                        <span className="text-gray-600 shrink-0">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                        <span>
                          {m.movement_type.replace(/_/g, " ")}{" "}
                          {m.quantity_change > 0 ? "+" : ""}
                          {formatQty(Number(m.quantity_change))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {!viewLoading && !viewError && viewRow && (
            <div className={DLG.footer}>
              <Button variant="outline" size="sm" className="text-sm text-black" onClick={closeStockView}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
