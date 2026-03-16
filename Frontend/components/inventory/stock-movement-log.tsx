"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Search } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

const MOVEMENT_TYPES = [
  "PURCHASE",
  "SALE",
  "ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN",
  "DAMAGE",
  "EXPIRED",
  "LOSS",
];

export function StockMovementLog() {
  const { toast } = useToast();
  const [movements, setMovements] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [filters, setFilters] = useState({
    branchId: "",
    productId: "",
    movementType: "",
    startDate: "",
    endDate: "",
  });

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, limit: 100 };
      if (filters.branchId) params.branchId = filters.branchId;
      if (filters.productId) params.productId = filters.productId;
      if (filters.movementType) params.movementType = filters.movementType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await apiClient.get(`${API_BASE}/inventory/movements`, { params });
      setMovements(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load movements",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [bRes, pRes] = await Promise.all([
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
      ]);
      setBranches(Array.isArray(bRes.data?.data) ? bRes.data.data : (bRes.data?.data || []));
      const productList = Array.isArray(pRes.data?.data) ? pRes.data.data : (pRes.data?.data?.products || []);
      setProducts((productList || []).filter((p: any) => p?.id));
    } catch (e) {
      console.error(e);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const exportCSV = () => {
    const headers = ["Date", "Type", "Product", "SKU", "Qty Change", "From Qty", "To Qty", "Branch", "Ref", "User"];
    const rows = movements.map((m) => [
      new Date(m.created_at).toLocaleString(),
      m.movement_type,
      m.product?.name || "",
      m.product?.sku || "",
      m.quantity_change,
      m.previous_qty,
      m.new_qty,
      m.branch?.name || "",
      m.reference_id || "",
      m.user?.email || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-movements-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "CSV downloaded" });
  };

  const getTypeBadge = (type: string) => {
    const incoming = ["PURCHASE", "TRANSFER_IN", "RETURN"];
    const outgoing = ["SALE", "TRANSFER_OUT", "DAMAGE", "EXPIRED", "LOSS"];
    if (incoming.includes(type))
      return <Badge className="bg-green-100 text-green-800">{type}</Badge>;
    if (outgoing.includes(type))
      return <Badge className="bg-red-100 text-red-800">{type}</Badge>;
    return <Badge className="bg-amber-100 text-amber-800">{type}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Stock Movement Log</h1>
          <p className="text-sm text-gray-600">Full audit trail of all stock events</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.branchId || "all"}
          onValueChange={(v) => setFilters({ ...filters, branchId: v === "all" ? "" : v })}
          disabled={metaLoading}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={metaLoading ? "Loading..." : "All Branches"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.filter((b: any) => b?.id).map((b: any) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.productId || "all"}
          onValueChange={(v) => setFilters({ ...filters, productId: v === "all" ? "" : v })}
          disabled={metaLoading}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={metaLoading ? "Loading..." : "All Products"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.sku || p.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.movementType || "all"}
          onValueChange={(v) => setFilters({ ...filters, movementType: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {MOVEMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movement History ({movements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading movements..." />
          ) : movements.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No movements found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty Change</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">
                        {new Date(m.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{getTypeBadge(m.movement_type)}</TableCell>
                      <TableCell>{m.product?.name}</TableCell>
                      <TableCell>
                        <span className={Number(m.quantity_change) > 0 ? "text-green-600" : "text-red-600"}>
                          {Number(m.quantity_change) > 0 ? "+" : ""}
                          {Number(m.quantity_change)}
                        </span>
                      </TableCell>
                      <TableCell>{Number(m.previous_qty)}</TableCell>
                      <TableCell>{Number(m.new_qty)}</TableCell>
                      <TableCell>{m.branch?.name}</TableCell>
                      <TableCell className="font-mono text-xs">{m.reference_id?.slice(0, 8) || "—"}</TableCell>
                      <TableCell className="text-sm">{m.user?.email || "—"}</TableCell>
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
