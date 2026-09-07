"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  DollarSign,
  CheckCircle2,
  XCircle,
  Users,
  List,
  LayoutGrid,
  X,
  CalendarIcon,
  Wallet,
  RefreshCcw,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  downloadExcel,
  formatMoney,
} from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import { useEmployees } from "@/hooks/queries/use-employees";
import { useSalaries, useSalaryMutations } from "@/hooks/queries/use-salaries";
import type { SalaryRecord } from "@/lib/api/salaries";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type PaidFilter = "all" | "paid" | "unpaid";

interface FormState {
  employee_id: string;
  month: number;
  year: number;
  amount: string;
  is_paid: boolean;
  paid_date: Date | undefined;
  notes: string;
}

const PAGE_SIZE = 20;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear - i);

const fieldLabel = "text-xs font-medium text-foreground";
const fieldControl = "h-9 text-sm";

const salaryFormSchema = z.object({
  employee_id: z.string().min(1, "Select an employee"),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  amount: z.number().positive("Amount must be greater than 0"),
  is_paid: z.boolean(),
  notes: z.string().optional(),
});

const emptyForm = (): FormState => ({
  employee_id: "",
  month: new Date().getMonth() + 1,
  year: currentYear,
  amount: "",
  is_paid: false,
  paid_date: undefined,
  notes: "",
});

const formatPeriod = (month: number, year: number) =>
  `${MONTHS[month - 1] || month} ${year}`;

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy");
};

