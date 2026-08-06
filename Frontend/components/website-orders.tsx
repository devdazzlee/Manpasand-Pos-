"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Eye, Search, ShoppingBag, Clock, Globe, Download, Printer, CheckCircle2, Trash2, Phone, Mail, MapPin, Package, Wallet, User, Ban, Loader } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { Badge } from "@/components/ui/badge";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { useLogoDataUri } from "@/hooks/use-logo-data-uri";
import {
  downloadReceiptPdf,
  generateReceiptHtml,
  receiptPageWrapper,
} from "@/lib/receipt";
import { cn } from "@/lib/utils";
import { formatMoneyDisplay } from "@/lib/money";

interface OrderItem { 
  productId?: string;
  product_id?: string;
  quantity: number; 
  product?: { name: string; id: string; unit?: { name?: string } | null } | null;
  display_name?: string;
  grams_per_unit?: string | number;
  unit_name?: string;
  name?: string;
  price?: string | number;
  total_price?: string | number;
}

function getWeightInGramsFromText(weightText?: string): number | undefined {
  if (!weightText) return undefined;
  const normalized = weightText.replace(/\s+/g, " ").trim();
  let match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gram|grams|gms)\b/i,
  );
  if (!match) {
    match = normalized.match(/\.(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|gms|kg|kgs)\b/i);
  }
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (Number.isNaN(value) || value <= 0) return undefined;
  if (["kg", "kgs", "kilogram", "kilograms"].includes(unit)) return value * 1000;
  return value;
}

/** Show weight in gms unless 1 kg or more — do not convert using product catalog unit (often KG). */
function formatGramsForDisplay(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    if (Number.isInteger(kg)) return `${kg} Kg`;
    return `${kg.toFixed(2).replace(/\.?0+$/, "")} Kg`;
  }
  return Number.isInteger(grams) ? `${grams} gms` : `${grams.toFixed(1)} gms`;
}

/** Weight text embedded in product/line name (e.g. "Shilajit .10 gm"). */
function extractInlineWeightLabel(label: string): string | undefined {
  const match = label.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gram|grams|gms)\b/i);
  if (!match) {
    const dotMatch = label.match(/\.(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|gms|kg|kgs)\b/i);
    if (!dotMatch) return undefined;
    const value = dotMatch[1];
    const unit = dotMatch[2].toLowerCase();
    if (["kg", "kgs"].includes(unit)) return `${value} Kg`;
    return `${value} gms`;
  }
  const value = match[1];
  const unit = match[2].toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms"].includes(unit)) return `${value} Kg`;
  return `${value} gms`;
}

/** Parse Prisma Decimal / string / number for order line quantity. */
function parseOrderQuantity(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "object") {
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybe.toNumber === "function") {
      const n = maybe.toNumber();
      return Number.isNaN(n) ? 0 : n;
    }
    if (typeof maybe.toString === "function") {
      const parsed = parseFloat(maybe.toString());
      return Number.isNaN(parsed) ? 0 : parsed;
    }
  }
  return 0;
}

function getOrderItemLabel(item: OrderItem): string {
  return (
    item.display_name ||
    item.name ||
    item.product?.name ||
    "Unknown Product"
  );
}

function resolveLineGrams(item: OrderItem): number | undefined {
  const stored = parseOrderQuantity(item.grams_per_unit);
  if (stored > 0) return stored;
  return getWeightInGramsFromText(getOrderItemLabel(item));
}

function formatWeightQuantityLabel(weightLabel: string, packQty: number): string {
  if (packQty <= 1) return weightLabel;
  return `${formatQuantityValue(packQty)} × ${weightLabel}`;
}

/** Human-readable quantity — matches what the customer ordered (gms, not forced to kg). */
function formatOrderItemQuantity(item: OrderItem): string {
  const packQty = parseOrderQuantity(item.quantity);
  const label = getOrderItemLabel(item);

  // Prefer exact variant from line name: "Sugar - 100 gms" → "100 gms"
  const variantMatch = label.match(/\s-\s(.+)$/);
  if (variantMatch) {
    const variant = variantMatch[1].trim();
    if (variant.length > 0) {
      return formatWeightQuantityLabel(variant, packQty);
    }
  }

  const inlineWeight = extractInlineWeightLabel(label);
  if (inlineWeight) {
    return formatWeightQuantityLabel(inlineWeight, packQty);
  }

  const grams = resolveLineGrams(item);
  if (grams && grams > 0) {
    return formatWeightQuantityLabel(formatGramsForDisplay(grams), packQty);
  }

  return formatQuantityValue(packQty);
}

