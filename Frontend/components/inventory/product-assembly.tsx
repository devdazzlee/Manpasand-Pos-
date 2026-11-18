"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useScopedBranch } from "@/lib/branch-scope";
import { getInventoryReadOnly } from "@/lib/role-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  ArrowRight,
  Boxes,
  CalendarIcon,
  Combine,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { usePosData } from "@/hooks/use-pos-data";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { formatQty } from "@/components/inventory/stock-ops/export-utils";
import {
  StockProductPicker,
  type StockLineItem,
} from "@/components/inventory/stock-ops/stock-product-picker";
import {
  StockOperationDialog,
  StockSelectSkeleton,
} from "@/components/inventory/stock-ops/stock-operation-dialog";
import { cn } from "@/lib/utils";

type AssemblyLine = {
  id: string;
  quantity: string | number;
  unit_cost?: string | number | null;
  product?: { id: string; name: string; sku?: string | null; code?: string | null } | null;
};

type AssemblyRow = {
  id: string;
  reference_no: string;
  finished_quantity: string | number;
  unit_cost?: string | number | null;
  notes?: string | null;
  created_at: string;
  finished_product?: { id: string; name: string; sku?: string | null; code?: string | null } | null;
  branch?: { id: string; name: string } | null;
  user?: { email?: string | null; name?: string | null } | null;
  lines?: AssemblyLine[];
};

type BranchStockRow = { qty: number; cost: number; name: string; sku: string };

const DEFAULT_FORM = {
  branchId: "",
  referenceNo: "",
  notes: "",
};

