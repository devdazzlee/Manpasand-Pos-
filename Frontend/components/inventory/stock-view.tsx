"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Search } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

export function StockView() {
  const { toast } = useToast();
  const [stocks, setStocks] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, limit: 500 };
      if (branchFilter) params.branchId = branchFilter;
      if (search) params.search = search;
      const res = await apiClient.get(`${API_BASE}/stock`, { params });
      setStocks(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load stock",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [branchFilter, search, toast]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } });
      setBranches(res.data?.data || res.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  const exportCSV = () => {
    const headers = ["Product", "SKU", "Branch", "Quantity", "Status"];
    const rows = stocks.map((s) => {
      const qty = Number(s.current_quantity || 0);
      const min = Number(s.product?.min_qty ?? s.minimum_quantity ?? 0);
      const status = qty <= 0 ? "Out" : qty <= min && min > 0 ? "Low" : "OK";
      return [
        s.product?.name || "",
        s.product?.sku || "",
        s.branch?.name || "",
        qty,
        status,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-report-${branchFilter || "all"}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "CSV downloaded" });
  };

  const getStatusBadge = (s: any) => {
    const qty = Number(s.current_quantity || 0);
    const min = Number(s.product?.min_qty ?? s.minimum_quantity ?? 0);
    if (qty <= 0) return <Badge className="bg-red-100 text-red-800">Out</Badge>;
    if (min > 0 && qty <= min) return <Badge className="bg-amber-100 text-amber-800">Low</Badge>;
    return <Badge className="bg-green-100 text-green-800">OK</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Stock by Location</h1>
          <p className="text-sm text-gray-600">Live stock levels per product per branch</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={branchFilter || "all"}
          onValueChange={(v) => setBranchFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Stock ({stocks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading stock..." />
          ) : stocks.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No stock found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocks.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.product?.name}</TableCell>
                      <TableCell className="text-sm">{s.product?.sku}</TableCell>
                      <TableCell>{s.branch?.name}</TableCell>
                      <TableCell className="font-semibold">
                        {Number(s.current_quantity || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(s)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