export function Salaries() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState("");

  const [detail, setDetail] = useState<SalaryRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalaryRecord | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { employees: employeeRows } = useEmployees({ limit: 100 });
  const employees = useMemo(
    () =>
      (employeeRows as Array<{ id: string; name: string; employee_code?: string | null; status?: string }>).filter(
        (e) => (e.status || "ACTIVE") !== "TERMINATED",
      ),
    [employeeRows],
  );

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      isPaid:
        paidFilter === "paid" ? true : paidFilter === "unpaid" ? false : undefined,
      month: monthFilter !== "all" ? monthFilter : undefined,
      year: yearFilter !== "all" ? yearFilter : undefined,
      employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
    }),
    [page, debouncedSearch, paidFilter, monthFilter, yearFilter, employeeFilter],
  );

  const {
    salaries: rows,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useSalaries(listParams);

  const directoryParams = useMemo(
    () => ({
      page: 1,
      limit: 1,
      month: monthFilter !== "all" ? monthFilter : undefined,
      year: yearFilter !== "all" ? yearFilter : undefined,
      employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
    }),
    [monthFilter, yearFilter, employeeFilter],
  );
  const directoryQuery = useSalaries(directoryParams);
  const statsLoading =
    directoryQuery.isPending || directoryQuery.isPlaceholderData;
  const rawSummary = directoryQuery.summary;

  const summary = rawSummary ?? {
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    paidCount: 0,
    unpaidCount: 0,
  };
  const listMeta = meta ?? { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 };
  const directoryTotal =
    directoryQuery.meta?.total ?? summary.paidCount + summary.unpaidCount;

  const { create, update, remove, markPaid, markUnpaid } = useSalaryMutations();
  const submitting = create.isPending || update.isPending;
  const deleting = remove.isPending;

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load salaries",
        description: extractApiError(listError, "Failed to load salaries"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows as SalaryRecord[];

  const hasFilters =
    Boolean(search.trim()) ||
    paidFilter !== "all" ||
    monthFilter !== "all" ||
    yearFilter !== String(currentYear) ||
    employeeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setPaidFilter("all");
    setMonthFilter("all");
    setYearFilter(String(currentYear));
    setEmployeeFilter("all");
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (row: SalaryRecord) => {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      month: row.month,
      year: row.year,
      amount: String(row.amount ?? ""),
      is_paid: !!row.is_paid,
      paid_date: row.paid_date ? new Date(row.paid_date) : undefined,
      notes: row.notes || "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const openDetail = (row: SalaryRecord) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const handleSubmit = () => {
    const parsed = salaryFormSchema.safeParse({
      employee_id: form.employee_id,
      month: form.month,
      year: form.year,
      amount: Number(form.amount),
      is_paid: form.is_paid,
      notes: form.notes.trim() || undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || "Fix the form fields";
      setFormError(msg);
      toast({ variant: "destructive", title: msg });
      return;
    }
    setFormError("");

    const payload: Record<string, unknown> = {
      employee_id: parsed.data.employee_id,
      month: parsed.data.month,
      year: parsed.data.year,
      amount: parsed.data.amount,
      is_paid: parsed.data.is_paid,
      notes: parsed.data.notes || null,
      paid_date: parsed.data.is_paid
        ? (form.paid_date || new Date()).toISOString()
        : null,
    };

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save salary",
        description: extractApiError(e, "Failed to save salary"),
      });

    if (editing) {
      update.mutate(
        { id: editing.id, body: payload },
        {
          onSuccess: () => {
            toast({ title: "Salary record updated" });
            setFormOpen(false);
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Salary record created" });
          setFormOpen(false);
        },
        onError,
      });
    }
  };

  const handleMarkPaid = (row: SalaryRecord) => {
    setActionId(row.id);
    markPaid.mutate(
      { id: row.id, body: { paid_date: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast({ title: "Marked as paid" });
          if (detail?.id === row.id) {
            setDetail({
              ...row,
              is_paid: true,
              paid_date: new Date().toISOString(),
            });
          }
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not mark paid",
            description: extractApiError(e, "Failed to mark paid"),
          }),
        onSettled: () => setActionId(null),
      },
    );
  };

  const handleMarkUnpaid = (row: SalaryRecord) => {
    setActionId(row.id);
    markUnpaid.mutate(row.id, {
      onSuccess: () => {
        toast({ title: "Marked as unpaid" });
        if (detail?.id === row.id) {
          setDetail({ ...row, is_paid: false, paid_date: null });
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not mark unpaid",
          description: extractApiError(e, "Failed to mark unpaid"),
        }),
      onSettled: () => setActionId(null),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Salary record deleted" });
        setDeleteTarget(null);
        if (detail?.id === target.id) {
          setDetailOpen(false);
          setDetail(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete",
          description: extractApiError(e, "Failed to delete"),
        }),
    });
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export" });
      return;
    }
    downloadExcel(
      `salaries-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Salaries",
      [
        "Employee",
        "Code",
        "Designation",
        "Department",
        "Period",
        "Amount",
        "Status",
        "Paid date",
        "Notes",
      ],
      (rows as SalaryRecord[]).map((r) => [
        r.employee?.name || "",
        r.employee?.employee_code || "",
        r.employee?.employee_type?.name || "",
        r.employee?.department?.name || "",
        formatPeriod(r.month, r.year),
        r.amount,
        r.is_paid ? "Paid" : "Unpaid",
        r.paid_date ? formatDate(r.paid_date) : "",
        r.notes || "",
      ]),
    );
  };

  const paidChips: Array<{ key: PaidFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: directoryTotal },
    { key: "paid", label: "Paid", count: summary.paidCount },
    { key: "unpaid", label: "Unpaid", count: summary.unpaidCount },
  ];

  return (
    <>
      <PageHeader
        title="Salaries"
        description="Record monthly pay, track paid vs unpaid, and export payroll history"
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
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export Excel
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add salary
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={4}
          loading={statsLoading}
          items={[
            {
              label: "Total payroll",
              value: formatMoney(summary.totalAmount),
              icon: DollarSign,
              hint: `${directoryTotal} record${directoryTotal === 1 ? "" : "s"} in period`,
            },
            {
              label: "Paid",
              value: formatMoney(summary.paidAmount),
              icon: CheckCircle2,
              tone: "success",
              hint: `${summary.paidCount} paid`,
              onClick: () => {
                setPaidFilter("paid");
                setPage(1);
              },
            },
            {
              label: "Unpaid",
              value: formatMoney(summary.unpaidAmount),
              icon: XCircle,
              tone: "danger",
              hint: `${summary.unpaidCount} unpaid`,
              onClick: () => {
                setPaidFilter("unpaid");
                setPage(1);
              },
            },
            {
              label: "Employees listed",
              value: new Set(
                (rows as SalaryRecord[]).map((r) => r.employee_id),
              ).size.toLocaleString(),
              icon: Users,
              hint: "Distinct staff in current filters",
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {paidChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setPaidFilter(chip.key);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  paidFilter === chip.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
                {statsLoading ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
            <div className="relative max-w-md min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employee name or code"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 pl-9"
              />
            </div>
            <Select
              value={monthFilter}
              onValueChange={(v) => {
                setMonthFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-sm sm:w-[140px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={yearFilter}
              onValueChange={(v) => {
                setYearFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-sm sm:w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-sm sm:max-w-[220px] sm:w-[220px]">
                <SelectValue placeholder="Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5 xl:ml-auto">
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

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Salary records{" "}
                <span className="font-normal text-muted-foreground">
                  {isFirstLoad ? "(loading…)" : `(${listMeta.total})`}
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
            ) : rows.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Wallet className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No salary records found
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasFilters
                    ? "Try clearing filters or add a new salary entry."
                    : "Add the first monthly salary for an employee."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide">
                        Employee
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">
                        Period
                      </TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">
                        Amount
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">
                        Paid date
                      </TableHead>
                      <TableHead className="min-w-[280px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => (
                      <TableRow key={row.id} className="h-11 hover:bg-muted/50">
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {row.employee?.name || "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.employee?.employee_code || "—"}
                              {row.employee?.employee_type?.name
                                ? ` · ${row.employee.employee_type.name}`
                                : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatPeriod(row.month, row.year)}
                        </TableCell>
                        <TableCell className="text-right font-semibold nums">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              row.is_paid
                                ? "border-green-200 bg-green-100 text-green-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }
                          >
                            {row.is_paid ? "Paid" : "Unpaid"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(row.paid_date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(row)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </Button>
                            {row.is_paid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                disabled={actionId === row.id}
                                onClick={() => handleMarkUnpaid(row)}
                              >
                                {actionId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Mark unpaid"
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                disabled={actionId === row.id}
                                onClick={() => handleMarkPaid(row)}
                              >
                                {actionId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Mark paid"
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(row)}
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
                {pageRows.map((row) => (
                  <div
                    key={row.id}
                    className="space-y-3 rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {row.employee?.name || "—"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatPeriod(row.month, row.year)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          row.is_paid
                            ? "border-green-200 bg-green-100 text-green-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }
                      >
                        {row.is_paid ? "Paid" : "Unpaid"}
                      </Badge>
                    </div>
                    <p className="text-lg font-bold nums">
                      {formatMoney(row.amount)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(row)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      {!row.is_paid && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={actionId === row.id}
                          onClick={() => handleMarkPaid(row)}
                        >
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {listMeta.total > PAGE_SIZE && (
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

      {/* Create / Edit — 7 fields (employee, month, year, amount, paid toggle,
          paid date, notes), so a DetailSheet with the form in the body. */}
      <DetailSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditing(null);
            setFormError("");
          }
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editing ? "Edit salary" : "Add salary"}
          subtitle="Monthly pay record for an employee"
          icon={<Wallet className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          <div className="space-y-1">
            <Label className={fieldLabel}>
              Employee <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.employee_id}
              onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}
            >
              <SelectTrigger className={fieldControl}>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    {e.employee_code ? ` (${e.employee_code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={fieldLabel}>Month</Label>
              <Select
                value={String(form.month)}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, month: Number(v) }))
                }
              >
                <SelectTrigger className={fieldControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={fieldLabel}>Year</Label>
              <Select
                value={String(form.year)}
                onValueChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}
              >
                <SelectTrigger className={fieldControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={fieldLabel}>
              Amount <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
              placeholder="0.00"
              className={cn(fieldControl, "nums")}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Mark as paid
              </p>
              <p className="text-xs text-muted-foreground">
                Turn on if payment was already made
              </p>
            </div>
            <Switch
              checked={form.is_paid}
              onCheckedChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  is_paid: checked,
                  paid_date: checked ? f.paid_date || new Date() : undefined,
                }))
              }
            />
          </div>

          {form.is_paid && (
            <div className="space-y-1">
              <Label className={fieldLabel}>Paid date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      fieldControl,
                      "w-full justify-start px-3 font-normal",
                      !form.paid_date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    {form.paid_date
                      ? format(form.paid_date, "PPP")
                      : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.paid_date}
                    onSelect={(d) => setForm((f) => ({ ...f, paid_date: d }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-1">
            <Label className={fieldLabel}>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              className="min-h-[72px] text-sm"
            />
          </div>

          {formError && (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button
            variant="outline"
            onClick={() => setFormOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
          >
            {editing ? "Update salary" : "Create salary"}
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
          title={detail?.employee?.name || "Salary"}
          subtitle={
            detail ? formatPeriod(detail.month, detail.year) : undefined
          }
          icon={<Wallet className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {detail && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-normal">
                  {formatPeriod(detail.month, detail.year)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    detail.is_paid
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }
                >
                  {detail.is_paid ? "Paid" : "Unpaid"}
                </Badge>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="text-xs nums">
                    {detail.employee?.employee_code || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation</span>
                  <span>{detail.employee?.employee_type?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{detail.employee?.department?.name || "—"}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-medium text-foreground">Amount</span>
                  <span className="font-bold nums">
                    {formatMoney(detail.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid date</span>
                  <span>{formatDate(detail.paid_date)}</span>
                </div>
                {detail.notes && (
                  <div className="border-t border-border pt-2">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p className="text-foreground">{detail.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          {detail && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(detail);
                }}
              >
                Edit
              </Button>
              {detail.is_paid ? (
                <Button
                  variant="outline"
                  disabled={actionId === detail.id}
                  onClick={() => handleMarkUnpaid(detail)}
                >
                  Mark unpaid
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={actionId === detail.id}
                  onClick={() => handleMarkPaid(detail)}
                >
                  Mark paid
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(detail)}
              >
                Delete
              </Button>
            </>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete salary record?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the{" "}
              <span className="font-semibold">
                {deleteTarget
                  ? formatPeriod(deleteTarget.month, deleteTarget.year)
                  : ""}
              </span>{" "}
              entry for{" "}
              <span className="font-semibold">
                {deleteTarget?.employee?.name || "this employee"}
              </span>
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
