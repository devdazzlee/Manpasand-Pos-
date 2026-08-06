"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Search,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Boxes,
  Loader2,
  ArrowRightLeft,
  MapPin,
  DollarSign,
  Truck,
  Package,
  List,
  LayoutGrid,
  X,
  Warehouse,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { cn } from "@/lib/utils";
import {
  StockStatusBadge,
} from "@/components/inventory/stock-ops/stock-status-badge";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { StockRecordCard } from "@/components/inventory/stock-ops/stock-record-card";
import {
  ALL_BRANCHES,
  ALL_BRANDS,
  ALL_CATEGORIES,
  ALL_STOCK_STATUS,
  STOCK_STATUS_OPTIONS,
} from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  getProductBarcode,
  getStockRowImage,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";

/** Sentinel values - must not match a real branch/category id from the API. */
const ALL_WAREHOUSES = "__all_warehouses__";
/** Plain ASCII placeholder for empty fields (avoids em-dash encoding issues on Windows). */
const EMPTY = "-";

type StockMeta = {
  total: number;
  totalPages: number;
  totalQuantity: number;
  totalInventoryValue: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
};

const EMPTY_META: StockMeta = {
  total: 0,
  totalPages: 1,
  totalQuantity: 0,
  totalInventoryValue: 0,
  totalProducts: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  negativeStockCount: 0,
};

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="text-sm text-gray-600 shrink-0">{label}</dt>
      <dd className="text-sm text-black text-right">{value ?? EMPTY}</dd>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-black border-b border-gray-200 pb-1.5">
        {title}
      </h3>
      <dl>{children}</dl>
    </div>
  );
}

