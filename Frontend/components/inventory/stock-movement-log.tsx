"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  CalendarIcon,
  History,
  RefreshCw,
  X,
  Loader2,
  Eye,
  Package,
  List,
  LayoutGrid,
  ArrowRightLeft,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const PAGE_SIZE = 20;

const MOVEMENT_TYPES = [
  { value: "PURCHASE", label: "Purchase" },
  { value: "SALE", label: "Sale" },
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "TRANSFER_IN", label: "Transfer in" },
  { value: "TRANSFER_OUT", label: "Transfer out" },
  { value: "RETURN", label: "Return" },
  { value: "DAMAGE", label: "Damage" },
  { value: "EXPIRED", label: "Expired" },
  { value: "LOSS", label: "Loss" },
] as const;

interface MovementRow {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: string | number;
  previous_qty: string | number;
  new_qty: string | number;
  reference_id?: string | null;
  reference_type?: string | null;
  notes?: string | null;
  product?: { id: string; name: string; sku?: string | null } | null;
  branch?: { id: string; name: string } | null;
  user?: { email?: string | null } | null;
}

interface MovementSummary {
  totalIncrease: number;
  totalDecrease: number;
  count: number;
}

function typeLabel(t: string) {
  return MOVEMENT_TYPES.find((x) => x.value === t)?.label || t;
}

