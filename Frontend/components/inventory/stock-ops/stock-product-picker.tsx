"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
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

export interface StockPickerProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category_id?: string | null;
}

export interface StockLineItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: string | number;
  unitCost?: string | number;
  currentQty?: number | null;
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
  showCurrentQty?: boolean;
  allowSignedQuantity?: boolean;
  getCurrentQty?: (productId: string) => number | null;
  error?: string;
  disabled?: boolean;
  maxGridResults?: number;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function matchesProduct(product: StockPickerProduct, term: string) {
  if (!term) return true;
  return (
    product.name.toLowerCase().includes(term) ||
    (product.sku && product.sku.toLowerCase().includes(term)) ||
    (product.barcode && product.barcode.toLowerCase().includes(term))
  );
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
  unitCostLabel = "Unit cost",
  showCurrentQty = false,
  allowSignedQuantity = false,
  getCurrentQty,
  error,
  disabled = false,
  maxGridResults = 120,
}: StockProductPickerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const categoryOptions = useMemo(() => dedupeCategories(categories), [categories]);

  const filteredProducts = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return products
      .filter((p) => {
        if (categoryFilter !== "all" && p.category_id !== categoryFilter) {
          return false;
        }
        return matchesProduct(p, term);
      })
      .slice(0, maxGridResults);
  }, [products, searchTerm, categoryFilter, maxGridResults]);

  const lineMap = useMemo(
    () => new Map(lines.map((l) => [l.productId, l])),
    [lines],
  );

  const addOrBumpProduct = useCallback(
    (product: StockPickerProduct) => {
      if (disabled) return;
      const existing = lineMap.get(product.id);
      const currentQty = getCurrentQty?.(product.id) ?? null;

      if (existing) {
        const current = Number(existing.quantity) || 0;
        const next = allowSignedQuantity ? current + 1 : current + 1;
        onLinesChange(
          lines.map((l) =>
            l.productId === product.id ? { ...l, quantity: next } : l,
          ),
        );
      } else {
        onLinesChange([
          ...lines,
          {
            productId: product.id,
            productName: product.name,
            sku: product.sku || undefined,
            quantity: 1,
            unitCost: "",
            currentQty,
          },
        ]);
      }
      setSearchTerm("");
      searchRef.current?.focus();
    },
    [disabled, lineMap, getCurrentQty, allowSignedQuantity, onLinesChange, lines],
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = normalizeSearch(searchTerm);
    if (!term) return;

    const exact =
      products.find(
        (p) =>
          p.barcode?.toLowerCase() === term ||
          p.sku?.toLowerCase() === term,
      ) || filteredProducts[0];

    if (exact) addOrBumpProduct(exact);
  };

  const updateLine = (
    productId: string,
    patch: Partial<Pick<StockLineItem, "quantity" | "unitCost">>,
  ) => {
    onLinesChange(
      lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  };

  const adjustLineQty = (productId: string, delta: number) => {
    const line = lineMap.get(productId);
    if (!line) return;
    const current = Number(line.quantity) || 0;
    const next = allowSignedQuantity ? current + delta : Math.max(0, current + delta);
    updateLine(productId, { quantity: next });
  };

  const removeLine = (productId: string) => {
    onLinesChange(lines.filter((l) => l.productId !== productId));
  };

  const clearAll = () => onLinesChange([]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Catalog browser */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Product catalog</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Search, filter by category, then add to your list
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {products.length.toLocaleString()} products
          </span>
        </div>

        <div className="p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                ref={searchRef}
                placeholder="Search by name, SKU, or barcode…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                disabled={disabled || loading}
                autoComplete="off"
                className="pl-10 h-11 text-sm text-slate-900 bg-white border-slate-200 focus-visible:ring-slate-400"
              />
            </div>

            {categoryOptions.length > 0 && (
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                disabled={disabled || loading}
              >
                <SelectTrigger className="h-11 w-full sm:w-[220px] text-sm text-slate-900 border-slate-200">
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
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {filteredProducts.length} result{filteredProducts.length === 1 ? "" : "s"}
              {searchTerm.trim() && filteredProducts.length >= maxGridResults
                ? ` (showing first ${maxGridResults})`
                : ""}
            </span>
            <span className="hidden sm:inline">Press Enter to add top match</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1.5">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="h-14 rounded-md bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
              <Package className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-medium text-slate-700">No products found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Try a different search or category</p>
            </div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto -mx-0.5 px-0.5">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1.5">
                {filteredProducts.map((product) => {
                  const selected = lineMap.get(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => addOrBumpProduct(product)}
                      className={cn(
                        "relative flex min-h-[3.25rem] flex-col rounded-md border px-2 py-1.5 text-left transition-colors",
                        "bg-white border-slate-200 hover:border-slate-400 hover:bg-slate-50",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        selected && "border-slate-800 bg-slate-50 ring-1 ring-slate-800",
                      )}
                    >
                      {selected && (
                        <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-slate-800 text-white flex items-center justify-center">
                          <Check className="h-2 w-2" strokeWidth={3} />
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-900 leading-tight line-clamp-2 pr-4">
                        {product.name}
                      </span>
                      <span className="mt-auto pt-0.5 text-[10px] font-mono text-slate-500 truncate">
                        {product.sku || product.barcode || "—"}
                      </span>
                      {selected && (
                        <span className="mt-0.5 inline-flex w-fit items-center rounded bg-slate-200/80 px-1 py-px text-[9px] font-semibold text-slate-700">
                          ×{selected.quantity}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Selected lines */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Selected products
              </h3>
              <p className="text-xs text-slate-500">
                {lines.length} item{lines.length === 1 ? "" : "s"}
                {totalUnits > 0 ? ` · ${totalUnits} total units` : ""}
              </p>
            </div>
          </div>
          {lines.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={disabled}
              className="h-8 text-xs text-slate-600 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <p className="text-sm text-slate-600">No products selected yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Use the catalog above to build your list
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
            {lines.map((line) => (
              <div
                key={line.productId}
                className="rounded-lg border border-slate-200 bg-slate-50/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 line-clamp-2">
                      {line.productName}
                    </p>
                    {line.sku && (
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{line.sku}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-600"
                    disabled={disabled}
                    onClick={() => removeLine(line.productId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  {showCurrentQty && (
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400">
                        On hand
                      </Label>
                      <p className="h-9 flex items-center text-sm font-medium text-slate-700">
                        {line.currentQty != null
                          ? line.currentQty.toLocaleString()
                          : "—"}
                      </p>
                    </div>
                  )}

                  <div className={showUnitCost ? "" : "sm:col-span-2"}>
                    <Label className="text-[10px] uppercase tracking-wide text-slate-400">
                      {quantityLabel}
                    </Label>
                    <div className="flex items-center gap-1 mt-0.5">
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
                        onChange={(e) =>
                          updateLine(line.productId, { quantity: e.target.value })
                        }
                        className="h-8 text-sm text-center text-slate-900"
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

                  {showUnitCost && (
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-400">
                        {unitCostLabel}
                      </Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={line.unitCost ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateLine(line.productId, { unitCost: e.target.value })
                        }
                        className="h-8 mt-0.5 text-sm text-slate-900"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="px-4 pb-3 text-xs text-rose-600">{error}</p>
        )}
      </section>
    </div>
  );
}
