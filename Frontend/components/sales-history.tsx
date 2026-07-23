"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Printer,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Receipt,
  MoreHorizontal,
  Download,
  Trash2,
  Pencil,
  FileSpreadsheet,
  FileText,
  Filter,
  X,
  Building2,
  User,
  CreditCard,
  CalendarIcon,
} from "lucide-react";
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns";
import * as XLSX from "xlsx";
import { isKioskMode } from "@/utils/kiosk-printing";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import {
  prepareReceiptDataFromSale,
  generateReceiptHtml,
  receiptPageWrapper,
  downloadReceiptPdf,
  shareReceiptOnWhatsApp,
} from "@/lib/receipt";
import { EditSaleDialog } from "@/components/edit-sale-dialog";

interface SaleItem {
  id: string;
  product_id?: string;
  product: {
    id?: string;
    name: string;
    sku?: string;
    code?: string;
    barcode?: string;
    unit?: { name?: string };
    unit_name?: string;
  };
  quantity: number;
  unit_price?: string;
  discount_amount?: string;
  line_total: string;
}

interface Customer {
  id: string;
  email?: string | null;
  name?: string | null;
  phone_number?: string | null;
  mobile_number?: string | null;
}

interface Branch {
  id: string;
  name: string;
  address?: string;
}

interface Cashier {
  id: string;
  email: string;
  role?: string;
}

interface Sale {
  id: string;
  sale_number: string;
  invoice_number?: string | null;
  sale_date: string;
  total_amount: string;
  subtotal?: string;
  tax_amount?: string;
  discount_amount?: string;
  payment_method: string;
  payment_status?: string;
  status: string;
  notes?: string | null;
  customer: Customer | null;
  sale_items: SaleItem[];
  created_at?: string;
  updated_at?: string;
  branch?: Branch | null;
  user?: Cashier | null;
  original_sale_id?: string | null;
  original_sale?: { id: string; sale_number: string } | null;
  return_sales?: Array<{
    id: string;
    sale_number: string;
    sale_date: string;
    total_amount: string;
    status: string;
  }>;
  _count?: { return_sales?: number };
}

interface SalesSummary {
  totalSales: number;
  totalOrders: number;
  completedOrders: number;
  totalRefunds: number;
  refundCount: number;
  averageOrderValue: number;
  totalTaxCollected: number;
  totalDiscounts: number;
}

interface BranchOption {
  id: string;
  name: string;
}

type DatePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom";
type SortField =
  | "sale_date"
  | "sale_number"
  | "total_amount"
  | "subtotal"
  | "discount_amount"
  | "tax_amount"
  | "payment_method"
  | "payment_status"
  | "status";

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "CREDIT",
] as const;

const PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING", "OVERDUE"] as const;
const ORDER_STATUSES = [
  "COMPLETED",
  "PENDING",
  "CANCELLED",
  "REFUNDED",
  "EXCHANGED",
] as const;

const EMPTY_SUMMARY: SalesSummary = {
  totalSales: 0,
  totalOrders: 0,
  completedOrders: 0,
  totalRefunds: 0,
  refundCount: 0,
  averageOrderValue: 0,
  totalTaxCollected: 0,
  totalDiscounts: 0,
};

const formatCurrency = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === "") return "Rs 0.00";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(numValue)) return "Rs 0.00";
  const abs = Math.abs(numValue).toFixed(2);
  return numValue < 0 ? `-Rs ${abs}` : `Rs ${abs}`;
};

const toNumber = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isNaN(n) ? 0 : n;
};

const customerLabel = (sale: Sale): string =>
  sale.customer?.name ||
  sale.customer?.email ||
  sale.customer?.phone_number ||
  sale.customer?.mobile_number ||
  "Guest";

const cashierLabel = (sale: Sale): string =>
  sale.user?.email?.split("@")[0] || sale.user?.email || "—";

const itemCount = (sale: Sale): number => sale.sale_items?.length || 0;

const totalQuantity = (sale: Sale): number =>
  (sale.sale_items || []).reduce((sum, item) => sum + Math.abs(Number(item.quantity) || 0), 0);

const getDateRange = (preset: DatePreset): { start?: Date; end?: Date } => {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    default:
      return {};
  }
};

const statusBadgeVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "REFUNDED":
    case "CANCELLED":
      return "destructive";
    case "PENDING":
      return "secondary";
    default:
      return "outline";
  }
};

const paymentStatusVariant = (
  status?: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "PAID":
      return "default";
    case "PARTIAL":
      return "secondary";
    case "OVERDUE":
      return "destructive";
    default:
      return "outline";
  }
};

export function SalesHistory() {
  const { toast } = useToast();
  const { receiptPrinter, getReceiptPrinterObj } = usePrinterSettings();
  const logoDataUri = useLogoDataUri();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SalesSummary>(EMPTY_SUMMARY);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [orderStatus, setOrderStatus] = useState<string>("all");
  const [cashierId, setCashierId] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalSales, setTotalSales] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("sale_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [receiptHtml, setReceiptHtml] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [kioskMode, setKioskMode] = useState(false);
  const [branchInfo, setBranchInfo] = useState({
    name: "MANPASAND GENERAL STORE",
    address: "Karachi",
  });
  const [exporting, setExporting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [actionBusy, setActionBusy] = useState<{
    saleId: string;
    action: string;
  } | null>(null);

  const userRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const canManageSales = isAdmin || userRole === "BRANCH_MANAGER";

  const isSaleBusy = (saleId: string, action?: string) =>
    !!actionBusy &&
    actionBusy.saleId === saleId &&
    (!action || actionBusy.action === action);

  const runSaleAction = async (
    saleId: string,
    action: string,
    fn: () => void | Promise<void>,
  ) => {
    if (actionBusy) return;
    setActionBusy({ saleId, action });
    try {
      await fn();
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setKioskMode(isKioskMode());
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    datePreset,
    customStart,
    customEnd,
    paymentMethod,
    paymentStatus,
    orderStatus,
    cashierId,
    branchFilter,
    pageSize,
  ]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const branchStr = localStorage.getItem("branch");
        if (branchStr && branchStr !== "Not Found" && !isAdmin) {
          const branchRes = await apiClient.get(`/branches/${branchStr}`);
          setBranchInfo({
            name: branchRes.data.data.name || branchStr,
            address: branchRes.data.data.address || "Karachi",
          });
        }

        if (isAdmin) {
          const branchesRes = await apiClient.get("/branches", {
            params: { fetch_all: true, is_active: true },
          });
          const list = Array.isArray(branchesRes.data?.data)
            ? branchesRes.data.data
            : branchesRes.data?.data?.data || [];
          setBranches(
            list.map((b: any) => ({ id: b.id, name: b.name })).filter((b: BranchOption) => b.id),
          );
        }
      } catch (error) {
        console.warn("Failed to load lookups", error);
      }
    };
    loadLookups();
  }, [isAdmin]);

  const resolveDateParams = useCallback(() => {
    if (datePreset === "custom") {
      return {
        startDate: customStart ? startOfDay(new Date(customStart)).toISOString() : undefined,
        endDate: customEnd ? endOfDay(new Date(customEnd)).toISOString() : undefined,
      };
    }
    const range = getDateRange(datePreset);
    return {
      startDate: range.start?.toISOString(),
      endDate: range.end?.toISOString(),
    };
  }, [datePreset, customStart, customEnd]);

  const buildParams = useCallback(
    (overrides?: { page?: number; limit?: number; forExport?: boolean }) => {
      const params: Record<string, string> = {};
      const storedBranch = localStorage.getItem("branch");
      const role = localStorage.getItem("role");
      const admin = role === "ADMIN" || role === "SUPER_ADMIN";

      // Branch users: always scoped to login branch.
      // Admins: all branches unless a branch filter is chosen.
      if (admin) {
        if (branchFilter !== "all") {
          params.branchId = branchFilter;
        }
      } else if (storedBranch && storedBranch !== "Not Found" && storedBranch.trim()) {
        params.branchId = storedBranch.trim();
      }

      if (!overrides?.forExport) {
        params.page = String(overrides?.page ?? currentPage);
        params.limit = String(overrides?.limit ?? pageSize);
      } else if (overrides.limit) {
        params.page = "1";
        params.limit = String(overrides.limit);
      }

      if (debouncedSearch) params.search = debouncedSearch;
      if (paymentMethod !== "all") params.paymentMethod = paymentMethod;
      if (paymentStatus !== "all") params.paymentStatus = paymentStatus;
      if (orderStatus !== "all") params.status = orderStatus;
      if (cashierId !== "all") params.cashierId = cashierId;

      const { startDate, endDate } = resolveDateParams();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      params.sortBy = sortBy;
      params.sortOrder = sortOrder;
      return params;
    },
    [
      branchFilter,
      currentPage,
      pageSize,
      debouncedSearch,
      paymentMethod,
      paymentStatus,
      orderStatus,
      cashierId,
      resolveDateParams,
      sortBy,
      sortOrder,
    ],
  );

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        data: Sale[];
        meta?: {
          total?: number;
          totalPages?: number;
          page?: number;
          limit?: number;
          summary?: SalesSummary;
          cashiers?: Cashier[];
        };
      }>("/sale", { params: buildParams() });

      const validSales = (res.data.data || []).filter(
        (sale) => sale.id && sale.sale_number && sale.sale_date && sale.total_amount !== undefined,
      );

      setSales(validSales);
      setTotalSales(res.data.meta?.total ?? validSales.length);
      setTotalPages(res.data.meta?.totalPages ?? 1);
      setSummary(res.data.meta?.summary || EMPTY_SUMMARY);
      if (Array.isArray(res.data.meta?.cashiers)) {
        setCashiers(res.data.meta.cashiers);
      }
    } catch (err) {
      console.error("Failed to fetch sales:", err);
      toast({ title: "Failed to load sales", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [buildParams, toast]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Refresh receipt preview once logo is available
  useEffect(() => {
    if (!viewSale || !logoDataUri || !receiptData) return;
    setReceiptHtml(receiptPageWrapper(generateReceiptHtml(receiptData, logoDataUri)));
  }, [logoDataUri, viewSale, receiptData]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count += 1;
    if (datePreset !== "all") count += 1;
    if (paymentMethod !== "all") count += 1;
    if (paymentStatus !== "all") count += 1;
    if (orderStatus !== "all") count += 1;
    if (cashierId !== "all") count += 1;
    if (branchFilter !== "all") count += 1;
    return count;
  }, [
    debouncedSearch,
    datePreset,
    paymentMethod,
    paymentStatus,
    orderStatus,
    cashierId,
    branchFilter,
  ]);

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setDatePreset("all");
    setCustomStart("");
    setCustomEnd("");
    setPaymentMethod("all");
    setPaymentStatus("all");
    setOrderStatus("all");
    setCashierId("all");
    setBranchFilter("all");
  };

  const openEditSale = (sale: Sale) => {
    // Open immediately so the dialog shows its own loader while fetching.
    setEditSale(sale);
  };

  const fetchSaleDetails = async (sale: Sale): Promise<Sale> => {
    try {
      const res = await apiClient.get(`/sale/${sale.id}`);
      return res.data?.data || sale;
    } catch {
      return sale;
    }
  };

  const handleDeleteSale = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/sale/${deleteTarget.id}`);
      toast({ title: "Sale deleted" });
      setDeleteTarget(null);
      fetchSales();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error?.response?.data?.message || error?.message || "Unable to delete sale",
      });
    } finally {
      setDeleting(false);
    }
  };

  const buildReceiptFromSale = (sale: Sale): ReceiptData => {
    const data = prepareReceiptDataFromSale(sale, {
      name: sale.branch?.name || branchInfo.name,
      address: sale.branch?.address || branchInfo.address,
    });
    if (sale.user?.email) {
      data.cashier = sale.user.email.split("@")[0] || sale.user.email;
    }
    return data;
  };

  const openSaleDetails = async (sale: Sale, showReceipt = true) => {
    await runSaleAction(sale.id, "view", async () => {
      setViewLoading(true);
      setViewSale(sale);
      try {
        const detailed = await fetchSaleDetails(sale);
        setViewSale(detailed);
        const data = buildReceiptFromSale(detailed);
        setReceiptData(data);
        if (showReceipt) {
          setReceiptHtml(receiptPageWrapper(generateReceiptHtml(data, logoDataUri)));
        }
      } catch (error) {
        console.error(error);
        const data = buildReceiptFromSale(sale);
        setReceiptData(data);
        setReceiptHtml(receiptPageWrapper(generateReceiptHtml(data, logoDataUri)));
        toast({
          title: "Loaded from list data",
          description: "Could not refresh full sale details.",
        });
      } finally {
        setViewLoading(false);
      }
    });
  };

  const handlePrintReceipt = async (sale?: Sale) => {
    const target = sale || viewSale;
    if (!target) return;
    await runSaleAction(target.id, "print", async () => {
      const detailed = await fetchSaleDetails(target);
      const data = buildReceiptFromSale(detailed);
      const html = receiptPageWrapper(generateReceiptHtml(data, logoDataUri));
      const printerInfo = getReceiptPrinterObj();
      const printerName = printerInfo?.name || (kioskMode ? "Default Printer" : "");

      if (printerName) {
        try {
          const result = await printReceiptViaServer(
            {
              name: printerName,
              columns: printerInfo?.receiptProfile?.columns || { fontA: 48, fontB: 64 },
            },
            data,
            { copies: 1, cut: true, openDrawer: false },
          );
          if (!result.success) throw new Error(result.error || "Print server error");
          toast({ title: "Receipt sent to printer", description: `Printer: ${printerName}` });
          return;
        } catch (error: any) {
          toast({
            variant: "destructive",
            title: "Printer failed — opening browser print",
            description: error?.message || "Falling back to browser print.",
          });
        }
      } else {
        toast({
          title: "No receipt printer configured",
          description: "Opening browser print instead.",
        });
      }

      const printWindow = window.open("", "_blank", "width=420,height=600");
      if (!printWindow) {
        toast({ title: "Unable to open print window", variant: "destructive" });
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (error) {
          console.error("Print failed", error);
        }
      }, 500);
    });
  };

  const handleBrowserPrint = () => {
    if (!receiptHtml) return;
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) {
      toast({ title: "Unable to open print window", variant: "destructive" });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        console.error("Print failed", error);
      }
    }, 500);
  };

  const handleDownloadPdf = async (sale?: Sale) => {
    const target = sale || viewSale;
    if (!target) return;
    await runSaleAction(target.id, "pdf", async () => {
      try {
        const detailed = await fetchSaleDetails(target);
        const data = buildReceiptFromSale(detailed);
        await downloadReceiptPdf(data, logoDataUri);
        toast({ title: "Receipt PDF downloaded" });
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "PDF download failed",
          description: error?.message || "Unable to generate PDF",
        });
      }
    });
  };

  const handleCancelSale = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiClient.patch(`/sale/${cancelTarget.id}/cancel`);
      toast({ title: "Sale cancelled" });
      setCancelTarget(null);
      fetchSales();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Cancel failed",
        description: error?.response?.data?.message || error?.message || "Unable to cancel sale",
      });
    } finally {
      setCancelling(false);
    }
  };

  const fetchAllForExport = async (): Promise<Sale[]> => {
    const res = await apiClient.get<{ data: Sale[] }>("/sale", {
      params: buildParams({ forExport: true, page: 1, limit: 5000 }),
    });
    return res.data.data || [];
  };

  const rowsForExport = (list: Sale[]) =>
    list.map((s) => ({
      "Invoice Number": s.invoice_number || s.sale_number,
      "Sale Number": s.sale_number,
      "Date & Time": format(parseISO(s.sale_date), "yyyy-MM-dd HH:mm:ss"),
      Customer: customerLabel(s),
      Cashier: cashierLabel(s),
      Items: itemCount(s),
      Quantity: totalQuantity(s),
      Subtotal: toNumber(s.subtotal),
      Discount: toNumber(s.discount_amount),
      Tax: toNumber(s.tax_amount),
      Total: toNumber(s.total_amount),
      "Payment Method": s.payment_method,
      "Payment Status": s.payment_status || "PAID",
      "Order Status": s.status,
      Branch: s.branch?.name || "—",
      Notes: s.notes || "",
      "Return Count": s._count?.return_sales ?? 0,
    }));

  const handleExport = async (type: "csv" | "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const list = await fetchAllForExport();
      const rows = rowsForExport(list);
      if (!rows.length) {
        toast({ title: "Nothing to export", variant: "destructive" });
        return;
      }

      if (type === "csv" || type === "xlsx") {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sales History");
        XLSX.writeFile(workbook, `sales-history.${type === "csv" ? "csv" : "xlsx"}`);
        toast({ title: `Exported ${rows.length} sales` });
        return;
      }

      // Branded printable report
      const logo = logoDataUri || "";
      const branchLabel = !isAdmin
        ? branchInfo.name
        : branchFilter !== "all"
          ? branches.find((b) => b.id === branchFilter)?.name || "Selected branch"
          : "All branches";
      const html = `<!DOCTYPE html>
<html><head><title>Sales History Report</title>
<style>
  @page { margin: 14mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 48px; width: auto; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: 0.02em; }
  .meta { text-align: right; font-size: 10px; color: #444; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .summary div { border: 1px solid #ddd; padding: 8px; border-radius: 6px; }
  .summary span { display: block; color: #666; font-size: 9px; text-transform: uppercase; }
  .summary strong { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 6px 5px; text-align: left; vertical-align: top; }
  th { background: #f7f7f7; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
  .footer { margin-top: 16px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
  <div class="header">
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="Logo" />` : ""}
      <div>
        <h1>Manpasand Sales History</h1>
        <div>${branchLabel}</div>
      </div>
    </div>
    <div class="meta">
      <div>Generated ${format(new Date(), "PPpp")}</div>
      <div>${rows.length} transactions</div>
    </div>
  </div>
  <div class="summary">
    <div><span>Total Sales</span><strong>${formatCurrency(summary.totalSales)}</strong></div>
    <div><span>Orders</span><strong>${summary.totalOrders}</strong></div>
    <div><span>Avg Order</span><strong>${formatCurrency(summary.averageOrderValue)}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th>Invoice</th><th>Date</th><th>Customer</th><th>Cashier</th>
      <th>Branch</th><th>Payment</th><th>Status</th><th>Total</th>
    </tr></thead>
    <tbody>
      ${list
        .map(
          (s) => `<tr>
        <td>${s.invoice_number || s.sale_number}</td>
        <td>${format(parseISO(s.sale_date), "yyyy-MM-dd HH:mm")}</td>
        <td>${customerLabel(s)}</td>
        <td>${cashierLabel(s)}</td>
        <td>${s.branch?.name || "—"}</td>
        <td>${s.payment_method}</td>
        <td>${s.status}</td>
        <td>${formatCurrency(s.total_amount)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="footer">Manpasand POS · Confidential sales report · Do not redistribute without authorization</div>
</body></html>`;
      const win = window.open("", "_blank");
      if (!win) throw new Error("Popup blocked");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
      toast({ title: "Branded PDF report opened" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Unable to export",
      });
    } finally {
      setExporting(false);
    }
  };

  const pageStart = totalSales === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min((currentPage - 1) * pageSize + sales.length, totalSales);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const windowSize = 5;
    let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [currentPage, totalPages]);

  const summaryCards = [
    { label: "Total Sales", value: formatCurrency(summary.totalSales), hint: "Filtered amount" },
    { label: "Total Orders", value: String(summary.totalOrders), hint: "Matching records" },
    { label: "Total Refunds", value: formatCurrency(summary.totalRefunds), hint: `${summary.refundCount} refunds` },
    {
      label: "Average Order Value",
      value: formatCurrency(summary.averageOrderValue),
      hint: "Completed orders",
    },
    { label: "Total Tax Collected", value: formatCurrency(summary.totalTaxCollected), hint: "VAT / GST" },
    { label: "Total Discounts", value: formatCurrency(summary.totalDiscounts), hint: "Applied discounts" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
          <p className="text-sm md:text-base text-gray-600">
            Professional sales ledger with filters, exports, and receipt tools
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="mr-2 h-4 w-4" />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileText className="mr-2 h-4 w-4" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <Printer className="mr-2 h-4 w-4" /> Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={`summary-skel-${index}`} className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="h-7 w-28 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                </CardContent>
              </Card>
            ))
          : summaryCards.map((card) => (
              <Card key={card.label} className="border-gray-200 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-lg font-bold text-gray-900">{card.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{card.hint}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="relative xl:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search invoice #, sale #, customer, barcode notes…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div>
                <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={cashierId} onValueChange={setCashierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cashier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cashiers</SelectItem>
                    {cashiers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Methods</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Statuses</SelectItem>
                    {PAYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Order status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Order Statuses</SelectItem>
                    {ORDER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isAdmin && (
                <div>
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {datePreset === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <div>
                  <Label className="text-xs text-gray-500">From</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">To</Label>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </div>
            )}

            {activeFilterCount > 0 && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" /> Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sales Cards */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              Sales History {loading ? "" : `(${totalSales})`}
            </CardTitle>
            <p className="text-sm text-gray-500">
              {loading
                ? "Loading sales…"
                : `Showing ${pageStart}–${pageEnd} of ${totalSales}${
                    !isAdmin ? " · your branch only" : branchFilter === "all" ? " · all branches" : ""
                  }`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="h-14 rounded-xl bg-gray-100" />
                  <div className="mt-4 h-4 w-2/3 rounded bg-gray-100" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="h-10 rounded-lg bg-gray-100" />
                    <div className="h-10 rounded-lg bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
              <Receipt className="h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">No sales found</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Adjust your search or filters to find transactions.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sales.map((sale) => {
                const isRefund =
                  sale.status === "REFUNDED" ||
                  !!sale.original_sale_id ||
                  toNumber(sale.total_amount) < 0;

                return (
                  <div
                    key={sale.id}
                    className={cn(
                      "group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                      isRefund
                        ? "border-red-200 hover:border-red-300"
                        : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    <div
                      className={cn(
                        "border-b px-4 py-4",
                        isRefund
                          ? "border-red-100 bg-gradient-to-r from-red-50 to-rose-50/40"
                          : "border-gray-100 bg-gradient-to-r from-slate-50 to-emerald-50/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={isRefund ? "destructive" : "default"}
                              className="text-[10px] uppercase"
                            >
                              {isRefund ? "Refund" : "Sale"}
                            </Badge>
                            <Badge variant={statusBadgeVariant(sale.status)} className="text-[10px] uppercase">
                              {sale.status}
                            </Badge>
                            <Badge variant={paymentStatusVariant(sale.payment_status)} className="text-[10px] uppercase">
                              {sale.payment_status || "PAID"}
                            </Badge>
                          </div>
                          <p className="mt-2 truncate font-mono text-sm font-semibold text-gray-900">
                            {sale.invoice_number || sale.sale_number}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {format(parseISO(sale.sale_date), "MMM dd, yyyy · hh:mm a")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Total</p>
                          <p
                            className={cn(
                              "text-xl font-bold",
                              isRefund ? "text-red-600" : "text-emerald-700",
                            )}
                          >
                            {formatCurrency(sale.total_amount)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2 text-gray-700">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Branch</p>
                            <p className="truncate font-medium">{sale.branch?.name || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-gray-700">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Customer / Cashier</p>
                            <p className="truncate font-medium">
                              {customerLabel(sale)} · {cashierLabel(sale)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-gray-700">
                          <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">Payment</p>
                            <p className="truncate font-medium">
                              {(sale.payment_method || "CASH").replace("_", " ")} ·{" "}
                              {itemCount(sale) > 0
                                ? `${itemCount(sale)} items · Qty ${totalQuantity(sale)}`
                                : "No line items saved"}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2 text-xs">
                          <div>
                            <p className="text-gray-500">Subtotal</p>
                            <p className="font-semibold">{formatCurrency(sale.subtotal)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Discount</p>
                            <p className="font-semibold">{formatCurrency(sale.discount_amount)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Tax</p>
                            <p className="font-semibold">{formatCurrency(sale.tax_amount)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={!!actionBusy}
                          onClick={() => openSaleDetails(sale, true)}
                        >
                          {isSaleBusy(sale.id, "view") ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="mr-1.5 h-4 w-4" />
                          )}
                          View
                        </Button>
                        {canManageSales && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditSale(sale)}
                            disabled={!!sale.original_sale_id || !!actionBusy}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" /> Edit
                          </Button>
                        )}
                        {canManageSales && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            disabled={!!actionBusy}
                            onClick={() => setDeleteTarget(sale)}
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={!!actionBusy && actionBusy.saleId === sale.id}
                            >
                              {actionBusy?.saleId === sale.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              disabled={!!actionBusy}
                              onSelect={(e) => {
                                e.preventDefault();
                                openSaleDetails(sale, true);
                              }}
                            >
                              {isSaleBusy(sale.id, "view") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="mr-2 h-4 w-4" />
                              )}
                              View Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!actionBusy}
                              onSelect={(e) => {
                                e.preventDefault();
                                handlePrintReceipt(sale);
                              }}
                            >
                              {isSaleBusy(sale.id, "print") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Printer className="mr-2 h-4 w-4" />
                              )}
                              Print Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!actionBusy}
                              onSelect={(e) => {
                                e.preventDefault();
                                handleDownloadPdf(sale);
                              }}
                            >
                              {isSaleBusy(sale.id, "pdf") ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {canManageSales && (
                              <DropdownMenuItem
                                disabled={!!sale.original_sale_id || !!actionBusy}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  openEditSale(sale);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit Sale
                              </DropdownMenuItem>
                            )}
                            {canManageSales && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  disabled={!!actionBusy}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setDeleteTarget(sale);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <DropdownMenuItem
                                    disabled={
                                      sale.status === "CANCELLED" ||
                                      !!sale.original_sale_id ||
                                      !!actionBusy
                                    }
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      setCancelTarget(sale);
                                    }}
                                  >
                                    Cancel Status
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Professional pagination */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pt-2 border-t">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="page-size" className="text-sm whitespace-nowrap">
                  Cards per page
                </Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[100px]" id="page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-gray-600">
                Page {currentPage} of {totalPages} · {totalSales} total
              </p>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage(1)}
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-[36px]"
                  disabled={loading}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage(totalPages)}
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice / Receipt Dialog */}
      <Dialog
        open={!!viewSale}
        onOpenChange={(open) => {
          if (!open) {
            setViewSale(null);
            setReceiptHtml("");
            setReceiptData(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto gap-3 p-4 sm:p-5">
          <DialogHeader className="space-y-1 pr-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <DialogTitle className="text-base sm:text-lg">
                  Invoice {viewSale?.invoice_number || viewSale?.sale_number}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Sale details and branded receipt
                </DialogDescription>
              </div>
              {viewSale && (
                <div className="flex flex-wrap items-center gap-2">
                  {canManageSales && !viewSale.original_sale_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={!!actionBusy}
                      onClick={() => openEditSale(viewSale)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {canManageSales && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-red-600"
                      disabled={!!actionBusy}
                      onClick={() => setDeleteTarget(viewSale)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-8" disabled={!!actionBusy && actionBusy.saleId === viewSale.id}>
                        {actionBusy?.saleId === viewSale.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Print / Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={!!actionBusy}
                        onSelect={(e) => {
                          e.preventDefault();
                          handlePrintReceipt(viewSale);
                        }}
                      >
                        {isSaleBusy(viewSale.id, "print") ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Printer className="mr-2 h-4 w-4" />
                        )}
                        Print Receipt
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleBrowserPrint} disabled={!!actionBusy}>
                        <FileText className="mr-2 h-4 w-4" /> Browser Print
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!!actionBusy}
                        onSelect={(e) => {
                          e.preventDefault();
                          handleDownloadPdf(viewSale);
                        }}
                      >
                        {isSaleBusy(viewSale.id, "pdf") ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!!actionBusy}
                        onSelect={async (e) => {
                          e.preventDefault();
                          if (!viewSale) return;
                          await runSaleAction(viewSale.id, "whatsapp", async () => {
                            const detailed = await fetchSaleDetails(viewSale);
                            const data = buildReceiptFromSale(detailed);
                            try {
                              const { fellBack } = await shareReceiptOnWhatsApp(
                                data,
                                logoDataUri,
                                viewSale.customer?.phone_number ||
                                  viewSale.customer?.mobile_number ||
                                  "",
                              );
                              if (fellBack) {
                                toast({
                                  title: "Receipt downloaded",
                                  description: "Attach the PDF in WhatsApp chat.",
                                });
                              }
                            } catch (err: any) {
                              toast({
                                title: err?.message || "Failed to share",
                                variant: "destructive",
                              });
                            }
                          });
                        }}
                      >
                        {isSaleBusy(viewSale.id, "whatsapp") ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <MessageCircle className="mr-2 h-4 w-4" />
                        )}
                        WhatsApp
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            {receiptPrinter && (
              <p className="text-[11px] text-gray-500">Printer: {receiptPrinter}</p>
            )}
          </DialogHeader>

          {viewLoading || !viewSale ? (
            <div className="py-10">
              <PageLoader />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-gray-50/80 p-3">
                  <div>
                    <p className="text-[11px] text-gray-500">Date & Time</p>
                    <p className="font-medium text-sm">{format(parseISO(viewSale.sale_date), "PPpp")}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Cashier</p>
                    <p className="font-medium text-sm">{cashierLabel(viewSale)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Customer</p>
                    <p className="font-medium text-sm">{customerLabel(viewSale)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Branch</p>
                    <p className="font-medium text-sm">{viewSale.branch?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Payment</p>
                    <p className="font-medium text-sm">
                      {viewSale.payment_method} · {viewSale.payment_status || "PAID"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">Order Status</p>
                    <Badge variant={statusBadgeVariant(viewSale.status)}>{viewSale.status}</Badge>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80">
                        <TableHead className="h-9">Item</TableHead>
                        <TableHead className="h-9 text-right">Qty</TableHead>
                        <TableHead className="h-9 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(viewSale.sale_items || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-gray-500 py-6">
                            No line items
                          </TableCell>
                        </TableRow>
                      ) : (
                        (viewSale.sale_items || []).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="py-2">{item.product?.name || "Item"}</TableCell>
                            <TableCell className="py-2 text-right">{item.quantity}</TableCell>
                            <TableCell className="py-2 text-right">
                              {formatCurrency(item.line_total)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-1 rounded-md bg-gray-50 p-3">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{formatCurrency(viewSale.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount</span>
                    <span>{formatCurrency(viewSale.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax</span>
                    <span>{formatCurrency(viewSale.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-2 mt-1">
                    <span>Total</span>
                    <span>{formatCurrency(viewSale.total_amount)}</span>
                  </div>
                </div>

                {viewSale.notes && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">Notes</p>
                    <p className="rounded-md border bg-white p-2 text-xs whitespace-pre-wrap break-words">
                      {viewSale.notes}
                    </p>
                  </div>
                )}

                {(viewSale.return_sales?.length || 0) > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">Return History</p>
                    <div className="space-y-1">
                      {viewSale.return_sales!.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded border px-2 py-1.5 text-xs"
                        >
                          <span className="font-mono">{r.sale_number}</span>
                          <span>{format(parseISO(r.sale_date), "MMM dd, yyyy")}</span>
                          <span className="text-red-600">{formatCurrency(r.total_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-md border bg-white overflow-hidden">
                <iframe
                  title="Receipt preview"
                  srcDoc={receiptHtml}
                  className="w-full h-[560px] border-0"
                />
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-end">
            <Button variant="outline" onClick={() => setViewSale(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel sale?</DialogTitle>
            <DialogDescription>
              This will mark {cancelTarget?.sale_number} as CANCELLED. Stock is not automatically restored.
              Prefer Refund/Return for inventory-safe reversals.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep
            </Button>
            <Button variant="destructive" onClick={handleCancelSale} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sale?</DialogTitle>
            <DialogDescription>
              Permanently delete {deleteTarget?.sale_number}. This cannot be undone. Stock is not restored —
              use Refund/Return if you need inventory back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Keep
            </Button>
            <Button variant="destructive" onClick={handleDeleteSale} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit sale — full POS editor */}
      <EditSaleDialog
        sale={editSale}
        open={!!editSale}
        onOpenChange={(open) => {
          if (!open) setEditSale(null);
        }}
        onUpdated={() => {
          fetchSales();
          if (viewSale && editSale && viewSale.id === editSale.id) {
            openSaleDetails(editSale, true);
          }
        }}
      />
    </div>
  );
}
