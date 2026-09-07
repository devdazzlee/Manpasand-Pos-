"use client";

import type React from "react";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Package,
  Loader2,
  Upload,
  X,
  ImageIcon,
  CheckCircle2,
  XCircle,
  Layers,
  RefreshCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { useCategories, useCategoryMutations } from "@/hooks/queries/use-categories";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { uploadCategoryImage, type Category } from "@/lib/api/categories";

const categorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Name must be at most 100 characters"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be at most 100 characters"),
});

type StatusFilter = "all" | "active" | "inactive";
type SortOrder = "newest" | "oldest" | "az" | "za";

const day = (iso?: string) => (iso ? iso.split("T")[0] : "—");

function categoryIsActive(c: Pick<Category, "is_active">): boolean {
  return c.is_active !== false;
}

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function categoryProductCount(c: Category): number {
  return Number(c.product_count ?? c.productCount ?? 0);
}

/** Downscale + re-encode an image before upload to keep payloads small. */
function compressImage(
  file: File,
  quality = 0.7,
  maxWidth = 800,
  maxHeight = 600,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: file.type, lastModified: Date.now() }));
          } else {
            reject(new Error("Canvas to Blob conversion failed"));
          }
        },
        file.type,
        quality,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}

export function Categories() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const {
    categories,
    isLoading,
    isFetching,
    refetch,
  } = useCategories({ search: debouncedSearch || undefined });
  const isFirstLoad = isLoading;
  const isRefreshing = isFetching && !isLoading;

  const { branches } = useBranches();
  const { create, update, remove, toggleStatus } = useCategoryMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", is_active: true });
  const [formError, setFormError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pendingFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitting = uploading || create.isPending || update.isPending;
  const isFormValid = form.name.trim() !== "" && form.slug.trim() !== "";

  // "View products in this category" panel.
  const [productsCategory, setProductsCategory] = useState<Category | null>(null);
  const productsSheetOpen = productsCategory !== null;
  const { products, isFirstLoad: productsLoading } = useProducts(
    { categoryId: productsCategory?.id, page: 1, limit: 20 },
    { enabled: productsSheetOpen },
  );

  // Keep slug synced to name while typing.
  useEffect(() => {
    if (form.name) {
      setForm((f) => ({ ...f, slug: generateSlug(f.name) }));
    }
  }, [form.name]);

  const resetForm = () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setForm({ name: "", slug: "", is_active: true });
    setFormError("");
    setPreview(null);
    setImageRemoved(false);
    pendingFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAdd = () => {
    setCurrent(null);
    resetForm();
    setAddOpen(true);
  };

  const openEdit = (c: Category) => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setCurrent(c);
    setForm({
      name: c.name,
      slug: c.slug || generateSlug(c.name),
      is_active: categoryIsActive(c),
    });
    setFormError("");
    setPreview(c.image || null);
    setImageRemoved(false);
    pendingFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEditOpen(true);
  };

  const closeForm = () => {
    setAddOpen(false);
    setEditOpen(false);
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

  const handleRemoveImage = () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    pendingFileRef.current = null;
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    const parsed = categorySchema.safeParse({
      name: form.name,
      slug: form.slug || generateSlug(form.name),
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message || "Please fix the highlighted fields");
      return;
    }
    setFormError("");

    const allBranchIds = branches.map((b) => b.id);
    let imageUrl: string | undefined;
    try {
      if (pendingFileRef.current) {
        setUploading(true);
        imageUrl = await uploadCategoryImage(pendingFileRef.current);
      }
    } catch (e) {
      setUploading(false);
      const msg = extractApiError(e, "Failed to upload image");
      setFormError(msg);
      toast({ variant: "destructive", title: "Image upload failed", description: msg });
      return;
    }
    setUploading(false);

    const onError = (e: unknown) => {
      const msg = extractApiError(e, "Failed to save category");
      setFormError(msg);
      toast({ variant: "destructive", title: "Could not save category", description: msg });
    };

    if (editOpen && current) {
      const body: Record<string, unknown> = {
        ...parsed.data,
        display_on_branches: allBranchIds,
        display_on_pos: true,
        is_active: form.is_active,
      };
      if (imageRemoved) body.remove_image = true;
      else if (imageUrl) body.image_url = imageUrl;

      update.mutate(
        { id: current.id, body },
        {
          onSuccess: () => {
            toast({ title: "Category updated" });
            closeForm();
          },
          onError,
        },
      );
    } else {
      const body: Record<string, unknown> = {
        ...parsed.data,
        display_on_branches: allBranchIds,
        display_on_pos: true,
        get_tax_from_item: false,
        editable_sale_rate: false,
        is_active: form.is_active,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Category created" });
          closeForm();
        },
        onError,
      });
    }
  };

  const handleToggle = (c: Category) => {
    toggleStatus.mutate(c.id, {
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not update status",
          description: extractApiError(e, "Failed to update category status"),
        }),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ title: "Category deleted" });
        setDeleteTarget(null);
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete category",
          description: extractApiError(e, "Failed to delete category"),
        }),
    });
  };

  const stats = useMemo(() => {
    const active = categories.filter((c) => categoryIsActive(c)).length;
    return {
      total: categories.length,
      active,
      inactive: categories.length - active,
      products: categories.reduce((sum, c) => sum + categoryProductCount(c), 0),
    };
  }, [categories]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    const rows = categories.filter((c) => {
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        (c.slug || "").toLowerCase().includes(term) ||
        (c.description || "").toLowerCase().includes(term);
      const active = categoryIsActive(c);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? active
            : !active;
      return matchesSearch && matchesStatus;
    });
    return rows.sort((a, b) => {
      if (sortOrder === "newest")
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortOrder === "oldest")
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortOrder === "az") return a.name.localeCompare(b.name);
      return b.name.localeCompare(a.name);
    });
  }, [categories, debouncedSearch, statusFilter, sortOrder]);

  return (
    <>
      <PageHeader
        title="Categories"
        description={`${stats.total} categor${stats.total === 1 ? "y" : "ies"}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              New category
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { label: "Total categories", value: stats.total, icon: Layers },
              { label: "Active", value: stats.active, icon: CheckCircle2 },
              { label: "Inactive", value: stats.inactive, icon: XCircle },
              { label: "Total products", value: stats.products, icon: Package },
            ] as const
          ).map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent>
                {isFirstLoad ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <div className="text-xl font-semibold nums">{s.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="az">Name (A–Z)</SelectItem>
                <SelectItem value="za">Name (Z–A)</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">
              Categories <span className="text-muted-foreground">({filtered.length})</span>
            </CardTitle>
            {isRefreshing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isFirstLoad ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Layers className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No categories found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Slug</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Products
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Created</TableHead>
                      <TableHead className="w-[220px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const active = categoryIsActive(c);
                      return (
                        <TableRow key={c.id} className="h-11 hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              {c.image ? (
                                <img
                                  src={c.image}
                                  alt={c.name}
                                  className="h-7 w-7 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                                  <Layers className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <span className="font-medium">{c.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {c.slug || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm nums">
                            {categoryProductCount(c)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                active
                                  ? "border-border bg-muted text-foreground"
                                  : "border-border bg-muted text-muted-foreground"
                              }`}
                            >
                              {active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground nums">
                            {day(c.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => setProductsCategory(c)}
                              >
                                Products
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={() => handleToggle(c)}
                                disabled={toggleStatus.isPending}
                              >
                                {active ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(c)}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(c)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>

      {/* Add / Edit — name + slug + status + image (≤ 6 fields), stays a Dialog (guide §2). */}
      <Dialog
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editOpen ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name" className="text-xs font-medium text-foreground">
                  Name<span className="text-destructive"> *</span>
                </Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    setFormError("");
                  }}
                  placeholder="Enter category name"
                  className="h-9"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-slug" className="text-xs font-medium text-foreground">
                  Slug<span className="text-destructive"> *</span>
                </Label>
                <Input
                  id="cat-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, slug: e.target.value }));
                    setFormError("");
                  }}
                  placeholder="category-slug"
                  className="h-9 font-mono text-xs"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Active status</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this category in system workflows
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Category image</Label>
              {preview ? (
                <div className="relative">
                  <div className="h-32 w-full overflow-hidden rounded-lg border border-dashed border-border">
                    <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8"
                    onClick={handleRemoveImage}
                    disabled={submitting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30"
                >
                  <ImageIcon className="h-8 w-8" />
                  <p className="text-sm">Click to upload image</p>
                  <p className="text-xs">PNG or JPG up to 5MB (compressed on upload)</p>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={submitting}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
                <Upload className="mr-2 h-4 w-4" />
                {preview ? "Change image" : "Upload image"}
              </Button>
            </div>

            {formError && (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || !isFormValid}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editOpen ? "Update category" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Products in category — was a modal list, now a DetailSheet (guide §2). */}
      <DetailSheet
        open={productsSheetOpen}
        onOpenChange={(o) => !o && setProductsCategory(null)}
        size="lg"
      >
        <DetailSheetHeader
          title={productsCategory ? `Products in ${productsCategory.name}` : "Products"}
          subtitle={
            productsLoading ? "Loading…" : `${products.length} product${products.length === 1 ? "" : "s"}`
          }
          icon={<Package className="h-5 w-5" />}
        />
        <DetailSheetBody>
          {productsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
              <Package className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No products in this category</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wide">Product</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">SKU</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">
                    Price
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">
                    Stock
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id} className="h-11">
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.sku || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm nums">
                      Rs {(Number(p.price) || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-sm nums">
                      {p.available_stock ?? 0}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                          p.is_active
                            ? "border-border bg-muted text-foreground"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setProductsCategory(null)}>
            Close
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Delete confirm — stays an AlertDialog (guide §2). */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>. Linked products
              are moved to the default category (&quot;General&quot;) and are not deleted.
              This action cannot be undone.
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default Categories;
