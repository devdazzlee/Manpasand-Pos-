"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Truck,
  Printer,
  ArrowRight,
  CalendarIcon,
  History,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { InventoryCardGrid } from "@/components/inventory/stock-ops/inventory-card-grid";
import { TransactionRecordCard } from "@/components/inventory/stock-ops/transaction-record-card";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  STOCK_DLG,
} from "@/components/inventory/stock-ops/stock-operation-dialog";

const DEFAULT_TRANSFER_FORM = {
  fromBranchId: "",
  toBranchId: "",
  notes: "",
  reason: "Stock Replenishment",
  carrierName: "",
  vehicleNo: "",
  estimatedArrival: "",
};

function validateTransferLines(lines: StockLineItem[]): string | null {
  if (lines.length === 0) return "Add at least one product";
  for (const line of lines) {
    const q = Number(line.quantity);
    if (!Number.isFinite(q) || q <= 0) {
      return `Quantity must be greater than 0 for ${line.productName}`;
    }
  }
  return null;
}

export function Transfers() {
  const {
    products,
    branches,
    categories,
    productsLoading,
    fetchProducts,
    fetchBranches,
  } = usePosData();

  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferLines, setTransferLines] = useState<StockLineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stocks, setStocks] = useState<Record<string, number>>({});

  const [form, setForm] = useState(DEFAULT_TRANSFER_FORM);

  // Fetch Transfers
  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`${API_BASE}/transfers`, {
        params: { page: 1, limit: 100 },
      });
      setTransfers(res.data?.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to synchronize transfer records");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStockLevels = useCallback(async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/stock`, { params: { limit: 1000 } });
      const stockList = res.data?.data || [];
      const map: Record<string, number> = {};
      stockList.forEach((s: { product_id: string; branch_id: string; current_quantity?: string | number }) => {
        map[`${s.product_id}-${s.branch_id}`] = Number(s.current_quantity || 0);
      });
      setStocks(map);
    } catch (e) {
      console.error("Failed to fetch stock levels", e);
    }
  }, []);

  const getStockQty = useCallback(
    (productId: string) => {
      if (!form.fromBranchId) return null;
      return stocks[`${productId}-${form.fromBranchId}`] ?? 0;
    },
    [form.fromBranchId, stocks],
  );

  const resetTransferForm = useCallback(() => {
    setForm(DEFAULT_TRANSFER_FORM);
    setTransferLines([]);
    setFormErrors({});
  }, []);

  // Initial Sync
  useEffect(() => {
    fetchTransfers();
    fetchProducts();
    fetchBranches();
    fetchStockLevels();
  }, [fetchTransfers, fetchProducts, fetchBranches, fetchStockLevels]);

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.fromBranchId) errors.fromBranchId = "Source branch is required";
    if (!form.toBranchId) errors.toBranchId = "Destination branch is required";
    if (form.fromBranchId && form.toBranchId && form.fromBranchId === form.toBranchId) {
      errors.toBranchId = "Source and destination must be different";
    }

    const lineErr = validateTransferLines(transferLines);
    if (lineErr) errors.lines = lineErr;

    if (!errors.lines && form.fromBranchId) {
      for (const line of transferLines) {
        const qty = Number(line.quantity);
        const available = getStockQty(line.productId) ?? 0;
        if (qty > available) {
          errors.lines = `Insufficient stock for ${line.productName}. Available: ${available}`;
          break;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    let lastError: string | null = null;

    try {
      for (const line of transferLines) {
        try {
          await apiClient.post(`${API_BASE}/transfers`, {
            productId: line.productId,
            fromBranchId: form.fromBranchId,
            toBranchId: form.toBranchId,
            quantity: Number(line.quantity),
            notes: form.notes || undefined,
            reason: form.reason || undefined,
            carrierName: form.carrierName || undefined,
            vehicleNo: form.vehicleNo || undefined,
            estimatedArrival: form.estimatedArrival || undefined,
          });
          ok++;
        } catch (e: any) {
          fail++;
          lastError = e?.response?.data?.message || "Failed to create transfer";
        }
      }

      if (ok > 0) {
        toast.success(`Created ${ok} transfer${ok === 1 ? "" : "s"}`, {
          description: "Inventory movement has been recorded.",
        });
        setDialogOpen(false);
        resetTransferForm();
        fetchTransfers();
        fetchStockLevels();
      }
      if (fail > 0) {
        toast.error(lastError || `Failed to create ${fail} transfer${fail === 1 ? "" : "s"}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiClient.patch(`${API_BASE}/transfers/${id}/status`, { status });
      toast.success(`Transfer status updated to ${status}`);
      fetchTransfers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update status");
    }
  };

  const printSlip = (t: any) => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`
        <html><head><title>Transfer Slip - ${t.reference_no || t.id}</title></head>
        <body style="font-family: sans-serif; padding: 40px; color: #334155;">
          <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #4f46e5;">MANPASAND POS</h1>
            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #64748b;">STOCK TRANSFER CHALLAN</h2>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 14px;">
            <div>
              <p style="margin: 5px 0;"><strong>REFERENCE:</strong> ${t.reference_no || t.id}</p>
              <p style="margin: 5px 0;"><strong>REASON:</strong> ${t.reason || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>TIMESTAMP:</strong> ${new Date(t.transfer_date).toLocaleString()}</p>
              <p style="margin: 5px 0;"><strong>LOGISTICS NODE:</strong> ${t.from_branch?.name}</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 5px 0;"><strong>TARGET NODE:</strong> ${t.to_branch?.name}</p>
              <p style="margin: 5px 0;"><strong>CARRIER:</strong> ${t.carrier_name || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>VEHICLE:</strong> ${t.vehicle_no || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>CURRENT STATUS:</strong> ${t.status}</p>
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 800;">MANAGED ASSET</th>
                <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 800;">SKU/ID</th>
                <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 800;">TRANSFER VOLUME</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; font-weight: 600;">${t.product?.name}</td>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; font-family: monospace;">${t.product?.sku}</td>
                <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #4f46e5;">${t.quantity} UNITS</td>
              </tr>
            </tbody>
          </table>
          ${t.notes ? `
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; font-weight: 800; color: #64748b; margin-bottom: 8px;">LOGISTICS REMARKS</p>
              <p style="margin: 0; font-size: 14px;">${t.notes}</p>
            </div>
          ` : ""}
          <div style="margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
            <div>
              <div style="border-top: 1px solid #cbd5e1; margin-top: 30px; padding-top: 10px; font-size: 12px; font-weight: bold; color: #64748b;">DISPATCH AUTHORIZATION</div>
            </div>
            <div>
              <div style="border-top: 1px solid #cbd5e1; margin-top: 30px; padding-top: 10px; font-size: 12px; font-weight: bold; color: #64748b;">RECIPIENT ACKNOWLEDGMENT</div>
            </div>
          </div>
          <p style="margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center;">This is a system-generated document. Dynamic ID: ${t.id}</p>
        </body></html>
      `);
      w.document.close();
      w.print();
    }
  };

  const getStatusStyle = (s: string) => {
    switch (s) {
      case "PENDING":
        return "bg-gray-100 text-gray-700 border-gray-200";
      case "DISPATCHED":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "RECEIVED":
        return "bg-green-100 text-green-700 border-green-200";
      case "CANCELLED":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = transfers.length;
    const pending = transfers.filter(t => t.status === 'PENDING').length;
    const dispatched = transfers.filter(t => t.status === 'DISPATCHED').length;
    const received = transfers.filter(t => t.status === 'RECEIVED').length;
    return { total, pending, dispatched, received };
  }, [transfers]);

  if (loading && transfers.length === 0) return <PageLoader message="Loading logistics cycles..." />;

  // estimatedArrival is stored as ISO string; convert to/from Date for the
  // shadcn date picker. Local time is preserved so the user sees what they pick.
  const arrivalDate = form.estimatedArrival ? new Date(form.estimatedArrival) : undefined;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 text-black">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Stock Transfers</h1>
          <p className="text-sm text-gray-600 mt-1">
            Move inventory between branches and warehouses
          </p>
        </div>

        <Button size="sm" className="text-sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Transfer
        </Button>

        <StockOperationDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetTransferForm();
          }}
          title="New transfer"
          description="Select multiple products and move stock between branches in one go."
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel={
            transferLines.length > 0
              ? `Create ${transferLines.length} transfer${transferLines.length === 1 ? "" : "s"}`
              : "Create transfer"
          }
          footerHint={
            transferLines.length > 0
              ? `${transferLines.length} product${transferLines.length === 1 ? "" : "s"} selected`
              : null
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>From branch</Label>
              <Select
                value={form.fromBranchId}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, fromBranchId: v }));
                  setFormErrors((e) => ({ ...e, fromBranchId: "" }));
                  setTransferLines((prev) =>
                    prev.map((l) => ({
                      ...l,
                      currentQty: stocks[`${l.productId}-${v}`] ?? 0,
                    })),
                  );
                }}
              >
                <SelectTrigger
                  className={`h-9 text-sm text-black ${formErrors.fromBranchId ? "border-red-400" : "border-gray-200"}`}
                >
                  <SelectValue placeholder="Source branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem
                      key={b.id}
                      value={b.id}
                      disabled={b.id === form.toBranchId}
                      className="text-sm"
                    >
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.fromBranchId && (
                <p className="text-xs text-red-500">{formErrors.fromBranchId}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>To branch</Label>
              <Select
                value={form.toBranchId}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, toBranchId: v }));
                  setFormErrors((e) => ({ ...e, toBranchId: "" }));
                }}
              >
                <SelectTrigger
                  className={`h-9 text-sm text-black ${formErrors.toBranchId ? "border-red-400" : "border-gray-200"}`}
                >
                  <SelectValue placeholder="Destination branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem
                      key={b.id}
                      value={b.id}
                      disabled={b.id === form.fromBranchId}
                      className="text-sm"
                    >
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.toBranchId && (
                <p className="text-xs text-red-500">{formErrors.toBranchId}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>Reason</Label>
              <Select
                value={form.reason}
                onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger className="h-9 text-sm text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Stock Replenishment" className="text-sm">
                    Stock Replenishment
                  </SelectItem>
                  <SelectItem value="Branch Support" className="text-sm">
                    Branch Support
                  </SelectItem>
                  <SelectItem value="Damage Return" className="text-sm">
                    Damage Return
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>Estimated arrival</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-start text-left text-sm font-normal text-black"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-gray-500" />
                    {arrivalDate ? (
                      format(arrivalDate, "PPP")
                    ) : (
                      <span className="text-gray-500">Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={arrivalDate}
                    onSelect={(d) =>
                      setForm((f) => ({
                        ...f,
                        estimatedArrival: d ? d.toISOString() : "",
                      }))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>Carrier</Label>
              <Input
                placeholder="Courier name"
                value={form.carrierName}
                onChange={(e) => setForm((f) => ({ ...f, carrierName: e.target.value }))}
                className="h-9 text-sm text-black"
              />
            </div>
            <div className="space-y-2">
              <Label className={STOCK_DLG.label}>Vehicle</Label>
              <Input
                placeholder="Plate number"
                value={form.vehicleNo}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNo: e.target.value }))}
                className="h-9 text-sm text-black"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className={STOCK_DLG.label}>Notes</Label>
            <Textarea
              placeholder="Optional remarks..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="text-sm text-black min-h-[60px] resize-none"
            />
          </div>

          <StockProductPicker
            products={products}
            categories={categories}
            loading={productsLoading}
            lines={transferLines}
            onLinesChange={(next) => {
              setTransferLines(
                next.map((l) => ({
                  ...l,
                  currentQty: getStockQty(l.productId),
                })),
              );
              setFormErrors((e) => ({ ...e, lines: "" }));
            }}
            quantityLabel="Qty to transfer"
            showCurrentQty
            getCurrentQty={getStockQty}
            disabled={!form.fromBranchId}
            error={formErrors.lines}
          />
        </StockOperationDialog>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-md text-blue-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Transfers</p>
              <h3 className="text-xl font-semibold text-black">{stats.total}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-2 rounded-md text-yellow-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <h3 className="text-xl font-semibold text-black">{stats.pending}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-md text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">In Transit</p>
              <h3 className="text-xl font-semibold text-black">{stats.dispatched}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-md text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Received</p>
              <h3 className="text-xl font-semibold text-green-600">{stats.received}</h3>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border border-gray-200 overflow-hidden">
        <CardHeader className="px-6 py-4 border-b border-gray-200">
          <CardTitle className="text-base font-semibold text-black">Transfer History</CardTitle>
        </CardHeader>
        <InventoryCardGrid
          empty={transfers.length === 0}
          emptyTitle="No transfers yet"
          emptyDescription="Create a transfer to move stock between branches."
        >
          {transfers.map((t) => (
            <TransactionRecordCard
              key={t.id}
              date={`${new Date(t.transfer_date).toLocaleDateString()} · ${new Date(t.transfer_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              title={t.product?.name || "Product"}
              subtitle={`Ref: ${t.reference_no || t.id.slice(0, 8)} · Qty ${t.quantity}`}
              meta={
                <span className="inline-flex items-center gap-1.5">
                  {t.from_branch?.name}
                  <ArrowRight className="h-3 w-3" />
                  {t.to_branch?.name}
                </span>
              }
              badge={
                <Badge variant="outline" className={`text-xs ${getStatusStyle(t.status)}`}>
                  {t.status}
                </Badge>
              }
              highlights={[
                { label: "Carrier", value: t.carrier_name || "—" },
                { label: "Vehicle", value: t.vehicle_no || "—" },
              ]}
              footer={t.reason}
              actions={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => printSlip(t)}
                    title="Print slip"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  {t.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => updateStatus(t.id, "DISPATCHED")}
                    >
                      Dispatch
                    </Button>
                  )}
                  {t.status === "DISPATCHED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => updateStatus(t.id, "RECEIVED")}
                    >
                      Receive
                    </Button>
                  )}
                </div>
              }
            />
          ))}
        </InventoryCardGrid>
      </Card>
    </div>
  );
}
