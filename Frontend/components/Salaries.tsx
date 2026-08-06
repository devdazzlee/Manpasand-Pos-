"use client";

import React, { useCallback, useEffect, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { LoadingButton } from "@/components/ui/loading-button";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  downloadExcel,
  formatMoney,
} from "@/components/inventory/stock-ops/export-utils";
import { cn } from "@/lib/utils";
import { z } from "zod";

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

interface EmployeeOption {
  id: string;
  name: string;
  employee_code?: string | null;
  status?: string;
}

interface SalaryRow {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
  } | null;
  month: number;
  year: number;
  amount: number;
  is_paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

interface Summary {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  paidCount: number;
  unpaidCount: number;
}

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

const dialogClass =
  "grid w-[min(96vw,560px)] max-w-[560px] sm:max-w-[560px] gap-4 p-5";
const fieldLabel = "text-xs font-medium text-gray-900";
const fieldControl = "h-9 rounded-md border-gray-200 text-sm";

const salaryFormSchema = z.object({
  employee_id: z.string().min(1, "Select an employee"),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  amount: z.number().positive("Amount must be greater than 0"),
  is_paid: z.boolean(),
  notes: z.string().optional(),
});

const extractApiError = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (data?.errors?.length) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  return data?.message || err?.message || fallback;
};

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
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    paidCount: 0,
    unpaidCount: 0,
  });
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<SalaryRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalaryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setMetaLoading(true);
    try {
      const res = await apiClient.get("/employee", {
        params: { fetch_all: "true" },
      });
      const list = (res.data?.data || []) as EmployeeOption[];
      setEmployees(
        list.filter((e) => (e.status || "ACTIVE") !== "TERMINATED"),
      );
    } catch {
      setEmployees([]);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  const fetchSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { fetch_all: "true" };
      if (search.trim()) params.search = search.trim();
      if (paidFilter === "paid") params.is_paid = "true";
      if (paidFilter === "unpaid") params.is_paid = "false";
      if (monthFilter !== "all") params.month = monthFilter;
      if (yearFilter !== "all") params.year = yearFilter;
      if (employeeFilter !== "all") params.employee_id = employeeFilter;

      const res = await apiClient.get("/salaries", { params });
      setRows(res.data?.data || []);
      const s = res.data?.meta?.summary;
      setSummary({
        totalAmount: Number(s?.totalAmount) || 0,
        paidAmount: Number(s?.paidAmount) || 0,
        unpaidAmount: Number(s?.unpaidAmount) || 0,
        paidCount: Number(s?.paidCount) || 0,
        unpaidCount: Number(s?.unpaidCount) || 0,
      });
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load salaries"));
      setRows([]);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [search, paidFilter, monthFilter, yearFilter, employeeFilter]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    fetchSalaries();
  }, [fetchSalaries]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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

  const openEdit = (row: SalaryRow) => {
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

  const openDetail = (row: SalaryRow) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const handleSubmit = async () => {
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
      toast.error(msg);
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        employee_id: parsed.data.employee_id,
        month: parsed.data.month,
        year: parsed.data.year,
        amount: parsed.data.amount,
        is_paid: parsed.data.is_paid,
        notes: parsed.data.notes || null,
      };
      if (parsed.data.is_paid) {
        payload.paid_date = (form.paid_date || new Date()).toISOString();
      } else {
        payload.paid_date = null;
      }

      if (editing) {
        await apiClient.put(`/salaries/${editing.id}`, payload);
        toast.success("Salary record updated");
      } else {
        await apiClient.post("/salaries", payload);
        toast.success("Salary record created");
      }
      setFormOpen(false);
      await fetchSalaries();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to save salary"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (row: SalaryRow) => {
    setActionId(row.id);
    try {
      await apiClient.patch(`/salaries/${row.id}/mark-paid`, {
        paid_date: new Date().toISOString(),
      });
      toast.success("Marked as paid");
      await fetchSalaries();
      if (detail?.id === row.id) {
        setDetail({
          ...row,
          is_paid: true,
          paid_date: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to mark paid"));
    } finally {
      setActionId(null);
    }
  };

  const handleMarkUnpaid = async (row: SalaryRow) => {
    setActionId(row.id);
    try {
      await apiClient.patch(`/salaries/${row.id}/mark-unpaid`);
      toast.success("Marked as unpaid");
      await fetchSalaries();
      if (detail?.id === row.id) {
        setDetail({ ...row, is_paid: false, paid_date: null });
      }
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to mark unpaid"));
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/salaries/${deleteTarget.id}`);
      toast.success("Salary record deleted");
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) {
        setDetailOpen(false);
        setDetail(null);
      }
      await fetchSalaries();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete"));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
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
      rows.map((r) => [
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
    { key: "all", label: "All", count: rows.length },
    { key: "paid", label: "Paid", count: summary.paidCount },
    { key: "unpaid", label: "Unpaid", count: summary.unpaidCount },
  ];

  if (initialLoading) {
    return <PageLoader message="Loading salaries..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Staff
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Salaries
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Record monthly pay, track paid vs unpaid, and export payroll history
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={handleExport}
          >
            Export Excel
          </Button>
          <Button className="h-9" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Salary
          </Button>
        </div>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && rows.length === 0}
        items={[
          {
            label: "Total payroll",
            value: formatMoney(summary.totalAmount),
            icon: DollarSign,
            hint: `${rows.length} record${rows.length === 1 ? "" : "s"} in view`,
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
            value: new Set(rows.map((r) => r.employee_id)).size.toLocaleString(),
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
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {chip.label}
              <span className="tabular-nums text-gray-500">{chip.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search employee name or code"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-9"
            />
          </div>
          <Select
            value={monthFilter}
            onValueChange={(v) => {
              setMonthFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-[140px] text-sm">
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
            <SelectTrigger className="h-9 w-full sm:w-[120px] text-sm">
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
            <SelectTrigger className="h-9 w-full sm:w-[180px] text-sm">
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
              className="h-9 text-red-600 border-red-200 hover:bg-red-50"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
          <div className="flex items-center gap-1 xl:ml-auto border border-gray-200 rounded-md p-0.5 bg-white">
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
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              Salary records{" "}
              <span className="font-normal text-gray-500">({rows.length})</span>
            </p>
          </div>

          {loading && rows.length === 0 ? (
            <div className="py-16">
              <PageLoader message="Loading salaries..." />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Wallet className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No salary records found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {hasFilters
                  ? "Try clearing filters or add a new salary entry."
                  : "Add the first monthly salary for an employee."}
              </p>
              {!hasFilters && (
                <Button className="mt-4 h-9" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Salary
                </Button>
              )}
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid date</TableHead>
                    <TableHead className="text-right min-w-[280px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-gray-50/80">
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {row.employee?.name || "—"}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {row.employee?.employee_code || "—"}
                            {row.employee?.employee_type?.name
                              ? ` · ${row.employee.employee_type.name}`
                              : ""}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatPeriod(row.month, row.year)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(row.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.is_paid
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }
                        >
                          {row.is_paid ? "Paid" : "Unpaid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(row.paid_date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5 flex-wrap">
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
                            className="h-8 px-2.5 text-xs text-red-600"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {pageRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {row.employee?.name || "—"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatPeriod(row.month, row.year)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        row.is_paid
                          ? "bg-green-100 text-green-800 border-green-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }
                    >
                      {row.is_paid ? "Paid" : "Unpaid"}
                    </Badge>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
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

          {rows.length > PAGE_SIZE && (
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
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={dialogClass}>
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {editing ? "Edit Salary" : "Add Salary"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className={fieldLabel}>
                Employee <span className="text-red-500">*</span>
              </Label>
              {metaLoading ? (
                <div className="h-9 rounded-md border border-gray-200 bg-gray-50 flex items-center px-3 text-xs text-gray-500">
                  Loading employees…
                </div>
              ) : (
                <Select
                  value={form.employee_id}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, employee_id: v }))
                  }
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
              )}
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
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, year: Number(v) }))
                  }
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
                Amount <span className="text-red-500">*</span>
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
                className={fieldControl}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-gray-900">
                  Mark as paid
                </p>
                <p className="text-[11px] text-gray-500">
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
                        "w-full justify-start font-normal px-3",
                        !form.paid_date && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                      {form.paid_date
                        ? format(form.paid_date, "PPP")
                        : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.paid_date}
                      onSelect={(d) =>
                        setForm((f) => ({ ...f, paid_date: d }))
                      }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional notes"
                className="min-h-[72px] text-sm"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-600" role="alert">
                {formError}
              </p>
            )}

            <LoadingButton
              onClick={handleSubmit}
              loading={submitting}
              className="h-10 w-full"
              disabled={submitting}
            >
              {editing ? "Update Salary" : "Create Salary"}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[min(96vw,560px)] max-w-[560px] sm:max-w-[560px]">
          {detail && (
            <div className="space-y-4">
              <DialogHeader className="text-left space-y-2">
                <DialogTitle className="text-xl font-bold text-gray-900">
                  {detail.employee?.name || "Salary"}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="font-normal">
                    {formatPeriod(detail.month, detail.year)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      detail.is_paid
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }
                  >
                    {detail.is_paid ? "Paid" : "Unpaid"}
                  </Badge>
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Code</span>
                  <span className="font-mono text-xs">
                    {detail.employee?.employee_code || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Designation</span>
                  <span>{detail.employee?.employee_type?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Department</span>
                  <span>{detail.employee?.department?.name || "—"}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-700 font-medium">Amount</span>
                  <span className="font-bold tabular-nums">
                    {formatMoney(detail.amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Paid date</span>
                  <span>{formatDate(detail.paid_date)}</span>
                </div>
                {detail.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Notes</p>
                    <p className="text-gray-800">{detail.notes}</p>
                  </div>
                )}
              </div>

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
                {detail.is_paid ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => handleMarkUnpaid(detail)}
                  >
                    Mark unpaid
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => handleMarkPaid(detail)}
                  >
                    Mark paid
                  </Button>
                )}
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
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