function typeTone(t: string) {
  switch (t) {
    case "PURCHASE":
    case "TRANSFER_IN":
    case "RETURN":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "SALE":
    case "TRANSFER_OUT":
    case "DAMAGE":
    case "EXPIRED":
    case "LOSS":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "ADJUSTMENT":
      return "bg-sky-50 text-sky-800 border-sky-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function deltaTone(qty: number) {
  if (qty > 0) return "text-emerald-700";
  if (qty < 0) return "text-rose-700";
  return "text-gray-700";
}

export function StockMovementLog() {
  const logoDataUri = useLogoDataUri();
  const {
    products,
    branches,
    productsLoading,
    fetchProducts,
    fetchBranches,
  } = usePosData();

  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [summary, setSummary] = useState<MovementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterDirection, setFilterDirection] = useState<"all" | "in" | "out">(
    "all",
  );
  const [filterProductId, setFilterProductId] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [exporting, setExporting] = useState(false);

  const [prodSearch, setProdSearch] = useState("");
  const [prodDropdownOpen, setProdDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<MovementRow | null>(null);

  const fetchMovements = useCallback(
    async (pg = page) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pg,
          limit: PAGE_SIZE,
        };
        if (filterBranch !== "all") params.branchId = filterBranch;
        if (filterProductId !== "all") params.productId = filterProductId;
        if (filterType !== "all") params.movementType = filterType;
        if (filterDirection !== "all") params.direction = filterDirection;
        if (filterStart) params.startDate = filterStart.toISOString();
        if (filterEnd) {
          const e = new Date(filterEnd);
          e.setHours(23, 59, 59, 999);
          params.endDate = e.toISOString();
        }

        const res = await apiClient.get(`${API_BASE}/inventory/movements`, {
          params,
        });
        setMovements(res.data?.data || []);
        const meta = res.data?.meta || {};
        setSummary(meta.summary || null);
        setTotal(meta.total ?? res.data?.data?.length ?? 0);
        setTotalPages(meta.totalPages ?? 1);
      } catch (e: any) {
        toast.error(
          e?.response?.data?.message || e?.message || "Failed to load movements",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      page,
      filterBranch,
      filterProductId,
      filterType,
      filterDirection,
      filterStart,
      filterEnd,
    ],
  );

  useEffect(() => {
    fetchProducts();
    fetchBranches();
  }, [fetchProducts, fetchBranches]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setProdDropdownOpen(false);
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

  const selectedProdName =
    products.find((p) => p.id === filterProductId)?.name || "";

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) => {
      const product = (m.product?.name || "").toLowerCase();
      const sku = (m.product?.sku || "").toLowerCase();
      const branch = (m.branch?.name || "").toLowerCase();
      const notes = (m.notes || "").toLowerCase();
      const ref = (m.reference_id || "").toLowerCase();
      const type = typeLabel(m.movement_type).toLowerCase();
      const user = (m.user?.email || "").toLowerCase();
      return (
        product.includes(q) ||
        sku.includes(q) ||
        branch.includes(q) ||
        notes.includes(q) ||
        ref.includes(q) ||
        type.includes(q) ||
        user.includes(q)
      );
    });
  }, [movements, searchQuery]);

  const pageStats = useMemo(() => {
    let inbound = 0;
    let outbound = 0;
    for (const m of filteredRows) {
      const q = Number(m.quantity_change) || 0;
      if (q > 0) inbound += q;
      else if (q < 0) outbound += Math.abs(q);
    }
    return { inbound, outbound, net: inbound - outbound };
  }, [filteredRows]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterBranch !== "all" ||
    filterType !== "all" ||
    filterDirection !== "all" ||
    filterProductId !== "all" ||
    !!filterStart ||
    !!filterEnd;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterType("all");
    setFilterDirection("all");
    setFilterProductId("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setProdSearch("");
    setPage(1);
  };

  const openDetail = (row: MovementRow) => {
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
        `movement-log-${Date.now()}.xlsx`,
        "Movements",
        [
          "Timestamp",
          "Type",
          "Product",
          "SKU",
          "Change",
          "Previous",
          "New",
          "Branch",
          "Reference",
          "Notes",
          "Operator",
        ],
        filteredRows.map((m) => [
          m.created_at ? new Date(m.created_at).toLocaleString() : "",
          typeLabel(m.movement_type),
          m.product?.name || "",
          m.product?.sku || "",
          Number(m.quantity_change) || 0,
          Number(m.previous_qty) || 0,
          Number(m.new_qty) || 0,
          m.branch?.name || "",
          m.reference_id || "",
          m.notes || "",
          m.user?.email || "System",
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
      const inbound = summary?.totalIncrease ?? pageStats.inbound;
      const outbound = summary?.totalDecrease ?? pageStats.outbound;
      await downloadBrandedPdf({
        filename: `movement-log-${Date.now()}.pdf`,
        title: "Stock Movement Log",
        subtitle: "Inventory activity audit trail",
        logoDataUri,
        summary: [
          { label: "Records", value: filteredRows.length.toLocaleString() },
          { label: "Inbound", value: `+${formatQty(inbound)}` },
          { label: "Outbound", value: `-${formatQty(outbound)}` },
        ],
        columns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "Type", width: 1.2 },
          { header: "Branch", width: 1.3 },
          { header: "Change", align: "right", width: 0.9 },
          { header: "New qty", align: "right", width: 0.9 },
        ],
        rows: filteredRows.map((m) => {
          const qty = Number(m.quantity_change) || 0;
          return [
            m.created_at ? new Date(m.created_at).toLocaleDateString() : "",
            m.product?.name || "",
            typeLabel(m.movement_type),
            m.branch?.name || "",
            `${qty > 0 ? "+" : ""}${formatQty(qty)}`,
            formatQty(Number(m.new_qty) || 0),
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

  if (loading && movements.length === 0 && branches.length === 0) {
    return <PageLoader message="Loading movement log..." />;
  }

  const kpiInbound = summary?.totalIncrease ?? 0;
  const kpiOutbound = summary?.totalDecrease ?? 0;
  const kpiNet = kpiInbound - kpiOutbound;
  const kpiCount = summary?.count ?? total;

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-600 mb-1">
            <History className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Stock ledger
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Movement Log
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Trace every stock in, out, transfer, sale, and adjustment
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm text-black"
            disabled={loading}
            onClick={() => fetchMovements(page)}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")}
            />
            Refresh
          </Button>
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
        loading={loading && movements.length === 0}
        items={[
          {
            label: "Activity (filtered)",
            value: kpiCount.toLocaleString(),
            icon: Activity,
          },
          {
            label: "Inbound units",
            value: `+${formatQty(kpiInbound)}`,
            icon: ArrowUpRight,
            tone: "success",
          },
          {
            label: "Outbound units",
            value: `-${formatQty(kpiOutbound)}`,
            icon: ArrowDownRight,
            tone: "danger",
          },
          {
            label: "Net flux",
            value: `${kpiNet > 0 ? "+" : ""}${formatQty(kpiNet)}`,
            icon: ArrowRightLeft,
          },
        ]}
      />

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
            <Label className="text-xs font-medium text-gray-500">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Product, SKU, branch, ref, notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 text-sm text-black"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">
              Activity type
            </Label>
            <Select
              value={filterType}
              onValueChange={(v) => {
                setFilterType(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 text-sm text-black">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  All types
                </SelectItem>
                {MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-sm">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-500">Branch</Label>
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
          </div>

          <div
            className="space-y-1.5 sm:col-span-2 xl:col-span-2 relative"
            ref={dropdownRef}
          >
            <Label className="text-xs font-medium text-gray-500">Product</Label>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                placeholder="Pick a product to filter…"
                className="h-10 pl-9 pr-9 text-sm text-black"
                value={
                  filterProductId === "all" ? prodSearch : selectedProdName
                }
                onFocus={() => {
                  setProdDropdownOpen(true);
                  if (filterProductId !== "all") {
                    setFilterProductId("all");
                    setProdSearch("");
                  }
                }}
                onChange={(e) => {
                  setProdSearch(e.target.value);
                  setProdDropdownOpen(true);
                }}
              />
              {filterProductId !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilterProductId("all");
                    setProdSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ) : null}
            </div>
            {prodDropdownOpen ? (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFilterProductId("all");
                    setProdDropdownOpen(false);
                    setProdSearch("");
                    setPage(1);
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
                    No matches found
                  </div>
                ) : (
                  filteredProd.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFilterProductId(p.id);
                        setProdDropdownOpen(false);
                        setProdSearch(p.name);
                        setPage(1);
                      }}
                      className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-none"
                    >
                      <span className="block font-medium text-black text-sm">
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
                  onSelect={(d) => {
                    setFilterStart(d);
                    setPage(1);
                  }}
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
                  onSelect={(d) => {
                    setFilterEnd(d);
                    setPage(1);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Showing {filteredRows.length.toLocaleString()} of{" "}
            {total.toLocaleString()} records
            {searchQuery.trim() ? " · text search on this page" : ""}
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

      {/* Direction tabs */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Tabs
          value={filterDirection}
          onValueChange={(v) => {
            setFilterDirection(v as "all" | "in" | "out");
            setPage(1);
          }}
        >
          <div className="bg-gray-50/60 overflow-x-auto">
            <TabsList className="h-auto w-full min-w-max justify-start gap-0 rounded-none bg-transparent p-0 inline-flex">
              {(
                [
                  { value: "all", label: "All movements", icon: Activity },
                  { value: "in", label: "Inbound", icon: ArrowUpRight },
                  { value: "out", label: "Outbound", icon: ArrowDownRight },
                ] as const
              ).map((s) => {
                const Icon = s.icon;
                return (
                  <TabsTrigger
                    key={s.value}
                    value={s.value}
                    className={cn(
                      "relative h-11 rounded-none border-0 bg-transparent px-4 text-sm font-medium shadow-none gap-2",
                      "text-gray-500 hover:text-gray-900 hover:bg-white/60",
                      "data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-none",
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent after:content-['']",
                      "data-[state=active]:after:bg-gray-900",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {s.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Activity feed</h2>
          <p className="text-xs text-gray-500">
            Chronological stock movements across all operations
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
          {loading && movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">Loading movements...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Package className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No movements found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try clearing filters or adjusting your search."
                  : "Stock activity will appear here as operations are recorded."}
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
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Product
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600">
                          Branch
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Change
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right">
                          Prev → New
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((m) => {
                        const ts = new Date(m.created_at);
                        const qty = Number(m.quantity_change) || 0;
                        return (
                          <TableRow key={m.id}>
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
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  typeTone(m.movement_type),
                                )}
                              >
                                {typeLabel(m.movement_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                {m.product?.name || "—"}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">
                                {m.product?.sku ||
                                  (m.reference_id
                                    ? `Ref ${m.reference_id.slice(0, 8)}`
                                    : "—")}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                {m.branch?.name || "—"}
                              </span>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-sm text-right tabular-nums font-semibold",
                                deltaTone(qty),
                              )}
                            >
                              {qty > 0 ? "+" : ""}
                              {formatQty(qty)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              <span className="text-gray-400">
                                {formatQty(Number(m.previous_qty) || 0)}
                              </span>
                              <span className="mx-1 text-gray-300">→</span>
                              <span className="font-medium text-gray-900">
                                {formatQty(Number(m.new_qty) || 0)}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => openDetail(m)}
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
                  {filteredRows.map((m) => {
                    const qty = Number(m.quantity_change) || 0;
                    return (
                      <TransactionRecordCard
                        key={m.id}
                        date={`${new Date(m.created_at).toLocaleDateString()} · ${new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        title={m.product?.name || "Product"}
                        subtitle={m.product?.sku}
                        meta={
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.branch?.name || "—"}
                          </span>
                        }
                        badge={
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold",
                              typeTone(m.movement_type),
                            )}
                          >
                            {typeLabel(m.movement_type)}
                          </Badge>
                        }
                        highlights={[
                          {
                            label: "Change",
                            value: `${qty > 0 ? "+" : ""}${formatQty(qty)}`,
                            tone:
                              qty > 0
                                ? "success"
                                : qty < 0
                                  ? "danger"
                                  : "default",
                          },
                          {
                            label: "Previous",
                            value: formatQty(Number(m.previous_qty) || 0),
                          },
                          {
                            label: "New",
                            value: formatQty(Number(m.new_qty) || 0),
                          },
                        ]}
                        footer={m.user?.email || m.notes || undefined}
                        actions={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => openDetail(m)}
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
              Movement detail
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Full audit record for this stock activity
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
                    typeTone(detailRow.movement_type),
                  )}
                >
                  {typeLabel(detailRow.movement_type)}
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
                    Operator
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5 truncate">
                    {detailRow.user?.email || "System"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 col-span-2">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Timestamp
                  </p>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {new Date(detailRow.created_at).toLocaleString()}
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
                    <p className="text-[11px] text-gray-500">Previous</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatQty(Number(detailRow.previous_qty) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Change</p>
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        deltaTone(Number(detailRow.quantity_change) || 0),
                      )}
                    >
                      {(Number(detailRow.quantity_change) || 0) > 0 ? "+" : ""}
                      {formatQty(Number(detailRow.quantity_change) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">New</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatQty(Number(detailRow.new_qty) || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {(detailRow.reference_id || detailRow.notes) && (
                <div className="space-y-2 text-sm">
                  {detailRow.reference_id ? (
                    <p>
                      <span className="text-gray-500">Reference: </span>
                      <span className="font-mono text-gray-900">
                        {detailRow.reference_id}
                      </span>
                      {detailRow.reference_type ? (
                        <span className="text-gray-400">
                          {" "}
                          ({detailRow.reference_type})
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {detailRow.notes ? (
                    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide inline-flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3" />
                        Notes
                      </p>
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {detailRow.notes}
                      </p>
                    </div>
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
