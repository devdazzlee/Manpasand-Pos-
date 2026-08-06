"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Search,
  TrendingUp,
  AlertTriangle,
  ArrowRightLeft,
  History,
  Clock,
  Box,
  Truck,
  X,
  Loader2,
  Package,
  FileBarChart2,
  MapPin,
  CalendarIcon,
  DollarSign,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { PageLoader } from "@/components/ui/page-loader";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { StockOpsActions } from "@/components/inventory/stock-ops/stock-ops-actions";
import {
  downloadExcel,
  downloadBrandedPdf,
  formatMoney,
  formatQty,
  yieldForUi,
} from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type ReportType =
  | "valuation"
  | "purchase"
  | "transfer"
  | "stockout"
  | "lowstock"
  | "aging"
  | "movement_summary";

const REPORT_TYPES: {
  value: ReportType;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
}[] = [
  {
    value: "valuation",
    label: "Stock Valuation",
    short: "Valuation",
    icon: Box,
    desc: "On-hand inventory worth by location",
  },
  {
    value: "purchase",
    label: "Procurement",
    short: "Purchases",
    icon: Truck,
    desc: "Incoming stock and purchase history",
  },
  {
    value: "transfer",
    label: "Transfers",
    short: "Transfers",
    icon: ArrowRightLeft,
    desc: "Inter-branch stock movements",
  },
  {
    value: "stockout",
    label: "Outflow",
    short: "Outflow",
    icon: TrendingUp,
    desc: "Sales, damage, loss, and expiry",
  },
  {
    value: "lowstock",
    label: "Critical Alerts",
    short: "Low stock",
    icon: AlertTriangle,
    desc: "Items at or below minimum levels",
  },
  {
    value: "aging",
    label: "Stock Aging",
    short: "Aging",
    icon: Clock,
    desc: "Slow-moving and dead stock",
  },
  {
    value: "movement_summary",
    label: "Movement Summary",
    short: "Summary",
    icon: History,
    desc: "Aggregated activity by movement type",
  },
];

function money(n: unknown) {
  return formatMoney(Number(n) || 0);
}

function statusTone(status?: string) {
  switch ((status || "").toUpperCase()) {
    case "RECEIVED":
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "DISPATCHED":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "PENDING":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "CANCELLED":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  disabled,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  disabled?: boolean;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200">
      <p className="text-sm text-gray-600">
        Showing {(page - 1) * pageSize + 1}–
        {Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="text-sm text-black"
          onClick={() => onPage(1)}
          disabled={page === 1 || disabled}
        >
          First
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-sm text-black"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1 || disabled}
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
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || disabled}
        >
          Next
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-sm text-black"
          onClick={() => onPage(totalPages)}
          disabled={page >= totalPages || disabled}
        >
          Last
        </Button>
      </div>
    </div>
  );
}

