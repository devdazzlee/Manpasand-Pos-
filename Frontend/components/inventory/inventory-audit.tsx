"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  BarChart3,
  TrendingUp,
  DollarSign,
  CalendarIcon,
  Search,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Loader2,
  Package,
  List,
  LayoutGrid,
  Eye,
  Percent,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { PageLoader } from "@/components/ui/page-loader";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";

interface AuditSummary {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
}

interface BranchMetric {
  name: string;
  revenue: number;
  cogs: number;
  profit: number;
  count: number;
}

type SortKey = "revenue" | "profit" | "margin" | "count" | "name";

function money(n: unknown) {
  return formatMoney(Number(n) || 0);
}

function marginOf(b: BranchMetric) {
  if (!b.revenue) return 0;
  return (b.profit / b.revenue) * 100;
}

function marginTone(margin: number) {
  if (margin >= 20) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (margin >= 10) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

export function InventoryAudit() {
  const logoDataUri = useLogoDataUri();
  const {
    products,
    categories,
    branches,
    productsLoading,
    categoriesLoading,
    fetchProducts,
    fetchCategories,
    fetchBranches,
  } = usePosData();

  const [data, setData] = useState<BranchMetric[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [searchQuery, setSearchQuery] = useState("");

  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();

  const [prodSearch, setProdSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<BranchMetric | null>(null);

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { type: "financial_audit" };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (filterCategory !== "all") params.categoryId = filterCategory;
      if (filterProduct !== "all") params.productId = filterProduct;
      if (filterStart) params.startDate = filterStart.toISOString();
      if (filterEnd) {
        const e = new Date(filterEnd);
        e.setHours(23, 59, 59, 999);
        params.endDate = e.toISOString();
      }

      const response = await apiClient.get("/inventory/reports", { params });
      const report = response.data?.data || {};
      setData(report.data || []);
      setSummary(report.summary || null);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load financial audit",
      );
      setData([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [filterBranch, filterCategory, filterProduct, filterStart, filterEnd]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchBranches();
  }, [fetchProducts, fetchCategories, fetchBranches]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(event.target as Node)) {
        setProdDropdownOpen(false);
      }
      if (catRef.current && !catRef.current.contains(event.target as Node)) {
        setCatDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProd = useMemo(() => {
    const term = prodSearch.toLowerCase();
    if (!term) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term)),
      )
      .slice(0, 50);
  }, [products, prodSearch]);

  const filteredCat = useMemo(() => {
    const term = catSearch.toLowerCase();
    if (!term) return categories.slice(0, 50);
    return categories
      .filter((c) => c.name.toLowerCase().includes(term))
      .slice(0, 50);
  }, [categories, catSearch]);

  const selectedProdName =
    products.find((p) => p.id === filterProduct)?.name || "";
  const selectedCatName =
    categories.find((c) => c.id === filterCategory)?.name || "";

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterBranch !== "all" ||
    filterCategory !== "all" ||
    filterProduct !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterCategory("all");
    setFilterProduct("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setCatSearch("");
    setProdSearch("");
  };

  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    const now = new Date();
    if (preset === "all") {
      setFilterStart(undefined);
      setFilterEnd(undefined);
      return;
    }
    if (preset === "today") {
      setFilterStart(startOfDay(now));
      setFilterEnd(endOfDay(now));
      return;
    }
    if (preset === "week") {
      setFilterStart(startOfWeek(now, { weekStartsOn: 1 }));
      setFilterEnd(endOfWeek(now, { weekStartsOn: 1 }));
      return;
    }
    setFilterStart(startOfMonth(now));
    setFilterEnd(endOfMonth(now));
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = data;
    if (q) {
      rows = rows.filter((b) => b.name.toLowerCase().includes(q));
    }
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "count":
          return b.count - a.count;
        case "profit":
          return b.profit - a.profit;
        case "margin":
          return marginOf(b) - marginOf(a);
        case "revenue":
        default:
          return b.revenue - a.revenue;
      }
    });
    return sorted;
  }, [data, searchQuery, sortKey]);

  const topBranch = filteredRows[0] || null;
  const avgMargin =
    filteredRows.length > 0
      ? filteredRows.reduce((acc, b) => acc + marginOf(b), 0) /
        filteredRows.length
      : 0;

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      downloadExcel(
        `financial-audit-${Date.now()}.xlsx`,
        "Financial Audit",
        [
          "Branch",
          "Transactions",
          "Revenue",
          "COGS",
          "Gross profit",
          "Margin %",
        ],
        filteredRows.map((b) => [
          b.name,
          b.count,
          b.revenue,
          b.cogs,
          b.profit,
          Number(marginOf(b).toFixed(2)),
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
        filename: `financial-audit-${Date.now()}.pdf`,
        title: "Inventory Financial Audit",
        subtitle: "Revenue, COGS, and profitability by branch",
        logoDataUri,
        summary: [
          { label: "Revenue", value: money(summary?.totalRevenue || 0) },
          { label: "Gross profit", value: money(summary?.grossProfit || 0) },
          {
            label: "Margin",
            value: `${(summary?.profitMargin || 0).toFixed(1)}%`,
          },
        ],
        columns: [
          { header: "Branch", width: 2 },
          { header: "Txns", align: "right", width: 0.8 },
          { header: "Revenue", align: "right", width: 1.2 },
          { header: "COGS", align: "right", width: 1.2 },
          { header: "Profit", align: "right", width: 1.2 },
          { header: "Margin", align: "right", width: 0.9 },
        ],
        rows: filteredRows.map((b) => [
          b.name,
          formatQty(b.count),
          money(b.revenue),
          money(b.cogs),
          money(b.profit),
          `${marginOf(b).toFixed(1)}%`,
        ]),
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading && data.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading financial audit..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-600 mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Finance
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Inventory Financial Audit
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Revenue, cost of goods, and margin by branch
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={loading || filteredRows.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && data.length === 0}
        items={[
          {
            label: "Gross revenue",
            value: money(summary?.totalRevenue || 0),
            icon: DollarSign,
            hint: `${(summary?.transactionCount || 0).toLocaleString()} sales`,
          },
          {
            label: "COGS",
            value: money(summary?.totalCOGS || 0),
            icon: ShoppingCart,
          },
          {
            label: "Gross profit",
            value: money(summary?.grossProfit || 0),
            icon: TrendingUp,
            tone: (summary?.grossProfit || 0) >= 0 ? "success" : "danger",
          },
          {
            label: "Profit margin",
            value: `${(summary?.profitMargin || 0).toFixed(1)}%`,
            icon: Percent,
          },
        ]}
      />

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: "All time" },
              { id: "today", label: "Today" },
              { id: "week", label: "This week" },
              { id: "month", label: "This month" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 h-8 text-xs font-medium text-gray-700 hover:bg-white hover:border-gray-300 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
            <Label className="text-xs font-medium text-gray-500">
              Search branches
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search branch name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 text-sm text-black"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">Branch</Label>
            <Select value={filterBranch} onValueChange={setFilterBranch}>
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">Sort by</Label>
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            >
              <SelectTrigger className="h-10 text-sm text-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue" className="text-sm">
                  Revenue
                </SelectItem>
                <SelectItem value="profit" className="text-sm">
                  Profit
                </SelectItem>
                <SelectItem value="margin" className="text-sm">
                  Margin
                </SelectItem>
                <SelectItem value="count" className="text-sm">
                  Transactions
                </SelectItem>
                <SelectItem value="name" className="text-sm">
                  Branch name
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 relative" ref={catRef}>
            <Label className="text-xs font-medium text-gray-500">Category</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                placeholder="Filter by category…"
                className="h-10 pl-9 pr-9 text-sm text-black"
                value={filterCategory === "all" ? catSearch : selectedCatName}
                onFocus={() => {
                  setCatDropdownOpen(true);
                  if (filterCategory !== "all") {
                    setFilterCategory("all");
                    setCatSearch("");
                  }
                }}
                onChange={(e) => {
                  setCatSearch(e.target.value);
                  setCatDropdownOpen(true);
                }}
              />
              {filterCategory !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategory("all");
                    setCatSearch("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ) : null}
            </div>
            {catDropdownOpen ? (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategory("all");
                    setCatDropdownOpen(false);
                    setCatSearch("");
                  }}
                  className="w-full p-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 border-b border-gray-100"
                >
                  All categories
                </button>
                {categoriesLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : (
                  filteredCat.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setFilterCategory(c.id);
                        setCatDropdownOpen(false);
                        setCatSearch(c.name);
                      }}
                      className="w-full p-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-none"
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5 relative" ref={prodRef}>
            <Label className="text-xs font-medium text-gray-500">Product</Label>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                placeholder="Filter by product…"
                className="h-10 pl-9 pr-9 text-sm text-black"
                value={filterProduct === "all" ? prodSearch : selectedProdName}
                onFocus={() => {
                  setProdDropdownOpen(true);
                  if (filterProduct !== "all") {
                    setFilterProduct("all");
                    setProdSearch("");
                  }
                }}
                onChange={(e) => {
                  setProdSearch(e.target.value);
                  setProdDropdownOpen(true);
                }}
              />
              {filterProduct !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilterProduct("all");
                    setProdSearch("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ) : null}
            </div>
            {prodDropdownOpen ? (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFilterProduct("all");
                    setProdDropdownOpen(false);
                    setProdSearch("");
                  }}
                  className="w-full p-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 border-b border-gray-100"
                >
                  All products
                </button>
                {productsLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : filteredProd.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No matches
                  </div>
                ) : (
                  filteredProd.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFilterProduct(p.id);
                        setProdDropdownOpen(false);
                        setProdSearch(p.name);
                      }}
                      className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-none"
                    >
                      <span className="block text-sm font-medium text-black">
                        {p.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        SKU: {p.sku || "N/A"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">
              From date
            </Label>
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
                    <span className="text-gray-400">Pick date</span>
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

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">To date</Label>
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
                    <span className="text-gray-400">Pick date</span>
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
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Showing {filteredRows.length.toLocaleString()} branch
            {filteredRows.length === 1 ? "" : "es"}
            {topBranch
              ? ` · Top: ${topBranch.name} (${money(topBranch.revenue)})`
              : ""}
            {filteredRows.length > 0
              ? ` · Avg margin ${avgMargin.toFixed(1)}%`
              : ""}
          </p>
          {hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 self-start sm:self-auto"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Branch performance
          </h2>
          <p className="text-xs text-gray-500">
            Comparative revenue, cost, and margin by location
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
          {loading && data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">
                Calculating financial audit...
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <BarChart3 className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No audit data found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try clearing filters or widening the date range."
                  : "Completed sales will appear here once recorded."}
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
                          Branch
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Txns
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Revenue
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          COGS
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Profit
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Margin
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((b) => {
                        const margin = marginOf(b);
                        return (
                          <TableRow key={b.name}>
                            <TableCell className="py-2.5 pl-3">
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                {b.name}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-700">
                              {b.count.toLocaleString()}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                              {money(b.revenue)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              {money(b.cogs)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-sm text-right tabular-nums font-semibold",
                                b.profit >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700",
                              )}
                            >
                              {money(b.profit)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  marginTone(margin),
                                )}
                              >
                                {margin.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setDetailRow(b);
                                  setDetailOpen(true);
                                }}
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
                  {filteredRows.map((b) => {
                    const margin = marginOf(b);
                    return (
                      <TransactionRecordCard
                        key={b.name}
                        date={`${b.count.toLocaleString()} transactions`}
                        title={b.name}
                        meta={
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Branch performance
                          </span>
                        }
                        badge={
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold",
                              marginTone(margin),
                            )}
                          >
                            {margin.toFixed(1)}% margin
                          </Badge>
                        }
                        amount={money(b.revenue)}
                        amountLabel="Revenue"
                        highlights={[
                          {
                            label: "Profit",
                            value: money(b.profit),
                            tone: b.profit >= 0 ? "success" : "danger",
                          },
                          { label: "COGS", value: money(b.cogs) },
                          {
                            label: "Txns",
                            value: b.count.toLocaleString(),
                          },
                        ]}
                        actions={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setDetailRow(b);
                              setDetailOpen(true);
                            }}
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
      </Card>

      {/* Real insights from data (not fake AI) */}
      {filteredRows.length > 0 && summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              {(summary.grossProfit || 0) >= 0 ? (
                <ArrowUpRight className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ArrowDownRight className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Overall profitability
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Gross profit is {money(summary.grossProfit)} on{" "}
                  {money(summary.totalRevenue)} revenue (
                  {(summary.profitMargin || 0).toFixed(1)}% margin) across{" "}
                  {(summary.transactionCount || 0).toLocaleString()} completed
                  sales.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Leading branch
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {topBranch
                    ? `${topBranch.name} leads with ${money(topBranch.revenue)} revenue and ${marginOf(topBranch).toFixed(1)}% margin (${topBranch.count.toLocaleString()} sales).`
                    : "No branch data in the current view."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[520px] border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-black">
              Branch audit detail
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Financial breakdown for this location
            </DialogDescription>
          </DialogHeader>

          {detailRow ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">
                    {detailRow.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {detailRow.count.toLocaleString()} completed sales
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold",
                    marginTone(marginOf(detailRow)),
                  )}
                >
                  {marginOf(detailRow).toFixed(1)}% margin
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Revenue
                  </p>
                  <p className="font-semibold text-gray-900 mt-0.5 tabular-nums">
                    {money(detailRow.revenue)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    COGS
                  </p>
                  <p className="font-semibold text-gray-900 mt-0.5 tabular-nums">
                    {money(detailRow.cogs)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 col-span-2">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Gross profit
                  </p>
                  <p
                    className={cn(
                      "font-semibold mt-0.5 tabular-nums text-lg",
                      detailRow.profit >= 0
                        ? "text-emerald-700"
                        : "text-rose-700",
                    )}
                  >
                    {money(detailRow.profit)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
