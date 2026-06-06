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
  Download,
  Search,
  ArrowUpDown,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Boxes,
  Loader2,
  ArrowRightLeft,
  MapPin,
  DollarSign,
  Truck,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import {
  StockStatusBadge,
} from "@/components/inventory/stock-ops/stock-status-badge";
import {
  ALL_BRANCHES,
  ALL_BRANDS,
  ALL_CATEGORIES,
} from "@/components/inventory/stock-ops/constants";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { useInventoryDashboard } from "@/components/inventory/stock-ops/use-inventory-dashboard";
import {
  downloadCsv,
  downloadExcel,
  formatMoney,
  getProductBarcode,
  printHtmlDocument,
} from "@/components/inventory/stock-ops/export-utils";

/** Sentinel values - must not match a real branch/category id from the API. */
const ALL_WAREHOUSES = "__all_warehouses__";
/** Plain ASCII placeholder for empty fields (avoids em-dash encoding issues on Windows). */
const EMPTY = "-";

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

export function StockView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { stats: dashboardStats, loading: dashboardLoading } = useInventoryDashboard();
  const {
    branches,
    categories,
    fetchBranches,
    fetchCategories,
  } = usePosData();

  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const [detailProduct, setDetailProduct] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [warehouseFilter, setWarehouseFilter] = useState(ALL_WAREHOUSES);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("current_quantity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(25);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: itemsPerPage,
        branchId:
          branchFilter === ALL_BRANCHES
            ? warehouseFilter === ALL_WAREHOUSES
              ? ""
              : warehouseFilter
            : branchFilter,
        categoryId: categoryFilter === ALL_CATEGORIES ? "" : categoryFilter,
        brandId: brandFilter === ALL_BRANDS ? "" : brandFilter,
        search: search.trim(),
      };

      const res = await apiClient.get(`${API_BASE}/stock`, { params });
      setStocks(res.data?.data || []);
      setTotalPages(res.data?.meta?.totalPages || 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [branchFilter, warehouseFilter, categoryFilter, brandFilter, search, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchStocks();
    fetchBranches();
    fetchCategories();
    apiClient
      .get(`${API_BASE}/brands`, { params: { limit: 1000 } })
      .then((res) => setBrands(res.data?.data || res.data || []))
      .catch(() => setBrands([]));
  }, [fetchStocks, fetchBranches, fetchCategories]);

  const categoryNameById = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c.name]));
  }, [categories]);

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sortField) {
        case "product":
          valA = a.product?.name || "";
          valB = b.product?.name || "";
          break;
        case "branch":
          valA = a.branch?.name || "";
          valB = b.branch?.name || "";
          break;
        case "quantity":
          valA = Number(a.current_quantity);
          valB = Number(b.current_quantity);
          break;
        default:
          valA = Number(a.current_quantity);
          valB = Number(b.current_quantity);
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [stocks, sortField, sortOrder]);

  const stats = useMemo(() => {
    const totalItems = stocks.reduce(
      (acc, s) => acc + Number(s.current_quantity || 0),
      0,
    );
    const lowStock = stocks.filter((s) => {
      const qty = Number(s.current_quantity || 0);
      const min = Number(s.product?.min_qty || 0);
      return qty > 0 && qty <= min;
    }).length;
    const outOfStock = stocks.filter(
      (s) => Number(s.current_quantity || 0) <= 0,
    ).length;

    return { totalItems, lowStock, outOfStock };
  }, [stocks]);

  const exportCSV = () => {
    const headers = [
      "Product",
      "SKU",
      "Barcode",
      "Branch",
      "Available",
      "Reserved",
      "Inventory Value",
      "Last Updated",
    ];
    const rows = stocks.map((s) => {
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
    downloadCsv(`stock-by-location-${Date.now()}.csv`, headers, rows);
    toast.success("CSV downloaded");
  };

  const exportExcel = () => {
    const headers = [
      "Product",
      "SKU",
      "Barcode",
      "Branch",
      "Available",
      "Reserved",
      "Inventory Value",
      "Last Updated",
    ];
    const rows = stocks.map((s) => {
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
    downloadExcel(`stock-by-location-${Date.now()}.xlsx`, "Stock", headers, rows);
    toast.success("Excel downloaded");
  };

  const warehouses = useMemo(
    () => branches.filter((b) => (b.branch_type || "").toUpperCase() === "WAREHOUSE"),
    [branches],
  );

  const locationValue = useMemo(() => {
    return stocks.reduce((acc, s) => {
      const qty = Number(s.current_quantity || 0);
      const cost = Number(s.product?.purchase_rate || 0);
      return acc + qty * cost;
    }, 0);
  }, [stocks]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const formatMoney = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return EMPTY;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatQty = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return EMPTY;
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  };

  const getCategoryLabel = useCallback(
    (rowProduct?: { category_id?: string; category?: { name?: string } }, full?: Record<string, unknown> | null) => {
      const fromFull = (full?.category as { name?: string } | undefined)?.name;
      if (fromFull) return fromFull;
      if (rowProduct?.category?.name) return rowProduct.category.name;
      const categoryId =
        (full?.category_id as string) || rowProduct?.category_id;
      if (categoryId) {
        const match = categories.find((c) => c.id === categoryId);
        if (match?.name) return match.name;
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
    ? Number(
        detailRow.maximum_quantity ?? detailProduct?.max_qty ?? 0,
      )
    : 0;

  const detailAvailable =
    detailRow &&
    Number(detailRow.current_quantity || 0) -
      Number(detailRow.reserved_quantity || 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 text-black">
      <div className="flex items-start gap-3">
        <div className="bg-gray-900 text-white p-2.5 rounded-lg shrink-0">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">Stock by Location</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Branch and warehouse inventory, valuation, transfers, and low-stock alerts.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Filter by branch or warehouse below, then export or transfer stock.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onNavigate ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm text-black"
                onClick={() => onNavigate("transfers")}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                Transfers
              </Button>
            ) : null}
            <StockOpsActions
              onNavigate={onNavigate}
              onExportCsv={exportCSV}
              onExportExcel={exportExcel}
              onPrint={() => {
                if (stocks.length === 0) return;
                const body = stocks
                  .map((s) => {
                    const qty = Number(s.current_quantity || 0);
                    const reserved = Number(s.reserved_quantity || 0);
                    const cost = Number(s.product?.purchase_rate || 0);
                    return `<tr><td>${s.product?.name || ""}</td><td>${s.product?.sku || ""}</td><td>${s.branch?.name || ""}</td><td class="num">${qty - reserved}</td><td class="num">${formatMoney(qty * cost)}</td></tr>`;
                  })
                  .join("");
                printHtmlDocument(
                  "Location Inventory",
                  `<h1>Stock by Location</h1><p class="meta">${new Date().toLocaleString()}</p><table><thead><tr><th>Product</th><th>SKU</th><th>Branch</th><th>Available</th><th>Value</th></tr></thead><tbody>${body}</tbody></table>`,
                );
              }}
              disabled={loading || stocks.length === 0}
            />
          </div>
        </div>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={dashboardLoading || loading}
        items={[
          {
            label: "Total Locations",
            value: dashboardStats.totalLocations.toLocaleString(),
            icon: MapPin,
          },
          {
            label: "Inventory Value (page)",
            value: formatMoney(locationValue),
            icon: DollarSign,
          },
          {
            label: "Low Stock (page)",
            value: stats.lowStock.toLocaleString(),
            icon: AlertTriangle,
            tone: "warning",
          },
          {
            label: "Pending Transfers",
            value: dashboardStats.pendingTransferCount.toLocaleString(),
            icon: Truck,
          },
        ]}
      />

      {/* Filters */}
      <Card className="p-4 border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by product name or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 h-9 text-sm text-black"
            />
          </div>
          <Select
            value={warehouseFilter}
            onValueChange={(v) => {
              setWarehouseFilter(v);
              if (v !== ALL_WAREHOUSES) setBranchFilter(ALL_BRANCHES);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full lg:w-[200px] text-sm text-black">
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
            <SelectTrigger className="h-9 w-full lg:w-[200px] text-sm text-black">
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
            <SelectTrigger className="h-9 w-full lg:w-[200px] text-sm text-black">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES} className="text-sm">
                All categories
              </SelectItem>
              {categories.map((c) => (
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
            <SelectTrigger className="h-9 w-full lg:w-[200px] text-sm text-black">
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
        </div>
      </Card>

      {/* Table */}
      <Card className="border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-black">Stock list</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Products and quantities for the filters above.
          </p>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200">
                  <TableHead className="text-sm text-gray-600">
                    <button
                      type="button"
                      className="inline-flex items-center text-sm text-gray-600 hover:text-black"
                      onClick={() => toggleSort("product")}
                    >
                      Product
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-sm text-gray-600">SKU</TableHead>
                  <TableHead className="text-sm text-gray-600">Barcode</TableHead>
                  <TableHead className="text-sm text-gray-600">
                    <button
                      type="button"
                      className="inline-flex items-center text-sm text-gray-600 hover:text-black"
                      onClick={() => toggleSort("branch")}
                    >
                      Branch
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-sm text-gray-600 text-right">
                    Available
                  </TableHead>
                  <TableHead className="text-sm text-gray-600 text-right">
                    Reserved
                  </TableHead>
                  <TableHead className="text-sm text-gray-600 text-right">
                    Value
                  </TableHead>
                  <TableHead className="text-sm text-gray-600">
                    Updated
                  </TableHead>
                  <TableHead className="text-sm text-gray-600 text-center min-w-[108px]">
                    Status
                  </TableHead>
                  <TableHead className="text-sm text-gray-600 text-right w-[72px]">
                    Details
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-48">
                      <PageLoader message="Loading stock..." />
                    </TableCell>
                  </TableRow>
                ) : stocks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-32 text-center text-sm text-gray-500"
                    >
                      No stock found for these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedStocks.map((s) => {
                    const qty = Number(s.current_quantity || 0);
                    const reserved = Number(s.reserved_quantity || 0);
                    const cost = Number(s.product?.purchase_rate || 0);
                    const minQty = Number(
                      s.minimum_quantity ?? s.product?.min_qty ?? 0,
                    );
                    return (
                      <TableRow key={s.id} className="border-gray-100">
                        <TableCell className="py-3">
                          <span className="text-sm text-black block">
                            {s.product?.name || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {s.product?.sku || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {getProductBarcode(s.product)}
                        </TableCell>
                        <TableCell className="text-sm text-black">
                          {s.branch?.name || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-black text-right">
                          {(qty - reserved).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 text-right">
                          {reserved.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-black text-right">
                          {formatMoney(qty * cost)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {s.last_updated
                            ? new Date(s.last_updated).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <StockStatusBadge qty={qty} minQty={minQty} showIcon />
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-600 hover:text-black"
                            aria-label={`View details for ${s.product?.name || "product"}`}
                            onClick={() => openDetail(s)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white rounded-b-xl">
              <p className="text-xs font-normal text-slate-500">
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
                  const pg = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  return (
                    <Button
                      key={pg}
                      variant={pg === currentPage ? "default" : "outline"}
                      size="sm"
                      className={`h-8 w-8 p-0 text-xs font-normal transition-all ${
                        pg === currentPage
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 text-black hover:bg-slate-50"
                      }`}
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
              <p className="text-xs font-normal text-slate-500 hidden sm:block">
                {stats.totalItems.toLocaleString()} total items
              </p>
            </div>
          )}
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
                    value={(detailProduct?.code as string) || "-"}
                  />
                  <DetailRow
                    label="Category"
                    value={getCategoryLabel(detailRow.product, detailProduct)}
                  />
                  <DetailRow
                    label="Subcategory"
                    value={
                      (detailProduct?.subcategory as { name?: string })?.name ||
                      "-"
                    }
                  />
                  <DetailRow
                    label="Brand"
                    value={
                      (detailProduct?.brand as { name?: string })?.name || "-"
                    }
                  />
                  <DetailRow
                    label="Unit"
                    value={
                      (detailProduct?.unit as { name?: string })?.name || "-"
                    }
                  />
                  <DetailRow
                    label="Supplier"
                    value={
                      (detailProduct?.supplier as { name?: string })?.name ||
                      "-"
                    }
                  />
                  <DetailRow
                    label="Tax"
                    value={
                      (detailProduct?.tax as { name?: string })?.name || "-"
                    }
                  />
                  <DetailRow
                    label="Product active"
                    value={
                      detailProduct?.is_active === false ? "No" : "Yes"
                    }
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
                      detailMaxStock > 0 ? formatQty(detailMaxStock) : "-"
                    }
                  />
                  <DetailRow
                    label="Reorder level"
                    value={
                      detailRow.reorder_level != null
                        ? formatQty(detailRow.reorder_level)
                        : "-"
                    }
                  />
                  <DetailRow
                    label="Last updated"
                    value={
                      detailRow.last_updated
                        ? new Date(detailRow.last_updated).toLocaleString()
                        : "-"
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
                        "-"
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
                        : "-"
                    }
                  />
                </DetailSection>

                <DetailSection title="Identifiers">
                  <DetailRow
                    label="HS / PCT code"
                    value={(detailProduct?.pct_or_hs_code as string) || "-"}
                  />
                  <DetailRow
                    label="Size"
                    value={
                      (detailProduct?.size as { name?: string })?.name || "-"
                    }
                  />
                  <DetailRow
                    label="Color"
                    value={
                      (detailProduct?.color as { name?: string })?.name || "-"
                    }
                  />
                  <DetailRow
                    label="Weight"
                    value={
                      detailProduct?.weight != null
                        ? `${detailProduct.weight} ${(detailProduct?.weight_unit as string) || ""}`.trim()
                        : "-"
                    }
                  />
                </DetailSection>
              </div>

              <div className="flex justify-end pt-5 mt-2 border-t border-gray-200">
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
