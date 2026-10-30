"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  Loader2,
  Pencil,
  Eye,
  Trash2,
  RefreshCcw,
  Layers,
  CheckCircle2,
  MonitorSmartphone,
  Package,
  PackageX,
  MoreHorizontal,
  LayoutGrid,
  List,
  ImagePlus,
  X,
  Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { extractApiError } from "@/lib/api/errors";
import { uploadCategoryImage } from "@/lib/api/categories";
import { compressImage } from "@/lib/image-compress";
import { useSubcategories, useSubcategory, useSubcategoryMutations } from "@/hooks/queries/use-subcategories";
import { useProducts } from "@/hooks/queries/use-products";
import { useCatalogFilterOptions } from "@/components/catalog-filter-bar";
import type { Subcategory } from "@/lib/api/subcategories";

type StatusFilter = "all" | "active" | "inactive" | "hidden" | "unused";
type SortKey = "az" | "za" | "products" | "newest";

/** Soft, stable tint per name so rows without an image still read at a glance. */
const TINTS = [
  "bg-indigo-50 text-indigo-700 ring-indigo-100",
  "bg-emerald-50 text-emerald-700 ring-emerald-100",
  "bg-amber-50 text-amber-700 ring-amber-100",
  "bg-rose-50 text-rose-700 ring-rose-100",
  "bg-sky-50 text-sky-700 ring-sky-100",
  "bg-violet-50 text-violet-700 ring-violet-100",
];
const tintFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