function formatQuantityValue(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return "0";
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(3).replace(/\.?0+$/, "");
}

interface WebsiteOrder { 
  id: string; 
  order_number: string; 
  total_amount: string; 
  status: string; 
  created_at: string; 
  items: OrderItem[];
  payment_method: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  order_notes?: string;
}

const ORDER_STATUS_OPTIONS = ["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"] as const;
type OrderStatusOption = (typeof ORDER_STATUS_OPTIONS)[number];

const isTerminalOrderStatus = (status: string) =>
  status === "COMPLETED" || status === "CANCELLED";

const getOrderStatusStyle = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-800 border-green-200";
    case "PROCESSING":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "PENDING":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-red-100 text-red-800 border-red-200";
  }
};

const getAllowedStatusOptions = (status: string): OrderStatusOption[] => {
  switch (status) {
    case "PENDING":
      return ["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"];
    case "PROCESSING":
      return ["PROCESSING", "PENDING", "COMPLETED", "CANCELLED"];
    case "COMPLETED":
      return ["COMPLETED"];
    case "CANCELLED":
      return ["CANCELLED"];
    default:
      return [...ORDER_STATUS_OPTIONS];
  }
};

function formatRs(amount: number | string) {
  return `Rs ${formatMoneyDisplay(Number(amount) || 0)}`;
}

function formatPaymentMethod(method?: string) {
  switch ((method || "CASH").toUpperCase()) {
    case "CASH":
      return "Cash on Delivery";
    case "CARD":
      return "Card";
    case "MOBILE_MONEY":
      return "Mobile Money";
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "CREDIT":
      return "Credit";
    default:
      return method || "Cash";
  }
}

function formatStatusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

