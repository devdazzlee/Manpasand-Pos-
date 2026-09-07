"use client";

import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
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
  Loader2,
  Edit,
  Eye,
  Trash2,
  RefreshCcw,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import {
  useSubcategories,
  useSubcategory,
  useSubcategoryMutations,
} from "@/hooks/queries/use-subcategories";
import type { Subcategory } from "@/lib/api/subcategories";

const Subcategories: React.FC = () => {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { subcategories, isFirstLoad, isRefreshing, refetch } = useSubcategories({
    search: debouncedSearch || undefined,
  });
  const { create, update, remove, toggleStatus } = useSubcategoryMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<Subcategory | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subcategory | null>(null);

  const detailOpen = detailId !== null;
  const { data: detail, isLoading: detailLoading } = useSubcategory(detailId, {
    enabled: detailOpen,
  });

  const [form, setForm] = useState({ name: "", display_on_pos: true, image: "" });
  const [formError, setFormError] = useState("");

  const submitting = create.isPending || update.isPending;
  const isFormValid = form.name.trim() !== "";

  const openAdd = () => {
    setCurrent(null);
    setForm({ name: "", display_on_pos: true, image: "" });
    setFormError("");
    setAddOpen(true);
  };

  const openEdit = (sub: Subcategory) => {
    setCurrent(sub);
    setForm({
      name: sub.name,
      display_on_pos: sub.display_on_pos,
      image: sub.image || "",
    });
    setFormError("");
    setEditOpen(true);
  };

  const closeForm = () => {
    setAddOpen(false);
    setEditOpen(false);
    setFormError("");
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    const body = {
      name: form.name.trim(),
      display_on_pos: form.display_on_pos,
      image: form.image,
    };
    const onError = (e: unknown) => {
      const msg = extractApiError(e, "Failed to save subcategory");
      setFormError(msg);
      toast({
        variant: "destructive",
        title: "Could not save subcategory",
        description: msg,
      });
    };

    if (editOpen && current) {
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

  const handleToggle = (sub: Subcategory) => {
    toggleStatus.mutate(sub.id, {
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not update status",
          description: extractApiError(e, "Failed to update status"),
        }),
    });
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
        toast({
          variant: "destructive",
          title: "Could not delete subcategory",
          description: extractApiError(e, "Failed to delete subcategory"),
        }),
    });
  };

  const rows = useMemo(
    () =>
      [...subcategories].sort((a, b) =>
        (a.name || "").localeCompare(b.name || ""),
      ),
    [subcategories],
  );

  return (
    <>
      <PageHeader
        title="Subcategories"
        description={`${subcategories.length} subcategor${
          subcategories.length === 1 ? "y" : "ies"
        }`}
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
              New subcategory
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">
              Subcategories{" "}
              <span className="text-muted-foreground">({rows.length})</span>
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
            ) : rows.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Layers className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No subcategories found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide">Code</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">POS</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Products
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="w-[168px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((sub) => (
                      <TableRow key={sub.id} className="h-11 hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">{sub.code}</TableCell>
                        <TableCell className="font-medium">{sub.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sub.display_on_pos ? "Yes" : "No"}
                        </TableCell>
                        <TableCell className="text-right text-sm nums">
                          {sub.product_count ?? 0}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                              sub.is_active
                                ? "border-border bg-muted text-foreground"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            {sub.is_active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => handleToggle(sub)}
                              disabled={toggleStatus.isPending}
                            >
                              {sub.is_active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setDetailId(sub.id)}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEdit(sub)}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(sub)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      </PageBody>

      {/* Add / Edit — 3 fields, stays a Dialog (guide §2). */}
      <Dialog
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editOpen ? "Edit subcategory" : "New subcategory"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="subcat-name" className="text-xs font-medium text-foreground">
                Name<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="subcat-name"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setFormError("");
                }}
                placeholder="Enter subcategory name"
                className="h-9"
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subcat-image" className="text-xs font-medium text-foreground">
                Image (optional)
              </Label>
              <Input
                id="subcat-image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="h-9"
                disabled={submitting}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Display on POS</Label>
                <p className="text-xs text-muted-foreground">
                  Show this subcategory in the POS product grid
                </p>
              </div>
              <Switch
                checked={form.display_on_pos}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, display_on_pos: v }))
                }
                disabled={submitting}
              />
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
              {editOpen ? "Update subcategory" : "Create subcategory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View subcategory — record detail, so a DetailSheet (guide §2). */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(o) => !o && setDetailId(null)}
        size="md"
      >
        <DetailSheetHeader
          title={detail?.name ?? "Subcategory"}
          subtitle={detail?.code}
          icon={<Layers className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-5">
          {detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <Field label="Code" value={detail.code} />
                <Field label="Name" value={detail.name} />
                <Field
                  label="Display on POS"
                  value={detail.display_on_pos ? "Yes" : "No"}
                />
                <Field
                  label="Linked products"
                  value={`${detail.product_count ?? 0}`}
                />
                <Field
                  label="Status"
                  value={detail.is_active ? "Active" : "Inactive"}
                />
              </div>
              {detail.image && (
                <img
                  src={detail.image}
                  alt={detail.name}
                  className="h-40 w-full rounded-lg border object-cover"
                />
              )}
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
          {detail && (
            <Button
              onClick={() => {
                setDetailId(null);
                openEdit(detail);
              }}
            >
              Edit
            </Button>
          )}
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
            <AlertDialogTitle>Delete subcategory?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-semibold">
                {deleteTarget?.name || "this subcategory"}
              </span>
              . Linked products are moved to the default subcategory and are not deleted.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default Subcategories;
