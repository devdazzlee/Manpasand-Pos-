"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Loader2,
  Edit,
  Eye,
  Trash2,
  RefreshCcw,
  Scale,
  CheckCircle2,
  XCircle,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { useUnits, useUnitMutations } from "@/hooks/queries/use-units";
import type { Unit } from "@/lib/api/units";

type StatusFilter = "all" | "active" | "inactive";
type SortOrder = "newest" | "oldest" | "az" | "za";

const day = (iso?: string) => (iso ? iso.split("T")[0] : "—");

const Units: React.FC = () => {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { units, isFirstLoad, isRefreshing, refetch } = useUnits({
    search: debouncedSearch || undefined,
  });
  const { create, update, remove } = useUnitMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [current, setCurrent] = useState<Unit | null>(null);

  const [formName, setFormName] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState("");

  const submitting = create.isPending || update.isPending;
  const isFormValid = formName.trim() !== "";

  const openAdd = () => {
    setCurrent(null);
    setFormName("");
    setFormIsActive(true);
    setFormError("");
    setAddOpen(true);
  };

  const openEdit = (u: Unit) => {
    setCurrent(u);
    setFormName(u.name);
    setFormIsActive(u.is_active !== false);
    setFormError("");
    setEditOpen(true);
  };

  const closeForm = () => {
    setAddOpen(false);
    setEditOpen(false);
    setFormError("");
  };

  const submit = () => {
    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }
    const body = { name: formName.trim(), is_active: formIsActive };
    const onError = (e: unknown) => {
      const msg = extractApiError(e, "Failed to save unit");
      setFormError(msg);
      toast({ variant: "destructive", title: "Could not save unit", description: msg });
    };

    if (editOpen && current) {
      update.mutate(
        { id: current.id, body },
        {
          onSuccess: () => {
            toast({ title: "Unit updated" });
            closeForm();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Unit created" });
          closeForm();
        },
        onError,
      });
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Unit deleted" });
        setDeleteTarget(null);
        if (detailTarget?.id === target.id) setDetailTarget(null);
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete unit",
          description: extractApiError(e, "Failed to delete unit"),
        }),
    });
  };

  const stats = useMemo(() => {
    const active = units.filter((u) => u.is_active).length;
    return {
      total: units.length,
      active,
      inactive: units.length - active,
      products: units.reduce((sum, u) => sum + (u.product_count || 0), 0),
    };
  }, [units]);

  const filtered = useMemo(() => {
    const rows = units.filter((u) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? u.is_active === true
            : u.is_active === false;
      return matchesStatus;
    });
    return rows.sort((a, b) => {
      if (sortOrder === "newest")
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortOrder === "oldest")
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortOrder === "az") return a.name.localeCompare(b.name);
      return b.name.localeCompare(a.name);
    });
  }, [units, statusFilter, sortOrder]);

  return (
    <>
      <PageHeader
        title="Units"
        description={`${stats.total} unit${stats.total === 1 ? "" : "s"}`}
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
              New unit
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { label: "Total units", value: stats.total, icon: Scale },
              { label: "Active", value: stats.active, icon: CheckCircle2 },
              { label: "Inactive", value: stats.inactive, icon: XCircle },
              { label: "Linked products", value: stats.products, icon: Package },
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
              placeholder="Search by name or code"
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
              Units <span className="text-muted-foreground">({filtered.length})</span>
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
                <Scale className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No units found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wide">Code</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Products
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Created</TableHead>
                      <TableHead className="w-[132px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u) => (
                      <TableRow key={u.id} className="h-11 hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">{u.code}</TableCell>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-right text-sm nums">
                          {u.product_count ?? 0}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                              u.is_active
                                ? "border-border bg-muted text-foreground"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground nums">
                          {day(u.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setDetailTarget(u)}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEdit(u)}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(u)}
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

      {/* Add / Edit — 2 fields, stays a Dialog (guide §2). */}
      <Dialog
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editOpen ? "Edit unit" : "New unit"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="unit-name" className="text-xs font-medium text-foreground">
                Name<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="unit-name"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  setFormError("");
                }}
                placeholder="Enter unit name (e.g. KG, Liter, Pcs)"
                className="h-9"
                disabled={submitting}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Active status</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable this unit in system workflows
                </p>
              </div>
              <Switch
                checked={formIsActive}
                onCheckedChange={setFormIsActive}
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
              {editOpen ? "Update unit" : "Create unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View unit — record detail, so a DetailSheet (guide §2). */}
      <DetailSheet
        open={detailTarget !== null}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        size="md"
      >
        <DetailSheetHeader
          title={detailTarget?.name ?? "Unit"}
          subtitle={detailTarget?.code}
          icon={<Scale className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-5">
          {detailTarget && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <Field label="Code" value={detailTarget.code} />
              <Field label="Name" value={detailTarget.name} />
              <Field
                label="Linked products"
                value={`${detailTarget.product_count ?? 0}`}
              />
              <Field label="Created" value={day(detailTarget.created_at)} />
              <Field
                label="Status"
                value={detailTarget.is_active ? "Active" : "Inactive"}
              />
            </div>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setDetailTarget(null)}>
            Close
          </Button>
          {detailTarget && (
            <Button
              onClick={() => {
                const u = detailTarget;
                setDetailTarget(null);
                openEdit(u);
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
            <AlertDialogTitle>Delete unit?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>
              {deleteTarget?.code ? ` (${deleteTarget.code})` : ""}. Linked products are
              moved to the default unit and are not deleted. This action cannot be undone.
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
              Delete unit
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

export default Units;