const WebsiteOrders: React.FC = () => {
  const { toast } = useToast();
  const logoDataUri = useLogoDataUri();
  // Global printer settings (configured in Printer Settings page)
  const { receiptPrinter, getReceiptPrinterObj, printers } = usePrinterSettings();

  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("ALL");
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("NEWEST");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WebsiteOrder | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Record<string, boolean>>({});
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Client-side pagination over the already-filtered list. Page resets on
  // any filter / search / sort change so the user always sees page 1 of the
  // new view.
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const normalizeOrderItems = (items: any[]): OrderItem[] => {
    if (!Array.isArray(items)) return [];
    return items.map((item: any) => {
      const quantity = parseOrderQuantity(item.quantity);
      const price = parseOrderQuantity(item.price);
      const totalFromApi = parseOrderQuantity(item.total_price);
      const total_price =
        totalFromApi > 0 ? totalFromApi : price * Math.max(quantity, 0);

      return {
        productId: item.productId || item.product_id || item.product?.id || "",
        product_id: item.product_id || item.productId || item.product?.id || "",
        quantity,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name || item.name || "Unknown Product",
              unit: item.product.unit ?? null,
            }
          : null,
        display_name: item.display_name || item.name || item.product?.name || "Unknown Product",
        name: item.display_name || item.name || item.product?.name || "Unknown Product",
        grams_per_unit: item.grams_per_unit ?? item.gramsPerUnit,
        unit_name: item.unit_name || item.unitName || item.product?.unit?.name,
        price,
        total_price,
      };
    });
  };

  const normalizeOrder = (raw: any, fallback: WebsiteOrder | null = null): WebsiteOrder => {
    const rawItems = raw?.items || raw?.order_items || raw?.sale_items || [];
    const normalizedItems = normalizeOrderItems(rawItems);
    const fallbackItems = fallback?.items || [];

    return {
      id: raw?.id || fallback?.id || "",
      order_number: raw?.order_number || fallback?.order_number || "",
      total_amount: String(raw?.total_amount ?? fallback?.total_amount ?? "0"),
      status: raw?.status || fallback?.status || "PENDING",
      created_at: raw?.created_at || fallback?.created_at || new Date().toISOString(),
      payment_method: raw?.payment_method || fallback?.payment_method || "CASH",
      customer_name:
        raw?.customer_name ||
        (raw?.customer ? `${raw.customer.firstName || ""} ${raw.customer.lastName || ""}`.trim() : "") ||
        fallback?.customer_name ||
        "",
      customer_email: raw?.customer_email || raw?.customer?.email || fallback?.customer_email || "",
      customer_phone: raw?.customer_phone || raw?.customer?.phone || fallback?.customer_phone || "",
      delivery_address: raw?.delivery_address || raw?.shipping?.address || fallback?.delivery_address || "",
      delivery_city: raw?.delivery_city || raw?.shipping?.city || fallback?.delivery_city || "",
      delivery_postal_code:
        raw?.delivery_postal_code || raw?.shipping?.postalCode || fallback?.delivery_postal_code || "",
      order_notes: raw?.order_notes || raw?.orderNotes || fallback?.order_notes || "",
      items: normalizedItems.length > 0 ? normalizedItems : fallbackItems,
    };
  };

  const buildReceiptData = (order: WebsiteOrder): ReceiptData => {
    const branchName =
      (typeof window !== "undefined" && localStorage.getItem("branchName")) ||
      "MANPASAND GENERAL STORE";
    const branchAddress =
      (typeof window !== "undefined" && localStorage.getItem("branchAddress")) ||
      "Karachi, Pakistan";

    const items = (order.items || []).map((item) => {
      const qty = parseOrderQuantity(item.quantity);
      const unitPrice = parseOrderQuantity(item.price);
      const unitLabel = item.unit_name || item.product?.unit?.name;
      return {
        name: getOrderItemLabel(item),
        quantity: qty,
        price: unitPrice,
        unit: unitLabel,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderTotal = Number(order.total_amount) || subtotal;

    const customerLabel =
      order.customer_name?.trim() ||
      order.customer_phone?.trim() ||
      order.customer_email?.trim() ||
      "Walk-in";

    const noteParts = [
      order.order_notes?.trim(),
      order.delivery_address
        ? `Delivery: ${order.delivery_address}${order.delivery_city ? `, ${order.delivery_city}` : ""}`
        : "",
    ].filter(Boolean);

    return {
      storeName: branchName,
      tagline: "Quality • Service • Value",
      address: branchAddress,
      transactionId: order.order_number,
      timestamp: order.created_at,
      cashier: "Website Order",
      customerType: customerLabel,
      items,
      subtotal: subtotal || orderTotal,
      total: orderTotal,
      paymentMethod: (order.payment_method || "CASH").toUpperCase(),
      amountPaid: orderTotal,
      changeAmount: 0,
      promo: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
      thankYouMessage: "Thank you for shopping!",
      footerMessage: "Visit us again soon!",
    };
  };

  const handleBrowserPrint = (order: WebsiteOrder) => {
    const receiptData = buildReceiptData(order);
    const content = generateReceiptHtml(receiptData, logoDataUri);
    const html = receiptPageWrapper(content);
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
  };

  const handlePrinterPrint = async (order: WebsiteOrder) => {
    const printerInfo = getReceiptPrinterObj();
    if (!printerInfo) {
      toast({
        title: "No receipt printer configured",
        description: "Go to Printer Settings to select a receipt printer.",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const printerObj = {
        ...printerInfo,
        columns: printerInfo.receiptProfile?.columns || { fontA: 48, fontB: 64 },
      };
      const result = await printReceiptViaServer(printerObj, buildReceiptData(order), {
        copies: 1,
        cut: true,
        openDrawer: false,
      });
      if (!result.success) {
        throw new Error(result.error || "Printer failed");
      }
      toast({
        title: "Printed successfully",
        description: `Receipt sent to ${printerInfo.name}`,
      });
    } catch (error: any) {
      toast({
        title: "Print failed",
        description: error?.message || "Unable to print receipt",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async (order: WebsiteOrder) => {
    setIsDownloadingPdf(true);
    try {
      await downloadReceiptPdf(buildReceiptData(order), logoDataUri);
      toast({
        title: "PDF downloaded",
        description: `Receipt saved for order ${order.order_number}`,
      });
    } catch (error: any) {
      toast({
        title: "PDF download failed",
        description: error?.message || "Unable to generate PDF receipt",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const confirmDelete = (id: string) => {
    setOrderToDelete(id);
  };

  const executeDelete = async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      await apiClient.delete(`${API_BASE}/order/${orderToDelete}`);
      toast({
        title: "Success",
        description: "Order deleted successfully",
      });
      setOrders((prev) => prev.filter(o => o.id !== orderToDelete));
      setOrderToDelete(null);
    } catch (err: any) {
      console.log("Order deletion failed", err);
      toast({
        title: "Error",
        description: err.response?.data?.message || "Failed to delete order",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter) {
        params.status = statusFilter;
      }
      params.page = '1';
      params.pageSize = '500';
      
      const res = await apiClient.get(`${API_BASE}/guest/order`, { params });
      const rawOrders = res.data?.data?.data || [];
      setOrders(rawOrders.map((order: any) => normalizeOrder(order)));
    } catch (err: any) {
      console.log("Website orders load failed", err);
      
      let errorMessage = "Failed to load website orders";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleReopenOrder = async (orderId: string) => {
    if (!window.confirm("Re-opening this order will re-allocate stock. Ensure items are available. Continue?")) {
      return;
    }

    setStatusUpdatingIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      await apiClient.patch(`${API_BASE}/order/${orderId}/reopen`);
      toast({
        title: "Order Re-opened",
        description: "Status changed to PENDING and stock re-allocated.",
      });
      await fetchOrders();
    } catch (err: any) {
      toast({
        title: "Re-open failed",
        description: err.response?.data?.message || "Unable to re-open order",
        variant: "destructive",
      });
    } finally {
      setStatusUpdatingIds((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    const currentOrder =
      orders.find((order) => order.id === orderId) ||
      (selectedOrder?.id === orderId ? selectedOrder : null);

    if (!currentOrder || currentOrder.status === newStatus) {
      return;
    }

    if (isTerminalOrderStatus(currentOrder.status)) {
      toast({
        title: "Locked State",
        description: `${currentOrder.status} is a terminal state. Use explicit actions to modify.`,
        variant: "destructive",
      });
      return;
    }
    const previousOrders = [...orders];
    const previousSelectedOrder = selectedOrder && selectedOrder.id === orderId ? { ...selectedOrder } : null;

    setStatusUpdatingIds((prev) => ({ ...prev, [orderId]: true }));
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order))
    );
    setSelectedOrder((prev) =>
      prev && prev.id === orderId ? { ...prev, status: newStatus } : prev
    );

    try {
      // Use the regular order status update endpoint
      await apiClient.patch(`${API_BASE}/order/${orderId}/status`, { status: newStatus });
      toast({
        title: "Success",
        description: "Order status updated successfully",
      });
      await fetchOrders();
    } catch (err: any) {
      console.log("Status update failed", err);
      setOrders(previousOrders);
      if (previousSelectedOrder) {
        setSelectedOrder(previousSelectedOrder);
      }
      
      let errorMessage = "Failed to update order status";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setStatusUpdatingIds((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const viewOrderDetail = async (orderId: string) => {
    const currentOrder = orders.find((order) => order.id === orderId) || null;
    setSelectedOrder(currentOrder);
    setIsDetailOpen(true);
    setIsDetailLoading(true);

    try {
      const res = await apiClient.get(`${API_BASE}/guest/order/${orderId}`);
      const normalized = normalizeOrder(res.data.data, currentOrder);
      setSelectedOrder(normalized);

      if (!normalized.items || normalized.items.length === 0) {
        toast({
          title: "No item details found",
          description: "This order was saved without item lines, so product details are not available.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.log("Fetch detail failed", err);
      
      let errorMessage = "Failed to load order details";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const getRangeStart = () => {
      if (dateRangeFilter === "TODAY") {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      }
      if (dateRangeFilter === "7D") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
      }
      if (dateRangeFilter === "30D") {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return d;
      }
      return null;
    };

    const rangeStart = getRangeStart();

    const list = orders.filter((o) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name || "").toLowerCase().includes(q) ||
        (o.customer_phone || "").toLowerCase().includes(q) ||
        (o.customer_email || "").toLowerCase().includes(q) ||
        (o.delivery_city || "").toLowerCase().includes(q) ||
        (o.delivery_address || "").toLowerCase().includes(q);
      const matchesPayment =
        paymentFilter === "ALL" ? true : (o.payment_method || "CASH").toUpperCase() === paymentFilter;
      const matchesDate = rangeStart ? new Date(o.created_at) >= rangeStart : true;
      return matchesSearch && matchesPayment && matchesDate;
    });

    list.sort((a, b) => {
      if (sortBy === "OLDEST") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "AMOUNT_HIGH") return Number(b.total_amount || 0) - Number(a.total_amount || 0);
      if (sortBy === "AMOUNT_LOW") return Number(a.total_amount || 0) - Number(b.total_amount || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [orders, searchTerm, paymentFilter, dateRangeFilter, sortBy]);

  // Reset to page 1 whenever the filtered view changes — otherwise the user
  // can end up "stuck" on an empty page 5 after narrowing the results.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, paymentFilter, dateRangeFilter, sortBy, statusFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Calculate stats
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  const pendingOrders = orders.filter((order) => order.status === "PENDING").length;
  const processingOrders = orders.filter((order) => order.status === "PROCESSING").length;
  const completedOrders = orders.filter((order) => order.status === "COMPLETED").length;
  const cancelledOrders = orders.filter((order) => order.status === "CANCELLED").length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusCounts: Record<string, number> = {
    "": totalOrders,
    PENDING: pendingOrders,
    PROCESSING: processingOrders,
    COMPLETED: completedOrders,
    CANCELLED: cancelledOrders,
  };

  if (isInitialLoading) {
    return <PageLoader message="Loading website orders..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="bg-blue-600 text-white p-2.5 rounded-lg shrink-0">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              Website Orders
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Online checkout orders, delivery, and fulfillment
            </p>
          </div>
        </div>
        <Badge variant="outline" className="self-start text-xs font-medium border-gray-200 text-gray-600">
          {filtered.length} shown
        </Badge>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className={cn(
                "rounded-xl border bg-white p-3.5 text-left shadow-sm transition-colors hover:border-blue-300",
                statusFilter === "" ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Total Orders</p>
                <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{totalOrders}</p>
            </button>

            <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Revenue</p>
                <Wallet className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="text-xl font-semibold text-emerald-700 mt-1 tabular-nums leading-tight">
                {formatRs(totalRevenue)}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">Avg {formatRs(avgOrderValue)}</p>
            </div>

            <button
              type="button"
              onClick={() => setStatusFilter("PENDING")}
              className={cn(
                "rounded-xl border p-3.5 text-left shadow-sm transition-colors hover:border-amber-300",
                statusFilter === "PENDING"
                  ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-100"
                  : "border-amber-200/80 bg-amber-50/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Pending</p>
                <Clock className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="text-2xl font-semibold text-amber-700 mt-1 tabular-nums">{pendingOrders}</p>
              <p className="text-[10px] text-gray-500 mt-1">{processingOrders} processing</p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("COMPLETED")}
              className={cn(
                "rounded-xl border p-3.5 text-left shadow-sm transition-colors hover:border-blue-300",
                statusFilter === "COMPLETED"
                  ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-100"
                  : "border-blue-200/80 bg-blue-50/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-gray-600">Completed</p>
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <p className="text-2xl font-semibold text-blue-700 mt-1 tabular-nums">{completedOrders}</p>
              <p className="text-[10px] text-gray-500 mt-1">{cancelledOrders} cancelled</p>
            </button>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {[
            { v: "", label: "All" },
            { v: "PENDING", label: "Pending" },
            { v: "PROCESSING", label: "Processing" },
            { v: "COMPLETED", label: "Completed" },
            { v: "CANCELLED", label: "Cancelled" },
          ].map((s) => {
            const active = statusFilter === s.v;
            const count = statusCounts[s.v] ?? 0;
            return (
              <button
                key={s.v || "ALL"}
                type="button"
                onClick={() => setStatusFilter(s.v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-semibold transition-colors",
                  active
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search order, customer, phone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-10 w-full"
            />
          </div>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All Payments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Payments</SelectItem>
              <SelectItem value="CASH">Cash on Delivery</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
              <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Dates</SelectItem>
              <SelectItem value="TODAY">Today</SelectItem>
              <SelectItem value="7D">Last 7 Days</SelectItem>
              <SelectItem value="30D">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NEWEST">Newest first</SelectItem>
              <SelectItem value="OLDEST">Oldest first</SelectItem>
              <SelectItem value="AMOUNT_HIGH">Amount (High → Low)</SelectItem>
              <SelectItem value="AMOUNT_LOW">Amount (Low → High)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders list */}
      <Card className="border border-gray-200 shadow-sm min-w-0 overflow-hidden">
        <CardHeader className="py-3 px-4 sm:px-5 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-gray-900">
              Orders
            </CardTitle>
            <p className="text-xs text-gray-500">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Globe className="h-6 w-6 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">No orders found</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Try clearing filters or search, or wait for new website checkouts.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="text-xs font-semibold text-gray-600">Order</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Customer</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Delivery</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Payment</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600 text-right">Amount</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-gray-600 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((o) => {
                      const allowedStatusOptions = getAllowedStatusOptions(o.status);
                      const isTerminal = isTerminalOrderStatus(o.status);
                      const statusStyle = getOrderStatusStyle(o.status);
                      const ts = new Date(o.created_at);
                      const itemCount = o.items?.length || 0;

                      return (
                        <TableRow key={o.id} className="align-top">
                          <TableCell className="py-3">
                            <p className="font-mono text-sm font-semibold text-gray-900">
                              {o.order_number}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {ts.toLocaleDateString()} ·{" "}
                              {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {itemCount} item{itemCount === 1 ? "" : "s"}
                            </p>
                          </TableCell>
                          <TableCell className="py-3 max-w-[200px]">
                            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              {o.customer_name?.trim() || "Guest"}
                            </p>
                            {o.customer_phone ? (
                              <p className="text-[11px] text-gray-500 mt-1 truncate flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {o.customer_phone}
                              </p>
                            ) : null}
                            {o.customer_email ? (
                              <p className="text-[11px] text-gray-400 mt-0.5 truncate flex items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                {o.customer_email}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-3 max-w-[180px]">
                            {o.delivery_city || o.delivery_address ? (
                              <div className="text-[11px] text-gray-600">
                                <p className="font-medium text-gray-800 flex items-center gap-1">
                                  <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
                                  {o.delivery_city || "Address"}
                                </p>
                                {o.delivery_address ? (
                                  <p className="mt-0.5 line-clamp-2 text-gray-500 pl-4">
                                    {o.delivery_address}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="text-xs font-medium text-gray-700">
                              {formatPaymentMethod(o.payment_method)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-sm font-semibold tabular-nums text-gray-900">
                              {formatRs(o.total_amount)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 min-w-[140px]">
                            {isTerminal ? (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold",
                                  statusStyle,
                                )}
                              >
                                {formatStatusLabel(o.status)}
                              </span>
                            ) : (
                              <Select
                                value={o.status}
                                onValueChange={(value) => handleStatusUpdate(o.id, value)}
                                disabled={!!statusUpdatingIds[o.id]}
                              >
                                <SelectTrigger
                                  className={cn("h-8 w-full text-[11px] font-semibold", statusStyle)}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedStatusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {formatStatusLabel(status)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {statusUpdatingIds[o.id] ? (
                              <span className="mt-1 inline-flex items-center text-[10px] text-blue-600">
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Updating
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => viewOrderDetail(o.id)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => confirmDelete(o.id)}
                                disabled={!!statusUpdatingIds[o.id]}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile / tablet cards */}
              <div className="lg:hidden divide-y divide-gray-100">
                {paged.map((o) => {
                  const allowedStatusOptions = getAllowedStatusOptions(o.status);
                  const isTerminal = isTerminalOrderStatus(o.status);
                  const statusStyle = getOrderStatusStyle(o.status);
                  const ts = new Date(o.created_at);
                  const itemCount = o.items?.length || 0;

                  return (
                    <div key={o.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold text-gray-900 truncate">
                            {o.order_number}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {ts.toLocaleDateString()} ·{" "}
                            {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <p className="text-base font-bold text-emerald-700 tabular-nums shrink-0">
                          {formatRs(o.total_amount)}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-1.5">
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          {o.customer_name?.trim() || "Guest"}
                        </p>
                        {o.customer_phone ? (
                          <p className="text-xs text-gray-600 flex items-center gap-1.5 pl-5">
                            <Phone className="h-3 w-3 text-gray-400" />
                            {o.customer_phone}
                          </p>
                        ) : null}
                        {(o.delivery_city || o.delivery_address) && (
                          <p className="text-xs text-gray-600 flex items-start gap-1.5 pl-5">
                            <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">
                              {[o.delivery_address, o.delivery_city].filter(Boolean).join(", ")}
                            </span>
                          </p>
                        )}
                        <div className="flex items-center gap-3 pl-5 text-xs text-gray-500 pt-0.5">
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3 w-3" />
                            {formatPaymentMethod(o.payment_method)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {itemCount} items
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isTerminal ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium",
                              statusStyle,
                            )}
                          >
                            {formatStatusLabel(o.status)}
                          </span>
                        ) : (
                          <Select
                            value={o.status}
                            onValueChange={(value) => handleStatusUpdate(o.id, value)}
                            disabled={!!statusUpdatingIds[o.id]}
                          >
                            <SelectTrigger className={cn("h-9 flex-1 text-xs font-medium", statusStyle)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {allowedStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {formatStatusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          variant="outline"
                          className="h-9"
                          onClick={() => viewOrderDetail(o.id)}
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 w-9 p-0 text-red-600"
                          onClick={() => confirmDelete(o.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex flex-col gap-3 p-4 border-t border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
                  <span className="text-xs sm:text-sm text-center sm:text-left">
                    Showing {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-[120px] text-sm mx-auto sm:mx-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 / page</SelectItem>
                      <SelectItem value="25">25 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                      <SelectItem value="100">100 / page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs sm:text-sm text-gray-700 px-2 sm:px-3">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setSelectedOrder(null);
            setIsDetailLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90dvh] overflow-y-auto overflow-x-hidden min-w-0 rounded-xl p-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-100 pr-12">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600 shrink-0" />
              Order Details
            </DialogTitle>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="min-h-[280px] flex flex-col justify-center p-6">
              <PageLoader message="Loading order details..." />
            </div>
          ) : selectedOrder ? (
            <div className="space-y-4 p-4 sm:p-6">
              {/* Summary strip */}
              <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-slate-50 to-blue-50/40 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold text-gray-900 break-all">
                      {selectedOrder.order_number}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(selectedOrder.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total</p>
                    <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                      {formatRs(selectedOrder.total_amount)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
                      getOrderStatusStyle(selectedOrder.status),
                    )}
                  >
                    {formatStatusLabel(selectedOrder.status)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                    <Wallet className="h-3 w-3" />
                    {formatPaymentMethod(selectedOrder.payment_method)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                    <Package className="h-3 w-3" />
                    {selectedOrder.items.length} items
                  </span>
                </div>
              </div>

              {/* Status update */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Update Status
                </Label>
                {(() => {
                  const allowedStatusOptions = getAllowedStatusOptions(selectedOrder.status);
                  const isTerminal = isTerminalOrderStatus(selectedOrder.status);
                  return (
                    <div className="mt-2 space-y-2">
                      <Select
                        value={selectedOrder.status}
                        onValueChange={(value) => handleStatusUpdate(selectedOrder.id, value)}
                        disabled={!!statusUpdatingIds[selectedOrder.id] || isTerminal}
                      >
                        <SelectTrigger className="w-full sm:w-64 text-sm font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedStatusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {formatStatusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isTerminal && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                          {selectedOrder.status === "CANCELLED" ? (
                            <Ban className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          )}
                          <p className="text-[11px] text-amber-800 font-medium">
                            This order is {formatStatusLabel(selectedOrder.status).toLowerCase()} and
                            locked. Status cannot be changed from here.
                          </p>
                        </div>
                      )}
                      {selectedOrder.status === "CANCELLED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!!statusUpdatingIds[selectedOrder.id]}
                          onClick={() => handleReopenOrder(selectedOrder.id)}
                        >
                          {statusUpdatingIds[selectedOrder.id] ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Loader className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Re-open order
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Customer & delivery */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </p>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      {selectedOrder.customer_name || "N/A"}
                    </p>
                    <p className="text-gray-600 flex items-center gap-2 break-all">
                      <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                      {selectedOrder.customer_phone || "N/A"}
                    </p>
                    <p className="text-gray-600 flex items-center gap-2 break-all">
                      <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                      {selectedOrder.customer_email || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Delivery
                  </p>
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-800 flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                      <span>
                        {selectedOrder.delivery_address
                          ? `${selectedOrder.delivery_address}${
                              selectedOrder.delivery_city
                                ? `, ${selectedOrder.delivery_city}`
                                : ""
                            }${
                              selectedOrder.delivery_postal_code
                                ? ` (${selectedOrder.delivery_postal_code})`
                                : ""
                            }`
                          : "N/A"}
                      </span>
                    </p>
                    {selectedOrder.order_notes ? (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5">
                        <p className="text-[10px] font-semibold uppercase text-amber-700">Notes</p>
                        <p className="text-xs text-amber-900 mt-0.5">{selectedOrder.order_notes}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">
                    Items ({selectedOrder.items.length})
                  </p>
                </div>
                {selectedOrder.items.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 text-sm">
                    Product details are not available for this order.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 p-3 md:hidden">
                      {selectedOrder.items.map((item, idx) => (
                        <div
                          key={`${item.productId || item.product_id || idx}-${idx}`}
                          className="rounded-lg border border-gray-100 bg-slate-50 p-3"
                        >
                          <p className="font-semibold text-sm text-gray-900">
                            {getOrderItemLabel(item)}
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-gray-500">Qty</p>
                              <p className="font-medium">{formatOrderItemQuantity(item)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Price</p>
                              <p className="font-medium">{formatRs(parseOrderQuantity(item.price))}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500">Total</p>
                              <p className="font-semibold">
                                {formatRs(parseOrderQuantity(item.total_price))}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80">
                            <TableHead className="font-semibold text-xs">Product</TableHead>
                            <TableHead className="font-semibold text-xs text-center">Qty</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Unit</TableHead>
                            <TableHead className="font-semibold text-xs text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrder.items.map((item, idx) => (
                            <TableRow key={`${item.productId || item.product_id || idx}-${idx}`}>
                              <TableCell className="font-medium text-sm">
                                {getOrderItemLabel(item)}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {formatOrderItemQuantity(item)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatRs(parseOrderQuantity(item.price))}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-sm">
                                {formatRs(parseOrderQuantity(item.total_price))}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-emerald-50/50">
                            <TableCell colSpan={3} className="text-right font-bold text-sm">
                              Grand Total
                            </TableCell>
                            <TableCell className="text-right font-bold text-base text-emerald-700">
                              {formatRs(selectedOrder.total_amount)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                {receiptPrinter && (
                  <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                    Printer: <span className="font-medium">{receiptPrinter}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => handleDownloadPdf(selectedOrder)}
                    disabled={isDownloadingPdf}
                  >
                    {isDownloadingPdf ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download PDF
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => handleBrowserPrint(selectedOrder)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Receipt
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => handlePrinterPrint(selectedOrder)}
                    disabled={isPrinting || !receiptPrinter}
                  >
                    {isPrinting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Printer className="h-4 w-4 mr-2" />
                    )}
                    Print to Printer
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => setIsDetailOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-10 text-center">Order details are not available.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!orderToDelete}
        onOpenChange={(open) => !open && !isDeleting && setOrderToDelete(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-xl p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The order and its data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeleting} className="w-full sm:w-auto mt-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Order"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WebsiteOrders;

