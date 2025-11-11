"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  RefreshCw,
  Download,
  Printer,
  CalendarIcon,
  Eye,
  Loader2,
} from "lucide-react";
import {
  format,
  parseISO,
  isWithinInterval,
  startOfDay,
  endOfDay,
} from "date-fns";
import { isKioskMode } from "@/utils/kiosk-printing";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getPrinters, printReceiptViaServer, type ReceiptData } from "@/lib/print-server";

interface SaleItem {
  id: string;
  product: { name: string; sku?: string };
  quantity: number;
  unit_price?: string;
  line_total: string;
}

interface Customer {
  id: string;
  email: string;
}

interface Sale {
  id: string;
  sale_number: string;
  sale_date: string;
  total_amount: string;
  subtotal?: string;
  tax_amount?: string;
  discount_amount?: string;
  payment_method: string;
  payment_status?: string;
  status: string;
  customer: Customer | null;
  sale_items: SaleItem[];
  notes?: string;
  created_at?: string;
}

interface BranchInfo {
  name: string;
  address: string;
}

interface PrinterOption {
  name: string;
  isDefault?: boolean;
  status?: string;
  receiptProfile?: {
    roll?: string;
    printableWidthMM?: number;
    columns?: {
      fontA: number;
      fontB: number;
    };
  };
  languageHint?: string;
}

