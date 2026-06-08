"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { 
  Edit, 
  Loader2, 
  Plus, 
  MapPin, 
  Package, 
  ClipboardCheck, 
  History, 
  ArrowRightLeft, 
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Download,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Info
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";



export function StockAdjustment() {
  const {
    products,
    categories,
    branches,
    productsLoading,
    fetchProducts,
    fetchBranches,
  } = usePosData();

  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAdjustments, setTotalAdjustments] = useState(0);
  const PAGE_SIZE = 20;
  
  const [adjustLines, setAdjustLines] = useState<StockLineItem[]>([]);

  const [form, setForm] = useState({
    branchId: "",
    adjustmentType: "RECONCILIATION" as any,
    adjustmentCategory: "CORRECTION" as any,
    referenceNo: "",
    reason: "",
  });

  const fetchAdjustments = useCallback(async (pg: number = page) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`${API_BASE}/stock-adjustments`, {
        params: { page: pg, limit: PAGE_SIZE },
      });
      setAdjustments(res.data?.data || []);
      const total = res.data?.meta?.total ?? res.data?.data?.length ?? 0;
      setTotalAdjustments(total);
      setTotalPages(
        res.data?.meta?.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE)),
      );
    } catch (e: any) {
      toast({
        title: "Sync Error",
        description: e?.response?.data?.message || "Failed to load adjustment history",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, [page]);

  const fetchStockLevels = useCallback(async () => {
    try {
      const sRes = await apiClient.get(`${API_BASE}/stock`, { params: { limit: 1000 } });
      const stockList = sRes.data?.data || [];
      const map: Record<string, number> = {};
      stockList.forEach((s: any) => {
        map[`${s.product_id}-${s.branch_id}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch (e) {
      console.error("Failed to fetch stock levels", e);
    }
  }, []);

  useEffect(() => {
    fetchStockLevels();
    fetchProducts();
    fetchBranches();
  }, [fetchStockLevels, fetchProducts, fetchBranches]);

  // Refetch adjustments whenever the page changes.
  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  const getStockQty = useCallback(
    (productId: string) => {
      if (!form.branchId) return null;
      return stocks[`${productId}-${form.branchId}`] ?? 0;
    },
    [form.branchId, stocks],
  );

  const handleSubmit = async () => {
    if (!form.branchId) {
      toast.error("Branch is required");
      return;
    }
    if (adjustLines.length === 0) {
      toast.error("Add at least one product");
      return;
    }

    for (const line of adjustLines) {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty)) {
        toast.error(`Invalid quantity for ${line.productName}`);
        return;
      }
      if (form.adjustmentType === "RECONCILIATION" && line.quantity === "") {
        toast.error(`Physical count required for ${line.productName}`);
        return;
      }
      if (form.adjustmentType !== "RECONCILIATION" && qty === 0) {
        toast.error(`Change cannot be zero for ${line.productName}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      let ok = 0;
      for (const line of adjustLines) {
        const systemQty = getStockQty(line.productId) ?? 0;
        const payload: any = {
          productId: line.productId,
          branchId: form.branchId,
          systemQuantity: systemQty,
          adjustmentType: form.adjustmentType,
          adjustmentCategory: form.adjustmentCategory,
          reason: form.reason || `${form.adjustmentType} via POS Portal`,
          referenceNo: form.referenceNo,
        };

        if (form.adjustmentType === "RECONCILIATION") {
          payload.physicalCount = Number(line.quantity);
        } else if (form.adjustmentType === "ADDITION") {
          payload.changeQuantity = Number(line.quantity);
        } else {
          payload.changeQuantity = -Math.abs(Number(line.quantity));
        }

        await apiClient.post(`${API_BASE}/stock-adjustments`, payload);
        ok++;
      }

      toast.success(`Adjusted ${ok} product${ok === 1 ? "" : "s"} successfully.`);
      setDialogOpen(false);
      setForm({
        branchId: "",
        adjustmentType: "RECONCILIATION",
        adjustmentCategory: "CORRECTION",
        referenceNo: "",
        reason: "",
      });
      setAdjustLines([]);
      if (page !== 1) setPage(1);
      else fetchAdjustments(1);
      fetchStockLevels();
    } catch (e: any) {
      const backendMessage =
        e?.response?.data?.message ||
        e?.message ||
        "Failed to execute stock adjustment";
      toast.error(backendMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const exportCSV = () => {
    if (adjustments.length === 0) return;
    const headers = ["Date", "Product", "Branch", "Type", "Category", "System Qty", "Change/Phys", "Difference", "Staff", "Reason"];
    const rows = adjustments.map(a => [
      new Date(a.adjustment_date).toLocaleString(),
      a.product?.name || "",
      a.branch?.name || "",
      a.adjustment_type,
      a.adjustment_category,
      a.system_quantity,
      a.adjustment_type === 'RECONCILIATION' ? a.physical_count : a.change_quantity,
      a.difference,
      a.user?.email || "N/A",
      a.reason || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-adjustments-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const stats = useMemo(() => {
    const totalCount = adjustments.length;
    let shrink = 0;
    let gain = 0;
    adjustments.forEach(a => {
       const diff = Number(a.difference);
       if (diff < 0) shrink += Math.abs(diff);
       else gain += diff;
    });
    return { totalCount, shrink: shrink.toFixed(2), gain: gain.toFixed(2) };
  }, [adjustments]);

  if (loading && adjustments.length === 0) return <PageLoader message="Loading stock adjustments..." />;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 text-black">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Stock Adjustments</h1>
          <p className="text-sm text-gray-600 mt-1">
            Physical inventory reconciliation & operational corrections
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportCSV}
            size="sm"
            className="text-sm text-black"
          >
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>

          <Button size="sm" className="text-sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Adjustment
          </Button>

          <StockOperationDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setAdjustLines([]);
                setForm({
                  branchId: "",
                  adjustmentType: "RECONCILIATION",
                  adjustmentCategory: "CORRECTION",
                  referenceNo: "",
                  reason: "",
                });
              }
            }}
            title="Bulk stock adjustment"
            description="Select multiple products, set quantities, and submit in one go."
            onSubmit={handleSubmit}
            submitting={submitting}
            submitLabel={
              adjustLines.length > 0
                ? `Submit ${adjustLines.length} item${adjustLines.length === 1 ? "" : "s"}`
                : "Submit"
            }
            footerHint={
              adjustLines.length > 0
                ? `${adjustLines.length} product${adjustLines.length === 1 ? "" : "s"} selected`
                : null
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={STOCK_DLG.label}>Branch</Label>
                <Select
                  value={form.branchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, branchId: v }));
                    setAdjustLines((prev) =>
                      prev.map((l) => ({
                        ...l,
                        currentQty: stocks[`${l.productId}-${v}`] ?? 0,
                      })),
                    );
                  }}
                >
                  <SelectTrigger className="h-9 text-sm text-black">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-sm">
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className={STOCK_DLG.label}>Adjustment type</Label>
                <Select
                  value={form.adjustmentType}
                  onValueChange={(v) => setForm((f) => ({ ...f, adjustmentType: v }))}
                >
                  <SelectTrigger className="h-9 text-sm text-black">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECONCILIATION">Reconciliation (physical count)</SelectItem>
                    <SelectItem value="ADDITION">Addition (+)</SelectItem>
                    <SelectItem value="SUBTRACTION">Subtraction (-)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className={STOCK_DLG.label}>Category</Label>
                <Select
                  value={form.adjustmentCategory}
                  onValueChange={(v) => setForm((f) => ({ ...f, adjustmentCategory: v }))}
                >
                  <SelectTrigger className="h-9 text-sm text-black">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CORRECTION">Standard correction</SelectItem>
                    <SelectItem value="DAMAGE">Damaged / broken</SelectItem>
                    <SelectItem value="EXPIRED">Expired stock</SelectItem>
                    <SelectItem value="THEFT">Missing / theft</SelectItem>
                    <SelectItem value="RETURN_TO_SUPPLIER">Return to supplier</SelectItem>
                    <SelectItem value="ADMINISTRATIVE">Administrative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className={STOCK_DLG.label}>Reference / Batch ID</Label>
                <Input
                  className="h-9 text-sm text-black"
                  placeholder="REF-XXXXX"
                  value={form.referenceNo}
                  onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>Remarks / Reason</Label>
              <Textarea
                className="text-sm text-black min-h-[60px] resize-none"
                placeholder="Detailed explanation for audit log..."
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>

            <StockProductPicker
              products={products}
              categories={categories}
              loading={productsLoading}
              lines={adjustLines}
              onLinesChange={(next) => {
                setAdjustLines(
                  next.map((l) => ({
                    ...l,
                    currentQty: getStockQty(l.productId),
                  })),
                );
              }}
              quantityLabel={
                form.adjustmentType === "RECONCILIATION"
                  ? "Physical count"
                  : form.adjustmentType === "ADDITION"
                    ? "Qty to add"
                    : "Qty to remove"
              }
              showCurrentQty
              getCurrentQty={getStockQty}
              disabled={!form.branchId}
            />
          </StockOperationDialog>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-md text-blue-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Audit Cycles</p>
              <h3 className="text-xl font-semibold text-black">{stats.totalCount}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-md text-red-600">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Inventory Shrinkage</p>
              <h3 className="text-xl font-semibold text-red-600">-{stats.shrink}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-md text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Procedural Gains</p>
              <h3 className="text-xl font-semibold text-green-600">+{stats.gain}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Adjustment history */}
      <Card className="border border-gray-200 overflow-hidden">
        <InventoryCardGrid
          empty={adjustments.length === 0 && !loading}
          emptyTitle="No adjustments found"
          emptyDescription="Create a bulk adjustment to see history here."
          loading={loading && adjustments.length === 0}
        >
          {adjustments.map((a) => (
            <TransactionRecordCard
              key={a.id}
              date={`${new Date(a.adjustment_date).toLocaleDateString()} · ${new Date(a.adjustment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              title={a.product?.name || "Product"}
              subtitle={a.product?.sku}
              meta={
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {a.branch?.name}
                </span>
              }
              badge={
                <Badge variant="outline" className="text-xs">
                  {a.adjustment_type}
                </Badge>
              }
              highlights={[
                {
                  label: "Variance",
                  value: `${Number(a.difference) > 0 ? "+" : ""}${a.difference}`,
                  tone: Number(a.difference) > 0 ? "success" : Number(a.difference) < 0 ? "danger" : "default",
                },
                { label: "Category", value: a.adjustment_category },
                { label: "Count", value: a.physical_count ?? a.change_quantity ?? "—" },
              ]}
              footer={a.reason || a.reference_no ? `${a.reason || ""}${a.reference_no ? ` · #${a.reference_no}` : ""}` : undefined}
            />
          ))}
        </InventoryCardGrid>

        {/* Pagination */}
        {totalAdjustments > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-black">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, totalAdjustments)} of {totalAdjustments}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={page === 1 || loading}
                className="text-sm text-black"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="text-sm text-black"
              >
                Previous
              </Button>
              <span className="text-sm text-black px-3">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="text-sm text-black"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || loading}
                className="text-sm text-black"
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