export function InventoryReports() {
  const logoDataUri = useLogoDataUri();
  const { branches, suppliers, fetchBranches, fetchSuppliers } = usePosData();

  const [reportType, setReportType] = useState<ReportType>("valuation");
  const [data, setData] = useState<any>(null);
  const [loadedType, setLoadedType] = useState<ReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [locationFocus, setLocationFocus] = useState("all");

  const [page, setPage] = useState(1);
  useScrollToTopOnPageChange(page);

  const activeReport = REPORT_TYPES.find((r) => r.value === reportType)!;

  const fetchReport = useCallback(async () => {
    const requestedType = reportType;
    setLoading(true);
    try {
      const params: Record<string, string> = { type: requestedType };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (requestedType === "purchase" && filterSupplier !== "all") {
        params.supplierId = filterSupplier;
      }
      if (filterStart) params.startDate = filterStart.toISOString();
      if (filterEnd) {
        const e = new Date(filterEnd);
        e.setHours(23, 59, 59, 999);
        params.endDate = e.toISOString();
      }
      const res = await apiClient.get("/inventory/reports", { params });
      setData(res.data?.data || res.data);
      setLoadedType(requestedType);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load report");
      setData(null);
      setLoadedType(requestedType);
    } finally {
      setLoading(false);
    }
  }, [reportType, filterBranch, filterSupplier, filterStart, filterEnd]);

  useEffect(() => {
    fetchBranches();
    fetchSuppliers();
  }, [fetchBranches, fetchSuppliers]);

  useEffect(() => {
    setPage(1);
    setLocationFocus("all");
    setSearchQuery("");
    fetchReport();
  }, [fetchReport]);

  // Only treat data as ready when it matches the active tab — avoids
  // flashing "0" / empty rows from the previous report's shape.
  const dataReady = loadedType === reportType && data != null;
  const awaitingReport = loading || !dataReady;
  const summary = dataReady ? data?.summary || {} : {};

  const valuationLocations = useMemo(() => {
    if (!dataReady || reportType !== "valuation" || !data?.byLocation) return [];
    return Object.entries(data.byLocation).map(([bid, loc]: [string, any]) => ({
      id: bid,
      name: branches.find((b) => b.id === bid)?.name || "Unknown location",
      value: Number(loc.value) || 0,
      items: (loc.items || []) as any[],
    }));
  }, [dataReady, reportType, data, branches]);

  const flatValuationRows = useMemo(() => {
    if (!dataReady || reportType !== "valuation") return [];
    const locs =
      locationFocus === "all"
        ? valuationLocations
        : valuationLocations.filter((l) => l.id === locationFocus);
    const rows: any[] = [];
    for (const loc of locs) {
      for (const item of loc.items) {
        rows.push({
          ...item,
          branchId: loc.id,
          branchName: loc.name,
        });
      }
    }
    return rows;
  }, [dataReady, reportType, valuationLocations, locationFocus]);

  const listRows = useMemo(() => {
    if (!dataReady) return [];
    if (reportType === "valuation") return flatValuationRows;
    return Array.isArray(data?.data) ? data.data : [];
  }, [dataReady, reportType, flatValuationRows, data]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return listRows;
    return listRows.filter((d: any) => {
      const hay = [
        d.product?.name,
        d.product?.sku,
        d.branch?.name,
        d.branchName,
        d.supplier?.name,
        d.from_branch?.name,
        d.to_branch?.name,
        d.warehouse_branch?.name,
        d.movement_type,
        d.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [listRows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, locationFocus, reportType]);

  const showDateFilters = ![
    "valuation",
    "lowstock",
  ].includes(reportType);
  const showSupplierFilter = reportType === "purchase";

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterBranch !== "all" ||
    filterSupplier !== "all" ||
    !!filterStart ||
    !!filterEnd ||
    locationFocus !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterSupplier("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setLocationFocus("all");
    setPage(1);
  };

  const kpiItems = useMemo(() => {
    switch (reportType) {
      case "valuation":
        return [
          {
            label: "Total value",
            value: money(summary.totalValue || data?.totalValue || 0),
            icon: DollarSign,
          },
          {
            label: "SKUs tracked",
            value: (summary.totalItems || 0).toLocaleString(),
            icon: Package,
          },
          {
            label: "Locations",
            value: (summary.locationsCount || 0).toLocaleString(),
            icon: MapPin,
          },
          {
            label: "Rows (view)",
            value: filteredRows.length.toLocaleString(),
            icon: Box,
          },
        ];
      case "purchase":
        return [
          {
            label: "Total spend",
            value: money(summary.totalCost || 0),
            icon: DollarSign,
          },
          {
            label: "Records",
            value: (summary.count || 0).toLocaleString(),
            icon: Truck,
          },
          {
            label: "Avg line value",
            value: money(summary.avgPrice || 0),
            icon: TrendingUp,
          },
          {
            label: "Filtered rows",
            value: filteredRows.length.toLocaleString(),
            icon: Search,
          },
        ];
      case "transfer":
        return [
          {
            label: "Transfers",
            value: (summary.count || filteredRows.length).toLocaleString(),
            icon: ArrowRightLeft,
          },
          {
            label: "Received",
            value: (summary.completed || 0).toLocaleString(),
            icon: Package,
            tone: "success" as const,
          },
          {
            label: "Filtered rows",
            value: filteredRows.length.toLocaleString(),
            icon: Search,
          },
        ];
      case "stockout":
        return [
          {
            label: "Events",
            value: (summary.count || 0).toLocaleString(),
            icon: TrendingUp,
          },
          {
            label: "Units out",
            value: formatQty(summary.totalQty || 0),
            icon: Package,
            tone: "danger" as const,
          },
          {
            label: "Damage events",
            value: (summary.damageCount || 0).toLocaleString(),
            icon: AlertTriangle,
            tone: "warning" as const,
          },
          {
            label: "Filtered rows",
            value: filteredRows.length.toLocaleString(),
            icon: Search,
          },
        ];
      case "lowstock":
        return [
          {
            label: "Alerts",
            value: (summary.warningCount || filteredRows.length).toLocaleString(),
            icon: AlertTriangle,
            tone: "warning" as const,
          },
          {
            label: "Out of stock",
            value: (summary.criticalCount || 0).toLocaleString(),
            icon: Package,
            tone: "danger" as const,
          },
          {
            label: "Filtered rows",
            value: filteredRows.length.toLocaleString(),
            icon: Search,
          },
        ];
      case "aging":
        return [
          {
            label: "Avg age (days)",
            value: Math.round(summary.avgAge || 0).toLocaleString(),
            icon: Clock,
          },
          {
            label: "Dead stock (>90d)",
            value: (summary.deadStockCount || 0).toLocaleString(),
            icon: AlertTriangle,
            tone: "danger" as const,
          },
          {
            label: "Filtered rows",
            value: filteredRows.length.toLocaleString(),
            icon: Search,
          },
        ];
      case "movement_summary":
        return [
          {
            label: "Total movements",
            value: (summary.totalMovements || 0).toLocaleString(),
            icon: History,
          },
          {
            label: "Activity types",
            value: filteredRows.length.toLocaleString(),
            icon: Box,
          },
        ];
      default:
        return [
          {
            label: "Records",
            value: filteredRows.length.toLocaleString(),
            icon: FileBarChart2,
          },
        ];
    }
  }, [reportType, summary, data, filteredRows.length]);

  const buildExportPayload = () => {
    if (reportType === "valuation") {
      return {
        headers: ["Product", "SKU", "Branch", "Qty", "Unit value", "Total value"],
        rows: filteredRows.map((item: any) => {
          const qty = Number(item.quantity) || 0;
          const unit =
            item.product?.purchase_rate != null
              ? Number(item.product.purchase_rate)
              : qty !== 0
                ? (Number(item.value) || 0) / qty
                : 0;
          return [
            item.product?.name || "",
            item.product?.sku || "",
            item.branchName || "",
            qty,
            unit,
            Number(item.value) || 0,
          ];
        }),
        pdfColumns: [
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.3 },
          { header: "Qty", align: "right" as const, width: 0.8 },
          { header: "Value", align: "right" as const, width: 1.1 },
        ],
        pdfRows: filteredRows.map((item: any) => [
          item.product?.name || "",
          item.branchName || "",
          formatQty(item.quantity),
          money(item.value),
        ]),
      };
    }
    if (reportType === "purchase") {
      return {
        headers: ["Date", "Product", "Supplier", "Qty", "Cost", "Warehouse", "Line total"],
        rows: filteredRows.map((d: any) => {
          const qty = Number(d.quantity) || 0;
          const cost = Number(d.cost_price) || 0;
          return [
            d.purchase_date ? new Date(d.purchase_date).toLocaleString() : "",
            d.product?.name || "",
            d.supplier?.name || "",
            qty,
            cost,
            d.warehouse_branch?.name || "",
            qty * cost,
          ];
        }),
        pdfColumns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "Supplier", width: 1.4 },
          { header: "Qty", align: "right" as const, width: 0.7 },
          { header: "Total", align: "right" as const, width: 1 },
        ],
        pdfRows: filteredRows.map((d: any) => {
          const qty = Number(d.quantity) || 0;
          const cost = Number(d.cost_price) || 0;
          return [
            d.purchase_date
              ? new Date(d.purchase_date).toLocaleDateString()
              : "",
            d.product?.name || "",
            d.supplier?.name || "",
            formatQty(qty),
            money(qty * cost),
          ];
        }),
      };
    }
    if (reportType === "transfer") {
      return {
        headers: ["Date", "Product", "From", "To", "Qty", "Status"],
        rows: filteredRows.map((d: any) => [
          d.transfer_date ? new Date(d.transfer_date).toLocaleString() : "",
          d.product?.name || "",
          d.from_branch?.name || "",
          d.to_branch?.name || "",
          Number(d.quantity) || 0,
          d.status || "",
        ]),
        pdfColumns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "From", width: 1.2 },
          { header: "To", width: 1.2 },
          { header: "Qty", align: "right" as const, width: 0.7 },
          { header: "Status", width: 1 },
        ],
        pdfRows: filteredRows.map((d: any) => [
          d.transfer_date
            ? new Date(d.transfer_date).toLocaleDateString()
            : "",
          d.product?.name || "",
          d.from_branch?.name || "",
          d.to_branch?.name || "",
          formatQty(d.quantity),
          d.status || "",
        ]),
      };
    }
    if (reportType === "stockout") {
      return {
        headers: ["Date", "Product", "Branch", "Qty", "Type"],
        rows: filteredRows.map((d: any) => [
          d.created_at ? new Date(d.created_at).toLocaleString() : "",
          d.product?.name || "",
          d.branch?.name || "",
          Math.abs(Number(d.quantity_change) || 0),
          d.movement_type || "",
        ]),
        pdfColumns: [
          { header: "Date", width: 1.1 },
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.3 },
          { header: "Qty", align: "right" as const, width: 0.8 },
          { header: "Type", width: 1.1 },
        ],
        pdfRows: filteredRows.map((d: any) => [
          d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
          d.product?.name || "",
          d.branch?.name || "",
          formatQty(Math.abs(Number(d.quantity_change) || 0)),
          d.movement_type || "",
        ]),
      };
    }
    if (reportType === "lowstock") {
      return {
        headers: ["Product", "SKU", "Branch", "Qty", "Min", "Status"],
        rows: filteredRows.map((d: any) => {
          const qty = Number(d.current_quantity) || 0;
          return [
            d.product?.name || "",
            d.product?.sku || "",
            d.branch?.name || "",
            qty,
            Number(d.product?.min_qty ?? d.minimum_quantity ?? 0),
            qty <= 0 ? "OUT OF STOCK" : "LOW",
          ];
        }),
        pdfColumns: [
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.3 },
          { header: "Qty", align: "right" as const, width: 0.8 },
          { header: "Min", align: "right" as const, width: 0.8 },
          { header: "Status", width: 1.1 },
        ],
        pdfRows: filteredRows.map((d: any) => {
          const qty = Number(d.current_quantity) || 0;
          return [
            d.product?.name || "",
            d.branch?.name || "",
            formatQty(qty),
            formatQty(d.product?.min_qty ?? d.minimum_quantity ?? 0),
            qty <= 0 ? "OUT" : "LOW",
          ];
        }),
      };
    }
    if (reportType === "aging") {
      return {
        headers: ["Product", "Branch", "Qty", "Days old", "Last action"],
        rows: filteredRows.map((d: any) => [
          d.product?.name || "",
          d.branch?.name || "",
          Number(d.currentQuantity) || 0,
          Number(d.daysOld) || 0,
          d.lastAction ? new Date(d.lastAction).toLocaleDateString() : "",
        ]),
        pdfColumns: [
          { header: "Product", width: 2 },
          { header: "Branch", width: 1.3 },
          { header: "Qty", align: "right" as const, width: 0.8 },
          { header: "Days", align: "right" as const, width: 0.8 },
          { header: "Last", width: 1.1 },
        ],
        pdfRows: filteredRows.map((d: any) => [
          d.product?.name || "",
          d.branch?.name || "",
          formatQty(d.currentQuantity),
          String(d.daysOld ?? 0),
          d.lastAction ? new Date(d.lastAction).toLocaleDateString() : "",
        ]),
      };
    }
    // movement_summary
    return {
      headers: ["Activity type", "Occurrences", "Net qty change"],
      rows: filteredRows.map((d: any) => [
        d.movement_type || "",
        typeof d._count === "number" ? d._count : d._count?._all ?? 0,
        Number(d._sum?.quantity_change || 0),
      ]),
      pdfColumns: [
        { header: "Type", width: 2 },
        { header: "Events", align: "right" as const, width: 1 },
        { header: "Net qty", align: "right" as const, width: 1.2 },
      ],
      pdfRows: filteredRows.map((d: any) => {
        const net = Number(d._sum?.quantity_change || 0);
        return [
          d.movement_type || "",
          String(typeof d._count === "number" ? d._count : d._count?._all ?? 0),
          `${net > 0 ? "+" : ""}${formatQty(net)}`,
        ];
      }),
    };
  };

  const exportExcel = async () => {
    if (filteredRows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    setExporting(true);
    await yieldForUi();
    try {
      const payload = buildExportPayload();
      downloadExcel(
        `inventory-${reportType}-${Date.now()}.xlsx`,
        activeReport.short,
        payload.headers,
        payload.rows,
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
      const payload = buildExportPayload();
      await downloadBrandedPdf({
        filename: `inventory-${reportType}-${Date.now()}.pdf`,
        title: activeReport.label,
        subtitle: activeReport.desc,
        logoDataUri,
        summary: kpiItems.slice(0, 3).map((k) => ({
          label: k.label,
          value: String(k.value),
        })),
        columns: payload.pdfColumns,
        rows: payload.pdfRows,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (awaitingReport && !data && branches.length === 0) {
    return <PageLoader message="Loading inventory reports..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-600 mb-1">
            <FileBarChart2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Analytics
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Inventory Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Valuation, procurement, transfers, alerts, and movement insights
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <StockOpsActions
            onExportExcel={exportExcel}
            onExportPdf={exportPdf}
            disabled={awaitingReport || filteredRows.length === 0}
            exporting={exporting}
          />
        </div>
      </div>

      {/* Report type tabs */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Tabs
          value={reportType}
          onValueChange={(v) => setReportType(v as ReportType)}
          className="w-full"
        >
          <div className="border-b border-gray-200 bg-gray-50/60 overflow-x-auto">
            <TabsList
              className={cn(
                "h-auto w-full min-w-max justify-start gap-0 rounded-none bg-transparent p-0",
                "inline-flex",
              )}
            >
              {REPORT_TYPES.map((r) => {
                const Icon = r.icon;
                return (
                  <TabsTrigger
                    key={r.value}
                    value={r.value}
                    className={cn(
                      "relative h-11 rounded-none border-0 bg-transparent px-4 text-sm font-medium shadow-none",
                      "text-gray-500 hover:text-gray-900 hover:bg-white/60",
                      "data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-none",
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent after:content-['']",
                      "data-[state=active]:after:bg-gray-900",
                      "gap-2",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{r.short}</span>
                    <span className="sm:hidden">{r.short.split(" ")[0]}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </Tabs>

        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">
              {activeReport.label}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{activeReport.desc}</p>
          </div>
          {reportType === "valuation" && valuationLocations.length > 0 ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 self-start overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setLocationFocus("all")}
                className={cn(
                  "h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  locationFocus === "all"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900",
                )}
              >
                All locations
              </button>
              {valuationLocations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setLocationFocus(loc.id)}
                  className={cn(
                    "h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1.5",
                    locationFocus === loc.id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  <MapPin className="h-3 w-3 text-gray-400" />
                  {loc.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <InventoryKpiGrid
        columns={kpiItems.length >= 4 ? 4 : 3}
        loading={awaitingReport}
        items={kpiItems}
      />

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search product, SKU, branch, supplier…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm text-black"
            />
          </div>

          <Select
            value={filterBranch}
            onValueChange={(v) => setFilterBranch(v)}
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

          {showSupplierFilter ? (
            <Select
              value={filterSupplier}
              onValueChange={(v) => setFilterSupplier(v)}
            >
              <SelectTrigger className="h-10 text-sm text-black">
                <SelectValue placeholder="Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  All suppliers
                </SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-sm">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {showDateFilters ? (
            <>
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
                    onSelect={setFilterStart}
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
                    onSelect={setFilterEnd}
                  />
                </PopoverContent>
              </Popover>
            </>
          ) : null}

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
          Showing {pagedRows.length.toLocaleString()} of{" "}
          {filteredRows.length.toLocaleString()} rows
          {searchQuery.trim() ? " (search applied)" : ""}
        </p>
      </div>

      {/* Results */}
      <Card className="border border-gray-200 overflow-hidden bg-white shadow-sm">
        <CardContent className="p-0 relative">
          {awaitingReport ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 mt-3">Generating report...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Package className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No report data found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasActiveFilters
                  ? "Try clearing filters or adjusting your search."
                  : "No records match this report yet."}
              </p>
            </div>
          ) : (
            <>
              {loading ? (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      {reportType === "valuation" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Branch
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Unit value
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Total value
                          </TableHead>
                        </>
                      )}
                      {reportType === "purchase" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Supplier
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Unit cost
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Line total
                          </TableHead>
                        </>
                      )}
                      {reportType === "transfer" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Route
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Status
                          </TableHead>
                        </>
                      )}
                      {reportType === "stockout" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Branch
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Reason
                          </TableHead>
                        </>
                      )}
                      {reportType === "lowstock" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Branch
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            In stock
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Min
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Status
                          </TableHead>
                        </>
                      )}
                      {reportType === "aging" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Product
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">
                            Branch
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Days old
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Last movement
                          </TableHead>
                        </>
                      )}
                      {reportType === "movement_summary" && (
                        <>
                          <TableHead className="text-xs font-semibold text-gray-600 pl-3">
                            Activity type
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">
                            Occurrences
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right pr-3">
                            Net qty change
                          </TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.map((d: any, i: number) => {
                      if (reportType === "valuation") {
                        const qty = Number(d.quantity) || 0;
                        const unit =
                          d.product?.purchase_rate != null
                            ? Number(d.product.purchase_rate)
                            : qty !== 0
                              ? (Number(d.value) || 0) / qty
                              : 0;
                        const val = Number(d.value) || 0;
                        return (
                          <TableRow key={`${d.branchId}-${d.product?.id || i}`}>
                            <TableCell className="py-2.5 pl-3">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                {d.product?.name || "—"}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">
                                {d.product?.sku || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                {d.branchName}
                              </span>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 text-sm text-right tabular-nums font-medium",
                                qty < 0 && "text-rose-700",
                              )}
                            >
                              {formatQty(qty)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              {money(unit)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-2.5 pr-3 text-sm text-right tabular-nums font-semibold",
                                val < 0 && "text-rose-700",
                              )}
                            >
                              {money(val)}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (reportType === "purchase") {
                        const qty = Number(d.quantity) || 0;
                        const cost = Number(d.cost_price) || 0;
                        return (
                          <TableRow key={d.id || i}>
                            <TableCell className="py-2.5 pl-3 text-sm text-gray-700 whitespace-nowrap">
                              {d.purchase_date
                                ? new Date(d.purchase_date).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm font-medium text-gray-900">
                              {d.product?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-600">
                              {d.supplier?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums">
                              {formatQty(qty)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              {money(cost)}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-sm text-right tabular-nums font-semibold">
                              {money(qty * cost)}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (reportType === "transfer") {
                        return (
                          <TableRow key={d.id || i}>
                            <TableCell className="py-2.5 pl-3 text-sm text-gray-700 whitespace-nowrap">
                              {d.transfer_date
                                ? new Date(d.transfer_date).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm font-medium text-gray-900">
                              {d.product?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-700">
                              {d.from_branch?.name || "—"} →{" "}
                              {d.to_branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                              {formatQty(d.quantity)}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  statusTone(d.status),
                                )}
                              >
                                {d.status || "—"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (reportType === "stockout") {
                        return (
                          <TableRow key={d.id || i}>
                            <TableCell className="py-2.5 pl-3 text-sm text-gray-700 whitespace-nowrap">
                              {d.created_at
                                ? new Date(d.created_at).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm font-medium text-gray-900">
                              {d.product?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-600">
                              {d.branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-semibold text-rose-700">
                              {formatQty(
                                Math.abs(Number(d.quantity_change) || 0),
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold"
                              >
                                {d.movement_type || "—"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (reportType === "lowstock") {
                        const qty = Number(d.current_quantity) || 0;
                        const out = qty <= 0;
                        return (
                          <TableRow key={d.id || i}>
                            <TableCell className="py-2.5 pl-3">
                              <p className="text-sm font-medium text-gray-900">
                                {d.product?.name || "—"}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">
                                {d.product?.sku || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-600">
                              {d.branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums font-semibold text-rose-700">
                              {formatQty(qty)}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums text-gray-600">
                              {formatQty(
                                d.product?.min_qty ?? d.minimum_quantity ?? 0,
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  out
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : "bg-amber-50 text-amber-800 border-amber-200",
                                )}
                              >
                                {out ? "Out of stock" : "Low"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      if (reportType === "aging") {
                        const days = Number(d.daysOld) || 0;
                        return (
                          <TableRow key={`${d.product?.id}-${d.branch?.id}-${i}`}>
                            <TableCell className="py-2.5 pl-3 text-sm font-medium text-gray-900">
                              {d.product?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-gray-600">
                              {d.branch?.name || "—"}
                            </TableCell>
                            <TableCell className="py-2.5 text-sm text-right tabular-nums">
                              {formatQty(d.currentQuantity)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold",
                                  days > 90
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : days > 30
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-gray-50 text-gray-700 border-gray-200",
                                )}
                              >
                                {days} days
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 pr-3 text-sm text-right text-gray-600">
                              {d.lastAction
                                ? new Date(d.lastAction).toLocaleDateString()
                                : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // movement_summary
                      const count =
                        typeof d._count === "number"
                          ? d._count
                          : d._count?._all ?? 0;
                      const net = Number(d._sum?.quantity_change || 0);
                      return (
                        <TableRow key={d.movement_type || i}>
                          <TableCell className="py-2.5 pl-3 text-sm font-medium text-gray-900">
                            {d.movement_type || "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm text-right tabular-nums">
                            {count.toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "py-2.5 pr-3 text-sm text-right tabular-nums font-semibold",
                              net > 0
                                ? "text-emerald-700"
                                : net < 0
                                  ? "text-rose-700"
                                  : "text-gray-700",
                            )}
                          >
                            {net > 0 ? "+" : ""}
                            {formatQty(net)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                total={filteredRows.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                disabled={loading}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