function Thumb({ sub, size = "md" }: { sub: Pick<Subcategory, "name" | "image">; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-xl text-base" : "h-10 w-10 rounded-lg text-xs";
  if (sub.image) {
    return <img src={sub.image} alt="" className={cn(box, "shrink-0 border border-slate-200 object-cover")} />;
  }
  return (
    <span className={cn(box, "flex shrink-0 items-center justify-center font-semibold ring-1", tintFor(sub.name))}>
      {initials(sub.name)}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function CategoryTags({ names, max = 2 }: { names: string[]; max?: number }) {
  if (!names.length) return <span className="text-xs text-slate-400">Not used yet</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.slice(0, max).map((name) => (
        <span key={name} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {name}
        </span>
      ))}
      {names.length > max ? (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500" title={names.slice(max).join(", ")}>
          +{names.length - max}
        </span>
      ) : null}
    </div>
  );
}

const Subcategories: React.FC = () => {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("az");
  const [view, setView] = useState<"table" | "grid">("table");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { subcategories, isFirstLoad, isRefreshing, refetch } = useSubcategories({
    search: debouncedSearch || undefined,
  });
  const { create, update, remove, toggleStatus } = useSubcategoryMutations();
  const { categories, links } = useCatalogFilterOptions();

  // Which categories each subcategory is used under (from its products).
  const categoryNamesBySub = useMemo(() => {
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    const map = new Map<string, string[]>();
    for (const link of links) {
      const name = nameOf.get(link.categoryId);
      if (!name) continue;
      const list = map.get(link.subcategoryId) ?? [];
      if (!list.includes(name)) list.push(name);
      map.set(link.subcategoryId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.localeCompare(b));
    return map;
  }, [categories, links]);

  const [formOpen, setFormOpen] = useState(false);
  const [current, setCurrent] = useState<Subcategory | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subcategory | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const detailOpen = detailId !== null;
  const { data: detail, isLoading: detailLoading } = useSubcategory(detailId, { enabled: detailOpen });
  const { products: detailProducts, meta: detailMeta, isFirstLoad: detailProductsLoading } = useProducts(
    { subcategoryId: detailId ?? undefined, page: 1, limit: 12 },
    { enabled: detailOpen },
  );

  const [form, setForm] = useState({ name: "", display_on_pos: true, is_active: true });
  const [preview, setPreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const pendingFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  const submitting = uploading || create.isPending || update.isPending;
  const editing = current !== null;

  const resetImage = (image: string | null) => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(image);
    setImageRemoved(false);
    pendingFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAdd = () => {
    setCurrent(null);
    setForm({ name: "", display_on_pos: true, is_active: true });
    resetImage(null);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (sub: Subcategory) => {
    setCurrent(sub);
    setForm({ name: sub.name, display_on_pos: sub.display_on_pos, is_active: sub.is_active });
    resetImage(sub.image || null);
    setFormError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError("");
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Please select an image file" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File size must be less than 5MB" });
      return;
    }
    try {
      const compressed = await compressImage(file);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      pendingFileRef.current = compressed;
      setImageRemoved(false);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      toast({ variant: "destructive", title: "Failed to process image" });
    }
  };

  const removeImage = () => {
    resetImage(null);
    setImageRemoved(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    let image: string | null | undefined;
    if (pendingFileRef.current) {
      try {
        setUploading(true);
        image = await uploadCategoryImage(pendingFileRef.current);
      } catch (e) {
        const msg = extractApiError(e, "Failed to upload image");
        setFormError(msg);
        toast({ variant: "destructive", title: "Image upload failed", description: msg });
        return;
      } finally {
        setUploading(false);
      }
    } else if (imageRemoved) {
      image = null;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      display_on_pos: form.display_on_pos,
      is_active: form.is_active,
      ...(image !== undefined ? { image } : {}),
    };
    const onError = (e: unknown) => {
      const msg = extractApiError(e, "Failed to save subcategory");
      setFormError(msg);
      toast({ variant: "destructive", title: "Could not save subcategory", description: msg });
    };

    if (current) {
      update.mutate(
        { id: current.id, body },
        {
          onSuccess: () => {
            toast({ title: "Subcategory updated" });
            closeForm();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Subcategory created" });
          closeForm();
        },
        onError,
      });
    }
  };

  const toggleActive = (sub: Subcategory) => {
    setPendingId(sub.id);
    toggleStatus.mutate(sub.id, {
      onSuccess: () => toast({ title: sub.is_active ? `${sub.name} disabled` : `${sub.name} enabled` }),
      onError: (e) =>
        toast({ variant: "destructive", title: "Could not update status", description: extractApiError(e, "Failed to update status") }),
      onSettled: () => setPendingId(null),
    });
  };

  const togglePos = (sub: Subcategory) => {
    setPendingId(sub.id);
    update.mutate(
      { id: sub.id, body: { display_on_pos: !sub.display_on_pos } },
      {
        onSuccess: () => toast({ title: sub.display_on_pos ? `${sub.name} hidden from POS` : `${sub.name} shown on POS` }),
        onError: (e) =>
          toast({ variant: "destructive", title: "Could not update POS setting", description: extractApiError(e, "Failed to update") }),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Subcategory deleted" });
        setDeleteTarget(null);
        if (detailId === target.id) setDetailId(null);
      },
      onError: (e) =>
        toast({ variant: "destructive", title: "Could not delete subcategory", description: extractApiError(e, "Failed to delete subcategory") }),
    });
  };

  const stats = useMemo(() => {
    let active = 0;
    let onPos = 0;
    let products = 0;
    let unused = 0;
    for (const s of subcategories) {
      if (s.is_active) active += 1;
      if (s.display_on_pos) onPos += 1;
      products += s.product_count ?? 0;
      if (!s.product_count) unused += 1;
    }
    return { total: subcategories.length, active, inactive: subcategories.length - active, onPos, hidden: subcategories.length - onPos, products, unused };
  }, [subcategories]);

  const rows = useMemo(() => {
    const filtered = subcategories.filter((s) => {
      if (status === "active") return s.is_active;
      if (status === "inactive") return !s.is_active;
      if (status === "hidden") return !s.display_on_pos;
      if (status === "unused") return !s.product_count;
      return true;
    });
    const byName = (a: Subcategory, b: Subcategory) => (a.name || "").localeCompare(b.name || "");
    return filtered.sort((a, b) => {
      if (sort === "za") return byName(b, a);
      if (sort === "products") return (b.product_count ?? 0) - (a.product_count ?? 0) || byName(a, b);
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return byName(a, b);
    });
  }, [subcategories, status, sort]);

  const maxProducts = Math.max(1, ...subcategories.map((s) => s.product_count ?? 0));

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "active", label: "Active", count: stats.active },
    { key: "inactive", label: "Inactive", count: stats.inactive },
    { key: "hidden", label: "Hidden on POS", count: stats.hidden },
    { key: "unused", label: "No products", count: stats.unused },
  ];

  const kpis = [
    { label: "Total subcategories", value: stats.total, hint: `${stats.products.toLocaleString()} products linked`, icon: Layers, tone: "text-slate-400", filter: "all" as const },
    { label: "Active", value: stats.active, hint: `${stats.inactive} inactive`, icon: CheckCircle2, tone: "text-emerald-500", filter: "active" as const },
    { label: "Hidden on POS", value: stats.hidden, hint: `${stats.onPos} shown to cashiers`, icon: MonitorSmartphone, tone: "text-blue-500", filter: "hidden" as const },
    { label: "No products yet", value: stats.unused, hint: "Safe to tidy up", icon: PackageX, tone: "text-amber-500", filter: "unused" as const },
  ];

  const rowActions = (sub: Subcategory) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" aria-label={`Actions for ${sub.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => setDetailId(sub.id)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(sub)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleActive(sub)}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {sub.is_active ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setDeleteTarget(sub)} className="text-rose-600 focus:text-rose-700">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-w-0 space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-blue-600">
            <Layers className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Catalog</span>
          </div>
          <h1 className="text-2xl font-bold leading-none tracking-tight text-gray-900 md:text-[1.75rem]">Sub-Categories</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Group products inside a category, e.g. Almonds, Cashews, Pistachios
            {isRefreshing ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing…
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isRefreshing} title="Refresh">
            <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button className="bg-gray-900 hover:bg-gray-800" onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            New subcategory
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => setStatus(k.filter)}
            className={cn(
              "rounded-xl border bg-white p-3.5 text-left shadow-sm transition-colors hover:border-blue-300",
              status === k.filter ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-gray-600">{k.label}</p>
              <k.icon className={cn("h-3.5 w-3.5", k.tone)} />
            </div>
            {isFirstLoad ? (
              <Skeleton className="mt-2 h-7 w-12" />
            ) : (
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{k.value}</p>
            )}
            <p className="mt-1 text-[11px] text-gray-500">{k.hint}</p>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = status === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatus(chip.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-10 pr-9"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-10 sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="az">Name (A → Z)</SelectItem>
              <SelectItem value="za">Name (Z → A)</SelectItem>
              <SelectItem value="products">Most products</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex h-10 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(
              [
                { id: "table", label: "Table", icon: List },
                { id: "grid", label: "Grid", icon: LayoutGrid },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setView(opt.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                  view === opt.id ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900",
                )}
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Sub-categories <span className="font-normal text-gray-400">({rows.length})</span>
            </p>
            <p className="text-xs text-gray-500">Toggle POS visibility inline; use ⋯ to edit, disable or delete</p>
          </div>
        </div>

        {isFirstLoad ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Layers className="h-6 w-6 text-slate-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {search || status !== "all" ? "No matching sub-categories" : "No sub-categories yet"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {search || status !== "all"
                  ? "Try a different search or filter."
                  : "Create one to start grouping products, e.g. Almonds."}
              </p>
            </div>
            {search || status !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={openAdd}>
                <Plus className="mr-1.5 h-4 w-4" />
                New subcategory
              </Button>
            )}
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="pl-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Sub-category</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-500">Used in</TableHead>
                  <TableHead className="w-[180px] text-xs font-semibold uppercase tracking-wide text-gray-500">Products</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-500">On POS</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</TableHead>
                  <TableHead className="w-[60px] pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sub) => {
                  const count = sub.product_count ?? 0;
                  return (
                    <TableRow key={sub.id} className={cn("group", !sub.is_active && "bg-slate-50/60")}>
                      <TableCell className="py-3 pl-5">
                        <button type="button" onClick={() => setDetailId(sub.id)} className="flex min-w-0 items-center gap-3 text-left">
                          <Thumb sub={sub} />
                          <span className="min-w-0">
                            <span className={cn("block truncate font-semibold group-hover:text-blue-700", sub.is_active ? "text-gray-900" : "text-gray-500")}>
                              {sub.name}
                            </span>
                            <span className="font-mono text-[11px] text-gray-400">#{sub.code}</span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <CategoryTags names={categoryNamesBySub.get(sub.id) ?? []} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 text-right text-sm font-semibold tabular-nums text-gray-900">{count}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <span className="block h-full rounded-full bg-blue-500" style={{ width: `${(count / maxProducts) * 100}%` }} />
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={sub.display_on_pos}
                          onCheckedChange={() => togglePos(sub)}
                          disabled={pendingId === sub.id}
                          aria-label={`Show ${sub.name} on POS`}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge active={sub.is_active} />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {pendingId === sub.id ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-400" /> : rowActions(sub)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((sub) => {
              const count = sub.product_count ?? 0;
              return (
                <div
                  key={sub.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-md",
                    !sub.is_active && "bg-slate-50/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setDetailId(sub.id)} className="flex min-w-0 items-center gap-3 text-left">
                      <Thumb sub={sub} size="lg" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">{sub.name}</span>
                        <span className="font-mono text-[11px] text-gray-400">#{sub.code}</span>
                      </span>
                    </button>
                    {rowActions(sub)}
                  </div>
                  <CategoryTags names={categoryNamesBySub.get(sub.id) ?? []} max={3} />
                  <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                      <Package className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-semibold tabular-nums text-gray-900">{count}</span> product{count === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge active={sub.is_active} />
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                        POS
                        <Switch
                          checked={sub.display_on_pos}
                          onCheckedChange={() => togglePos(sub)}
                          disabled={pendingId === sub.id}
                          aria-label={`Show ${sub.name} on POS`}
                        />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / edit */}
      <DetailSheet open={formOpen} onOpenChange={(open) => !open && closeForm()} size="md">
        <DetailSheetHeader
          title={editing ? "Edit sub-category" : "New sub-category"}
          subtitle={editing ? `#${current?.code}` : "Group products inside a category"}
          icon={<Layers className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="subcat-name" className="text-xs font-semibold text-gray-700">
              Name<span className="text-rose-500"> *</span>
            </Label>
            <Input
              id="subcat-name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                setFormError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="e.g. Almonds"
              className="h-10"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700">Image</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} disabled={submitting} />
            {preview ? (
              <div className="flex items-center gap-4 rounded-xl border border-gray-200 p-3">
                <img src={preview} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    Replace
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={removeImage} disabled={submitting}>
                    <X className="mr-1.5 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <ImagePlus className="h-6 w-6 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Upload an image</span>
                <span className="text-xs text-gray-400">Optional · PNG or JPG up to 5MB</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            <label className="flex cursor-pointer items-center justify-between gap-3 p-3.5">
              <span>
                <span className="block text-sm font-medium text-gray-900">Show on POS</span>
                <span className="text-xs text-gray-500">Cashiers can browse products by this sub-category</span>
              </span>
              <Switch checked={form.display_on_pos} onCheckedChange={(v) => setForm((f) => ({ ...f, display_on_pos: v }))} disabled={submitting} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 p-3.5">
              <span>
                <span className="block text-sm font-medium text-gray-900">Active</span>
                <span className="text-xs text-gray-500">Inactive sub-categories stay on products but can&apos;t be picked</span>
              </span>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} disabled={submitting} />
            </label>
          </div>

          {formError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
              {formError}
            </p>
          ) : null}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={closeForm} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || !form.name.trim()} className="bg-gray-900 hover:bg-gray-800">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {uploading ? "Uploading image…" : editing ? "Save changes" : "Create sub-category"}
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Details */}
      <DetailSheet open={detailOpen} onOpenChange={(o) => !o && setDetailId(null)} size="md">
        <DetailSheetHeader title={detail?.name ?? "Sub-category"} subtitle={detail ? `#${detail.code}` : undefined} icon={<Layers className="h-5 w-5" />} />
        <DetailSheetBody className="space-y-5">
          {detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Thumb sub={detail} size="lg" />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge active={detail.is_active} />
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        detail.display_on_pos ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {detail.display_on_pos ? "Shown on POS" : "Hidden on POS"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Created {new Date(detail.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Products</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{detailMeta?.total ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Categories</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{(categoryNamesBySub.get(detail.id) ?? []).length}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Tag className="h-3.5 w-3.5" />
                  Used in categories
                </p>
                <CategoryTags names={categoryNamesBySub.get(detail.id) ?? []} max={20} />
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Package className="h-3.5 w-3.5" />
                  Products
                </p>
                {detailProductsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : detailProducts.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-gray-500">No products in this sub-category yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {detailProducts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                          <span className="text-[11px] text-gray-400">
                            {[p.category, p.sku].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-gray-700">Rs {Math.round(p.price).toLocaleString()}</span>
                      </li>
                    ))}
                    {(detailMeta?.total ?? 0) > detailProducts.length ? (
                      <li className="px-3 py-2 text-center text-xs text-gray-500">
                        +{(detailMeta?.total ?? 0) - detailProducts.length} more in Products
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
          {detail ? (
            <Button
              className="bg-gray-900 hover:bg-gray-800"
              onClick={() => {
                setDetailId(null);
                openEdit(detail);
              }}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          ) : null}
        </DetailSheetFooter>
      </DetailSheet>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sub-category?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-semibold">{deleteTarget?.name || "this sub-category"}</span>.
              {deleteTarget?.product_count
                ? ` Its ${deleteTarget.product_count} product${deleteTarget.product_count === 1 ? "" : "s"} move to the default sub-category and are not deleted.`
                : " No products use it."}{" "}
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={remove.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Subcategories;
