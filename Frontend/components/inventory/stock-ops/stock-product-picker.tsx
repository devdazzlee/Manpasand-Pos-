"use client";

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Package,
  Trash2,
  X,
  Check,
  Minus,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatProductSearchLabel,
  getProductBarcodeDisplay,
  productMatchesSearch,
} from "@/lib/labelBarcode";

export interface StockPickerProduct {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  label_barcode?: string | null;
  custom_code?: string | null;
  barcode?: string | null;
  category_id?: string | null;
  categoryId?: string | null;
  /** Optional extras shown on catalog cards / used to prefill unit cost. */
  price?: number | null;
  cost?: number | null;
  categoryName?: string | null;
}

export interface StockLineItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: string | number;
  unitCost?: string | number;
  currentQty?: number | null;
  /** New selling price typed on the line (Stock In). */
  salePrice?: string | number;
  /** The product's selling price when the line was added — to show what changes. */
  currentSalePrice?: number | null;
}

interface StockProductPickerProps {
  products: StockPickerProduct[];
  categories?: Array<{ id: string; name: string }>;
  loading?: boolean;
  lines: StockLineItem[];
  onLinesChange: (lines: StockLineItem[]) => void;
  quantityLabel?: string;
  quantityPlaceholder?: string;
  showUnitCost?: boolean;
  unitCostLabel?: string;
  /** Stock In: editable selling price per line, prefilled with the current price. */
  showSalePrice?: boolean;
  showCurrentQty?: boolean;
  allowSignedQuantity?: boolean;
  getCurrentQty?: (productId: string) => number | null;
  error?: string;
  /** Hard lock: search + add disabled, full overlay. Prefer `lockAdd` for multi-step forms. */
  disabled?: boolean;
  disabledHint?: string;
  /**
   * Soft lock: catalog stays browsable/searchable; adding is blocked and
   * `onAddBlocked` is called so the parent can highlight missing fields.
   */
  lockAdd?: boolean;
  onAddBlocked?: () => void;
  maxGridResults?: number;
  /** split = catalog | cart side-by-side (page forms). stack = vertical (dialogs). */
  layout?: "stack" | "split";
  /** Rendered under the cart list (totals + save). */
  cartFooter?: React.ReactNode;
  /** Shows the resulting on-hand per line: add (+qty), remove (-qty), signed (+change). */
  previewMode?: "add" | "remove" | "signed" | "set";
  /** Starting quantity for a newly added line (default 1), e.g. on-hand for a stock count. */
  initialQuantity?: (product: StockPickerProduct, onHand: number | null) => string | number;
  catalogTitle?: string;
  catalogSubtitle?: string;
  cartTitle?: string;
  emptyCartHint?: string;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesProduct(product: StockPickerProduct, term: string) {
  return productMatchesSearch(product, term);
}

function pickerDisplayLabel(product: StockPickerProduct) {
  return formatProductSearchLabel(product);
}

function dedupeCategories(categories: Array<{ id: string; name: string }>) {
  const seen = new Set<string>();
  return categories.filter((c) => {
    const id = (c.id || "").trim();
    const name = (c.name || "").trim().toLowerCase();
    if (!id || id === "all" || name === "all" || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function StockProductPicker({
  products,
  categories = [],
  loading = false,
  lines,
  onLinesChange,
  quantityLabel = "Quantity",
  quantityPlaceholder = "0",
  showUnitCost = false,
  unitCostLabel = "Cost price",
  showSalePrice = false,
  showCurrentQty = false,
  allowSignedQuantity = false,
  getCurrentQty,
  error,
  disabled = false,
  disabledHint,
  lockAdd = false,
  onAddBlocked,
  maxGridResults = 120,
  layout = "stack",
  cartFooter,
  previewMode,
  initialQuantity,
  catalogTitle = "Products",
  catalogSubtitle,
  cartTitle = "Receipt",
  emptyCartHint,
}: StockProductPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const addBlocked = disabled || lockAdd;
  const [remoteProducts, setRemoteProducts] = useState<StockPickerProduct[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  /** Keyboard highlight in the product results list (−1 = none). */
  const [highlightIndex, setHighlightIndex] = useState(-1);
  /** After add / Enter chain: focus this line field (or product search). */
  const [focusTarget, setFocusTarget] = useState<{
    productId?: string;
    field: "qty" | "cost" | "sale" | "search";
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogScrollRef = useRef<HTMLDivElement>(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const isSplit = layout === "split";

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [searchTerm, categoryFilter]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const res = await apiClient.get("/products", {
          params: {
            page: 1,
            limit: 60,
            is_active: true,
            search: searchTerm.trim() || undefined,
            category_id: categoryFilter !== "all" ? categoryFilter : undefined,
          },
        });
        const raw = Array.isArray(res.data?.data) ? res.data.data : [];
        setRemoteTotal(Number(res.data?.meta?.total ?? raw.length) || raw.length);
        setRemoteProducts(
          raw.map((item: any) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            code: item.code,
            label_barcode: item.label_barcode,
            custom_code: item.custom_code,
            barcode:
              item.label_barcode ||
              item.custom_code ||
              item.barcode ||
              item.sku ||
              item.code,
            category_id: item.category?.id || item.category_id,
            categoryId: item.category?.id || item.category_id,
            categoryName: item.category?.name ?? null,
            price:
              Number(item.sales_rate_inc_dis_and_tax ?? item.sales_rate_exc_dis_and_tax ?? 0) || null,
            cost: Number(item.purchase_rate ?? 0) || null,
          })),
        );
      } catch {
        setRemoteProducts([]);
      } finally {
        setRemoteLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchTerm, categoryFilter]);

  const filteredProducts = useMemo(() => {
    const catalog = remoteProducts.length > 0 ? remoteProducts : products;
    const term = normalizeSearch(searchTerm);
    return catalog
      .filter((p) => {
        if (
          categoryFilter !== "all" &&
          (p.category_id || p.categoryId) !== categoryFilter
        ) {
          return false;
        }
        return matchesProduct(p, term);
      })
      .slice(0, maxGridResults);
  }, [products, remoteProducts, searchTerm, categoryFilter, maxGridResults]);

  const lineMap = useMemo(
    () => new Map(lines.map((l) => [l.productId, l])),
    [lines],
  );

  const addOrBumpProduct = useCallback(
    (product: StockPickerProduct, opts?: { fromSearch?: boolean }) => {
      if (disabled) return;
      if (lockAdd) {
        onAddBlocked?.();
        return;
      }
      const existing = lineMap.get(product.id);
      const currentQty = getCurrentQty?.(product.id) ?? null;

      if (existing) {
        const current = Number(existing.quantity) || 0;
        onLinesChange(
          lines.map((l) =>
            l.productId === product.id ? { ...l, quantity: current + 1 } : l,
          ),
        );
      } else {
        onLinesChange([
          ...lines,
          {
            productId: product.id,
            productName: pickerDisplayLabel(product),
            sku: getProductBarcodeDisplay(product) || product.sku || undefined,
            quantity: initialQuantity ? initialQuantity(product, currentQty) : 1,
            // Prefill with the product's purchase rate; still editable per line.
            unitCost: showUnitCost && product.cost ? String(product.cost) : "",
            currentQty,
            ...(showSalePrice
              ? { salePrice: product.price ? String(product.price) : "", currentSalePrice: product.price ?? null }
              : {}),
          },
        ]);
      }
      if (opts?.fromSearch) {
        setSearchTerm("");
        setHighlightIndex(-1);
      }
      // Always land on Qty so staff can type amount immediately.
      setFocusTarget({ productId: product.id, field: "qty" });
    },
    [disabled, lockAdd, onAddBlocked, lineMap, getCurrentQty, onLinesChange, lines, showUnitCost, showSalePrice, initialQuantity],
  );

  const focusNextAfterQty = useCallback(
    (productId: string) => {
      if (showUnitCost) setFocusTarget({ productId, field: "cost" });
      else if (showSalePrice) setFocusTarget({ productId, field: "sale" });
      else setFocusTarget({ field: "search" });
    },
    [showUnitCost, showSalePrice],
  );

  const focusNextAfterCost = useCallback(
    (productId: string) => {
      if (showSalePrice) setFocusTarget({ productId, field: "sale" });
      else setFocusTarget({ field: "search" });
    },
    [showSalePrice],
  );

  const onLineFieldKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    productId: string,
    field: "qty" | "cost" | "sale",
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (field === "qty") focusNextAfterQty(productId);
    else if (field === "cost") focusNextAfterCost(productId);
    else setFocusTarget({ field: "search" });
  };

  // Focus + scroll cart to the active line after add / Enter chain.
  useEffect(() => {
    if (!focusTarget) return;
    const run = () => {
      if (focusTarget.field === "search") {
        searchRef.current?.focus();
        searchRef.current?.select?.();
        setFocusTarget(null);
        return;
      }
      const { productId, field } = focusTarget;
      if (!productId) {
        setFocusTarget(null);
        return;
      }
      const row = document.querySelector(
        `[data-stock-row="${productId}"]`,
      ) as HTMLElement | null;
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const input = document.querySelector(
        `[data-stock-line="${productId}"][data-stock-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
      setFocusTarget(null);
    };
    const t = window.setTimeout(run, 30);
    return () => window.clearTimeout(t);
  }, [focusTarget, lines]);

  // Keep highlighted catalog row visible while arrowing.
  useEffect(() => {
    if (highlightIndex < 0) return;
    const el = catalogScrollRef.current?.querySelector(
      `[data-catalog-index="${highlightIndex}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredProducts.length === 0) return;
      setHighlightIndex((i) =>
        i < 0 ? 0 : Math.min(i + 1, filteredProducts.length - 1),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredProducts.length === 0) return;
      setHighlightIndex((i) => (i <= 0 ? 0 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      setHighlightIndex(-1);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (addBlocked) {
      onAddBlocked?.();
      return;
    }
    const term = normalizeSearch(searchTerm);
    const highlighted =
      highlightIndex >= 0 ? filteredProducts[highlightIndex] : undefined;
    const exact =
      highlighted ||
      (term
        ? products.find((p) => {
            const code = getProductBarcodeDisplay(p).toLowerCase();
            return (
              code === term ||
              p.sku?.toLowerCase() === term ||
              p.barcode?.toLowerCase() === term ||
              p.label_barcode?.toLowerCase() === term
            );
          })
        : undefined) ||
      filteredProducts[0];

    if (exact) addOrBumpProduct(exact, { fromSearch: true });
  };

  const updateLine = (
    productId: string,
    patch: Partial<Pick<StockLineItem, "quantity" | "unitCost" | "salePrice">>,
  ) => {
    onLinesChange(
      lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  };

  const adjustLineQty = (productId: string, delta: number) => {
    const line = lineMap.get(productId);
    if (!line) return;
    const current = Number(line.quantity) || 0;
    const next = allowSignedQuantity
      ? current + delta
      : Math.max(0, current + delta);
    updateLine(productId, { quantity: next });
  };

  const removeLine = (productId: string) => {
    onLinesChange(lines.filter((l) => l.productId !== productId));
  };

  const clearAll = () => onLinesChange([]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const totalCost = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );
  const onHandFor = (line: StockLineItem) => {
    const live = getCurrentQty?.(line.productId);
    return live != null ? live : line.currentQty ?? null;
  };
  const fmtNum = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  /** True when the line's selling price differs from the product's current price. */
  const salePriceChanged = (line: StockLineItem) => {
    if (!showSalePrice || line.salePrice === undefined || String(line.salePrice).trim() === "") return false;
    const next = Number(line.salePrice);
    return Number.isFinite(next) && Math.abs(next - (line.currentSalePrice ?? 0)) >= 0.005;
  };
  const priceChangeCount = showSalePrice ? lines.filter(salePriceChanged).length : 0;

  const catalogToolbar = (
    <>
      {lockAdd && !disabled ? (
        <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">{disabledHint || "Complete the fields above first."}</span>
          <span className="text-amber-800/90"> Then click a product to add it.</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchRef}
            placeholder="Search name, SKU, barcode…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            disabled={disabled || loading}
            autoComplete="off"
            className="h-10 border-slate-200 bg-white pl-9 text-sm text-slate-900"
          />
        </div>

        {loading && categoryOptions.length === 0 ? (
          <div className="h-10 w-full animate-pulse rounded-md border border-slate-200 bg-slate-50 sm:w-[180px]" />
        ) : categoryOptions.length > 0 ? (
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            disabled={disabled || loading}
          >
            <SelectTrigger className="h-10 w-full border-slate-200 text-sm text-slate-900 sm:w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all" className="text-sm">
                All categories
              </SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.id} value={cat.id} className="text-sm">
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex items-center justify-between pb-1 pt-2 text-[11px] text-slate-500">
        <span>
          {filteredProducts.length} result
          {filteredProducts.length === 1 ? "" : "s"}
          {remoteTotal != null && remoteTotal > filteredProducts.length
            ? ` of ${remoteTotal.toLocaleString()}`
            : ""}
        </span>
        <span className="hidden sm:inline">
          {addBlocked
            ? "Select details above to add"
            : "↑↓ move · Enter = add · then Qty → Cost → Sell → search"}
        </span>
      </div>
    </>
  );

  const catalogList =
    loading || remoteLoading ? (
      <div className={cn("grid gap-1.5", isSplit ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7")}>
        {Array.from({ length: isSplit ? 8 : 14 }).map((_, i) => (
          <div key={i} className={cn("animate-pulse rounded-md bg-slate-100", isSplit ? "h-11" : "h-12")} />
        ))}
      </div>
    ) : filteredProducts.length === 0 ? (
      <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
        <Package className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
        <p className="text-xs font-medium text-slate-700">No products found</p>
      </div>
    ) : isSplit ? (
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filteredProducts.map((product, index) => {
          const selected = lineMap.get(product.id);
          const onHand = getCurrentQty?.(product.id);
          const highlighted = highlightIndex === index;
          return (
            <button
              key={product.id}
              type="button"
              data-catalog-index={index}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => addOrBumpProduct(product)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                "hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50",
                selected && "bg-emerald-50/70",
                highlighted && "bg-emerald-100 ring-1 ring-inset ring-emerald-400",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {pickerDisplayLabel(product)}
                  </p>
                  {selected ? (
                    <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-px text-[10px] font-bold text-white">
                      ×{selected.quantity}
                    </span>
                  ) : null}
                </div>
                {product.categoryName ? (
                  <p className="truncate text-[11px] text-slate-500">{product.categoryName}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                {product.price != null ? (
                  <p className="text-xs font-semibold tabular-nums text-slate-800">
                    Rs {fmtNum(product.price)}
                  </p>
                ) : null}
                {onHand != null ? (
                  <p
                    className={cn(
                      "text-[10px] font-semibold tabular-nums",
                      onHand <= 0 ? "text-rose-600" : "text-emerald-700",
                    )}
                  >
                    {fmtNum(onHand)} stock
                  </p>
                ) : null}
              </div>
              <Plus
                className={cn(
                  "h-4 w-4 shrink-0",
                  selected ? "text-emerald-600" : "text-slate-300",
                )}
              />
            </button>
          );
        })}
      </div>
    ) : (
      <div
        ref={catalogScrollRef}
        className="max-h-[240px] overflow-y-auto -mx-0.5 px-0.5"
      >
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {filteredProducts.map((product, index) => {
            const selected = lineMap.get(product.id);
            const highlighted = highlightIndex === index;
            return (
              <button
                key={product.id}
                type="button"
                data-catalog-index={index}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => addOrBumpProduct(product)}
                className={cn(
                  "relative flex min-h-[4rem] flex-col rounded-lg border px-2.5 py-2 text-left transition-colors",
                  "border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  selected && "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600",
                  highlighted && "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400",
                )}
              >
                {selected ? (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-2 w-2" strokeWidth={3} />
                  </span>
                ) : null}
                <span className="line-clamp-3 pr-4 text-[12px] font-semibold leading-tight text-slate-900">
                  {pickerDisplayLabel(product)}
                </span>
                {(() => {
                  const onHand = getCurrentQty?.(product.id);
                  if (product.price == null && onHand == null) return null;
                  return (
                    <span className="mt-auto flex items-center justify-between gap-1 pt-1 text-[10px]">
                      {product.price != null ? (
                        <span className="font-semibold tabular-nums text-slate-700">
                          Rs {fmtNum(product.price)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {onHand != null ? (
                        <span
                          className={cn(
                            "rounded px-1 py-px font-semibold tabular-nums",
                            onHand <= 0
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {fmtNum(onHand)} in stock
                        </span>
                      ) : null}
                    </span>
                  );
                })()}
              </button>
            );
          })}
        </div>
      </div>
    );

  const catalogGrid = (
    <>
      {catalogToolbar}
      {catalogList}
    </>
  );

  const lineEditors = (line: StockLineItem) => (
    <div
      className={cn(
        "mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-4",
      )}
    >
      {showCurrentQty ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">
            On hand
          </Label>
          <p className="flex h-8 items-center text-sm font-medium tabular-nums text-slate-700">
            {onHandFor(line) != null ? fmtNum(onHandFor(line) as number) : "—"}
            {previewMode && onHandFor(line) != null
              ? (() => {
                  const q = Number(line.quantity) || 0;
                  const base = onHandFor(line) as number;
                  if (previewMode === "set" && line.quantity === "") return null;
                  const after =
                    previewMode === "set" ? q : previewMode === "remove" ? base - q : base + q;
                  const diff = after - base;
                  return (
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-semibold",
                        after < 0 || (previewMode === "set" && diff < 0)
                          ? "text-rose-600"
                          : previewMode === "set" && diff === 0
                            ? "text-slate-400"
                            : "text-emerald-700",
                      )}
                      title={previewMode === "set" ? "Variance (counted − system)" : "On hand after saving"}
                    >
                      {previewMode === "set"
                        ? diff === 0
                          ? "· matches"
                          : `${diff > 0 ? "+" : "−"}${fmtNum(Math.abs(diff))}`
                        : `→ ${fmtNum(after)}`}
                    </span>
                  );
                })()
              : null}
          </p>
        </div>
      ) : null}

      <div className={!showUnitCost ? "sm:col-span-2" : ""}>
        <Label className="text-[10px] uppercase tracking-wide text-slate-400">
          {quantityLabel}
        </Label>
        <div className="mt-0.5 flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            onClick={() => adjustLineQty(line.productId, -1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            placeholder={quantityPlaceholder}
            value={line.quantity}
            disabled={disabled}
            data-stock-line={line.productId}
            data-stock-field="qty"
            onChange={(e) =>
              updateLine(line.productId, { quantity: e.target.value })
            }
            onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "qty")}
            className="h-8 text-center text-sm text-slate-900"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled}
            onClick={() => adjustLineQty(line.productId, 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showUnitCost ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">
            {unitCostLabel}
          </Label>
          <Input
            type="number"
            placeholder="0.00"
            value={line.unitCost ?? ""}
            disabled={disabled}
            data-stock-line={line.productId}
            data-stock-field="cost"
            onChange={(e) =>
              updateLine(line.productId, { unitCost: e.target.value })
            }
            onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "cost")}
            className="mt-0.5 h-8 text-sm text-slate-900"
          />
          {Number(line.unitCost) > 0 && Number(line.quantity) > 0 ? (
            <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">
              Cost {fmtNum(Number(line.unitCost) || 0)} × {fmtNum(Number(line.quantity) || 0)} = Rs{" "}
              {fmtNum((Number(line.unitCost) || 0) * (Number(line.quantity) || 0))}
            </p>
          ) : null}
        </div>
      ) : null}

      {showSalePrice ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-slate-400">Selling price</Label>
          <Input
            type="number"
            min={0}
            placeholder="0.00"
            value={line.salePrice ?? ""}
            disabled={disabled}
            data-stock-line={line.productId}
            data-stock-field="sale"
            onChange={(e) => updateLine(line.productId, { salePrice: e.target.value })}
            onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "sale")}
            className={cn(
              "mt-0.5 h-8 text-sm text-slate-900",
              salePriceChanged(line) && "border-amber-400 bg-amber-50",
            )}
          />
          {salePriceChanged(line) ? (
            <p className="mt-0.5 text-[10px] tabular-nums text-amber-700">
              Was Rs {fmtNum(line.currentSalePrice ?? 0)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  /** Dense POS cart rows — one line of controls so both panes stay equal height */
  const splitCartLines = (
    <div
      ref={cartScrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="divide-y divide-slate-100">
        {lines.map((line) => {
          const qty = Number(line.quantity) || 0;
          const cost = Number(line.unitCost) || 0;
          const onHand = onHandFor(line);
          const after =
            onHand != null && previewMode
              ? previewMode === "set"
                ? line.quantity === ""
                  ? null
                  : qty
                : previewMode === "remove"
                  ? onHand - qty
                  : onHand + qty
              : null;
          const setDiff = previewMode === "set" && after != null && onHand != null ? after - onHand : null;
          return (
            <div
              key={line.productId}
              data-stock-row={line.productId}
              className="flex items-end gap-2 bg-white px-2.5 py-2"
            >
              <div className="min-w-0 flex-1 self-center">
                <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
                  {line.productName}
                </p>
                <p className="truncate text-[10px] leading-tight text-slate-500">
                  {showCurrentQty && onHand != null ? (
                    <span className="tabular-nums">
                      {fmtNum(onHand)}
                      {after != null ? (
                        <span
                          className={cn(
                            "ml-1 font-semibold",
                            after < 0 || (setDiff != null && setDiff < 0)
                              ? "text-rose-600"
                              : setDiff === 0
                                ? "text-slate-400"
                                : "text-emerald-700",
                          )}
                        >
                          {setDiff != null
                            ? setDiff === 0
                              ? "· matches"
                              : `${setDiff > 0 ? "+" : "−"}${fmtNum(Math.abs(setDiff))}`
                            : `→ ${fmtNum(after)}`}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {showUnitCost && qty > 0 && cost > 0 ? (
                    <span className="tabular-nums text-slate-600">
                      {" · "}
                      <span className="font-medium text-slate-500">Cost</span>{" "}
                      <span className="font-medium text-slate-700">
                        {fmtNum(cost)} × {fmtNum(qty)}
                      </span>
                      {" = "}Rs {fmtNum(qty * cost)}
                    </span>
                  ) : null}
                  {salePriceChanged(line) ? (
                    <span className="font-semibold tabular-nums text-amber-700">
                      {" · "}Sell Rs {fmtNum(line.currentSalePrice ?? 0)} → {fmtNum(Number(line.salePrice))}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-0.5">
                <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                  Qty
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={disabled}
                    onClick={() => adjustLineQty(line.productId, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    placeholder={quantityPlaceholder}
                    value={line.quantity}
                    disabled={disabled}
                    data-stock-line={line.productId}
                    data-stock-field="qty"
                    onChange={(e) =>
                      updateLine(line.productId, { quantity: e.target.value })
                    }
                    onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "qty")}
                    className="h-7 w-12 px-1 text-center text-xs tabular-nums text-slate-900"
                    title={quantityLabel}
                    aria-label={`Quantity for ${line.productName}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={disabled}
                    onClick={() => adjustLineQty(line.productId, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {showUnitCost ? (
                <div className="flex w-[5.25rem] shrink-0 flex-col gap-0.5">
                  <span className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    Cost price
                  </span>
                  <Input
                    type="number"
                    placeholder="0"
                    value={line.unitCost ?? ""}
                    disabled={disabled}
                    data-stock-line={line.productId}
                    data-stock-field="cost"
                    onChange={(e) =>
                      updateLine(line.productId, { unitCost: e.target.value })
                    }
                    onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "cost")}
                    className="h-7 px-1.5 text-xs tabular-nums text-slate-900"
                    title={unitCostLabel}
                    aria-label={`Cost price for ${line.productName}`}
                  />
                </div>
              ) : null}

              {showSalePrice ? (
                <div className="flex w-[5.25rem] shrink-0 flex-col gap-0.5">
                  <span className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    Selling price
                  </span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={line.salePrice ?? ""}
                    disabled={disabled}
                    data-stock-line={line.productId}
                    data-stock-field="sale"
                    onChange={(e) => updateLine(line.productId, { salePrice: e.target.value })}
                    onKeyDown={(e) => onLineFieldKeyDown(e, line.productId, "sale")}
                    className={cn(
                      "h-7 px-1.5 text-xs tabular-nums text-slate-900",
                      salePriceChanged(line) && "border-amber-400 bg-amber-50",
                    )}
                    title="Selling price — change it to update the product's price when you save"
                    aria-label={`Selling price for ${line.productName}`}
                  />
                </div>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5 h-7 w-7 shrink-0 text-slate-400 hover:text-rose-600"
                disabled={disabled}
                onClick={() => removeLine(line.productId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const cartBody = (
    <>
      {error ? (
        <div className="mx-3 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <ShoppingCart className="mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No items yet</p>
          <p className="mt-1 max-w-[220px] text-xs text-slate-500">
            {emptyCartHint ||
              (isSplit
                ? "Click a product on the left to add it here."
                : "Click a product above to add it here.")}
          </p>
        </div>
      ) : isSplit ? (
        splitCartLines
      ) : (
        <div
          ref={cartScrollRef}
          className="max-h-[320px] space-y-2 overflow-y-auto p-3"
        >
          {lines.map((line) => (
            <div
              key={line.productId}
              data-stock-row={line.productId}
              className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-snug text-slate-900">
                    {line.productName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-slate-400 hover:text-rose-600"
                  disabled={disabled}
                  onClick={() => removeLine(line.productId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {lineEditors(line)}
            </div>
          ))}
        </div>
      )}

      {priceChangeCount > 0 ? (
        <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          Selling price will update for <span className="font-semibold">{priceChangeCount}</span> product
          {priceChangeCount === 1 ? "" : "s"} when you save.
        </div>
      ) : null}

      {cartFooter ? (
        <div className="shrink-0 border-t border-slate-200 bg-white p-2">
          {cartFooter}
        </div>
      ) : null}
    </>
  );

  if (isSplit) {
    return (
      <div
        className={cn(
          // Forced equal panes: one row, fixed height, both columns min-h-0 so neither can stretch the card.
          "grid h-[min(640px,calc(100vh-12rem))] max-h-[calc(100vh-12rem)] grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-2",
          (disabled || lockAdd) && "border-amber-200/80",
        )}
      >
        {/* Products — left */}
        <section className="relative flex h-full min-h-0 flex-col overflow-hidden border-b border-slate-200 md:border-b-0 md:border-r">
          {disabled ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4">
              <div className="max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center shadow-sm">
                <p className="text-sm font-medium text-amber-900">
                  {disabledHint ||
                    "Complete the required fields above to add products"}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{catalogTitle}</h3>
              <p className="text-[11px] text-slate-500">
                {catalogSubtitle ||
                  `${products.length.toLocaleString()} products · click to add`}
              </p>
            </div>
            {!addBlocked ? (
              <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline">
                Ready
              </span>
            ) : null}
          </div>

          {/* Search stays fixed — only the product rows scroll */}
          <div className="shrink-0 border-b border-slate-100 px-2.5 pb-2 pt-2">
            {catalogToolbar}
          </div>

          <div
            ref={catalogScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5"
          >
            {catalogList}
          </div>
        </section>

        {/* Receipt / dispatch — right, locked to same height */}
        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <ShoppingCart className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{cartTitle}</h3>
                <p className="text-[11px] tabular-nums text-slate-500">
                  {lines.length} item{lines.length === 1 ? "" : "s"}
                  {totalUnits > 0 ? ` · ${fmtNum(totalUnits)} units` : ""}
                  {showUnitCost && totalCost > 0 ? ` · Rs ${fmtNum(totalCost)}` : ""}
                </p>
              </div>
            </div>
            {lines.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={disabled}
                className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {cartBody}
          </div>
        </section>
      </div>
    );
  }

  /* Stacked (dialogs) */
  return (
    <div className="space-y-3">
      <section
        className={cn(
          "rounded-xl border bg-white shadow-sm overflow-hidden relative",
          disabled ? "border-amber-200" : "border-slate-200",
        )}
      >
        {disabled ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center max-w-sm shadow-sm">
              <p className="text-sm font-medium text-amber-900">
                {disabledHint ||
                  "Complete the required fields above to add products"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{catalogTitle}</h3>
            <p className="text-[11px] text-slate-500">
              {catalogSubtitle ||
                `${products.length.toLocaleString()} products · click to add`}
            </p>
          </div>
        </div>
        <div className="p-3">{catalogGrid}</div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{cartTitle}</h3>
              <p className="text-[11px] text-slate-500">
                {lines.length} item{lines.length === 1 ? "" : "s"}
                {totalUnits > 0 ? ` · ${fmtNum(totalUnits)} units` : ""}
                {showUnitCost && totalCost > 0 ? ` · Rs ${fmtNum(totalCost)}` : ""}
              </p>
            </div>
          </div>
          {lines.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={disabled}
              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          ) : null}
        </div>
        {cartBody}
      </section>
    </div>
  );
}
