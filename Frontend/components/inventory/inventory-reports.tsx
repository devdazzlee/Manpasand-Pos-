"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

const REPORT_TYPES = [
  { value: "valuation", label: "Stock Valuation" },
  { value: "purchase", label: "Purchase Report" },
  { value: "transfer", label: "Transfer Report" },
  { value: "stockout", label: "Stock Out Report" },
  { value: "lowstock", label: "Low Stock Report" },
];

export function InventoryReports() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState("valuation");
  const [data, setData] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    branchId: "",
    supplierId: "",
    startDate: "",
    endDate: "",
  });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { type: reportType };
      if (filters.branchId) params.branchId = filters.branchId;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await apiClient.get(`${API_BASE}/inventory/reports`, { params });
      setData(res.data?.data);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [reportType, filters, toast]);

  const fetchMeta = useCallback(async () => {
    try {
      const [bRes, sRes] = await Promise.all([
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/suppliers`),
      ]);
      setBranches(bRes.data?.data || bRes.data || []);
      setSuppliers(sRes.data?.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportCSV = () => {
    if (!data) return;
    let headers: string[] = [];
    let rows: any[] = [];
    if (reportType === "valuation" && data.byLocation) {
      const locs = Object.entries(data.byLocation);
      locs.forEach(([bid, loc]: [string, any]) => {
        (loc.items || []).forEach((item: any) => {
          rows.push([item.product?.name, item.product?.sku, bid, item.quantity, item.value]);
        });
      });
      headers = ["Product", "SKU", "Branch", "Qty", "Value"];
    } else if (Array.isArray(data)) {
      if (reportType === "purchase" && data[0]) {
        headers = ["Date", "Product", "Supplier", "Qty", "Cost", "Warehouse"];
        rows = data.map((d: any) => [
          new Date(d.purchase_date).toLocaleDateString(),
          d.product?.name,
          d.supplier?.name,
          d.quantity,
          d.cost_price,
          d.warehouse_branch?.name,
        ]);
      } else if (reportType === "transfer" && data[0]) {
        headers = ["Date", "Product", "From", "To", "Qty", "Status"];
        rows = data.map((d: any) => [
          new Date(d.transfer_date).toLocaleDateString(),
          d.product?.name,
          d.from_branch?.name,
          d.to_branch?.name,
          d.quantity,
          d.status,
        ]);
      } else if (reportType === "stockout" && data[0]) {
        headers = ["Date", "Product", "Branch", "Qty", "Type"];
        rows = data.map((d: any) => [
          new Date(d.created_at).toLocaleDateString(),
          d.product?.name,
          d.branch?.name,
          d.quantity_change,
          d.movement_type,
        ]);
      } else if (reportType === "lowstock" && data[0]) {
        headers = ["Product", "SKU", "Branch", "Qty", "Min"];
        rows = data.map((d: any) => [
          d.product?.name,
          d.product?.sku,
          d.branch?.name,
          d.current_quantity,
          d.product?.min_qty ?? d.minimum_quantity,
        ]);
      }
    }
    if (headers.length && rows.length) {
      const csv = [headers.join(","), ...rows.map((r) => r.map((c: any) => `"${c}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-${reportType}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "CSV downloaded" });
    }
  };

  const formatCurrency = (n: number) => `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventory Reports</h1>
          <p className="text-sm text-gray-600">Stock valuation, purchases, transfers, and more</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!data}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.branchId || "all"}
          onValueChange={(v) => setFilters({ ...filters, branchId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.filter((b) => b.id).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reportType === "purchase" && (
          <Select
            value={filters.supplierId || "all"}
            onValueChange={(v) => setFilters({ ...filters, supplierId: v === "all" ? "" : v })}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.filter((s) => s.id).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          className="w-40"
        />
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          className="w-40"
        />
        <Button onClick={fetchReport}>Apply</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {REPORT_TYPES.find((r) => r.value === reportType)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading report..." />
          ) : reportType === "valuation" && data?.byLocation ? (
            <div className="space-y-4">
              <p className="text-lg font-semibold">Total Value: {formatCurrency(data.total || 0)}</p>
              {Object.entries(data.byLocation).map(([bid, loc]: [string, any]) => (
                <div key={bid}>
                  <p className="font-medium mb-2">Branch: {bid}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(loc.items || []).map((item: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>{item.product?.name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{formatCurrency(item.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          ) : Array.isArray(data) && data.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportType === "purchase" && (
                      <>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Warehouse</TableHead>
                      </>
                    )}
                    {reportType === "transfer" && (
                      <>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                    {reportType === "stockout" && (
                      <>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Type</TableHead>
                      </>
                    )}
                    {reportType === "lowstock" && (
                      <>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Min</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((d: any, i: number) => (
                    <TableRow key={i}>
                      {reportType === "purchase" && (
                        <>
                          <TableCell>{new Date(d.purchase_date).toLocaleDateString()}</TableCell>
                          <TableCell>{d.product?.name}</TableCell>
                          <TableCell>{d.supplier?.name}</TableCell>
                          <TableCell>{d.quantity}</TableCell>
                          <TableCell>{formatCurrency(Number(d.cost_price))}</TableCell>
                          <TableCell>{d.warehouse_branch?.name}</TableCell>
                        </>
                      )}
                      {reportType === "transfer" && (
                        <>
                          <TableCell>{new Date(d.transfer_date).toLocaleDateString()}</TableCell>
                          <TableCell>{d.product?.name}</TableCell>
                          <TableCell>{d.from_branch?.name}</TableCell>
                          <TableCell>{d.to_branch?.name}</TableCell>
                          <TableCell>{d.quantity}</TableCell>
                          <TableCell>{d.status}</TableCell>
                        </>
                      )}
                      {reportType === "stockout" && (
                        <>
                          <TableCell>{new Date(d.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>{d.product?.name}</TableCell>
                          <TableCell>{d.branch?.name}</TableCell>
                          <TableCell>{d.quantity_change}</TableCell>
                          <TableCell>{d.movement_type}</TableCell>
                        </>
                      )}
                      {reportType === "lowstock" && (
                        <>
                          <TableCell>{d.product?.name}</TableCell>
                          <TableCell>{d.product?.sku}</TableCell>
                          <TableCell>{d.branch?.name}</TableCell>
                          <TableCell>{Number(d.current_quantity)}</TableCell>
                          <TableCell>{Number(d.product?.min_qty ?? d.minimum_quantity ?? 0)}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-500">No data for this report</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
