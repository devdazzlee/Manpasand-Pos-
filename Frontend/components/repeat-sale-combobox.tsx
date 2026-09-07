"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2, RotateCcw } from "lucide-react";
import { useSales } from "@/hooks/queries/use-sales";
import { fetchSaleById } from "@/lib/api/sales";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface RepeatCartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unitId?: string;
  unitName?: string;
}

export interface RepeatSalePayload {
  saleNumber: string;
  customerId: string | null;
  items: RepeatCartLine[];
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

function mapDetailToItems(detail: any): RepeatCartLine[] {
  const raw = Array.isArray(detail?.sale_items)
    ? detail.sale_items
    : Array.isArray(detail?.items)
      ? detail.items
      : [];
  return raw
    .map((it: any) => {
      const productId = String(
        it.product_id || it.productId || it.product?.id || "",
      );
      if (!productId) return null;
      const qty = Math.abs(toNum(it.quantity)) || 1;
      const lineTotal = Math.abs(toNum(it.line_total ?? it.lineTotal));
      let unit = Math.abs(toNum(it.unit_price ?? it.unitPrice ?? it.price));
      if (!unit && qty > 0 && lineTotal > 0) unit = lineTotal / qty;
      return {
        productId,
        name: it.product?.name || it.name || "Item",
        price: unit,
        quantity: qty,
        unitId: it.product?.unit_id || it.unitId || undefined,
        unitName: it.product?.unit?.name || it.unitName || undefined,
      } as RepeatCartLine;
    })
    .filter(Boolean) as RepeatCartLine[];
}

interface RepeatSaleComboboxProps {
  branchId?: string;
  disabled?: boolean;
  className?: string;
  onRepeat: (payload: RepeatSalePayload) => void;
}

export function RepeatSaleCombobox({
  branchId,
  disabled,
  className,
  onRepeat,
}: RepeatSaleComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn("justify-between", className)}
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 shrink-0" />
            Repeat past sale
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(360px,calc(100vw-2rem))] p-0"
        align="start"
        sideOffset={6}
        collisionPadding={8}
      >
        {open && (
          <RepeatSaleList
            branchId={branchId}
            onPick={(payload) => {
              setOpen(false);
              onRepeat(payload);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function RepeatSaleList({
  branchId,
  onPick,
}: {
  branchId?: string;
  onPick: (payload: RepeatSalePayload) => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { sales, isFirstLoad, isRefreshing } = useSales({
    branchId: branchId || undefined,
    page: 1,
    limit: 20,
    sortBy: "sale_date",
    sortOrder: "desc",
    search: debounced || undefined,
  });

  const handleSelect = async (sale: any) => {
    if (loadingId) return;
    setLoadingId(sale.id);
    try {
      let detail: any = sale;
      const hasItems =
        Array.isArray(sale?.sale_items) && sale.sale_items.length > 0;
      if (!hasItems) {
        detail = await fetchSaleById(sale.id);
      }
      const items = mapDetailToItems(detail);
      if (!items.length) {
        toast({
          variant: "destructive",
          title: "Nothing to repeat",
          description: "This sale has no saved line items.",
        });
        return;
      }
      onPick({
        saleNumber: sale.sale_number || detail?.sale_number || "",
        customerId: detail?.customer?.id || sale?.customer?.id || null,
        items,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not load sale",
        description:
          error?.response?.data?.message || error?.message || "Try again.",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const loading = isFirstLoad || isRefreshing;

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search sale # or customer name…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sales…
          </div>
        )}
        {!loading && <CommandEmpty>No sales found.</CommandEmpty>}
        {sales.length > 0 && (
          <CommandGroup heading={debounced ? "Search results" : "Recent sales"}>
            {sales.map((sale: any) => {
              const customer =
                sale.customer?.name ||
                sale.customer?.phone_number ||
                sale.customer?.phone ||
                "Walk-in";
              const when = sale.sale_date
                ? new Date(sale.sale_date).toLocaleDateString()
                : "";
              const count = Array.isArray(sale.sale_items)
                ? sale.sale_items.length
                : (sale.item_count ?? sale._count?.sale_items ?? null);
              return (
                <CommandItem
                  key={sale.id}
                  value={sale.id}
                  onSelect={() => handleSelect(sale)}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      #{sale.sale_number}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {customer}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        when,
                        count != null
                          ? `${count} item${count === 1 ? "" : "s"}`
                          : null,
                        `Rs ${toNum(sale.total_amount).toLocaleString()}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {loadingId === sale.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 shrink-0 opacity-40" />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
