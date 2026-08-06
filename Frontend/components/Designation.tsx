"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { LoadingButton } from "@/components/ui/loading-button";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import { cn } from "@/lib/utils";

interface DesignationType {
  id: string;
  name: string;
  is_active: boolean;
  employee_count?: number;
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name-asc" | "name-desc" | "count-desc" | "count-asc";

const PAGE_SIZE = 20;

const dialogContentClass =
  "grid w-[min(96vw,480px)] max-w-[480px] sm:max-w-[480px] gap-4 p-5";

const extractApiError = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  if (data?.message) return data.message;
  if (err?.message) return err.message;
  return fallback;
};

export function Designation() {
  const [types, setTypes] = useState<DesignationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editType, setEditType] = useState<DesignationType | null>(null);
  const [formName, setFormName] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DesignationType | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DesignationType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/employee/types");
      setTypes(res.data?.data || []);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load designations"));
      setTypes([]);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const stats = useMemo(() => {
    const active = types.filter((t) => t.is_active).length;
    const inactive = types.length - active;
    const staffed = types.filter((t) => (t.employee_count || 0) > 0).length;
    return { active, inactive, staffed };
  }, [types]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
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
  }, [types, search, statusFilter, sortKey]);

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

  const openEdit = (type: DesignationType) => {
    setEditType(type);
    setFormName(type.name);
    setFormActive(type.is_active);
    setFormError("");
    setModalOpen(true);
  };

  const openDetail = (type: DesignationType) => {
    setDetail(type);
    setDetailOpen(true);
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    if (!name) {
      setFormError("Name is required");
      toast.error("Name is required");
      return;
    }
    if (name.length < 2) {
      setFormError("Name must be at least 2 characters");
      toast.error("Name must be at least 2 characters");
      return;
    }
    setFormError("");
    setSubmitLoading(true);
    try {
      if (editType) {
        await apiClient.put(`/employee/type/${editType.id}`, {
          name,
          is_active: formActive,
        });
        toast.success("Designation updated");
      } else {
        await apiClient.post("/employee/type", {
          name,
          is_active: formActive,
        });
        toast.success("Designation created");
      }
      setModalOpen(false);
      await fetchTypes();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to save designation"));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggle = async (type: DesignationType) => {
    setTogglingId(type.id);
    try {
      await apiClient.patch(`/employee/type/${type.id}/toggle-status`);
      toast.success(
        type.is_active ? "Designation deactivated" : "Designation activated",
      );
      await fetchTypes();
      if (detail?.id === type.id) {
        setDetail((d) =>
          d ? { ...d, is_active: !d.is_active } : d,
        );
      }
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to update status"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/employee/type/${deleteTarget.id}`);
      toast.success("Designation deleted");
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) {
        setDetailOpen(false);
        setDetail(null);
      }
      await fetchTypes();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete designation"));
    } finally {
      setDeleteLoading(false);
    }
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

  if (initialLoading) {
    return <PageLoader message="Loading designations..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Briefcase className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Staff
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Designations
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Job titles used when assigning employees (cashier, manager, etc.)
          </p>
        </div>
        <Button onClick={openCreate} className="h-9 shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Designation
        </Button>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && types.length === 0}
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
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {chip.label}
              <span className="tabular-nums text-gray-500">{chip.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-9"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
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
              className="h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
          <div className="flex items-center gap-1 ml-auto border border-gray-200 rounded-md p-0.5 bg-white">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              Designation list{" "}
              <span className="font-normal text-gray-500">
                ({filtered.length})
              </span>
            </p>
          </div>

          {loading && types.length === 0 ? (
            <div className="py-16">
              <PageLoader message="Loading designations..." />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No designations found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasFilters
                  ? "Try clearing filters or create a new designation."
                  : "Create your first job title to assign to employees."}
              </p>
              {!hasFilters && (
                <Button className="mt-4 h-9" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Designation
                </Button>
              )}
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right min-w-[260px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((type) => (
                    <TableRow key={type.id} className="hover:bg-gray-50/80">
                      <TableCell className="font-medium text-gray-900">
                        {type.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-gray-700">
                        {(type.employee_count ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            type.is_active
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {type.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5 flex-wrap">
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
                            className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {pageRows.map((type) => (
                <div
                  key={type.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {type.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(type.employee_count ?? 0).toLocaleString()} employee
                        {(type.employee_count ?? 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        type.is_active
                          ? "bg-green-100 text-green-800 border-green-200 shrink-0"
                          : "bg-red-100 text-red-800 border-red-200 shrink-0"
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
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
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

      {/* Create / Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={dialogContentClass}>
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {editType ? "Edit Designation" : "Add Designation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-gray-900">
                Name <span className="text-red-500">*</span>
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
                  formError && "border-red-500 focus-visible:ring-red-500",
                )}
                autoFocus
              />
              {formError && (
                <p className="text-xs text-red-600" role="alert">
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
                className="text-sm font-normal text-gray-900 cursor-pointer"
              >
                Active (available when assigning employees)
              </Label>
            </div>
            <LoadingButton
              onClick={handleSubmit}
              loading={submitLoading}
              className="h-10 w-full"
              disabled={submitLoading}
            >
              {editType ? "Update Designation" : "Create Designation"}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[min(96vw,520px)] max-w-[520px] sm:max-w-[520px]">
          {detail && (
            <div className="space-y-4">
              <DialogHeader className="text-left space-y-2">
                <DialogTitle className="text-xl font-bold text-gray-900">
                  {detail.name}
                </DialogTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={
                      detail.is_active
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }
                  >
                    {detail.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-gray-50 text-gray-700 border-gray-200"
                  >
                    {(detail.employee_count ?? 0).toLocaleString()} employee
                    {(detail.employee_count ?? 0) === 1 ? "" : "s"}
                  </Badge>
                </div>
              </DialogHeader>
              <p className="text-sm text-gray-600">
                This designation is used as the job title on employee records.
                Deactivate it to hide it from new assignments without removing
                existing staff links.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setDetailOpen(false);
                    openEdit(detail);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => handleToggle(detail)}
                >
                  {detail.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-red-600"
                  onClick={() => setDeleteTarget(detail)}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  . Delete is blocked until those employees are reassigned.
                  Prefer <span className="font-medium">Deactivate</span> instead.
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
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
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
                    setDeleteTarget(null);
                    handleToggle(deleteTarget);
                  }
                }}
              >
                Deactivate instead
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
