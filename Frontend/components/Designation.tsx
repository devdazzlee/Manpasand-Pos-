"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import {
  Search,
  Plus,
  Loader2,
  Briefcase,
  CheckCircle2,
  XCircle,
  List,
  LayoutGrid,
  X,
  Users,
  RefreshCcw,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import {
  useEmployeeTypes,
  useEmployeeTypeMutations,
} from "@/hooks/queries/use-employee-types";
import type { EmployeeType } from "@/lib/api/employee-types";

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name-asc" | "name-desc" | "count-desc" | "count-asc";

const PAGE_SIZE = 20;

export function Designation() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editType, setEditType] = useState<EmployeeType | null>(null);
  const [formName, setFormName] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<EmployeeType | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeType | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const {
    employeeTypes,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useEmployeeTypes();
  const { create, update, remove, toggleStatus } = useEmployeeTypeMutations();
  const submitLoading = create.isPending || update.isPending;
  const deleteLoading = remove.isPending;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load designations",
        description: extractApiError(listError, "Failed to load designations"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = employeeTypes as EmployeeType[];

  const stats = useMemo(() => {
    const active = types.filter((t) => t.is_active).length;
    const inactive = types.length - active;
    const staffed = types.filter((t) => (t.employee_count || 0) > 0).length;
    return { active, inactive, staffed };
  }, [types]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    let rows = types.filter((t) => {
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "inactive" && t.is_active) return false;
      if (!term) return true;
      return t.name.toLowerCase().includes(term);
    });

    rows = [...rows].sort((a, b) => {
      const ca = a.employee_count || 0;
      const cb = b.employee_count || 0;
      switch (sortKey) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "count-desc":
          return cb - ca || a.name.localeCompare(b.name);
        case "count-asc":
          return ca - cb || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return rows;
  }, [types, debouncedSearch, statusFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );

  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const openCreate = () => {
    setEditType(null);
    setFormName("");
    setFormActive(true);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (type: EmployeeType) => {
    setEditType(type);
    setFormName(type.name);
    setFormActive(type.is_active);
    setFormError("");
    setModalOpen(true);
  };

  const openDetail = (type: EmployeeType) => {
    setDetail(type);
    setDetailOpen(true);
  };

  const handleSubmit = () => {
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required");
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    if (name.length < 2) {
      setFormError("Name must be at least 2 characters");
      toast({
        variant: "destructive",
        title: "Name must be at least 2 characters",
      });
      return;
    }
    setFormError("");

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save designation",
        description: extractApiError(e, "Failed to save designation"),
      });

    if (editType) {
      update.mutate(
        { id: editType.id, body: { name, is_active: formActive } },
        {
          onSuccess: () => {
            toast({ title: "Designation updated" });
            setModalOpen(false);
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { name, is_active: formActive },
        {
          onSuccess: () => {
            toast({ title: "Designation created" });
            setModalOpen(false);
          },
          onError,
        },
      );
    }
  };

  const handleToggle = (type: EmployeeType) => {
    setTogglingId(type.id);
    toggleStatus.mutate(type.id, {
      onSuccess: () => {
        toast({
          title: type.is_active
            ? "Designation deactivated"
            : "Designation activated",
        });
        if (detail?.id === type.id) {
          setDetail((d) => (d ? { ...d, is_active: !d.is_active } : d));
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not update status",
          description: extractApiError(e, "Failed to update status"),
        }),
      onSettled: () => setTogglingId(null),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Designation deleted" });
        setDeleteTarget(null);
        if (detail?.id === target.id) {
          setDetailOpen(false);
          setDetail(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete designation",
          description: extractApiError(e, "Failed to delete designation"),
        }),
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const chips: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: types.length },
    { key: "active", label: "Active", count: stats.active },
    { key: "inactive", label: "Inactive", count: stats.inactive },
  ];

  return (
    <>
      <PageHeader
        title="Designations"
        description="Job titles used when assigning employees (cashier, manager, etc.)"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add designation
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={4}
          loading={isFirstLoad}
          items={[
            {
              label: "Total",
              value: types.length.toLocaleString(),
              icon: Briefcase,
              hint: "All designations",
              onClick: () => {
                setStatusFilter("all");
                setPage(1);
              },
            },
            {
              label: "Active",
              value: stats.active.toLocaleString(),
              icon: CheckCircle2,
              tone: "success",
              hint: "Available for new employees",
              onClick: () => {
                setStatusFilter("active");
                setPage(1);
              },
            },
            {
              label: "Inactive",
              value: stats.inactive.toLocaleString(),
              icon: XCircle,
              tone: "danger",
              hint: "Hidden from selection",
              onClick: () => {
                setStatusFilter("inactive");
                setPage(1);
              },
            },
            {
              label: "In use",
              value: stats.staffed.toLocaleString(),
              icon: Users,
              hint: "Linked to at least one employee",
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setStatusFilter(chip.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === chip.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
                {isFirstLoad ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 pl-9"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="count-desc">Most employees</option>
              <option value="count-asc">Fewest employees</option>
            </select>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearFilters}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                className="h-8 px-2.5"
                onClick={() => setViewMode("table")}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                className="h-8 px-2.5"
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Designation list{" "}
                <span className="font-normal text-muted-foreground">
                  {isFirstLoad ? "(loading…)" : `(${filtered.length})`}
                </span>
              </p>
              {isRefreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {isFirstLoad ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Briefcase className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No designations found
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasFilters
                    ? "Try clearing filters or create a new designation."
                    : "Create your first job title to assign to employees."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide">
                        Name
                      </TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Employees
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="min-w-[260px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((type) => (
                      <TableRow key={type.id} className="h-11 hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">
                          {type.name}
                        </TableCell>
                        <TableCell className="text-right text-sm nums text-muted-foreground">
                          {(type.employee_count ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              type.is_active
                                ? "border-green-200 bg-green-100 text-green-800"
                                : "border-red-200 bg-red-100 text-red-800"
                            }
                          >
                            {type.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(type)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openEdit(type)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              disabled={togglingId === type.id}
                              onClick={() => handleToggle(type)}
                            >
                              {togglingId === type.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : type.is_active ? (
                                "Deactivate"
                              ) : (
                                "Activate"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(type)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((type) => (
                  <div
                    key={type.id}
                    className="space-y-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {type.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {(type.employee_count ?? 0).toLocaleString()} employee
                          {(type.employee_count ?? 0) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          type.is_active
                            ? "shrink-0 border-green-200 bg-green-100 text-green-800"
                            : "shrink-0 border-red-200 bg-red-100 text-red-800"
                        }
                      >
                        {type.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(type)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(type)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleToggle(type)}
                      >
                        {type.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {pageSafe} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>

      <DetailSheet open={modalOpen} onOpenChange={setModalOpen} size="md">
        <DetailSheetHeader
          title={editType ? "Edit designation" : "Add designation"}
          subtitle={
            editType
              ? "Update this job title"
              : "Create a title used when assigning employees"
          }
          icon={<Briefcase className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="e.g. Cashier, Store Manager"
                className={cn(
                  "h-9",
                  formError &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                autoFocus
              />
              {formError && (
                <p className="text-xs text-destructive" role="alert">
                  {formError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="desig-active"
                checked={formActive}
                onCheckedChange={setFormActive}
              />
              <Label
                htmlFor="desig-active"
                className="cursor-pointer text-sm font-normal text-foreground"
              >
                Active (available when assigning employees)
              </Label>
            </div>
        </DetailSheetBody>
        <DetailSheetFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitLoading}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleSubmit}
              loading={submitLoading}
              className="h-9"
              disabled={submitLoading}
            >
              {editType ? "Update designation" : "Create designation"}
            </LoadingButton>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Detail */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setDetail(null);
          }
        }}
        size="md"
      >
        <DetailSheetHeader
          title={detail?.name || "Designation"}
          subtitle={
            detail
              ? `${(detail.employee_count ?? 0).toLocaleString()} employee${
                  (detail.employee_count ?? 0) === 1 ? "" : "s"
                }`
              : undefined
          }
          icon={<Briefcase className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {detail && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={
                    detail.is_active
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }
                >
                  {detail.is_active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  {(detail.employee_count ?? 0).toLocaleString()} employee
                  {(detail.employee_count ?? 0) === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                This designation is used as the job title on employee records.
                Deactivate it to hide it from new assignments without removing
                existing staff links.
              </p>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          {detail && (
            <>
              <Button
                variant="outline"
                onClick={() => handleToggle(detail)}
                disabled={togglingId === detail.id}
              >
                {detail.is_active ? "Deactivate" : "Activate"}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(detail)}
              >
                Delete
              </Button>
              <Button
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(detail);
                }}
              >
                Edit
              </Button>
            </>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete designation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (deleteTarget.employee_count || 0) > 0 ? (
                <>
                  <span className="font-semibold">{deleteTarget.name}</span> is
                  assigned to{" "}
                  <span className="font-semibold">
                    {deleteTarget.employee_count} employee
                    {deleteTarget.employee_count === 1 ? "" : "s"}
                  </span>
                  . Delete is blocked until those employees are reassigned. Prefer{" "}
                  <span className="font-medium">Deactivate</span> instead.
                </>
              ) : (
                <>
                  This will permanently remove{" "}
                  <span className="font-semibold">
                    {deleteTarget?.name || "this designation"}
                  </span>
                  . This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            {(deleteTarget?.employee_count || 0) === 0 ? (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteTarget) {
                    const t = deleteTarget;
                    setDeleteTarget(null);
                    handleToggle(t);
                  }
                }}
              >
                Deactivate instead
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
