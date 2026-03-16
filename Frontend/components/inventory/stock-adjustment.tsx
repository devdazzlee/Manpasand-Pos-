"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Edit, Loader2, Plus } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

export function StockAdjustment() {
  const { toast } = useToast();
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    branchId: "",
    systemQuantity: "",
    physicalCount: "",
    reason: "",
  });

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/stock-adjustments`, {
        params: { page: 1, limit: 50 },
      });
      setAdjustments(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load adjustments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [pRes, bRes, sRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/stock`, { params: { limit: 1000 } }),
      ]);
      const productList = Array.isArray(pRes.data?.data) ? pRes.data.data : (pRes.data?.data?.products || []);
      setProducts((productList || []).filter((p: any) => p?.id));
      setBranches(Array.isArray(bRes.data?.data) ? bRes.data.data : (bRes.data?.data || []));
      const stockList = sRes.data?.data || [];
      const map: Record<string, number> = {};
      stockList.forEach((s: any) => {
        const key = `${s.product_id}-${s.branch_id}`;
        map[key] = Number(s.current_quantity || 0);
      });
      setStocks(map);
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
    fetchAdjustments();
  }, [fetchAdjustments]);

  const systemQty = form.productId && form.branchId
    ? stocks[`${form.productId}-${form.branchId}`] ?? 0
    : 0;

  const handleSubmit = async () => {
    const sys = Number(form.systemQuantity);
    const phys = Number(form.physicalCount);
    if (!form.productId || !form.branchId || isNaN(sys) || isNaN(phys)) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    if (sys === phys) {
      toast({
        title: "Validation Error",
        description: "No difference between system and physical count",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/stock-adjustments`, {
        productId: form.productId,
        branchId: form.branchId,
        systemQuantity: sys,
        physicalCount: phys,
        reason: form.reason || undefined,
      });
      toast({ title: "Success", description: "Adjustment created successfully" });
      setDialogOpen(false);
      setForm({ productId: "", branchId: "", systemQuantity: "", physicalCount: "", reason: "" });
      fetchAdjustments();
      fetchMeta();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to create adjustment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Stock Adjustment</h1>
          <p className="text-sm text-gray-600">Physical count reconciliation</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Adjustment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stock Adjustment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product *</Label>
                <Select
                  value={form.productId || "none"}
                  onValueChange={(v) => setForm({ ...form, productId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading products..." : "Select product"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select product</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Branch *</Label>
                <Select
                  value={form.branchId || "none"}
                  onValueChange={(v) => setForm({ ...form, branchId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading..." : "Select branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select branch</SelectItem>
                    {branches.filter((b: any) => b?.id).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>System Quantity</Label>
                <Input
                  type="number"
                  value={form.systemQuantity || (form.productId && form.branchId ? systemQty : "")}
                  onChange={(e) => setForm({ ...form, systemQuantity: e.target.value })}
                  placeholder={form.productId && form.branchId ? `Current: ${systemQty}` : ""}
                />
              </div>
              <div>
                <Label>Physical Count *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.physicalCount}
                  onChange={(e) => setForm({ ...form, physicalCount: e.target.value })}
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={2}
                />
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adjusting...
                  </>
                ) : (
                  "Create Adjustment"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adjustment History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading adjustments..." />
          ) : adjustments.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No adjustments found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>System</TableHead>
                    <TableHead>Physical</TableHead>
                    <TableHead>Difference</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{new Date(a.adjustment_date).toLocaleDateString()}</TableCell>
                      <TableCell>{a.product?.name}</TableCell>
                      <TableCell>{a.branch?.name}</TableCell>
                      <TableCell>{Number(a.system_quantity)}</TableCell>
                      <TableCell>{Number(a.physical_count)}</TableCell>
                      <TableCell>
                        <span className={Number(a.difference) > 0 ? "text-green-600" : "text-red-600"}>
                          {Number(a.difference) > 0 ? "+" : ""}
                          {Number(a.difference)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{a.reason || "—"}</TableCell>
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