export function ProductAssembly() {
  const readOnly = getInventoryReadOnly();
  const { products, categories, branches, productsLoading, branchesLoading, fetchProducts, fetchBranches } =
    usePosData();

  const [rows, setRows] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  useScrollToTopOnPageChange(page);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterBranch, setFilterBranch] = useScopedBranch("all");
  const [filterStart, setFilterStart] = useState<Date | undefined>();
  const [filterEnd, setFilterEnd] = useState<Date | undefined>();
  const [detail, setDetail] = useState<AssemblyRow | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardTab, setWizardTab] = useState<"create" | "combine" | "review">("create");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [finishedLines, setFinishedLines] = useState<StockLineItem[]>([]);
  const [componentLines, setComponentLines] = useState<StockLineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [branchStock, setBranchStock] = useState<Record<string, BranchStockRow>>({});
  const [branchStockLoading, setBranchStockLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchBranches();
  }, [fetchProducts, fetchBranches]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchAssemblies = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (filterBranch !== "all") params.branchId = filterBranch;
      if (filterStart) params.startDate = filterStart.toISOString();
      if (filterEnd) {
        const e = new Date(filterEnd);
        e.setHours(23, 59, 59, 999);
        params.endDate = e.toISOString();
      }
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.get(`${API_BASE}/stock-assemblies`, { params });
      setRows(res.data?.data || []);
      setTotal(res.data?.meta?.total ?? 0);
      setTotalPages(res.data?.meta?.totalPages ?? 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load assemblies");
    } finally {
      setLoading(false);
    }
  }, [page, filterBranch, filterStart, filterEnd, debouncedSearch]);

  useEffect(() => {
    fetchAssemblies();
  }, [fetchAssemblies]);

  useEffect(() => {
    if (!form.branchId) {
      setBranchStock({});
      return;
    }
    let cancelled = false;
    setBranchStockLoading(true);
    apiClient
      .get(`${API_BASE}/stock`, { params: { branchId: form.branchId, page: 1, limit: 10000 } })
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, BranchStockRow> = {};
        for (const s of res.data?.data || []) {
          const pid = s.product?.id || s.product_id;
          if (!pid) continue;
          map[pid] = {
            qty: Number(s.current_quantity) || 0,
            cost: Number(s.product?.purchase_rate) || 0,
            name: s.product?.name || "",
            sku: s.product?.sku || s.product?.code || "",
          };
        }
        setBranchStock(map);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load stock for this branch");
      })
      .finally(() => {
        if (!cancelled) setBranchStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.branchId]);

  const onHand = useCallback(
    (productId: string) => (form.branchId ? branchStock[productId]?.qty ?? 0 : null),
    [form.branchId, branchStock],
  );

  const pickerProducts = useMemo(
    () =>
      (products as any[])
        .filter((p) => p?.id && p?.is_active !== false)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku || p.code || undefined,
          code: p.code,
          barcode: p.barcode,
          label_barcode: p.label_barcode,
          custom_code: p.custom_code,
          category_id: p.category_id,
          cost: Number(p.purchase_rate) || null,
          price: Number(p.sale_rate) || null,
        })),
    [products],
  );

  const finishedId = finishedLines[0]?.productId || "";

  const componentCatalog = useMemo(
    () => pickerProducts.filter((p) => p.id !== finishedId),
    [pickerProducts, finishedId],
  );

  const finishedQty = Number(finishedLines[0]?.quantity) || 0;

  const shortComponents = useMemo(() => {
    const short: string[] = [];
    for (const line of componentLines) {
      const need = Number(line.quantity) || 0;
      const have = onHand(line.productId) ?? 0;
      if (need > have) short.push(`${line.productName} (need ${formatQty(need)}, have ${formatQty(have)})`);
    }
    return short;
  }, [componentLines, onHand]);

  const canSave =
    !!form.branchId &&
    finishedLines.length === 1 &&
    finishedQty > 0 &&
    componentLines.length > 0 &&
    componentLines.every((l) => Number(l.quantity) > 0) &&
    shortComponents.length === 0;

  const openNew = () => {
    if (readOnly) return;
    setForm({
      ...DEFAULT_FORM,
      branchId: filterBranch !== "all" ? filterBranch : "",
    });
    setFinishedLines([]);
    setComponentLines([]);
    setFormErrors({});
    setWizardTab("create");
    setDialogOpen(true);
  };

  const onFinishedChange = (next: StockLineItem[]) => {
    // Only one finished product — keep the latest selection.
    const last = next.length ? [next[next.length - 1]] : [];
    setFinishedLines(last);
    setFormErrors((e) => ({ ...e, finished: "" }));
    if (last[0]?.productId) {
      setComponentLines((prev) => prev.filter((l) => l.productId !== last[0].productId));
    }
  };

  const validateBeforeSave = () => {
    const errors: Record<string, string> = {};
    if (!form.branchId) errors.branchId = "Choose a branch";
    if (finishedLines.length !== 1) errors.finished = "Pick the product you want to create";
    else if (!(Number(finishedLines[0].quantity) > 0)) errors.finished = "Enter how many to create";
    if (!componentLines.length) errors.components = "Add the products you are combining";
    else if (componentLines.some((l) => !(Number(l.quantity) > 0))) {
      errors.components = "Each component needs a quantity";
    }
    if (shortComponents.length) errors.components = `Not enough stock: ${shortComponents[0]}`;
    setFormErrors(errors);
    if (errors.finished) setWizardTab("create");
    else if (errors.components) setWizardTab("combine");
    else if (errors.branchId) setWizardTab("create");
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateBeforeSave()) return;
    setSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/stock-assemblies`, {
        branchId: form.branchId,
        finishedProductId: finishedLines[0].productId,
        finishedQuantity: Number(finishedLines[0].quantity),
        referenceNo: form.referenceNo.trim() || undefined,
        notes: form.notes.trim() || undefined,
        components: componentLines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
        })),
      });
      toast.success(
        `Assembled ${formatQty(Number(finishedLines[0].quantity))} × ${finishedLines[0].productName}`,
      );
      setDialogOpen(false);
      setFinishedLines([]);
      setComponentLines([]);
      setPage(1);
      await fetchAssemblies();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Could not save assembly");
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterBranch("all");
    setFilterStart(undefined);
    setFilterEnd(undefined);
    setPage(1);
  };

  const hasFilters =
    !!searchQuery.trim() || filterBranch !== "all" || !!filterStart || !!filterEnd;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Product assembly</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Combine separate items (bottle, sticker, cap…) into one finished product. Components leave
            stock; the finished product is stocked in.
          </p>
        </div>
        {!readOnly ? (
          <Button onClick={openNew} className="h-10 shrink-0 gap-2">
            <Combine className="h-4 w-4" />
            Assemble products
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, reference…"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {branchesLoading ? (
              <StockSelectSkeleton className="h-9 w-[160px]" />
            ) : (
              <Select value={filterBranch} onValueChange={(v) => { setFilterBranch(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[160px] bg-white text-sm">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-white">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterStart ? format(filterStart, "dd MMM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent mode="single" selected={filterStart} onSelect={(d) => { setFilterStart(d); setPage(1); }} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-white">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {filterEnd ? format(filterEnd, "dd MMM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent mode="single" selected={filterEnd} onSelect={(d) => { setFilterEnd(d); setPage(1); }} />
              </PopoverContent>
            </Popover>
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-white"
              onClick={() => fetchAssemblies()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {loading && !rows.length ? (
          <PageLoader label="Loading assemblies…" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <PackagePlus className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-slate-900">No assemblies yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Assemble a finished product from components to see history here.
              </p>
            </div>
            {!readOnly ? (
              <Button onClick={openNew} className="mt-1 gap-2">
                <Plus className="h-4 w-4" />
                Assemble products
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>When</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Qty in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setDetail(row)}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-slate-600">
                      {format(new Date(row.created_at), "dd MMM yyyy · HH:mm")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">{row.reference_no}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.finished_product?.name || "—"}</div>
                      <div className="text-xs text-slate-500">
                        {row.finished_product?.sku || row.finished_product?.code || ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {(row.lines || []).length} item{(row.lines || []).length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.branch?.name || "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                      +{formatQty(Number(row.finished_quantity) || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">
              {total} assembl{total === 1 ? "y" : "ies"}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <span className="flex h-8 items-center px-2 tabular-nums text-slate-600">
                {page}/{totalPages}
              </span>
              <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <StockOperationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setFinishedLines([]);
            setComponentLines([]);
            setFormErrors({});
          }
        }}
        title="Assemble products"
        description="Create a finished product from components — stock in the new item, stock out what you combined."
        icon={<Combine className="h-5 w-5" />}
        iconTone="bg-teal-600 text-white"
        onSubmit={handleSubmit}
        submitting={submitting}
        submitDisabled={!canSave}
        submitLabel={
          canSave
            ? `Assemble ${formatQty(finishedQty)} × ${finishedLines[0]?.productName || "product"}`
            : "Assemble"
        }
        footerHint={
          !form.branchId
            ? "Choose a branch first"
            : !finishedLines.length
              ? "Pick the product to create"
              : !componentLines.length
                ? "Add components to combine"
                : shortComponents.length
                  ? shortComponents[0]
                  : `${componentLines.length} component${componentLines.length === 1 ? "" : "s"} → +${formatQty(finishedQty)} finished`
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                Branch <span className="text-red-500">*</span>
              </Label>
              {branchesLoading ? (
                <StockSelectSkeleton label="Loading branches" />
              ) : (
                <Select
                  value={form.branchId}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, branchId: v }));
                    setFormErrors((e) => ({ ...e, branchId: "" }));
                    setFinishedLines([]);
                    setComponentLines([]);
                  }}
                >
                  <SelectTrigger className={cn("h-10 bg-white text-sm", formErrors.branchId ? "border-red-400" : "")}>
                    <SelectValue placeholder="Choose branch / warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Reference</Label>
              <Input
                placeholder="Auto if empty"
                value={form.referenceNo}
                onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
                className="h-10 bg-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Note</Label>
              <Textarea
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-[40px] resize-none bg-white text-sm"
              />
            </div>
          </div>

          <Tabs value={wizardTab} onValueChange={(v) => setWizardTab(v as typeof wizardTab)}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-slate-100 p-1">
              <TabsTrigger value="create" className="gap-1.5 py-2 data-[state=active]:bg-white">
                <Sparkles className="h-3.5 w-3.5" />
                Create
              </TabsTrigger>
              <TabsTrigger value="combine" className="gap-1.5 py-2 data-[state=active]:bg-white">
                <Boxes className="h-3.5 w-3.5" />
                Combine
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-1.5 py-2 data-[state=active]:bg-white">
                <ArrowRight className="h-3.5 w-3.5" />
                Review
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-4 space-y-3">
              <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm text-teal-900">
                Choose the <strong>finished product</strong> that will go into stock (e.g. packaged hair oil),
                and how many you are making.
              </div>
              {formErrors.finished ? (
                <p className="text-sm text-rose-600">{formErrors.finished}</p>
              ) : null}
              <StockProductPicker
                layout="split"
                products={pickerProducts}
                categories={categories}
                loading={productsLoading || branchStockLoading}
                lines={finishedLines}
                onLinesChange={onFinishedChange}
                quantityLabel="Qty to create"
                previewMode="add"
                showCurrentQty
                getCurrentQty={onHand}
                disabled={!form.branchId}
                disabledHint="Choose a branch first"
                catalogTitle="Finished product"
                cartTitle="Creating"
                emptyCartHint="Pick the product you want to create."
              />
              {finishedLines.length ? (
                <div className="flex justify-end">
                  <Button type="button" onClick={() => setWizardTab("combine")} className="gap-2">
                    Next: combine components
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="combine" className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
                Select the <strong>parts you combine</strong> (bottle, sticker, cap…) and quantities used.
                Their stock will be reduced.
              </div>
              {formErrors.components ? (
                <p className="text-sm text-rose-600">{formErrors.components}</p>
              ) : null}
              {!finishedId ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Pick a finished product on the Create tab first.
                  <div className="mt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setWizardTab("create")}>
                      Go to Create
                    </Button>
                  </div>
                </div>
              ) : (
                <StockProductPicker
                  layout="split"
                  products={componentCatalog}
                  categories={categories}
                  loading={productsLoading || branchStockLoading}
                  lines={componentLines}
                  onLinesChange={(next) => {
                    setComponentLines(next);
                    setFormErrors((e) => ({ ...e, components: "" }));
                  }}
                  quantityLabel="Qty used"
                  previewMode="remove"
                  showCurrentQty
                  getCurrentQty={onHand}
                  disabled={!form.branchId}
                  disabledHint="Choose a branch first"
                  catalogTitle="Components"
                  cartTitle="Combining"
                  emptyCartHint="Add bottle, sticker, and other parts from the catalog."
                />
              )}
              {componentLines.length ? (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setWizardTab("create")}>
                    Back
                  </Button>
                  <Button type="button" onClick={() => setWizardTab("review")} className="gap-2">
                    Review & save
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="review" className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    <PackagePlus className="h-3.5 w-3.5" />
                    Stock in (create)
                  </div>
                  {finishedLines[0] ? (
                    <div>
                      <p className="font-semibold text-slate-900">{finishedLines[0].productName}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                        +{formatQty(finishedQty)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        On hand now: {formatQty(onHand(finishedLines[0].productId) ?? 0)} →{" "}
                        {formatQty((onHand(finishedLines[0].productId) ?? 0) + finishedQty)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No finished product selected.</p>
                  )}
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-800">
                    <Boxes className="h-3.5 w-3.5" />
                    Stock out (combine)
                  </div>
                  {componentLines.length ? (
                    <ul className="space-y-2">
                      {componentLines.map((l) => {
                        const need = Number(l.quantity) || 0;
                        const have = onHand(l.productId) ?? 0;
                        const ok = need <= have;
                        return (
                          <li key={l.productId} className="flex items-start justify-between gap-2 text-sm">
                            <span className="min-w-0">
                              <span className="font-medium text-slate-900">{l.productName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {formatQty(have)} → {formatQty(Math.max(0, have - need))}
                              </span>
                            </span>
                            <span className={cn("shrink-0 font-semibold tabular-nums", ok ? "text-rose-700" : "text-rose-600")}>
                              −{formatQty(need)}
                              {!ok ? " !" : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No components selected.</p>
                  )}
                </div>
              </div>
              {shortComponents.length ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  Not enough stock for: {shortComponents.join("; ")}
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setWizardTab("combine")}>
                  Back
                </Button>
                <Button type="button" disabled={!canSave || submitting} onClick={handleSubmit} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Combine className="h-4 w-4" />}
                  Confirm assembly
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </StockOperationDialog>

      <DetailSheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        {detail ? (
          <>
            <DetailSheetHeader
              title={detail.finished_product?.name || "Assembly"}
              subtitle={`${detail.reference_no} · ${format(new Date(detail.created_at), "dd MMM yyyy HH:mm")}`}
            />
            <DetailSheetBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Branch</div>
                  <div className="font-medium">{detail.branch?.name || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Created by</div>
                  <div className="font-medium">{detail.user?.name || detail.user?.email || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Finished qty</div>
                  <div className="font-semibold tabular-nums text-emerald-700">
                    +{formatQty(Number(detail.finished_quantity) || 0)}
                  </div>
                </div>
                {detail.notes ? (
                  <div className="col-span-2">
                    <div className="text-xs text-slate-500">Note</div>
                    <div>{detail.notes}</div>
                  </div>
                ) : null}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Components used
                </div>
                <ul className="divide-y rounded-lg border border-slate-200">
                  {(detail.lines || []).map((line) => (
                    <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{line.product?.name || "—"}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {line.product?.sku || line.product?.code || ""}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums text-rose-700">
                        −{formatQty(Number(line.quantity) || 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </DetailSheetBody>
            <DetailSheetFooter>
              <Button variant="outline" onClick={() => setDetail(null)}>
                Close
              </Button>
            </DetailSheetFooter>
          </>
        ) : null}
      </DetailSheet>
    </div>
  );
}

export default ProductAssembly;
