"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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

export function SalesHistory() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales History</h1>
          <p className="text-gray-600">View and export past sales</p>
        </div>
        <div className="flex space-x-2">
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
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 max-w-sm relative">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
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
        </CardContent>
      </Card>

      {/* Sale View Modal */}
      <Dialog open={!!viewSale || viewLoading} onOpenChange={closeViewModal}>
        <DialogContent className="max-w-2xl">
          {viewLoading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8 text-gray-500 mb-4" />
              <span>Loading sale details...</span>
            </div>
          ) : viewSale ? (
            <>
              <DialogHeader>
                <DialogTitle>Sale Details</DialogTitle>
                <DialogDescription>
                  Sale #:{" "}
                  <span className="font-semibold">{viewSale.sale_number}</span>{" "}
                  | Date: {format(parseISO(viewSale.sale_date), "MM/dd/yyyy")} |
                  Status:{" "}
                  <Badge
                    variant={
                      viewSale.status === "COMPLETED" ? "default" : "outline"
                    }
                  >
                    {viewSale.status}
                  </Badge>
                  {getSaleType(viewSale.total_amount) === "refund" && (
                    <Badge variant="destructive" className="ml-2">
                      REFUND
                    </Badge>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="mb-2">
                    <span className="font-medium">Payment Method:</span>{" "}
                    {viewSale.payment_method}
                  </div>
                  {viewSale.payment_status && (
                    <div className="mb-2">
                      <span className="font-medium">Payment Status:</span>{" "}
                      {viewSale.payment_status}
                    </div>
                  )}
                  {viewSale.subtotal && (
                    <div className="mb-2">
                      <span className="font-medium">Subtotal:</span>{" "}
                      {formatCurrency(viewSale.subtotal)}
                    </div>
                  )}
                  {viewSale.tax_amount && (
                    <div className="mb-2">
                      <span className="font-medium">Tax:</span>{" "}
                      {formatCurrency(viewSale.tax_amount)}
                    </div>
                  )}
                  {viewSale.discount_amount && (
                    <div className="mb-2">
                      <span className="font-medium">Discount:</span>{" "}
                      {formatCurrency(viewSale.discount_amount)}
                    </div>
                  )}
                  <div className="mb-2">
                    <span className="font-medium">Total:</span>
                    <span
                      className={
                        parseFloat(viewSale.total_amount) < 0
                          ? "text-red-600 font-medium"
                          : ""
                      }
                    >
                      {formatCurrency(viewSale.total_amount)}
                    </span>
                  </div>
                  {viewSale.notes && (
                    <div className="mb-2">
                      <span className="font-medium">Notes:</span>{" "}
                      {viewSale.notes}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-2">
                    <span className="font-medium">Customer Email:</span>{" "}
                    {viewSale.customer?.email || "—"}
                  </div>
                  <div className="mb-2">
                    <span className="font-medium">Sale ID:</span> {viewSale.id}
                  </div>
                  {viewSale.created_at && (
                    <div className="mb-2">
                      <span className="font-medium">Created At:</span>{" "}
                      {format(
                        parseISO(viewSale.created_at),
                        "MM/dd/yyyy HH:mm"
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Separator className="my-4" />
              <div>
                <div className="font-semibold mb-2">Sale Items</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewSale.sale_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.product?.name || "—"}</TableCell>
                        <TableCell>{item.product?.sku || "—"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {formatCurrency(
                            item.unit_price ||
                              (
                                parseFloat(item.line_total) / item.quantity
                              ).toString()
                          )}
                        </TableCell>
                        <TableCell>{formatCurrency(item.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button onClick={closeViewModal} variant="outline">
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