export function SalesHistory() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [branchInfo, setBranchInfo] = useState<BranchInfo>({
    name: "MANPASAND GENERAL STORE",
    address: "Karachi",
  });
  const [receiptHtml, setReceiptHtml] = useState<string>("");
  const [iframeHeight, setIframeHeight] = useState<number>(620);
  const receiptIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [kioskMode, setKioskMode] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Helper function to safely format currency
  const formatCurrency = (
    value: string | number | undefined,
    showNegativeSymbol: boolean = true
  ): string => {
    if (!value && value !== 0) return "Rs 0.00";

    const numValue = typeof value === "string" ? parseFloat(value) : value;

    // Check if the number is valid
    if (isNaN(numValue)) return "Rs 0.00";

    // Handle negative values
    if (numValue < 0) {
      const absValue = Math.abs(numValue);
      if (showNegativeSymbol) {
        return `-Rs ${absValue.toFixed(2)}`;
      } else {
        // For display purposes, show absolute value
        return `Rs ${absValue.toFixed(2)}`;
      }
    }

    return `Rs ${numValue.toFixed(2)}`;
  };

  // Helper function to get sale type based on total amount
  const getSaleType = (totalAmount: string): "sale" | "refund" | "return" => {
    const amount = parseFloat(totalAmount);
    if (isNaN(amount)) return "sale";
    return amount < 0 ? "refund" : "sale";
  };

  // Fetch sales
  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: Sale[] }>("/sale");

      // Filter out or handle invalid sales data
      const validSales = res.data.data.filter((sale) => {
        // Basic validation
        return (
          sale.id &&
          sale.sale_number &&
          sale.sale_date &&
          sale.total_amount !== undefined
        );
      });

      setSales(validSales);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
      toast({ title: "Failed to load sales", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  useEffect(() => {
    const loadBranchInfo = async () => {
      try {
        const branchStr = localStorage.getItem("branch");
        if (!branchStr) return;
        setBranchInfo((prev) => ({
          ...prev,
          name: branchStr,
        }));
        const branchRes = await apiClient.get(`/branches/${branchStr}`);
        setBranchInfo({
          name: branchRes.data.data.name || branchStr,
          address: branchRes.data.data.address || "Karachi",
        });
      } catch (error) {
        console.warn("Failed to load branch info", error);
      }
    };
    loadBranchInfo();
  }, []);

  useEffect(() => {
    setKioskMode(isKioskMode());
    const loadPrinters = async () => {
      try {
        const result = await getPrinters();
        if (result.success && result.data?.length) {
          setPrinters(result.data);
          const defaultPrinter =
            result.data.find((p) => p.isDefault) || result.data[0];
          setSelectedPrinter(defaultPrinter.name);
        }
      } catch (error: any) {
        console.error("Failed to load printers:", error);
        toast({
          variant: "destructive",
          title: "Printer list unavailable",
          description: error?.message || "Could not load available printers.",
        });
      }
    };
    loadPrinters();
    if (isKioskMode()) {
      setSelectedPrinter((prev) => prev || "Default Printer");
    }
  }, [toast]);

  // Filtered
  const filtered = useMemo(() => {
    return sales.filter((s) => {
      // Search by sale number or customer email
      const term = searchTerm.toLowerCase();
      if (
        term &&
        !s.sale_number.toLowerCase().includes(term) &&
        !s.customer?.email.toLowerCase().includes(term)
      ) {
        return false;
      }
      // Date filter
      if (startDate && endDate) {
        try {
          const d = parseISO(s.sale_date);
          if (
            !isWithinInterval(d, {
              start: startOfDay(startDate),
              end: endOfDay(endDate),
            })
          ) {
            return false;
          }
        } catch (error) {
          console.warn("Invalid date format for sale:", s.id, s.sale_date);
          return false;
        }
      }
      return true;
    });
  }, [sales, searchTerm, startDate, endDate]);

  // Export CSV
  const exportCSV = () => {
    const header = [
      "Sale #",
      "Date",
      "Customer",
      "Payment",
      "Total",
      "Status",
      "Type",
    ];
    const rows = filtered.map((s) => [
      s.sale_number,
      format(parseISO(s.sale_date), "yyyy-MM-dd"),
      s.customer?.email || "—",
      s.payment_method,
      formatCurrency(s.total_amount, true), // Include negative symbol in export
      s.status,
      getSaleType(s.total_amount).toUpperCase(),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print
  const printTable = () => window.print();

  const prepareReceiptDataFromSale = (sale: Sale, branch: BranchInfo): ReceiptData => {
    const subtotalFromApi = sale.subtotal ? parseFloat(sale.subtotal) : NaN;
    const subtotal =
      !isNaN(subtotalFromApi) && subtotalFromApi > 0
        ? subtotalFromApi
        : sale.sale_items.reduce((sum, item) => sum + parseFloat(item.line_total || "0"), 0);
    const discount = sale.discount_amount ? parseFloat(sale.discount_amount) : 0;
    const taxAmount = sale.tax_amount ? parseFloat(sale.tax_amount) : 0;
    const total = parseFloat(sale.total_amount);
    const taxable = Math.max(0, subtotal - discount);
    const taxPercent =
      taxable > 0 && taxAmount > 0 ? (taxAmount / taxable) * 100 : undefined;

    const items = sale.sale_items.map((item) => {
      const lineTotal = parseFloat(item.line_total || "0");
      const unitPrice =
        item.unit_price !== undefined
          ? parseFloat(item.unit_price)
          : lineTotal / Math.max(1, item.quantity);

      const unitLabel =
        (item.product as any)?.unit?.name ||
        (item.product as any)?.unit_name ||
        (item as any)?.unit?.name ||
        (item as any)?.unit_name ||
        undefined;

      return {
        name: item.product?.name || "Unnamed Item",
        quantity: item.quantity,
        price: unitPrice,
        unit: unitLabel,
      };
    });

    return {
      storeName: branch.name || "MANPASAND GENERAL STORE",
      tagline: "Quality • Service • Value",
      address: branch.address ? `${branch.address}, Karachi` : "Karachi",
      transactionId: sale.sale_number,
      timestamp: sale.created_at || sale.sale_date,
      cashier: "Walk-in",
      customerType: sale.customer?.email || "Walk-in",
      items,
      subtotal,
      discount: discount > 0 ? discount : undefined,
      taxPercent,
      total,
      paymentMethod: sale.payment_method,
      amountPaid: total,
      changeAmount: 0,
      promo: sale.notes,
      thankYouMessage: "Thank you for shopping!",
      footerMessage: "Visit us again soon!",
    };
  };

  const generateReceiptHtml = (data: ReceiptData) => {
    const subtotal = Number(data.subtotal || 0);
    const discount = Number(data.discount || 0);
    const taxable = Math.max(0, subtotal - discount);
    const taxPercent = data.taxPercent || 0;
    const tax = taxPercent > 0 ? (taxable * taxPercent) / 100 : 0;
    const total = Number(data.total || subtotal - discount + tax);
    const paid = data.amountPaid ?? total;
    const change = data.changeAmount ?? 0;
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    const itemsHtml = (data.items || [])
      .map((item) => {
        const name =
          item.name.length > 20 ? `${item.name.substring(0, 17)}...` : item.name;
        const unitLabel = item.unit ? String(item.unit) : "";
        const qty = unitLabel ? `${item.quantity} ${unitLabel}` : `${item.quantity}`;
        const rate = `PKR ${((item.price || 0) * (item.quantity || 0)).toFixed(1)}`;
        return `<div class="item-row">
  <div class="item-name">${name}</div>
  <div class="item-qty">${qty}</div>
  <div class="item-rate">${rate}</div>
</div>
${
  item.name.length > 20
    ? `<div class="item-sub-row"><div class="item-sub-name">${item.name}</div><div class="item-sub-qty"></div><div class="item-sub-rate"></div></div>`
    : ""
}`;
      })
      .join("");
    const promoHtml = data.promo ? `<div class="promo">${data.promo}</div>` : "";
    return `
<div class="receipt">
<div class="logo">
<img 
  src="${window.location.origin}/logo.png" 
  alt="Logo" 
  style="max-width:140px;height:50px;display:block;margin:0 auto;
         object-fit:contain;
         filter: grayscale(100%) contrast(200%);
         image-rendering: pixelated;
         -webkit-print-color-adjust: exact; 
         print-color-adjust: exact;" />
</div>
<div class="store-header">${(data.storeName || "MANPASAND GENERAL STORE").toUpperCase()}</div>
<div class="tagline">${data.tagline || "Quality • Service • Value"}</div>
<div class="address">${data.address || "Karachi"}</div>

<div class="divider">-------------------------------------</div>

<div class="receipt-info">Receipt # <span class="receipt-number">${data.transactionId}</span></div>
<div class="receipt-info">${timestamp.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    })} ${timestamp.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}</div>
<div class="flex-item-row-cs">
<div class="receipt-info">Cashier: ${data.cashier || "Walk-in"}</div>
<div class="receipt-info">${data.customerType || "Walk-in"}</div>  
</div>

<div class="divider">-------------------------------------</div>

<div class="items-section">
<div class="items-header">
  <div class="item-col">ITEM</div>
  <div class="qty-col">QTY</div>
  <div class="rate-col">RATE</div>
</div>

${itemsHtml}
</div>

<div class="divider">-------------------------------------</div>

<div class="flex-item-row-cs">
<div class="receipt-info">Subtotal</div>
<div class="receipt-info">PKR ${subtotal.toFixed(2)}</div>
</div>
${discount > 0
        ? `
<div class="flex-item-row-cs">
<div class="receipt-info">Discount</div>
<div class="receipt-info">PKR ${discount.toFixed(2)}</div>
</div>`
        : ""
      }
${tax > 0
        ? `
<div class="flex-item-row-cs">
<div class="receipt-info">Tax${taxPercent ? ` (${taxPercent.toFixed(0)}%)` : ""}</div>
<div class="receipt-info">PKR ${tax.toFixed(2)}</div>
</div>`
        : ""
      }
<div class="flex-item-row-cs">
<div class="receipt-info">Grand Total</div>
<div class="receipt-info">PKR ${total.toFixed(2)}</div>
</div>

<div class="divider">-------------------------------------</div>
<div class="flex-item-row-cs">
<div class="payment-info">Payment Method:</div>
<div class="payment-method">${(data.paymentMethod || "CASH").toUpperCase()}</div>
</div>
<div class="flex-item-row-cs">
<div class="payment-info">Amount Paid:</div>
<div class="payment-method">PKR ${paid.toFixed(2)}</div> 
</div>
${change > 0
        ? `
<div class="flex-item-row-cs">
<div class="payment-info">Change:</div>
<div class="payment-method">PKR ${change.toFixed(2)}</div>
</div>`
        : ""
      }
  
${promoHtml}

<div class="barcode-section">
<div class="barcode">
  <svg id="barcode-svg"></svg>
</div>
<div class="barcode-number" id="barcode-number">${data.transactionId}</div>
</div>

<div class="thank-you">${data.thankYouMessage || "Thank you for shopping with us!"
      }</div>
<div style="font-size: 15px; margin-top: 6px; font-weight: bold; color: #000000;">
  ${data.footerMessage || "Visit us again soon!"}
</div>
</div>
`;
  };

  const receiptPageWrapper = (content: string) => `
    <html>
      <head>
        <title>Receipt</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            height: auto;
            min-height: auto;
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.2;
            color: #000000;
            font-weight: bold;
            display: block;
            padding: 0;
          }
          .receipt {
            width: 100mm;
            max-width: 500px;
            background: #ffffff;
            color: #000000;
            font-weight: bold;
            text-align: center;
            padding: 1mm 2mm;
            margin: 0 auto;
            box-sizing: border-box;
            height: auto;
            min-height: auto;
          }
          .logo {
            text-align: center;
            margin-bottom: 12px;
          }
          .logo img {
            max-width: 180px;
            height: 50px;
            display: block;
            margin: 0 auto;
            object-fit: contain;
          }
          .store-header {
            font-weight: 900;
            font-size: 24px;
            margin-bottom: 6px;
            color: #000000;
          }
          .tagline, .address {
            font-size: 16px;
            margin-bottom: 4px;
            color: #000000;
            font-weight: bold;
          }
          .divider {
            margin: 6px 0;
            color: #000000;
            font-weight: bold;
            border: none;
            text-align: center;
            font-size: 16px;
          }
          .receipt-info, .payment-info {
            text-align: left;
            font-size: 16px;
            margin: 4px 0;
            color: #000000;
            font-weight: bold;
          }
          .receipt-number, .payment-method {
            font-weight: 900;
            color: #000000;
          }
          .flex-item-row-cs {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            box-sizing: border-box;
            white-space: nowrap;
          }
          .items-section {
            margin: 8px 0;
            font-size: 16px;
            line-height: 1.4;
            text-align: left;
          }
          .items-header {
            display: flex;
            justify-content: space-between;
            font-weight: 900;
            font-size: 18px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 3px;
            margin-bottom: 4px;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
            font-size: 14px;
          }
          .item-name {
            flex: 2;
            padding-right: 8px;
          }
          .item-qty {
            flex: 1;
            text-align: center;
          }
          .item-rate {
            flex: 1;
            text-align: right;
          }
          .item-sub-row {
            display: flex;
            margin: 2px 0 4px 0;
            font-style: italic;
            opacity: 0.7;
            font-size: 12px;
          }
          .barcode-section {
            text-align: center;
            margin: 10px 0;
          }
          .barcode svg {
            max-width: 100%;
            height: 50px;
          }
          .barcode-number {
            font-size: 14px;
            margin-top: 6px;
            font-weight: bold;
            letter-spacing: 2px;
          }
          .thank-you {
            font-size: 17px;
            margin-top: 10px;
            font-weight: 900;
          }
          .promo {
            padding: 6px;
            margin: 8px 0;
            font-size: 14px;
            text-align: left;
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            const barcodeElement = document.getElementById('barcode-svg');
            const barcodeNumber = document.getElementById('barcode-number')?.textContent || '';
            if (barcodeElement && barcodeNumber && window.JsBarcode) {
              try {
                JsBarcode(barcodeElement, barcodeNumber, {
                  format: "CODE128",
                  width: 2,
                  height: 50,
                  displayValue: false,
                  margin: 0,
                  background: "#ffffff",
                  lineColor: "#000000"
                });
              } catch (err) {
                console.error('Barcode generation failed:', err);
              }
            }
          };
        </script>
      </body>
    </html>
  `;

  // Fetch single sale (simulate API call, but use local data for now)
  const handleViewSale = async (saleId: string) => {
    setViewLoading(true);
    // Simulate API call delay
    const sale = sales.find((s) => s.id === saleId) || null;
    setTimeout(() => {
      setViewSale(sale);
      setViewLoading(false);
    }, 300); // Simulate network delay
  };

  const closeViewModal = () => {
    setViewSale(null);
    setViewLoading(false);
  };

  useEffect(() => {
    if (viewSale) {
      const data = prepareReceiptDataFromSale(viewSale, branchInfo);
      const content = generateReceiptHtml(data);
      setReceiptData(data);
      setReceiptHtml(receiptPageWrapper(content));
    } else {
      setReceiptHtml("");
      setReceiptData(null);
    }
  }, [viewSale, branchInfo]);

  useEffect(() => {
    const iframe = receiptIframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const body = doc.body;
        const html = doc.documentElement;
        const height = Math.max(
          body?.scrollHeight ?? 0,
          body?.offsetHeight ?? 0,
          html?.clientHeight ?? 0,
          html?.scrollHeight ?? 0,
          html?.offsetHeight ?? 0
        );
        setIframeHeight(Math.max(420, height + 24));
      } catch (error) {
        console.warn("Failed to measure receipt height", error);
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [receiptHtml]);

  const handleBrowserPrintReceipt = () => {
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

  const handleServerPrint = async () => {
    if (!receiptData) {
      toast({ title: "No receipt data available", variant: "destructive" });
      return;
    }
    const printerName = kioskMode
      ? selectedPrinter || "Default Printer"
      : selectedPrinter;
    if (!printerName) {
      toast({
        variant: "destructive",
        title: "Select a printer",
        description: "Choose a printer before printing the receipt.",
      });
      return;
    }
    const printerObj = {
      name: printerName,
      columns:
        printers.find((p) => p.name === printerName)?.receiptProfile?.columns ||
        { fontA: 48, fontB: 64 },
    };
    const job = { copies: 1, cut: true, openDrawer: false };
    try {
      const result = await printReceiptViaServer(printerObj, receiptData, job);
      if (result.success) {
        toast({
          title: "Receipt sent to printer",
          description: `Printer: ${printerName}`,
        });
      } else {
        throw new Error(result.error || "Print server error");
      }
    } catch (error: any) {
      console.error("Server print failed:", error);
      toast({
        variant: "destructive",
        title: "Print failed",
        description: error?.message || "Unable to print via print server.",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Sales History</h1>
          <p className="text-sm md:text-base text-gray-600">View and export past sales</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={fetchSales} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" onClick={printTable}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 sm:max-w-sm relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-10"
            placeholder="Search sale # or customer"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate && endDate
                ? `${format(startDate, "MM/dd/yyyy")} - ${format(
                    endDate,
                    "MM/dd/yyyy"
                  )}`
                : "Select date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                />
              </div>
              <div>
                <Label>To</Label>
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => date && setEndDate(date)}
                />
              </div>
            </div>
            <Separator className="my-2" />
            <Button
              onClick={() => {
                setStartDate(undefined);
                setEndDate(undefined);
              }}
              className="w-full"
            >
              Clear Dates
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Sale #</TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[100px]">Payment</TableHead>
                    <TableHead className="min-w-[100px]">Total</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10">
                      <Loader2 className="animate-spin h-6 w-6 text-gray-500 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-10 text-gray-500"
                    >
                      No sales found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => {
                    const saleType = getSaleType(s.total_amount);
                    const isNegative = parseFloat(s.total_amount) < 0;

                    return (
                      <TableRow
                        key={s.id}
                        className={isNegative ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-medium">
                          {s.sale_number}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(s.sale_date), "MM/dd/yyyy")}
                        </TableCell>
                        <TableCell>{s.customer?.email || "—"}</TableCell>
                        <TableCell>{s.payment_method}</TableCell>
                        <TableCell
                          className={
                            isNegative ? "text-red-600 font-medium" : ""
                          }
                        >
                          {formatCurrency(s.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              saleType === "refund" ? "destructive" : "default"
                            }
                          >
                            {saleType.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.status === "COMPLETED" ? "default" : "outline"
                            }
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewSale(s.id)}
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
          </div>
        </CardContent>
      </Card>

      {/* Sale Receipt Modal */}
      <Dialog open={!!viewSale || viewLoading} onOpenChange={closeViewModal}>
        <DialogContent className="max-w-3xl">
          {viewLoading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8 text-gray-500 mb-4" />
              <span>Loading sale details...</span>
            </div>
          ) : viewSale ? (
            <>
              <DialogHeader>
                <DialogTitle>Sale Receipt</DialogTitle>
                <DialogDescription>
                  View and print the receipt exactly as it appears at checkout.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[75vh] overflow-auto">
                {receiptHtml ? (
                  <iframe
                    ref={receiptIframeRef}
                    title="Receipt Preview"
                    srcDoc={receiptHtml}
                    className="block mx-auto rounded-xl border border-gray-200 shadow-inner bg-white"
                    style={{
                      width: "100%",
                      maxWidth: "100mm",
                      height: `${iframeHeight}px`,
                    }}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-10">
                    Receipt preview unavailable.
                  </div>
                )}
              </div>
              <DialogFooter className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:w-auto">
                  <div className="text-sm text-gray-500">
                    Sale #{viewSale.sale_number} • {format(parseISO(viewSale.sale_date), "PPpp")}
                  </div>
                  {printers.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Printer
                      </span>
                      <select
                        className="h-9 rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedPrinter}
                        onChange={(e) => setSelectedPrinter(e.target.value)}
                      >
                        <option value="">Choose printer</option>
                        {printers.map((printer) => (
                          <option key={printer.name} value={printer.name}>
                            {printer.name} {printer.isDefault ? "(Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  {(printers.length > 0 || kioskMode) && (
                    <Button onClick={handleServerPrint} disabled={!selectedPrinter && !kioskMode}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print to Printer
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleBrowserPrintReceipt}>
                    Browser Print
                  </Button>
                  <Button variant="ghost" onClick={closeViewModal}>
                    Close
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
