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
import { z } from "zod";
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

// ─── Zod Schemas ────────────────────────────────────────────────────────────
const addStockSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  branchId:  z.string().min(1, "Branch is required"),
  quantity:  z.preprocess(
    (v) => (v === "" ? undefined : Number(v)),
    z.number({ required_error: "Quantity is required", invalid_type_error: "Must be a number" }).positive("Must be greater than 0")
  ),
});

const adjustStockSchema = z.object({
  productId:      z.string().min(1, "Product is required"),
  branchId:       z.string().min(1, "Branch is required"),
  quantityChange: z.preprocess(
    (v) => (v === "" || v === "-" ? undefined : Number(v)),
    z.number({ required_error: "Change amount is required", invalid_type_error: "Must be a number" }).refine((n) => n !== 0, { message: "Change cannot be zero" })
  ),
});

const removeStockSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  branchId:  z.string().min(1, "Branch is required"),
  quantity:  z.preprocess(
    (v) => (v === "" ? undefined : Number(v)),
    z.number({ required_error: "Quantity is required", invalid_type_error: "Must be a number" }).positive("Must be greater than 0")
  ),
});

const transferStockSchema = z.object({
  productId:    z.string().min(1, "Product is required"),
  fromBranchId: z.string().min(1, "From branch is required"),
  toBranchId:   z.string().min(1, "To branch is required"),
  quantity:     z.preprocess(
    (v) => (v === "" ? undefined : Number(v)),
    z.number({ required_error: "Quantity is required", invalid_type_error: "Must be a number" }).positive("Must be greater than 0")
  ),
}).refine((d) => d.fromBranchId !== d.toBranchId, {
  message: "From and To branch must be different",
  path: ["toBranchId"],
});

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
      <dd className="text-sm text-black text-right">{value ?? "—"}</dd>
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

  // Apply the filter bar to Movement Log + Today too — currently only the
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

  // Product search state
  const [productSearch, setProductSearch] = useState("");

  // Pagination for stock table
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Dialog state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  // ─── Per-field validation errors ─────────────────────────────────────────
  type FieldErrors = Record<string, string>;
  const [addErrors,      setAddErrors]      = useState<FieldErrors>({});
  const [adjustErrors,   setAdjustErrors]   = useState<FieldErrors>({});
  const [removeErrors,   setRemoveErrors]   = useState<FieldErrors>({});
  const [transferErrors, setTransferErrors] = useState<FieldErrors>({});

  // Dropdown state for product selection
  const [addProductDropdownOpen, setAddProductDropdownOpen] = useState(false);
  const [adjustProductDropdownOpen, setAdjustProductDropdownOpen] = useState(false);
  const [transferProductDropdownOpen, setTransferProductDropdownOpen] = useState(false);
  const [removeProductDropdownOpen, setRemoveProductDropdownOpen] = useState(false);
  
  // Refs for dropdown containers
  const addProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const adjustProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const transferProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const removeProductDropdownRef = React.useRef<HTMLDivElement>(null);

  // Form state
  const [transferForm, setTransferForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: "" as string | number,
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    supplierId: "",
    unitCost: "" as string | number,
    invoiceRef: "",
    notes: "",
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    branchId: "",
    quantityChange: "" as string | number,
    reason: "",
    notes: "",
  });

  const [removeForm, setRemoveForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    reason: "WASTE",
    notes: "",
  });

  // Instant filtered products from global store
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return globalProducts.slice(0, 50);
    const search = productSearch.toLowerCase().trim();
    return globalProducts.filter(p => 
      p.name.toLowerCase().includes(search) || 
      p.sku?.toLowerCase().includes(search) || 
      p.barcode?.includes(search)
    ).slice(0, 50);
  }, [globalProducts, productSearch]);

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
      <p class="meta">Generated ${new Date().toLocaleString()} · ${totalStocks} records</p>
      <table><thead><tr>${exportHeaders.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
    );
  };
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addProductDropdownRef.current && !addProductDropdownRef.current.contains(event.target as Node)) setAddProductDropdownOpen(false);
      if (adjustProductDropdownRef.current && !adjustProductDropdownRef.current.contains(event.target as Node)) setAdjustProductDropdownOpen(false);
      if (transferProductDropdownRef.current && !transferProductDropdownRef.current.contains(event.target as Node)) setTransferProductDropdownOpen(false);
      if (removeProductDropdownRef.current && !removeProductDropdownRef.current.contains(event.target as Node)) setRemoveProductDropdownOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Derived analytics
  const paginationOptions = [20, 50, 100, 500];
  const totalUnits = stockMeta.totalQuantity || 0;
  const alerts = stockMeta.lowStockCount || 0;
  const totalStockPages = stockMeta.totalPages || 1;

  // Handlers
  // ─── helper to flatten Zod errors into a flat record ───────────────────
  const flattenZodErrors = (err: z.ZodError): FieldErrors => {
    const out: FieldErrors = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  };

  const handleAddStock = async () => {
    const parsed = addStockSchema.safeParse(addForm);
    if (!parsed.success) {
      setAddErrors(flattenZodErrors(parsed.error));
      return;
    }
    setAddErrors({});
    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId:  parsed.data.productId,
        branchId:   parsed.data.branchId,
        quantity:   parsed.data.quantity,
        supplierId: addForm.supplierId  || undefined,
        unitCost:   addForm.unitCost    ? Number(addForm.unitCost) : undefined,
        invoiceRef: addForm.invoiceRef  || undefined,
        notes:      addForm.notes       || undefined,
      });
      setIsAddOpen(false);
      clearProductUI();
      refreshAllData();
      toast.success("Stock added successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    const parsed = adjustStockSchema.safeParse(adjustForm);
    if (!parsed.success) {
      setAdjustErrors(flattenZodErrors(parsed.error));
      return;
    }
    setAdjustErrors({});
    setIsTransferring(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId:      parsed.data.productId,
        branchId:       parsed.data.branchId,
        quantityChange: parsed.data.quantityChange,
        reason: adjustForm.reason || undefined,
        notes:  adjustForm.notes  || undefined,
      });
      setIsAdjustOpen(false);
      setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "", notes: "" });
      setProductSearch("");
      setAdjustProductDropdownOpen(false);
      refreshAllData();
      toast.success("Stock adjusted successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRemoveStock = async () => {
    const parsed = removeStockSchema.safeParse(removeForm);
    if (!parsed.success) {
      setRemoveErrors(flattenZodErrors(parsed.error));
      return;
    }
    setRemoveErrors({});
    setIsTransferring(true);
    try {
      await apiClient.delete(`${API_BASE}/stock/remove`, {
        data: {
          productId: parsed.data.productId,
          branchId:  parsed.data.branchId,
          quantity:  parsed.data.quantity,
          reason:    removeForm.reason,
          notes:     removeForm.notes || undefined,
        },
      });
      setIsRemoveOpen(false);
      setRemoveForm({ productId: "", branchId: "", quantity: "", reason: "WASTE", notes: "" });
      setProductSearch("");
      setRemoveProductDropdownOpen(false);
      refreshAllData();
      toast.success("Stock removed successfully");
    } catch (e: any) {
      showErrorToast(e);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleTransfer = async () => {
    const parsed = transferStockSchema.safeParse(transferForm);
    if (!parsed.success) {
      setTransferErrors(flattenZodErrors(parsed.error));
      return;
    }
    setTransferErrors({});
    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock/transfer`, {
        productId:    parsed.data.productId,
        fromBranchId: parsed.data.fromBranchId,
        toBranchId:   parsed.data.toBranchId,
        quantity:     parsed.data.quantity,
        notes:        transferForm.notes,
      });
      setIsTransferOpen(false);
      setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
      setProductSearch("");
      setTransferProductDropdownOpen(false);
      refreshAllData();
      toast.success("Stock transferred successfully");
    } catch (e: any) {
      showErrorToast(e);
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
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
  };

  const clearProductUI = () => {
    setProductSearch("");
    setAddProductDropdownOpen(false);
    setAdjustProductDropdownOpen(false);
    setTransferProductDropdownOpen(false);
    setRemoveProductDropdownOpen(false);
    // Reset forms to default
    setAddForm({ productId: "", branchId: "", quantity: "", supplierId: "", unitCost: "" });
    setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "CORRECTION" });
    setRemoveForm({ productId: "", branch_id: "", quantity: "", reason: "WASTE", notes: "" });
    setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
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
            Central inventory dashboard — stock levels, valuation, adjustments, and movement history.
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

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) { clearProductUI(); setAddErrors({}); }
        }}
      >
        <DialogContent className={DLG.content}>
                  <DialogHeader className={DLG.header}>
                    <DialogTitle className={DLG.title}>Add stock</DialogTitle>
                    <p className={DLG.desc}>Add quantity to a product at a branch.</p>
                  </DialogHeader>
                  <div className={DLG.body}>
                    {/* PRODUCT SELECTOR */}
                    <div className="space-y-1.5 relative" ref={addProductDropdownRef}>
                      <Label className={DLG.label}>Product</Label>
                      <div className="relative group">
                        <Input
                          placeholder="Search product..."
                          value={productSearch}
                          onFocus={() => setAddProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setAddProductDropdownOpen(true);
                          }}
                          className={`px-4 h-9 border text-sm text-black focus:ring-1 focus:ring-slate-300 transition-all ${addErrors.productId ? "border-red-400" : "border-gray-200"}`}
                        />
                        {addProductDropdownOpen && (
                          <Card className={DLG.dropdown}>
                            {filteredProducts.length === 0 ? (
                               <div className="p-6 text-center">
                                 <Package className="h-6 w-6 text-slate-200 mx-auto mb-1" />
                                 <p className="text-sm text-gray-500">No products found</p>
                               </div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className={DLG.pickRow}
                                    onClick={() => {
                                      setAddForm({ ...addForm, productId: p.id });
                                      setAddErrors(e => ({ ...e, productId: "" }));
                                      setProductSearch(p.name);
                                      setAddProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm text-black">{p.name}</span>
                                      <span className="text-xs text-gray-500">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    {addErrors.productId && <p className="text-xs text-red-500 -mt-2">{addErrors.productId}</p>}

                    <div className="space-y-2">
                      <Label className={DLG.label}>Branch</Label>
                      <Select value={addForm.branchId} onValueChange={(v) => { setAddForm({ ...addForm, branchId: v }); setAddErrors(e => ({...e, branchId: ""})); }}>
                        <SelectTrigger className={`h-9 border text-sm text-black ${addErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                          {branches.map(b => <SelectItem key={b.id} value={b.id} className="font-normal text-sm py-2">{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {addErrors.branchId && <p className="text-xs text-red-500 mt-0.5">{addErrors.branchId}</p>}
                    </div>

                    {(() => {
                      // Pre/post balance preview — same pattern as Adjust /
                      // Remove / Transfer. Helps the user see how many they
                      // already have before piling on more.
                      const addStock = addForm.productId && addForm.branchId
                        ? allStocks.find(
                            (s) =>
                              s.product?.id === addForm.productId &&
                              s.branch?.id === addForm.branchId,
                          )
                        : undefined;
                      const currentQty = addStock ? Number(addStock.current_quantity) : null;
                      const addQty = Number(addForm.quantity) || 0;
                      const newTotal =
                        currentQty !== null
                          ? currentQty + addQty
                          : addQty > 0 && addForm.branchId
                            ? addQty
                            : null;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">Current quantity</Label>
                            <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 border border-gray-200 text-sm text-black">
                              {currentQty !== null
                                ? formatQty(currentQty)
                                : addForm.branchId
                                  ? "0"
                                  : "—"}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className={DLG.label}>Quantity to add</Label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={addForm.quantity}
                              onChange={(e) => { setAddForm({ ...addForm, quantity: e.target.value }); setAddErrors(er => ({...er, quantity: ""})); }}
                              className={`h-9 border text-sm text-black text-center ${addErrors.quantity ? "border-red-400" : "border-gray-200"}`}
                            />
                            {addErrors.quantity && <p className="text-xs text-red-500 mt-0.5">{addErrors.quantity}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">After adding</Label>
                            <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 border border-gray-200 text-sm text-black">
                              {newTotal !== null ? formatQty(newTotal) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="space-y-2">
                        <Label className={DLG.label}>Supplier</Label>
                        <Select value={addForm.supplierId} onValueChange={(v) => setAddForm({ ...addForm, supplierId: v })}>
                          <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                            <SelectValue placeholder="Select Supplier" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                            {supplierOptions.map((s) => <SelectItem key={s.id} value={s.id} className="font-normal text-sm py-2">{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className={DLG.label}>Unit cost</Label>
                        <Input
                          placeholder="0.00"
                          type="number"
                          value={addForm.unitCost}
                          onChange={(e) => setAddForm({ ...addForm, unitCost: e.target.value })}
                          className="h-9 border border-gray-200 text-sm text-black text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className={DLG.label}>Invoice / GRN reference (optional)</Label>
                      <Input
                        placeholder="e.g. INV-1024"
                        value={addForm.invoiceRef}
                        onChange={(e) => setAddForm({ ...addForm, invoiceRef: e.target.value })}
                        className="h-9 border border-gray-200 text-sm text-black"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={DLG.label}>Notes (optional)</Label>
                      <Textarea
                        placeholder="Delivery note, vehicle, approval, etc."
                        value={addForm.notes}
                        onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                        className="text-sm text-black min-h-[64px] resize-none border-gray-200"
                      />
                    </div>

                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() => setIsAddOpen(false)}
                        className="text-sm text-black"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddStock}
                        disabled={isTransferring}
                        size="sm" className="text-sm"
                      >
                        {isTransferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={isAdjustOpen}
                onOpenChange={(open) => {
                  setIsAdjustOpen(open);
                  if (!open) { clearProductUI(); setAdjustErrors({}); }
                }}
              >
                <DialogContent className={DLG.content}>
                  <DialogHeader className={DLG.header}>
                    <DialogTitle className={DLG.title}>Adjust stock</DialogTitle>
                    <p className={DLG.desc}>Set the correct quantity for a product.</p>
                  </DialogHeader>
                  <div className={DLG.body}>
                    <div className="space-y-2 relative" ref={adjustProductDropdownRef}>
                      <Label className={DLG.label}>Product</Label>
                      <div className="relative group">
                        <Input
                          placeholder="Search product..."
                          value={productSearch}
                          onFocus={() => setAdjustProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setAdjustProductDropdownOpen(true);
                          }}
                          className="px-4 h-9 border border-gray-200 text-sm text-black focus:ring-1 focus:ring-slate-300"
                        />
                        {adjustProductDropdownOpen && (
                          <Card className={DLG.dropdown}>
                            {filteredProducts.length === 0 ? (
                               <div className="p-4 text-center text-sm text-gray-500">No products found</div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className={DLG.pickRow}
                                    onClick={() => {
                                      setAdjustForm({ ...adjustForm, productId: p.id });
                                      setAdjustErrors(e => ({ ...e, productId: "" }));
                                      setProductSearch(p.name);
                                      setAdjustProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm text-black">{p.name}</span>
                                      <span className="text-xs text-gray-500">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    {adjustErrors.productId && <p className="text-xs text-red-500 -mt-2">{adjustErrors.productId}</p>}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className={DLG.label}>Branch</Label>
                        <Select value={adjustForm.branchId} onValueChange={(v) => { setAdjustForm({ ...adjustForm, branchId: v }); setAdjustErrors(e => ({...e, branchId: ""})); }}>
                          <SelectTrigger className={`h-9 border text-sm text-black ${adjustErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                             <SelectValue placeholder="Branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                             {branches.map(b => <SelectItem key={b.id} value={b.id} className="font-normal text-sm py-2">{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {adjustErrors.branchId && <p className="text-xs text-red-500 mt-0.5">{adjustErrors.branchId}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={DLG.label}>Reason</Label>
                        <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
                          <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                            <SelectValue placeholder="Select Reason" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                            <SelectItem value="CORRECTION" className="font-normal text-sm py-2">Correction</SelectItem>
                            <SelectItem value="LOST" className="font-normal text-sm py-2">Lost / Unaccounted</SelectItem>
                            <SelectItem value="FOUND" className="font-normal text-sm py-2">Found / Surprise Entry</SelectItem>
                            <SelectItem value="PROMOTIONAL" className="font-normal text-sm py-2">Promotional Redistribution</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(() => {
                      // Look up the current on-hand stock for the picked
                      // product + branch combination. allStocks is the full
                      // list loaded for the current page; if the user hasn't
                      // picked both yet, we just show a dash.
                      const adjStock = adjustForm.productId && adjustForm.branchId
                        ? allStocks.find(
                            (s) =>
                              s.product?.id === adjustForm.productId &&
                              s.branch?.id === adjustForm.branchId,
                          )
                        : undefined;
                      const currentQty = adjStock ? Number(adjStock.current_quantity) : null;
                      const delta = Number(adjustForm.quantityChange) || 0;
                      const newTotal = currentQty !== null ? currentQty + delta : null;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">Current quantity</Label>
                            <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 border border-gray-200 text-sm text-black">
                              {currentQty !== null ? formatQty(currentQty) : "—"}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className={DLG.label}>Change (+ / −)</Label>
                            <Input
                              type="number"
                              placeholder="e.g. -5 or 10"
                              value={adjustForm.quantityChange}
                              onChange={(e) => { setAdjustForm({ ...adjustForm, quantityChange: e.target.value }); setAdjustErrors(er => ({...er, quantityChange: ""})); }}
                              className={`h-9 border text-sm text-black text-center ${adjustErrors.quantityChange ? "border-red-400" : "border-gray-200"}`}
                            />
                            {adjustErrors.quantityChange && <p className="text-xs text-red-500 mt-0.5">{adjustErrors.quantityChange}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">New total</Label>
                            <div
                              className={`h-9 flex items-center px-3 rounded-md border text-sm ${
                                newTotal !== null && newTotal < 0
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : "bg-gray-50 border-gray-200 text-black"
                              }`}
                            >
                              {newTotal !== null ? formatQty(newTotal) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      <Label className={DLG.label}>Notes (optional)</Label>
                      <Textarea
                        placeholder="Add any additional details..."
                        value={adjustForm.notes}
                        onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                        className="text-sm text-black min-h-[64px] resize-none border-gray-200"
                      />
                    </div>

                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() => setIsAdjustOpen(false)}
                        className="text-sm text-black"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAdjustStock}
                        disabled={isTransferring}
                        size="sm" className="text-sm"
                      >
                        {isTransferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog
                open={isRemoveOpen}
                onOpenChange={(open) => {
                  setIsRemoveOpen(open);
                  if (!open) { clearProductUI(); setRemoveErrors({}); }
                }}
              >
                <DialogContent className={DLG.content}>
                  <DialogHeader className={DLG.header}>
                    <DialogTitle className={DLG.title}>Remove stock</DialogTitle>
                    <p className={DLG.desc}>Reduce quantity (damage, waste, loss, or expiry).</p>
                  </DialogHeader>
                  <div className={DLG.body}>
                    <div className="space-y-2 relative" ref={removeProductDropdownRef}>
                      <Label className={DLG.label}>Product</Label>
                      <div className="relative group">
                        <Input
                          placeholder="Search product..."
                          value={productSearch}
                          onFocus={() => setRemoveProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setRemoveProductDropdownOpen(true);
                          }}
                          className="px-4 h-9 border border-gray-200 text-sm text-black focus:ring-1 focus:ring-slate-300"
                        />
                        {removeProductDropdownOpen && (
                          <Card className={DLG.dropdown}>
                             {filteredProducts.length === 0 ? (
                               <div className="p-4 text-center text-sm text-gray-500">No products found</div>
                            ) : (
                              <div className="p-1">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className={DLG.pickRow}
                                    onClick={() => {
                                      setRemoveForm({ ...removeForm, productId: p.id });
                                      setRemoveErrors(e => ({ ...e, productId: "" }));
                                      setProductSearch(p.name);
                                      setRemoveProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm text-black">{p.name}</span>
                                      <span className="text-xs text-gray-500">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    {removeErrors.productId && <p className="text-xs text-red-500 -mt-2">{removeErrors.productId}</p>}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className={DLG.label}>Branch</Label>
                        <Select value={removeForm.branchId} onValueChange={(v) => { setRemoveForm({ ...removeForm, branchId: v }); setRemoveErrors(e => ({...e, branchId: ""})); }}>
                          <SelectTrigger className={`h-9 border text-sm text-black ${removeErrors.branchId ? "border-red-400" : "border-gray-200"}`}>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id} className="font-normal text-sm py-2">
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {removeErrors.branchId && <p className="text-xs text-red-500 mt-0.5">{removeErrors.branchId}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={DLG.label}>Reason</Label>
                        <Select value={removeForm.reason} onValueChange={(v) => setRemoveForm({ ...removeForm, reason: v })}>
                          <SelectTrigger className="h-9 border border-gray-200 text-sm text-black">
                            <SelectValue placeholder="Method" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border border-slate-100 shadow-xl">
                            <SelectItem value="DAMAGE" className="font-normal text-sm py-2">Damaged / Defected</SelectItem>
                            <SelectItem value="WASTE" className="font-normal text-sm py-2">Wastage / Garbage</SelectItem>
                            <SelectItem value="THEFT" className="font-normal text-sm py-2">Theft / Loss</SelectItem>
                            <SelectItem value="EXPIRED" className="font-normal text-sm py-2">Expired Goods</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(() => {
                      // Same live preview as Adjust — show current on-hand,
                      // the quantity being removed, and the resulting total.
                      const rmStock = removeForm.productId && removeForm.branchId
                        ? allStocks.find(
                            (s) =>
                              s.product?.id === removeForm.productId &&
                              s.branch?.id === removeForm.branchId,
                          )
                        : undefined;
                      const currentQty = rmStock ? Number(rmStock.current_quantity) : null;
                      const removeAmt = Number(removeForm.quantity) || 0;
                      const newTotal = currentQty !== null ? currentQty - removeAmt : null;
                      const wouldOverdraw = newTotal !== null && newTotal < 0;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">Current quantity</Label>
                            <div className="h-9 flex items-center px-3 rounded-md bg-gray-50 border border-gray-200 text-sm text-black">
                              {currentQty !== null ? formatQty(currentQty) : "—"}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className={DLG.label}>Quantity to remove</Label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={removeForm.quantity}
                              onChange={(e) => { setRemoveForm({ ...removeForm, quantity: e.target.value }); setRemoveErrors(er => ({...er, quantity: ""})); }}
                              className={`h-9 border text-sm text-black text-center ${removeErrors.quantity ? "border-red-400" : "border-gray-200"}`}
                            />
                            {removeErrors.quantity && <p className="text-xs text-red-500 mt-0.5">{removeErrors.quantity}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-sm text-gray-600">After removal</Label>
                            <div
                              className={`h-9 flex items-center px-3 rounded-md border text-sm ${
                                wouldOverdraw
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : "bg-gray-50 border-gray-200 text-black"
                              }`}
                            >
                              {newTotal !== null ? formatQty(newTotal) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      <Label className={DLG.label}>Notes (optional)</Label>
                      <Textarea
                        placeholder="Add reference, batch, vehicle, etc."
                        value={removeForm.notes}
                        onChange={(e) => setRemoveForm({ ...removeForm, notes: e.target.value })}
                        className="text-sm text-black min-h-[64px] resize-none border-gray-200"
                      />
                    </div>

                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() => setIsRemoveOpen(false)}
                        className="text-sm text-black"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRemoveStock}
                        disabled={isTransferring}
                        size="sm" className="text-sm"
                      >
                        {isTransferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog
                open={isTransferOpen}
                onOpenChange={(open) => {
                  setIsTransferOpen(open);
                  if (!open) { clearProductUI(); setTransferErrors({}); }
                }}
              >
                <DialogContent className={DLG.content}>
                  <DialogHeader className={DLG.header}>
                    <DialogTitle className={DLG.title}>Transfer stock</DialogTitle>
                    <p className={DLG.desc}>Move quantity from one branch to another.</p>
                  </DialogHeader>
                  <div className={DLG.body}>
                     <div className="space-y-2 relative" ref={transferProductDropdownRef}>
                      <Label className={DLG.label}>Select Product</Label>
                      <div className="relative group">
                        <Input
                          placeholder="Search product..."
                          value={productSearch}
                          onFocus={() => setTransferProductDropdownOpen(true)}
                          autoComplete="off"
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setTransferProductDropdownOpen(true);
                          }}
                          className="px-4 h-9 border border-gray-200 text-sm text-black focus:ring-1 focus:ring-slate-300"
                        />
                        {transferProductDropdownOpen && (
                          <Card className={DLG.dropdown}>
                            {filteredProducts.length === 0 ? (
                               <div className="p-8 text-center">
                                 <p className="text-xs text-gray-500">No products found</p>
                               </div>
                            ) : (
                              <div className="p-2">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    className={DLG.pickRow}
                                    onClick={() => {
                                      setTransferForm({ ...transferForm, productId: p.id });
                                      setTransferErrors(e => ({ ...e, productId: "" }));
                                      setProductSearch(p.name);
                                      setTransferProductDropdownOpen(false);
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm text-black">{p.name}</span>
                                      <span className="text-xs text-gray-500">{p.sku || p.id.slice(0, 8)}</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </Card>
                        )}
                      </div>
                    </div>
                    {transferErrors.productId && <p className="text-xs text-red-500 -mt-2">{transferErrors.productId}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex-1 w-full space-y-2">
                        <Label className={DLG.label}>From branch</Label>
                        <Select value={transferForm.fromBranchId} onValueChange={(v) => { setTransferForm({ ...transferForm, fromBranchId: v }); setTransferErrors(e => ({...e, fromBranchId: ""})); }}>
                          <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.fromBranchId ? "border-red-400" : "border-gray-200"}`}>
                             <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border border-slate-100 shadow-xl">
                             {branches.map(b => (
                               <SelectItem 
                                 key={b.id} 
                                 value={b.id} 
                                 disabled={b.id === transferForm.toBranchId}
                                 className="font-normal text-sm py-3"
                                >
                                 {b.name}
                               </SelectItem>
                             ))}
                          </SelectContent>
                        </Select>
                        {transferErrors.fromBranchId && <p className="text-xs text-red-500 mt-0.5">{transferErrors.fromBranchId}</p>}
                      </div>
                      

                      <div className="flex-1 w-full space-y-2">
                         <Label className={DLG.label}>To branch</Label>
                        <Select value={transferForm.toBranchId} onValueChange={(v) => { setTransferForm({ ...transferForm, toBranchId: v }); setTransferErrors(e => ({...e, toBranchId: ""})); }}>
                          <SelectTrigger className={`h-9 border text-sm text-black ${transferErrors.toBranchId ? "border-red-400" : "border-gray-200"}`}>
                             <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border border-slate-100 shadow-xl">
                             {branches.map(b => (
                               <SelectItem 
                                 key={b.id} 
                                 value={b.id} 
                                 disabled={b.id === transferForm.fromBranchId}
                                 className="font-normal text-sm py-3"
                               >
                                 {b.name}
                               </SelectItem>
                             ))}
                          </SelectContent>
                        </Select>
                        {transferErrors.toBranchId && <p className="text-xs text-red-500 mt-0.5">{transferErrors.toBranchId}</p>}
                      </div>
                    </div>

                    {(() => {
                      // Pre/post-transfer balance preview. allStocks is the
                      // full stocks list for the current page — sufficient
                      // for the typical case where the user picks something
                      // they can see; for products in stocks outside the
                      // current page, the balances simply show "—".
                      const fromStock = transferForm.productId && transferForm.fromBranchId
                        ? allStocks.find(
                            (s) =>
                              s.product?.id === transferForm.productId &&
                              s.branch?.id === transferForm.fromBranchId,
                          )
                        : undefined;
                      const toStock = transferForm.productId && transferForm.toBranchId
                        ? allStocks.find(
                            (s) =>
                              s.product?.id === transferForm.productId &&
                              s.branch?.id === transferForm.toBranchId,
                          )
                        : undefined;
                      const fromQty = fromStock ? Number(fromStock.current_quantity) : null;
                      const toQty = toStock ? Number(toStock.current_quantity) : null;
                      const moveQty = Number(transferForm.quantity) || 0;
                      const fromAfter = fromQty !== null ? fromQty - moveQty : null;
                      const toAfter = toQty !== null ? toQty + moveQty : moveQty > 0 ? moveQty : null;
                      const wouldOverdraw = fromAfter !== null && fromAfter < 0;

                      if (!transferForm.productId) return null;
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-gray-200 bg-gray-50/60 p-3">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-600 uppercase tracking-wide">From branch</p>
                            <div className="flex items-baseline gap-2 text-sm">
                              <span className="text-gray-600">Current:</span>
                              <span className="text-black">
                                {fromQty !== null ? formatQty(fromQty) : "—"}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 text-sm">
                              <span className="text-gray-600">After:</span>
                              <span className={wouldOverdraw ? "text-red-700 font-medium" : "text-black"}>
                                {fromAfter !== null ? formatQty(fromAfter) : "—"}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-gray-600 uppercase tracking-wide">To branch</p>
                            <div className="flex items-baseline gap-2 text-sm">
                              <span className="text-gray-600">Current:</span>
                              <span className="text-black">
                                {toQty !== null ? formatQty(toQty) : transferForm.toBranchId ? "0" : "—"}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 text-sm">
                              <span className="text-gray-600">After:</span>
                              <span className="text-black">
                                {toAfter !== null ? formatQty(toAfter) : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="space-y-2">
                        <Label className={DLG.label}>Quantity</Label>
                        <Input
                          type="number"
                          placeholder="Quantity"
                          value={transferForm.quantity}
                          onChange={(e) => { setTransferForm({ ...transferForm, quantity: e.target.value }); setTransferErrors(er => ({...er, quantity: ""})); }}
                          className={`h-9 border text-sm text-black ${transferErrors.quantity ? "border-red-400" : "border-gray-200"}`}
                        />
                        {transferErrors.quantity && <p className="text-xs text-red-500 mt-0.5">{transferErrors.quantity}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={DLG.label}>Notes</Label>
                        <Input
                          placeholder="Carrier name or ref..."
                          value={transferForm.notes}
                          onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                          className="h-9 border border-gray-200 text-sm text-black text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <Button
                        variant="outline"
                        type="button"
                        size="sm"
                        onClick={() => setIsTransferOpen(false)}
                        className="text-sm text-black"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleTransfer}
                        disabled={isTransferring}
                        size="sm" className="text-sm"
                      >
                        {isTransferring && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

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
        Filtered view: {totalStocks.toLocaleString()} rows ·{" "}
        {formatQty(stockMeta.totalQuantity || 0)} units · value{" "}
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
              
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="text-sm text-gray-600 py-3 w-12"></TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 min-w-[160px]">Product</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">SKU</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Barcode</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Category</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Brand</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Branch</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Cost</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Sell</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Current</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Reserved</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Available</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">Value</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 min-w-[108px]">Status</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right w-[72px]">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allStocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center p-24">
                        <div className="flex flex-col items-center opacity-20">
                          <Package className="h-12 w-12 mb-3 text-slate-300" />
                          <p className="text-sm text-gray-500">No stock found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    allStocks.map((s) => {
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
                        <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
                          <TableCell className="py-2">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt=""
                                className="h-9 w-9 rounded object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded bg-gray-100 flex items-center justify-center">
                                <Package className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="text-sm text-black">{s.product.name}</span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 py-3">{s.product.sku || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600 py-3">{getProductBarcode(s.product)}</TableCell>
                          <TableCell className="text-sm text-gray-600 py-3">
                            {s.product.category?.name ||
                              categories.find((c) => c.id === s.product.category_id)?.name ||
                              "—"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 py-3">{s.product.brand?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-gray-600 py-3">{s.branch?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-black py-3 text-right">{formatMoney(cost)}</TableCell>
                          <TableCell className="text-sm text-black py-3 text-right">{formatMoney(sell)}</TableCell>
                          <TableCell className="text-sm text-black py-3 text-right">{formatQty(qty)}</TableCell>
                          <TableCell className="text-sm text-gray-600 py-3 text-right">{formatQty(reserved)}</TableCell>
                          <TableCell className="text-sm text-black py-3 text-right">{formatQty(available)}</TableCell>
                          <TableCell className="text-sm text-black py-3 text-right">{formatMoney(qty * cost)}</TableCell>
                          <TableCell className="py-3 whitespace-nowrap">
                            <StockStatusBadge qty={qty} minQty={minQty} />
                          </TableCell>
                          <TableCell className="text-right py-3 pr-4">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-600 hover:text-black"
                              aria-label={`View details for ${s.product.name}`}
                              onClick={() => openStockView(s)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
              
              {/* Pagination — First / Prev / Page X of Y / Next / Last with
                  an inline rows-per-page selector and a "Showing 1–20 of N"
                  caption. Same pattern as the other inventory tables. */}
              {totalStocks > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-black">
                      Showing {(stockPage - 1) * stockPageSize + 1}–
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
           <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow className="border-slate-100">
                    <TableHead className="text-sm text-gray-600 py-3">Date</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Product</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Type</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-center">Change</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3">Before → after</TableHead>
                    <TableHead className="text-sm text-gray-600 py-3 text-right">User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center p-20 text-slate-400 text-xs uppercase font-semibold">No movement history discovered</TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((m) => (
                      <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                        <TableCell className="p-8 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                          {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </TableCell>                         <TableCell>
                           <div className="flex flex-col min-w-[200px]">
                              <span className="font-normal text-slate-700 text-xs">{m.product.name}</span>
                              <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">{m.branch?.name}</span>
                           </div>
                        </TableCell>
                        <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-normal ${m.quantity_change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}
                          </span>
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                             <span className="bg-slate-50 px-2 py-0.5 rounded">{formatQty(Number(m.previous_qty))}</span>
                             <ArrowRightLeft className="h-2.5 w-2.5 opacity-30" />
                             <span className="bg-slate-900 text-white px-2 py-0.5 rounded font-normal">{formatQty(Number(m.new_qty))}</span>
                           </div>
                        </TableCell>
                        <TableCell className="p-8 py-4 text-right text-xs font-semibold text-slate-400 uppercase max-w-[120px] truncate">
                          {m.user?.email.split('@')[0] || "SYSTEM"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
           </Card>
        </TabsContent>

        {/* Today's Movement Tab */}
        <TabsContent value="today" className="mt-0 outline-none animate-in fade-in duration-500">
           <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-50/30">
                   <TableRow className="border-slate-100">
                    <TableHead className="font-semibold text-xs uppercase p-8 py-4 text-slate-400 ">Timestamp</TableHead>
                    <TableHead className="font-semibold text-xs uppercase text-slate-400 ">Target Entity</TableHead>
                    <TableHead className="font-semibold text-xs uppercase text-slate-400 ">Protocol</TableHead>
                    <TableHead className="font-semibold text-xs uppercase text-center text-slate-400 ">Variance</TableHead>
                    <TableHead className="font-semibold text-xs uppercase text-slate-400 ">Final State</TableHead>
                    <TableHead className="font-semibold text-xs uppercase p-8 py-4 text-right text-slate-400 ">Audit Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                   {filteredTodayMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center p-20 text-slate-400 text-xs uppercase font-semibold">No events recorded today</TableCell>
                      </TableRow>
                   ) : (
                     filteredTodayMovements.map((m) => (
                        <TableRow key={m.id} className="hover:bg-slate-50/50 border-slate-50 transition-colors">
                          <TableCell className="p-8 py-4 text-xs font-semibold text-indigo-600 uppercase">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-normal text-slate-700 text-xs">{m.product.name}</TableCell>
                          <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                          <TableCell className="text-center font-normal text-sm text-slate-700">{m.quantity_change > 0 ? "+" : ""}{formatQty(Number(m.quantity_change))}</TableCell>
                          <TableCell>
                             <div className="bg-slate-900 text-white px-2 py-0.5 rounded font-normal text-xs inline-block">{formatQty(Number(m.new_qty))}</div>
                          </TableCell>
                          <TableCell className="p-8 py-4 text-right text-xs text-slate-400 max-w-[150px] truncate uppercase">
                            {m.notes || "-"}
                          </TableCell>
                        </TableRow>
                     ))
                   )}
                </TableBody>
              </Table>
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
                ? `${viewRow.product?.name ?? "Product"} · ${viewRow.branch?.name ?? "Branch"}`
                : "Product and branch stock information"}
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex flex-col items-center justify-center py-16 px-5 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading details…</p>
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
                    "—"
                  }
                />
                <DetailRow
                  label="Barcode"
                  value={(viewProduct?.code as string) || viewRow.product?.barcode || "—"}
                />
                <DetailRow label="Branch" value={viewRow.branch?.name} />
                <DetailRow
                  label="Category"
                  value={
                    (viewProduct?.category as { name?: string })?.name ||
                    categories.find((c) => c.id === viewRow.product?.category_id)?.name ||
                    "—"
                  }
                />
                <DetailRow
                  label="Subcategory"
                  value={(viewProduct?.subcategory as { name?: string })?.name || "—"}
                />
                <DetailRow
                  label="Unit"
                  value={(viewProduct?.unit as { name?: string })?.name || "—"}
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
