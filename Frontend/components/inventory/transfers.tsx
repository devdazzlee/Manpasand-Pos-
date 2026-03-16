"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Loader2, Truck, Printer, Check } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  branch_type?: string;
}

interface Transfer {
  id: string;
  product: Product;
  from_branch: Branch;
  to_branch: Branch;
  quantity: number;
  status: string;
  transfer_date: string;
  reference_no?: string;
  notes?: string;
}

export function Transfers() {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [printRef, setPrintRef] = useState<Transfer | null>(null);
  const printRefEl = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: "",
    notes: "",
  });

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/transfers`, {
        params: { page: 1, limit: 50 },
      });
      setTransfers(res.data?.data || []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load transfers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        apiClient.get(`${API_BASE}/products`, { params: { fetch_all: true } }),
        apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } }),
      ]);
      const productList = Array.isArray(pRes.data?.data) ? pRes.data.data : (pRes.data?.data?.products || []);
      setProducts((productList || []).filter((p: any) => p?.id));
      setBranches(Array.isArray(bRes.data?.data) ? bRes.data.data : (bRes.data?.data || []));
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
    fetchTransfers();
  }, [fetchTransfers]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const handleSubmit = async () => {
    const qty = Number(form.quantity);
    if (!form.productId || !form.fromBranchId || !form.toBranchId || !qty || qty <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    if (form.fromBranchId === form.toBranchId) {
      toast({
        title: "Error",
        description: "Source and destination cannot be the same",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/transfers`, {
        productId: form.productId,
        fromBranchId: form.fromBranchId,
        toBranchId: form.toBranchId,
        quantity: qty,
        notes: form.notes || undefined,
      });
      toast({ title: "Success", description: "Transfer created successfully" });
      setDialogOpen(false);
      setForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
      fetchTransfers();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to create transfer",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiClient.patch(`${API_BASE}/transfers/${id}/status`, { status });
      toast({ title: "Success", description: "Transfer status updated" });
      fetchTransfers();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const printSlip = (t: Transfer) => {
    setPrintRef(t);
    setTimeout(() => {
      if (printRefEl.current) {
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(`
            <html><head><title>Transfer Slip - ${t.reference_no || t.id}</title></head>
            <body style="font-family: sans-serif; padding: 20px;">
              <h2>Transfer Challan</h2>
              <p><strong>Ref:</strong> ${t.reference_no || t.id}</p>
              <p><strong>Date:</strong> ${new Date(t.transfer_date).toLocaleString()}</p>
              <p><strong>Product:</strong> ${t.product?.name} (${t.product?.sku})</p>
              <p><strong>Quantity:</strong> ${t.quantity}</p>
              <p><strong>From:</strong> ${t.from_branch?.name}</p>
              <p><strong>To:</strong> ${t.to_branch?.name}</p>
              <p><strong>Status:</strong> ${t.status}</p>
              ${t.notes ? `<p><strong>Notes:</strong> ${t.notes}</p>` : ""}
            </body></html>
          `);
          w.document.close();
          w.print();
          w.close();
        }
      }
      setPrintRef(null);
    }, 100);
  };

  const getStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      PENDING: "bg-amber-100 text-amber-800",
      DISPATCHED: "bg-blue-100 text-blue-800",
      RECEIVED: "bg-green-100 text-green-800",
    };
    return map[s] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Transfers</h1>
          <p className="text-sm text-gray-600">Warehouse → Branch & Branch → Branch</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Transfer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Product *</Label>
                <Input
                  placeholder="Search product..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="mb-1"
                />
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
                    {filteredProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From (Source) *</Label>
                <Select
                  value={form.fromBranchId || "none"}
                  onValueChange={(v) => setForm({ ...form, fromBranchId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading..." : "Select source"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select source</SelectItem>
                    {branches.filter((b: any) => b?.id).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>To (Destination) *</Label>
                <Select
                  value={form.toBranchId || "none"}
                  onValueChange={(v) => setForm({ ...form, toBranchId: v === "none" ? "" : v })}
                  disabled={metaLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={metaLoading ? "Loading..." : "Select destination"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select destination</SelectItem>
                    {branches.filter((b: any) => b?.id).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Transfer"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading transfers..." />
          ) : transfers.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No transfers found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.transfer_date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-xs">{t.reference_no || t.id.slice(0, 8)}</TableCell>
                      <TableCell>{t.product?.name}</TableCell>
                      <TableCell>{t.from_branch?.name}</TableCell>
                      <TableCell>{t.to_branch?.name}</TableCell>
                      <TableCell>{t.quantity}</TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(t.status)}>{t.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printSlip(t)}
                            title="Print slip"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {t.status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(t.id, "DISPATCHED")}
                            >
                              Dispatch
                            </Button>
                          )}
                          {(t.status === "PENDING" || t.status === "DISPATCHED") && (
                            <Button
                              size="sm"
                              onClick={() => updateStatus(t.id, "RECEIVED")}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Receive
                            </Button>
                          )}
                        </div>
                      </TableCell>
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
