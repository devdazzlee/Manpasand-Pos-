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
import { Loader2, Eye, RefreshCcw, Search, ShoppingBag, DollarSign, Clock, Globe, Download, Printer, CheckCircle2, Filter, Trash2 } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { printReceiptViaServer, type ReceiptData } from "@/lib/print-server";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { cn } from "@/lib/utils";

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

const WebsiteOrders: React.FC = () => {
  const { toast } = useToast();
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
    const items = (order.items || []).map((item) => {
      const qty = parseOrderQuantity(item.quantity);
      const unitPrice = parseOrderQuantity(item.price);
      return {
        name: getOrderItemLabel(item),
        quantity: qty,
        price: unitPrice,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderTotal = Number(order.total_amount) || subtotal;

    return {
      storeName: "MANPASAND GENERAL STORE",
      tagline: "Quality • Service • Value",
      address: "Karachi",
      transactionId: order.order_number,
      timestamp: order.created_at,
      cashier: "Website",
      customerType: "Guest Customer",
      items,
      subtotal: subtotal || orderTotal,
      total: orderTotal,
      paymentMethod: order.payment_method || "CASH",
      amountPaid: orderTotal,
      changeAmount: 0,
      thankYouMessage: "Thank you for shopping!",
      footerMessage: "Visit us again soon!",
    };
  };

  const buildReceiptHtml = (order: WebsiteOrder): string => {
    const itemsHtml = (order.items || [])
      .map((item) => {
        const name = getOrderItemLabel(item);
        const qty = parseOrderQuantity(item.quantity);
        const unitPrice = parseOrderQuantity(item.price);
        const lineTotal = parseOrderQuantity(item.total_price) || unitPrice * qty;
        return `
          <tr>
            <td>${name}</td>
            <td style="text-align:center;">${qty}</td>
            <td style="text-align:right;">Rs. ${unitPrice.toFixed(2)}</td>
            <td style="text-align:right;">Rs. ${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <html>
        <head>
          <title>Receipt ${order.order_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
            .receipt { max-width: 720px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
            .title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
            .meta { color: #555; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border-bottom: 1px solid #e5e5e5; padding: 10px 8px; font-size: 14px; }
            th { text-align: left; background: #f8f8f8; }
            .total { margin-top: 14px; text-align: right; font-size: 20px; font-weight: 700; color: #1b8f4b; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="title">Website Order Receipt</div>
            <div class="meta">Order: ${order.order_number} | Date: ${new Date(order.created_at).toLocaleString()} | Status: ${order.status}</div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Unit Price</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml || `<tr><td colspan="4" style="text-align:center;">No item details available</td></tr>`}
              </tbody>
            </table>
            <div class="total">Grand Total: Rs. ${(Number(order.total_amount) || 0).toFixed(2)}</div>
          </div>
        </body>
      </html>
    `;
  };

  const handleBrowserPrint = (order: WebsiteOrder) => {
    const html = buildReceiptHtml(order);
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast({ title: "Unable to open print window", variant: "destructive" });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
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
        name: printerInfo.name,
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
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = 15;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Website Order Receipt", 15, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Order #: ${order.order_number}`, 15, y);
      y += 6;
      doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`, 15, y);
      y += 6;
      doc.text(`Status: ${order.status}`, 15, y);
      y += 8;

      doc.setFont("helvetica", "bold");
      doc.text("Items", 15, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Product", 15, y);
      doc.text("Qty", 115, y, { align: "right" });
      doc.text("Unit Price", 150, y, { align: "right" });
      doc.text("Total", 195, y, { align: "right" });
      y += 4;
      doc.line(15, y, 195, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      for (const item of order.items || []) {
        const name = getOrderItemLabel(item);
        const qty = parseOrderQuantity(item.quantity);
        const unitPrice = parseOrderQuantity(item.price);
        const lineTotal = parseOrderQuantity(item.total_price) || unitPrice * qty;

        const splitName = doc.splitTextToSize(name, 90);
        doc.text(splitName, 15, y);
        doc.text(formatOrderItemQuantity(item), 115, y, { align: "right" });
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, 150, y, { align: "right" });
        doc.text(`Rs. ${lineTotal.toFixed(2)}`, 195, y, { align: "right" });
        y += Math.max(6, splitName.length * 5);

        if (y > 270) {
          doc.addPage();
          y = 15;
        }
      }

      y += 2;
      doc.line(15, y, 195, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Grand Total: Rs. ${(Number(order.total_amount) || 0).toFixed(2)}`, 195, y, { align: "right" });

      doc.save(`receipt-${order.order_number}.pdf`);
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
      params.pageSize = '100'; // Get more orders for website orders
      
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
      const matchesSearch = o.order_number.toLowerCase().includes(searchTerm.toLowerCase());
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
  const pendingOrders = orders.filter(order => order.status === 'PENDING').length;
  const completedOrders = orders.filter(order => order.status === 'COMPLETED').length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  if (isInitialLoading) {
    return <PageLoader message="Loading website orders..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
            Website Orders
          </h1>
          <p className="text-sm md:text-base text-gray-600">View & manage orders from website</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Website Orders</CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOrders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Rs. {(Number(totalRevenue) || 0).toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{pendingOrders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed / Avg</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-blue-600">{completedOrders} done</div>
                <p className="text-sm text-gray-500 mt-1">Avg Rs. {(Number(avgOrderValue) || 0).toFixed(2)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="h-4 w-4" />
            Filters & Options
          </div>
          <Button
            onClick={fetchOrders}
            variant="outline"
            size="sm"
            className="h-9 text-sm text-black"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Status chip row */}
        <div className="flex flex-wrap gap-2">
          {[
            { v: "", label: "All" },
            { v: "PENDING", label: "Pending" },
            { v: "PROCESSING", label: "Processing" },
            { v: "COMPLETED", label: "Completed" },
            { v: "CANCELLED", label: "Cancelled" },
          ].map((s) => (
            <Button
              key={s.v || "ALL"}
              size="sm"
              variant={statusFilter === s.v ? "default" : "outline"}
              className="h-8 text-sm"
              onClick={() => setStatusFilter(s.v)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        {/* One aligned row: search + the three dropdowns */}
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search Order #"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-10"
            />
          </div>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-10 flex-1 min-w-[150px]">
              <SelectValue placeholder="All Payments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Payments</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="CARD">Card</SelectItem>
              <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
              <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
            <SelectTrigger className="h-10 flex-1 min-w-[140px]">
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
            <SelectTrigger className="h-10 flex-1 min-w-[150px]">
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

      {/* Orders Grid */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Website Orders ({filtered.length})</CardTitle>
            <p className="text-sm text-gray-500">
              Online checkout orders and delivery requests
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4"
                >
                  <div className="h-16 rounded-xl bg-gray-100" />
                  <div className="mt-4 h-4 w-2/3 rounded bg-gray-100" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="h-12 rounded-lg bg-gray-100" />
                    <div className="h-12 rounded-lg bg-gray-100" />
                    <div className="h-12 rounded-lg bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
              <Globe className="h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">No website orders found</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Try changing your filters or check back when new online orders arrive.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {paged.map((o) => {
                  const allowedStatusOptions = getAllowedStatusOptions(o.status);
                  const isTerminal = isTerminalOrderStatus(o.status);
                  const statusStyle = getOrderStatusStyle(o.status);
                  const ts = new Date(o.created_at);

                  return (
                    <div
                      key={o.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                    >
                      <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50/40 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-blue-700">
                              <Globe className="h-4 w-4 shrink-0" />
                              <span className="text-[11px] font-semibold uppercase tracking-wide">
                                Website Order
                              </span>
                            </div>
                            <p className="mt-1 truncate font-mono text-sm font-semibold text-gray-900">
                              {o.order_number}
                            </p>
                            <p className="mt-1 truncate text-sm text-gray-600">
                              {o.customer_name?.trim() || "Guest Customer"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                              Total
                            </p>
                            <p className="text-xl font-bold text-green-700">
                              Rs. {(Number(o.total_amount) || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                              Payment
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {o.payment_method || "CASH"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                              Items
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {o.items?.length || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                              Date
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {ts.toLocaleDateString()}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {ts.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Status
                          </p>
                          <div className="flex items-center gap-2">
                            {isTerminal ? (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium",
                                  statusStyle,
                                )}
                              >
                                {o.status}
                              </span>
                            ) : (
                              <Select
                                value={o.status}
                                onValueChange={(value) => handleStatusUpdate(o.id, value)}
                                disabled={!!statusUpdatingIds[o.id]}
                              >
                                <SelectTrigger
                                  className={cn(
                                    "h-9 w-full text-xs font-medium",
                                    statusStyle,
                                  )}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedStatusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {isTerminal && (
                              <span className="inline-flex items-center rounded border border-amber-200 bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">
                                Terminal
                              </span>
                            )}
                          </div>
                          {statusUpdatingIds[o.id] && (
                            <span className="mt-2 inline-flex items-center text-xs text-blue-600">
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Updating...
                            </span>
                          )}
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => viewOrderDetail(o.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => confirmDelete(o.id)}
                            disabled={!!statusUpdatingIds[o.id]}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
                <div className="flex items-center gap-3 text-sm text-black">
                  <span>
                    Showing {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-9 w-[120px] text-sm">
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
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-black px-3">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage >= totalPages}
                  >
                    Last
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
        <DialogContent className="w-[95vw] max-h-[90vh] sm:max-w-4xl rounded-xl p-4 sm:p-6 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Website Order Details
            </DialogTitle>
          </DialogHeader>
          {isDetailLoading ? (
            <div className="min-h-[55vh] sm:min-h-[420px] flex flex-col justify-center">
              <PageLoader message="Loading order details..." />
              <div className="mt-6 space-y-3 animate-pulse">
                <div className="h-16 bg-gray-100 rounded-lg" />
                <div className="h-16 bg-gray-100 rounded-lg" />
                <div className="h-24 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ) : selectedOrder ? (
            <div className="space-y-6">
              {/* Order Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Number</Label>
                      <p className="text-base font-semibold mt-1">{selectedOrder.order_number}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Status</Label>
                      <div className="mt-1">
                        {(() => {
                          const allowedStatusOptions = getAllowedStatusOptions(selectedOrder.status);
                          const isTerminal = isTerminalOrderStatus(selectedOrder.status);

                          return (
                            <div className="flex flex-col gap-2">
                              <Select
                                value={selectedOrder.status} 
                                onValueChange={(value) => handleStatusUpdate(selectedOrder.id, value)}
                                disabled={!!statusUpdatingIds[selectedOrder.id] || isTerminal}
                              >
                                <SelectTrigger className="w-full text-sm font-semibold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {allowedStatusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              
                              {isTerminal && (
                                <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Terminal State</span>
                                    <p className="text-[11px] text-amber-700 font-medium">
                                      This order is {selectedOrder.status} and cannot be modified.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Date</Label>
                      <p className="text-base mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Payment Method</Label>
                      <p className="text-base mt-1 font-semibold">{selectedOrder.payment_method || 'CASH'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-500">Total Amount</Label>
                      <p className="text-2xl font-bold text-green-600 mt-1">Rs. {(Number(selectedOrder.total_amount) || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Delivery Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Customer Name</Label>
                      <p className="text-base mt-1">{selectedOrder.customer_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Phone</Label>
                      <p className="text-base mt-1">{selectedOrder.customer_phone || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Email</Label>
                      <p className="text-base mt-1">{selectedOrder.customer_email || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Postal Code</Label>
                      <p className="text-base mt-1">{selectedOrder.delivery_postal_code || "N/A"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-500">Delivery Address</Label>
                      <p className="text-base mt-1">
                        {selectedOrder.delivery_address
                          ? `${selectedOrder.delivery_address}${selectedOrder.delivery_city ? `, ${selectedOrder.delivery_city}` : ""}`
                          : "N/A"}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-500">Order Notes</Label>
                      <p className="text-base mt-1">{selectedOrder.order_notes || "N/A"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Items ({selectedOrder.items.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedOrder.items.length === 0 ? (
                    <div className="text-center text-gray-500 py-6">
                      Product details are not available for this order.
                    </div>
                  ) : (
                    <>
                      {/* Mobile cards */}
                      <div className="space-y-3 md:hidden">
                        {selectedOrder.items.map((item, idx) => (
                          <div key={`${item.productId || item.product_id || idx}-${idx}`} className="rounded-lg border p-3 bg-gray-50">
                            <p className="font-semibold text-base mb-2">{getOrderItemLabel(item)}</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <p className="text-gray-500">Quantity</p>
                                <p className="font-medium">{formatOrderItemQuantity(item)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-gray-500">Unit Price</p>
                                <p className="font-medium">Rs. {parseOrderQuantity(item.price).toFixed(2)}</p>
                              </div>
                              <div className="col-span-2 text-right pt-1 border-t mt-1">
                                <p className="text-gray-500">Total</p>
                                <p className="font-semibold">Rs. {parseOrderQuantity(item.total_price).toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="rounded-lg border p-3 bg-green-50">
                          <p className="text-right text-sm text-gray-600">Grand Total</p>
                          <p className="text-right font-bold text-lg text-green-700">
                            Rs. {(Number(selectedOrder.total_amount) || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Product Name</TableHead>
                          <TableHead className="font-semibold text-center">Quantity</TableHead>
                          <TableHead className="font-semibold text-right">Unit Price</TableHead>
                          <TableHead className="font-semibold text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item, idx) => (
                              <TableRow key={`${item.productId || item.product_id || idx}-${idx}`}>
                                <TableCell className="font-medium">{getOrderItemLabel(item)}</TableCell>
                            <TableCell className="text-center">{formatOrderItemQuantity(item)}</TableCell>
                            <TableCell className="text-right">Rs. {parseOrderQuantity(item.price).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">Rs. {parseOrderQuantity(item.total_price).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={3} className="text-right font-bold">Grand Total:</TableCell>
                          <TableCell className="text-right font-bold text-lg text-green-600">
                            Rs. {(Number(selectedOrder.total_amount) || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-4 border-t">
                {receiptPrinter && (
                  <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                    🖨️ <span className="font-medium">{receiptPrinter}</span>
                  </div>
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
                  variant="outline" 
                  onClick={() => setIsDetailOpen(false)}
                >
                  Close
                </Button>
                <Button 
                    className="w-full sm:w-auto"
                  onClick={() => {
                    fetchOrders();
                    setIsDetailOpen(false);
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-6">Order details are not available.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && !isDeleting && setOrderToDelete(null)}>
        <AlertDialogContent className="w-[95vw] max-w-md rounded-xl p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the order and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
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