export function StockView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const {
    stats: dashboardStats,
    branchSummary,
    loading: dashboardLoading,
  } = useInventoryDashboard();
  const logoDataUri = useLogoDataUri();
  const {
    branches,
    categories,
    fetchBranches,
    fetchCategories,
  } = usePosData();

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const [stocks, setStocks] = useState<any[]>([]);
  const [stockMeta, setStockMeta] = useState<StockMeta>(EMPTY_META);
  const [hasStockMeta, setHasStockMeta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const [detailProduct, setDetailProduct] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [warehouseFilter, setWarehouseFilter] = useState(ALL_WAREHOUSES);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);
  const [stockStatusFilter, setStockStatusFilter] = useState(ALL_STOCK_STATUS);
  const [search, setSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  useScrollToTopOnPageChange(currentPage);

  const combinedSearch = useMemo(
    () => [search, skuSearch, barcodeSearch].filter(Boolean).join(" ").trim(),
    [search, skuSearch, barcodeSearch],
  );

  const activeLocationId =
    branchFilter !== ALL_BRANCHES
      ? branchFilter
      : warehouseFilter !== ALL_WAREHOUSES
        ? warehouseFilter
        : "";

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: itemsPerPage,
        branchId: activeLocationId,
        categoryId: categoryFilter === ALL_CATEGORIES ? "" : categoryFilter,
        brandId: brandFilter === ALL_BRANDS ? "" : brandFilter,
        search: combinedSearch,
      };
      if (stockStatusFilter && stockStatusFilter !== ALL_STOCK_STATUS) {
        params.stockStatus = stockStatusFilter;
      }

      const res = await apiClient.get(`${API_BASE}/stock`, { params });
      const meta = res.data?.meta || {};
      setStocks(res.data?.data || []);
      setStockMeta({
        total: Number(meta.total || 0),
        totalPages: Number(meta.totalPages || 1),
        totalQuantity: Number(meta.totalQuantity || 0),
        totalInventoryValue: Number(meta.totalInventoryValue || 0),
        totalProducts: Number(meta.totalProducts || 0),
        lowStockCount: Number(meta.lowStockCount || 0),
        outOfStockCount: Number(meta.outOfStockCount || 0),
        negativeStockCount: Number(meta.negativeStockCount || 0),
      });
      setHasStockMeta(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load stock");
      setStocks([]);
      setStockMeta(EMPTY_META);
    } finally {
      setLoading(false);
    }
  }, [
    activeLocationId,
    categoryFilter,
    brandFilter,
    combinedSearch,
    stockStatusFilter,
    currentPage,
    itemsPerPage,
  ]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  useEffect(() => {
    fetchBranches();
    fetchCategories();
    apiClient
      .get(`${API_BASE}/brands`, { params: { limit: 1000 } })
      .then((res) => setBrands(res.data?.data || res.data || []))
      .catch(() => setBrands([]));
  }, [fetchBranches, fetchCategories]);

  const warehouses = useMemo(
    () => branches.filter((b) => (b.branch_type || "").toUpperCase() === "WAREHOUSE"),
    [branches],
  );

  const locationCards = useMemo(() => branchSummary, [branchSummary]);

  const hasActiveFilters =
    Boolean(search || skuSearch || barcodeSearch) ||
    branchFilter !== ALL_BRANCHES ||
    warehouseFilter !== ALL_WAREHOUSES ||
    categoryFilter !== ALL_CATEGORIES ||
    brandFilter !== ALL_BRANDS ||
    stockStatusFilter !== ALL_STOCK_STATUS;

  const clearFilters = () => {
    setSearch("");
    setSkuSearch("");
    setBarcodeSearch("");
    setBranchFilter(ALL_BRANCHES);
    setWarehouseFilter(ALL_WAREHOUSES);
    setCategoryFilter(ALL_CATEGORIES);
    setBrandFilter(ALL_BRANDS);
    setStockStatusFilter(ALL_STOCK_STATUS);
    setCurrentPage(1);
  };

  const selectLocation = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    const isWarehouse = (branch?.branch_type || "").toUpperCase() === "WAREHOUSE";
    if (activeLocationId === branchId) {
      setBranchFilter(ALL_BRANCHES);
      setWarehouseFilter(ALL_WAREHOUSES);
    } else if (isWarehouse) {
      setWarehouseFilter(branchId);
      setBranchFilter(ALL_BRANCHES);
    } else {
      setBranchFilter(branchId);
      setWarehouseFilter(ALL_WAREHOUSES);
    }
    setCurrentPage(1);
  };

  const buildExportRows = () =>
    stocks.map((s) => {
      const qty = Number(s.current_quantity || 0);
      const reserved = Number(s.reserved_quantity || 0);
      const cost = Number(s.product?.purchase_rate || 0);
      return [
        s.product?.name || "",
        s.product?.sku || "",
        getProductBarcode(s.product),
        s.branch?.name || "",
        qty - reserved,
        reserved,
        qty * cost,
        s.last_updated ? new Date(s.last_updated).toLocaleString() : "",
      ];
    });

  const exportHeaders = [
    "Product",
    "SKU",
    "Barcode",
    "Branch",
    "Available",
    "Reserved",
    "Inventory Value",
    "Last Updated",
  ];

  const exportExcel = async () => {
    if (stocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `stock-by-location-${Date.now()}.xlsx`,
        "Stock",
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
    if (stocks.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const locationLabel =
        branches.find((b) => b.id === activeLocationId)?.name || "All locations";

      const pdfRows = stocks.map((s) => {
        const qty = Number(s.current_quantity || 0);
        const reserved = Number(s.reserved_quantity || 0);
        const cost = Number(s.product?.purchase_rate || 0);
        return [
          s.product?.name || "",
          s.product?.sku || "",
          s.branch?.name || "",
          formatQty(qty - reserved),
          formatMoney(qty * cost),
        ];
      });

      await downloadBrandedPdf({
        filename: `stock-by-location-${Date.now()}.pdf`,
        title: "Stock by Location",
        subtitle: locationLabel,
        logoDataUri,
        summary: [
          { label: "Records", value: stocks.length.toLocaleString() },
          { label: "Quantity", value: formatQty(stockMeta.totalQuantity) },
          {
            label: "Inventory Value",
            value: formatMoney(stockMeta.totalInventoryValue),
          },
        ],
        columns: [
          { header: "Product", width: 2.4 },
          { header: "SKU", width: 1.2 },
          { header: "Location", width: 1.4 },
          { header: "Available", align: "right", width: 1 },
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

  const getCategoryLabel = useCallback(
    (
      rowProduct?: { category_id?: string; category?: { name?: string } },
      full?: Record<string, unknown> | null,
    ) => {
      const fromFull = (full?.category as { name?: string } | undefined)?.name;
      if (fromFull && fromFull !== "Unknown") return fromFull;
      if (rowProduct?.category?.name && rowProduct.category.name !== "Unknown") {
        return rowProduct.category.name;
      }
      const categoryId = (full?.category_id as string) || rowProduct?.category_id;
      if (categoryId) {
        const match = categories.find((c) => c.id === categoryId);
        if (match?.name && match.name !== "Unknown") return match.name;
      }
      return "Uncategorized";
    },
    [categories],
  );

  const openDetail = useCallback(async (row: any) => {
    setDetailRow(row);
    setDetailProduct(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiClient.get(`${API_BASE}/products/${row.product.id}`);
      setDetailProduct(res.data?.data ?? res.data ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setDetailError(
        err?.response?.data?.message || "Could not load product details",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setDetailRow(null);
    setDetailProduct(null);
    setDetailLoading(false);
    setDetailError(null);
  };

  const detailMinStock = detailRow
    ? Number(
        detailRow.minimum_quantity ??
          detailProduct?.min_qty ??
          detailRow.product?.min_qty ??
          0,
      )
    : 0;

  const detailMaxStock = detailRow
    ? Number(detailRow.maximum_quantity ?? detailProduct?.max_qty ?? 0)
    : 0;

  const detailAvailable =
    detailRow &&
    Number(detailRow.current_quantity || 0) -
      Number(detailRow.reserved_quantity || 0);

  const totalPages = Math.max(1, stockMeta.totalPages);

  const visibleCategories = useMemo(
    () => categories.filter((c) => (c.name || "").trim().toLowerCase() !== "unknown"),
    [categories],
  );

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <MapPin className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Locations
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Stock by Location
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Branch and warehouse inventory, valuation, and low-stock alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || stocks.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      <InventoryKpiGrid
        columns={6}
        loading={!hasStockMeta && loading}
        items={[
          {
            label: "Locations",
            value: (
              branchSummary.length || dashboardStats.totalLocations || 0
            ).toLocaleString(),
            icon: MapPin,
            onClick: () => {
              setBranchFilter(ALL_BRANCHES);
              setWarehouseFilter(ALL_WAREHOUSES);
              setCurrentPage(1);
            },
          },
          {
            label: "Products",
            value: (stockMeta.totalProducts || stockMeta.total).toLocaleString(),
            icon: Package,
            onClick: () => {
              setStockStatusFilter(ALL_STOCK_STATUS);
              setCurrentPage(1);
            },
          },
          {
            label: "Total Quantity",
            value: formatQty(stockMeta.totalQuantity),
            icon: Boxes,
          },
          {
            label: "Inventory Value",
            value: formatMoney(stockMeta.totalInventoryValue),
            icon: DollarSign,
          },
          {
            label: "Low Stock",
            value: stockMeta.lowStockCount.toLocaleString(),
            icon: AlertTriangle,
            tone: "warning",
            onClick: () => {
              setStockStatusFilter("low");
              setCurrentPage(1);
            },
          },
          {
            label: "Pending Transfers",
            value: dashboardStats.pendingTransferCount.toLocaleString(),
            icon: Truck,
            onClick: () => onNavigate?.("transfers"),
          },
        ]}
      />

      {/* Location overview — core missing feature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Locations</h2>
            <p className="text-xs text-gray-500">
              Click a branch or warehouse to filter stock below
            </p>
          </div>
          {activeLocationId ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-600"
              onClick={() => {
                setBranchFilter(ALL_BRANCHES);
                setWarehouseFilter(ALL_WAREHOUSES);
                setCurrentPage(1);
              }}
            >
              Show all locations
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {dashboardLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="h-4 w-2/3 max-w-[160px] rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                  </div>
                  <div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse shrink-0" />
                </div>
                <div className="h-7 w-28 rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
              </div>
            ))
          ) : locationCards.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              No locations with stock yet.
            </div>
          ) : (
            locationCards.map((loc) => {
              const active = activeLocationId === loc.branchId;
              const isWarehouse = (loc.type || "").toUpperCase() === "WAREHOUSE";
              return (
                <button
                  key={loc.branchId}
                  type="button"
                  onClick={() => selectLocation(loc.branchId)}
                  className={cn(
                    "rounded-xl border p-3.5 text-left transition-colors shadow-sm",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-semibold truncate",
                          active ? "text-white" : "text-gray-900",
                        )}
                      >
                        {loc.name}
                      </p>
                      <p
                        className={cn(
                          "text-[11px] mt-0.5 inline-flex items-center gap-1",
                          active ? "text-white/70" : "text-gray-500",
                        )}
                      >
                        {isWarehouse ? (
                          <Warehouse className="h-3 w-3" />
                        ) : (
                          <MapPin className="h-3 w-3" />
                        )}
                        {isWarehouse ? "Warehouse" : "Branch"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0",
                        active ? "bg-white/15 text-white" : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {Number(loc.items || 0).toLocaleString()} SKUs
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-lg font-semibold tabular-nums",
                      active ? "text-white" : "text-gray-900",
                    )}
                  >
                    {formatMoney(loc.value)}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] mt-0.5",
                      active ? "text-white/60" : "text-gray-500",
                    )}
                  >
                    Inventory value
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {STOCK_STATUS_OPTIONS.map((opt) => {
            const active = stockStatusFilter === opt.value;
            const allCount = stockMeta.totalProducts || stockMeta.total;
            const inStockCount = Math.max(
              0,
              allCount - stockMeta.outOfStockCount - stockMeta.lowStockCount,
            );
            const count =
              !hasStockMeta
                ? null
                : opt.value === ALL_STOCK_STATUS
                  ? allCount
                  : opt.value === "in"
                    ? inStockCount
                    : opt.value === "low"
                      ? stockMeta.lowStockCount
                      : opt.value === "out"
                        ? stockMeta.outOfStockCount
                        : opt.value === "negative"
                          ? stockMeta.negativeStockCount
                          : null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStockStatusFilter(opt.value);
                  setCurrentPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-semibold transition-colors",
                  active
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                {opt.label}
                {count != null ? (
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] tabular-nums",
                      active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {count}
                  </span>
                ) : !hasStockMeta && loading ? (
                  <span
                    className={cn(
                      "inline-block h-3 w-6 rounded-full animate-pulse",
                      active ? "bg-white/25" : "bg-gray-200",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Product name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-10 text-sm text-black"
            />
          </div>
          <Input
            placeholder="SKU..."
            value={skuSearch}
            onChange={(e) => {
              setSkuSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 text-sm text-black"
          />
          <Input
            placeholder="Barcode / code..."
            value={barcodeSearch}
            onChange={(e) => {
              setBarcodeSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 text-sm text-black"
          />
          <Select
            value={warehouseFilter}
            onValueChange={(v) => {
              setWarehouseFilter(v);
              if (v !== ALL_WAREHOUSES) setBranchFilter(ALL_BRANCHES);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="All warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WAREHOUSES} className="text-sm">
                All warehouses
              </SelectItem>
              {warehouses.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={branchFilter}
            onValueChange={(v) => {
              setBranchFilter(v);
              if (v !== ALL_BRANCHES) setWarehouseFilter(ALL_WAREHOUSES);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES} className="text-sm">
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
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES} className="text-sm">
                All categories
              </SelectItem>
              {visibleCategories.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={brandFilter}
            onValueChange={(v) => {
              setBrandFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-10 text-sm text-black">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS} className="text-sm">
                All brands
              </SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-sm">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          Showing {stockMeta.total.toLocaleString()} rows ·{" "}
          {formatQty(stockMeta.totalQuantity)} units · value{" "}
          {formatMoney(stockMeta.totalInventoryValue)}
        </p>
      </div>

      {/* Stock list */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Stock list</h2>
          <p className="text-xs text-gray-500">
            Products and quantities for the filters above
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
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
              viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
        </div>
      </div>

      <Card className="border border-gray-200 overflow-hidden bg-white shadow-sm">
        <CardContent className="p-0 relative min-h-[280px]">
          {loading && stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[280px] py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">Loading stock...</p>
            </div>
          ) : stocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[280px] py-16 px-6 text-center">
              <Package className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No stock found</p>
              <p className="text-xs text-gray-500 mt-1">
                Adjust filters or select another location.
              </p>
            </div>
          ) : (
            <>
              {loading ? (
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
                      Product
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 px-2">
                      Location
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 px-2">
                      Category
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 text-right px-2 whitespace-nowrap">
                      Available
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
                  {stocks.map((s) => {
                    const qty = Number(s.current_quantity || 0);
                    const reserved = Number(s.reserved_quantity || 0);
                    const available = qty - reserved;
                    const cost = Number(s.product?.purchase_rate || 0);
                    const minQty = Number(s.minimum_quantity ?? s.product?.min_qty ?? 10);
                    const imageUrl = getStockRowImage(s.product);
                    const categoryName = getCategoryLabel(s.product);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="py-2.5 pl-3 pr-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover border border-gray-100 shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 border border-gray-100 flex items-center justify-center shrink-0">
                                <Package className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {s.product?.name || EMPTY}
                              </p>
                              <p className="text-[11px] text-gray-500 font-mono mt-0.5 truncate">
                                {s.product?.sku || getProductBarcode(s.product) || EMPTY}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-2 text-sm text-gray-700 whitespace-nowrap">
                          {s.branch?.name || EMPTY}
                        </TableCell>
                        <TableCell className="py-2.5 px-2 text-sm text-gray-700 truncate max-w-[140px]">
                          {categoryName}
                        </TableCell>
                        <TableCell className="py-2.5 px-2 text-right whitespace-nowrap">
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              qty < 0 || available < 0 ? "text-red-600" : "text-gray-900",
                            )}
                          >
                            {formatQty(available)}
                          </p>
                          {reserved > 0 ? (
                            <p className="text-[10px] text-gray-400">
                              {formatQty(reserved)} reserved
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-2.5 px-2 text-right text-sm tabular-nums text-gray-700 whitespace-nowrap">
                          {formatMoney(cost)}
                        </TableCell>
                        <TableCell className="py-2.5 px-2 text-right text-sm font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                          {formatMoney(qty * cost)}
                        </TableCell>
                        <TableCell className="py-2.5 px-2">
                          <StockStatusBadge qty={qty} minQty={minQty} />
                        </TableCell>
                        <TableCell className="py-2.5 pl-2 pr-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-gray-700"
                            onClick={() => openDetail(s)}
                          >
                            View
                            <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <InventoryCardGrid empty={false}>
              {stocks.map((s) => {
                const qty = Number(s.current_quantity || 0);
                const reserved = Number(s.reserved_quantity || 0);
                const cost = Number(s.product?.purchase_rate || 0);
                const minQty = Number(s.minimum_quantity ?? s.product?.min_qty ?? 0);
                return (
                  <StockRecordCard
                    key={s.id}
                    productName={s.product?.name || EMPTY}
                    sku={s.product?.sku}
                    barcode={getProductBarcode(s.product)}
                    category={getCategoryLabel(s.product)}
                    branch={s.branch?.name}
                    imageUrl={getStockRowImage(s.product)}
                    cost={cost}
                    quantity={qty}
                    reserved={reserved}
                    available={qty - reserved}
                    value={qty * cost}
                    minQty={minQty}
                    onView={() => openDetail(s)}
                  />
                );
              })}
            </InventoryCardGrid>
              )}
            </>
          )}

          {totalPages > 1 && stocks.length > 0 ? (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white">
              <p className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 border-slate-200 text-black"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg =
                    Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <Button
                      key={pg}
                      variant={pg === currentPage ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-8 w-8 p-0 text-xs font-normal",
                        pg === currentPage
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 text-black hover:bg-slate-50",
                      )}
                      onClick={() => setCurrentPage(pg)}
                      disabled={loading}
                    >
                      {pg}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 border-slate-200 text-black"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {stockMeta.total.toLocaleString()} records
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Row details */}
      <Dialog
        open={!!detailRow}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-200 p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b border-gray-200">
            <DialogTitle className="text-lg font-bold text-black">
              Stock details
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {detailRow?.product?.name} at {detailRow?.branch?.name}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Loading product details...</p>
            </div>
          ) : detailError ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-600">{detailError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-sm text-black"
                onClick={() => detailRow && openDetail(detailRow)}
              >
                Try again
              </Button>
            </div>
          ) : detailRow ? (
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DetailSection title="Product">
                  <DetailRow label="Name" value={detailRow.product?.name} />
                  <DetailRow
                    label="SKU"
                    value={
                      (detailProduct?.sku as string) || detailRow.product?.sku
                    }
                  />
                  <DetailRow
                    label="Barcode"
                    value={(detailProduct?.code as string) || EMPTY}
                  />
                  <DetailRow
                    label="Category"
                    value={getCategoryLabel(detailRow.product, detailProduct)}
                  />
                  <DetailRow
                    label="Subcategory"
                    value={
                      (detailProduct?.subcategory as { name?: string })?.name &&
                      (detailProduct?.subcategory as { name?: string }).name !==
                        "Unknown"
                        ? (detailProduct?.subcategory as { name?: string }).name
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Brand"
                    value={
                      (detailProduct?.brand as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Unit"
                    value={
                      (detailProduct?.unit as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Supplier"
                    value={
                      (detailProduct?.supplier as { name?: string })?.name &&
                      (detailProduct?.supplier as { name?: string }).name !==
                        "Unknown"
                        ? (detailProduct?.supplier as { name?: string }).name
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Tax"
                    value={
                      (detailProduct?.tax as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Product active"
                    value={detailProduct?.is_active === false ? "No" : "Yes"}
                  />
                </DetailSection>

                <DetailSection title="Stock at this branch">
                  <DetailRow label="Branch" value={detailRow.branch?.name} />
                  <DetailRow
                    label="Quantity on hand"
                    value={formatQty(detailRow.current_quantity)}
                  />
                  <DetailRow
                    label="Reserved"
                    value={formatQty(detailRow.reserved_quantity ?? 0)}
                  />
                  <DetailRow
                    label="Available to sell"
                    value={formatQty(detailAvailable)}
                  />
                  <DetailRow
                    label="Minimum stock"
                    value={formatQty(detailMinStock)}
                  />
                  <DetailRow
                    label="Maximum stock"
                    value={
                      detailMaxStock > 0 ? formatQty(detailMaxStock) : EMPTY
                    }
                  />
                  <DetailRow
                    label="Reorder level"
                    value={
                      detailRow.reorder_level != null
                        ? formatQty(detailRow.reorder_level)
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Last updated"
                    value={
                      detailRow.last_updated
                        ? new Date(detailRow.last_updated).toLocaleString()
                        : EMPTY
                    }
                  />
                  <DetailRow
                    label="Stock status"
                    value={
                      detailRow ? (
                        <StockStatusBadge
                          qty={Number(detailRow.current_quantity || 0)}
                          minQty={detailMinStock}
                          showIcon
                        />
                      ) : (
                        EMPTY
                      )
                    }
                  />
                </DetailSection>

                <DetailSection title="Pricing">
                  <DetailRow
                    label="Purchase rate"
                    value={formatMoney(detailProduct?.purchase_rate)}
                  />
                  <DetailRow
                    label="Sales rate (ex. tax)"
                    value={formatMoney(
                      detailProduct?.sales_rate_exc_dis_and_tax,
                    )}
                  />
                  <DetailRow
                    label="Sales rate (inc. tax)"
                    value={formatMoney(
                      detailProduct?.sales_rate_inc_dis_and_tax,
                    )}
                  />
                  <DetailRow
                    label="Discount %"
                    value={
                      detailProduct?.discount_percentage != null
                        ? `${detailProduct.discount_percentage}%`
                        : EMPTY
                    }
                  />
                </DetailSection>

                <DetailSection title="Identifiers">
                  <DetailRow
                    label="HS / PCT code"
                    value={(detailProduct?.pct_or_hs_code as string) || EMPTY}
                  />
                  <DetailRow
                    label="Size"
                    value={
                      (detailProduct?.size as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Color"
                    value={
                      (detailProduct?.color as { name?: string })?.name || EMPTY
                    }
                  />
                  <DetailRow
                    label="Weight"
                    value={
                      detailProduct?.weight != null
                        ? `${detailProduct.weight} ${(detailProduct?.weight_unit as string) || ""}`.trim()
                        : EMPTY
                    }
                  />
                </DetailSection>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-5 mt-2 border-t border-gray-200">
                {onNavigate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => {
                      closeDetail();
                      onNavigate("transfers");
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                    Transfer stock
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-sm text-black"
                  onClick={closeDetail}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
