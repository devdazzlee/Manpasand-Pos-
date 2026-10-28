"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { cleanParams } from "@/lib/api/http";
import { STALE_TIME } from "@/lib/query/query-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ============================================================
 * Shared catalog filters for every report: Vendor, Category,
 * Subcategory (each multi-select) and a Stitched / Unstitched tab.
 * ============================================================ */

export type StitchType = "STITCHED" | "UNSTITCHED";
export type StitchFilter = "all" | StitchType;

export type CatalogFilters = {
  supplierIds: string[];
  categoryIds: string[];
  subcategoryIds: string[];
  stitchType: StitchFilter;
};

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  supplierIds: [],
  categoryIds: [],
  subcategoryIds: [],
  stitchType: "all",
};

export const STITCH_LABEL: Record<StitchType, string> = {
  STITCHED: "Stitched",
  UNSTITCHED: "Unstitched",
};

export const hasCatalogFilters = (f: CatalogFilters) =>
  f.supplierIds.length > 0 || f.categoryIds.length > 0 || f.subcategoryIds.length > 0 || f.stitchType !== "all";

/** Query-string params the report endpoints read (comma-separated ids). */
export function catalogFilterParams(f: CatalogFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.supplierIds.length) params.supplierIds = f.supplierIds.join(",");
  if (f.categoryIds.length) params.categoryIds = f.categoryIds.join(",");
  if (f.subcategoryIds.length) params.subcategoryIds = f.subcategoryIds.join(",");
  if (f.stitchType !== "all") params.stitchTypes = f.stitchType;
  return params;
}

type Option = { id: string; name: string };

async function fetchAllPages(path: string): Promise<Option[]> {
  const all: Option[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await apiClient.get(path, { params: cleanParams({ page, limit: 100 }) });
    const rows = (res.data?.data ?? []) as Option[];
    all.push(...rows.map((row) => ({ id: row.id, name: row.name })));
    const totalPages = Number(res.data?.meta?.totalPages ?? 1);
    if (page >= totalPages || rows.length === 0) break;
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

/** Vendors, categories and subcategories for the pickers (cached, all pages). */
export function useCatalogFilterOptions() {
  const query = useQuery({
    queryKey: ["catalog-filter-options"],
    queryFn: async () => {
      const [suppliers, categories, subcategories] = await Promise.all([
        fetchAllPages("/suppliers"),
        fetchAllPages("/categories"),
        fetchAllPages("/subcategories"),
      ]);
      return { suppliers, categories, subcategories };
    },
    staleTime: STALE_TIME.reference,
  });
  return {
    suppliers: query.data?.suppliers ?? [],
    categories: query.data?.categories ?? [],
    subcategories: query.data?.subcategories ?? [],
    loading: query.isLoading,
  };
}

/** Short text for headers and exports, e.g. "Stitched · Velvet · AARAST". */
export function useCatalogFilterLabel(f: CatalogFilters) {
  const { suppliers, categories, subcategories } = useCatalogFilterOptions();
  return useMemo(() => {
    const names = (ids: string[], options: Option[], noun: string) => {
      if (!ids.length) return null;
      if (ids.length > 2) return `${ids.length} ${noun}`;
      return ids.map((id) => options.find((o) => o.id === id)?.name || noun).join(", ");
    };
    return [
      f.stitchType !== "all" ? STITCH_LABEL[f.stitchType] : null,
      names(f.categoryIds, categories, "categories"),
      names(f.subcategoryIds, subcategories, "subcategories"),
      names(f.supplierIds, suppliers, "vendors"),
    ]
      .filter(Boolean)
      .join(" · ");
  }, [f, suppliers, categories, subcategories]);
}

export function StitchTabs({
  value,
  onChange,
  allLabel = "All",
  className,
}: {
  value: StitchFilter;
  onChange: (value: StitchFilter) => void;
  allLabel?: string;
  className?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as StitchFilter)} className={className}>
      <TabsList className="h-9">
        <TabsTrigger value="all" className="px-3 text-xs sm:text-sm">
          {allLabel}
        </TabsTrigger>
        <TabsTrigger value="STITCHED" className="px-3 text-xs sm:text-sm">
          Stitched
        </TabsTrigger>
        <TabsTrigger value="UNSTITCHED" className="px-3 text-xs sm:text-sm">
          Unstitched
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  allLabel,
  loading = false,
  className,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  allLabel: string;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const summary = useMemo(() => {
    if (value.length === 0) return allLabel;
    if (value.length === 1) return options.find((o) => o.id === value[0])?.name || `1 ${label.toLowerCase()}`;
    return `${value.length} selected`;
  }, [value, options, allLabel, label]);

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-9 w-full justify-between font-normal", value.length === 0 && "text-muted-foreground")}
          >
            <span className="truncate">{loading && options.length === 0 ? "Loading…" : summary}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {value.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Clear ${label}`}
                  className="rounded p-0.5 hover:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange([]);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onChange([]);
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>Nothing found</CommandEmpty>
              <CommandGroup>
                <CommandItem value={`__all__ ${allLabel}`} onSelect={() => onChange([])}>
                  <Check className={cn("mr-2 h-4 w-4", value.length === 0 ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
                {options.map((option) => (
                  <CommandItem key={option.id} value={`${option.name} ${option.id}`} onSelect={() => toggle(option.id)}>
                    <Check className={cn("mr-2 h-4 w-4", selected.has(option.id) ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Stitched / Unstitched tabs plus Vendor, Category and Subcategory pickers.
 * Drop it into any report and send `catalogFilterParams(value)` with the request.
 */
export function CatalogFilterBar({
  value,
  onChange,
  vendorLabel = "Vendor",
  clearable = false,
  className,
}: {
  value: CatalogFilters;
  onChange: (value: CatalogFilters) => void;
  vendorLabel?: string;
  /** Own "Clear filters" button, for screens without one. */
  clearable?: boolean;
  className?: string;
}) {
  const { suppliers, categories, subcategories, loading } = useCatalogFilterOptions();
  const set = <K extends keyof CatalogFilters>(key: K, next: CatalogFilters[K]) => onChange({ ...value, [key]: next });

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StitchTabs value={value.stitchType} onChange={(next) => set("stitchType", next)} />
        {clearable && hasCatalogFilters(value) && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onChange(EMPTY_CATALOG_FILTERS)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MultiSelectFilter
          label={vendorLabel}
          allLabel={`All ${vendorLabel.toLowerCase()}s`}
          options={suppliers}
          value={value.supplierIds}
          onChange={(next) => set("supplierIds", next)}
          loading={loading}
        />
        <MultiSelectFilter
          label="Category"
          allLabel="All categories"
          options={categories}
          value={value.categoryIds}
          onChange={(next) => set("categoryIds", next)}
          loading={loading}
        />
        <MultiSelectFilter
          label="Subcategory"
          allLabel="All subcategories"
          options={subcategories}
          value={value.subcategoryIds}
          onChange={(next) => set("subcategoryIds", next)}
          loading={loading}
        />
      </div>
    </div>
  );
}
