"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  Clock,
  Users,
  DollarSign,
  List,
  LayoutGrid,
  CalendarIcon,
  Sun,
  Moon,
  Sunset,
  CheckCircle2,
  Activity,
  Loader2,
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
import {
  useShiftAssignments,
  useShiftAssignmentMutations,
} from "@/hooks/queries/use-shift-assignments";
import type { ShiftAssignmentRecord } from "@/lib/api/shift-assignments";

type StatusFilter = "all" | "active" | "scheduled" | "completed";
type PeriodFilter = "all" | "today" | "week" | "month";
type ShiftRow = ShiftAssignmentRecord;

interface FormState {
  employee_id: string;
  date: Date | undefined;
  shiftType: "morning" | "evening" | "night" | "custom";
  startTime: string;
  endTime: string;
  breakHours: string;
  sales: string;
  markCompleted: boolean;
}

const PAGE_SIZE = 20;

const fieldLabel = "text-xs font-medium text-foreground";
const fieldControl = "h-9 text-sm";

const shiftFormSchema = z.object({
  employee_id: z.string().min(1, "Select an employee"),
  date: z.date({ required_error: "Select a date" }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  breakHours: z.number().min(0, "Break cannot be negative"),
});

const SHIFT_PRESETS = [
  { id: "morning" as const, name: "Morning", time: "9:00 AM – 5:00 PM", start: "09:00", end: "17:00", icon: Sun },
  { id: "evening" as const, name: "Evening", time: "1:00 PM – 9:00 PM", start: "13:00", end: "21:00", icon: Sunset },
  { id: "night" as const, name: "Night", time: "9:00 PM – 5:00 AM", start: "21:00", end: "05:00", icon: Moon },
  { id: "custom" as const, name: "Custom", time: "Set your own hours", start: "09:00", end: "17:00", icon: Clock },
];

const toUtcMidnightIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00.000Z`;
};

const parseToLocalDate = (dateStr?: string | null) => {
  if (!dateStr) return undefined;
  const datePart = dateStr.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = parseToLocalDate(value);
  if (!d) return "—";
  return format(d, "MMM d, yyyy");
};

const formatTimeTo12Hour = (timeStr?: string) => {
  if (!timeStr) return "—";
  if (timeStr.toUpperCase().includes("AM") || timeStr.toUpperCase().includes("PM")) {
    return timeStr;
  }
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${mStr || "00"} ${ampm}`;
};

const parseTimeToDecimal = (timeStr: string) => {
  if (!timeStr) return 0;
  const cleanStr = timeStr.replace(/\s+/g, "").toUpperCase();
  const isPM = cleanStr.includes("PM");
  const isAM = cleanStr.includes("AM");
  const numericPart = cleanStr.replace(/[AP]M/, "");
  const [hStr, mStr] = numericPart.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  if (isPM && h < 12) h += 12;
  else if (isAM && h === 12) h = 0;
  return h + m / 60;
};

const calculateHours = (startTime: string, endTime: string, breakHours: number) => {
  let diff = parseTimeToDecimal(endTime) - parseTimeToDecimal(startTime);
  if (diff < 0) diff += 24;
  return Math.max(0, diff - breakHours);
};

const emptyForm = (): FormState => ({
  employee_id: "",
  date: new Date(),
  shiftType: "morning",
  startTime: "09:00",
  endTime: "17:00",
  breakHours: "1",
  sales: "",
  markCompleted: false,
});

function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { hour: "09", minute: "00", ampm: "AM" };
    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr, 10);
    const minute = (mStr || "00").slice(0, 2);
    if (Number.isNaN(h)) return { hour: "09", minute: "00", ampm: "AM" };
    let ampm = "AM";
    let hourNum = h;
    if (h >= 12) {
      ampm = "PM";
      if (h > 12) hourNum = h - 12;
    } else if (h === 0) {
      hourNum = 12;
    }
    return { hour: String(hourNum).padStart(2, "0"), minute, ampm };
  };

  const { hour, minute, ampm } = parseTime(value);

  const handleTimeChange = (newHour: string, newMinute: string, newAmpm: string) => {
    let hNum = parseInt(newHour, 10);
    if (newAmpm === "PM" && hNum < 12) hNum += 12;
    else if (newAmpm === "AM" && hNum === 12) hNum = 0;
    onChange(`${String(hNum).padStart(2, "0")}:${newMinute}`);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  return (
    <div className="flex w-full items-center gap-1 rounded-md border border-border bg-background p-1">
      <Select disabled={disabled} value={hour} onValueChange={(val) => handleTimeChange(val, minute, ampm)}>
        <SelectTrigger className="h-8 w-[62px] border-none bg-transparent px-2 shadow-none focus:ring-0">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent className="max-h-[220px]">
          {hours.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="select-none text-muted-foreground">:</span>
      <Select
        disabled={disabled}
        value={minutes.includes(minute) ? minute : "00"}
        onValueChange={(val) => handleTimeChange(hour, val, ampm)}
      >
        <SelectTrigger className="h-8 w-[62px] border-none bg-transparent px-2 shadow-none focus:ring-0">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select disabled={disabled} value={ampm} onValueChange={(val) => handleTimeChange(hour, minute, val)}>
        <SelectTrigger className="h-8 w-[72px] border-none bg-transparent px-2 shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function statusBadgeClass(status?: string) {
  switch (status) {
    case "active":
      return "border-green-200 bg-green-50 text-green-800";
    case "scheduled":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "completed":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case "active":
      return "Active";
    case "scheduled":
      return "Scheduled";
    case "completed":
      return "Completed";
    default:
      return status || "—";
  }
}

export function Shifts() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState("");

  const [detail, setDetail] = useState<ShiftRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [endTarget, setEndTarget] = useState<ShiftRow | null>(null);
  const [endSales, setEndSales] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<ShiftRow | null>(null);

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
      status: statusFilter !== "all" ? statusFilter : undefined,
      period:
        periodFilter !== "all" && !dateFrom && !dateTo ? periodFilter : undefined,
      employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
      dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
    }),
    [
      page,
      debouncedSearch,
      statusFilter,
      periodFilter,
      employeeFilter,
      dateFrom,
      dateTo,
    ],
  );

  const {
    shiftAssignments: rows,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useShiftAssignments(listParams);

  const directoryQuery = useShiftAssignments({ page: 1, limit: 1 });
  const statsLoading =
    directoryQuery.isPending || directoryQuery.isPlaceholderData;
  const rawSummary = directoryQuery.summary;

  const summary = rawSummary ?? {
    total: 0,
    active: 0,
    scheduled: 0,
    completed: 0,
    today: 0,
    todayHours: 0,
    todaySales: 0,
    totalSales: 0,
  };
  const listMeta = meta ?? { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 };

  const { create, update, endShift, remove } = useShiftAssignmentMutations();
  const submitting = create.isPending || update.isPending;
  const ending = endShift.isPending;
  const deleting = remove.isPending;

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load shifts",
        description: extractApiError(listError, "Failed to load shifts"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows as ShiftRow[];

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    periodFilter !== "all" ||
    employeeFilter !== "all" ||
    !!dateFrom ||
    !!dateTo;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPeriodFilter("all");
    setEmployeeFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const previewHours = useMemo(
    () => calculateHours(form.startTime, form.endTime, Number(form.breakHours) || 0),
    [form.startTime, form.endTime, form.breakHours],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (row: ShiftRow) => {
    const start = row.start_time || row.shift_time?.split("-")[0]?.trim() || "09:00";
    const end = row.end_time || row.shift_time?.split("-")[1]?.trim() || "17:00";
    const breakRaw = row.break_time || String(row.break_hours ?? 1);
    const breakHours = String(parseFloat(breakRaw) || 0);
    const preset = SHIFT_PRESETS.find(
      (p) => p.start === start && p.end === end && p.id !== "custom",
    );

    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      date: parseToLocalDate(row.start_date) || new Date(),
      shiftType: preset?.id || "custom",
      startTime: start,
      endTime: end,
      breakHours,
      sales: row.sales ? String(row.sales) : "",
      markCompleted: !!row.end_date,
    });
    setFormError("");
    setFormOpen(true);
  };

  const openDetail = (row: ShiftRow) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const applyPreset = (id: FormState["shiftType"]) => {
    const preset = SHIFT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      shiftType: id,
      startTime: preset.start,
      endTime: preset.end,
    }));
  };

  const handleSubmit = () => {
    const parsed = shiftFormSchema.safeParse({
      employee_id: form.employee_id,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      breakHours: Number(form.breakHours),
    });
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || "Fix the form fields";
      setFormError(msg);
      toast({ variant: "destructive", title: msg });
      return;
    }
    setFormError("");

    const breakVal = Number(form.breakHours) || 0;
    const break_time = `${breakVal} hour${breakVal === 1 ? "" : "s"}`;
    const shift_time = `${form.startTime} - ${form.endTime}`;
    const payload: Record<string, unknown> = {
      shift_time,
      start_date: toUtcMidnightIso(parsed.data.date),
      break_time,
      sales: form.sales === "" ? 0 : Number(form.sales) || 0,
    };

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save shift",
        description: extractApiError(e, "Failed to save shift"),
      });

    if (editing) {
      payload.end_date = form.markCompleted ? new Date().toISOString() : null;
      update.mutate(
        { id: editing.id, body: payload },
        {
          onSuccess: () => {
            toast({ title: "Shift updated" });
            setFormOpen(false);
          },
          onError,
        },
      );
    } else {
      payload.employee_id = parsed.data.employee_id;
      if (form.markCompleted) payload.end_date = new Date().toISOString();
      create.mutate(payload, {
        onSuccess: () => {
          toast({ title: "Shift scheduled" });
          setFormOpen(false);
        },
        onError,
      });
    }
  };

  const openEnd = (row: ShiftRow) => {
    setEndTarget(row);
    setEndSales(row.sales ? String(row.sales) : "");
  };

  const handleEndShift = () => {
    if (!endTarget) return;
    const target = endTarget;
    endShift.mutate(
      { id: target.id, body: { sales: endSales === "" ? 0 : Number(endSales) || 0 } },
      {
        onSuccess: () => {
          toast({ title: "Shift ended" });
          setEndTarget(null);
          if (detail?.id === target.id) {
            setDetailOpen(false);
            setDetail(null);
          }
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not end shift",
            description: extractApiError(e, "Failed to end shift"),
          }),
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Shift deleted" });
        setDeleteTarget(null);
        if (detail?.id === target.id) {
          setDetailOpen(false);
          setDetail(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete shift",
          description: extractApiError(e, "Failed to delete shift"),
        }),
    });
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export" });
      return;
    }
    downloadExcel(
      `shifts-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Shifts",
      [
        "Employee",
        "Code",
        "Designation",
        "Department",
        "Date",
        "Start",
        "End",
        "Break (h)",
        "Hours",
        "Status",
        "Sales",
        "Ended",
      ],
      (rows as ShiftRow[]).map((r) => [
        r.employee?.name || "",
        r.employee?.employee_code || "",
        r.employee?.employee_type?.name || "",
        r.employee?.department?.name || "",
        formatDate(r.start_date),
        formatTimeTo12Hour(r.start_time),
        formatTimeTo12Hour(r.end_time),
        r.break_hours ?? (parseFloat(r.break_time || "0") || 0),
        r.total_hours ?? 0,
        statusLabel(r.status),
        r.sales ?? 0,
        r.end_date ? formatDate(r.end_date) : "",
      ]),
    );
  };

  const statusChips: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: summary.total },
    { key: "active", label: "Active", count: summary.active },
    { key: "scheduled", label: "Scheduled", count: summary.scheduled },
    { key: "completed", label: "Completed", count: summary.completed },
  ];

  const periodChips: Array<{ key: PeriodFilter; label: string }> = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "all", label: "All dates" },
  ];

  const renderActions = (row: ShiftRow) => (
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
      {row.status !== "completed" && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          onClick={() => openEnd(row)}
        >
          End
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
  );

  return (
    <>
      <PageHeader
        title="Shift Management"
        description="Schedule staff shifts, track active coverage, and close completed days"
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
              Schedule shift
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
              label: "Active now",
              value: summary.active.toLocaleString(),
              icon: Activity,
              tone: "success",
              hint: "Open shifts not yet ended",
              onClick: () => {
                setStatusFilter("active");
                setPeriodFilter("all");
                setPage(1);
              },
            },
            {
              label: "Today's shifts",
              value: summary.today.toLocaleString(),
              icon: Sun,
              hint: `${summary.todayHours.toFixed(1)}h scheduled today`,
              onClick: () => {
                setPeriodFilter("today");
                setStatusFilter("all");
                setDateFrom(undefined);
                setDateTo(undefined);
                setPage(1);
              },
            },
            {
              label: "Today's sales",
              value: formatMoney(summary.todaySales),
              icon: DollarSign,
              hint: "Sales recorded on today's shifts",
            },
            {
              label: "Scheduled ahead",
              value: summary.scheduled.toLocaleString(),
              icon: Users,
              tone: "warning",
              hint: `${summary.completed} completed overall`,
              onClick: () => {
                setStatusFilter("scheduled");
                setPeriodFilter("all");
                setPage(1);
              },
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {statusChips.map((chip) => (
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
                {statsLoading ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {periodChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => {
                  setPeriodFilter(chip.key);
                  setDateFrom(undefined);
                  setDateTo(undefined);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  periodFilter === chip.key && !dateFrom && !dateTo
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="relative max-w-md flex-1">
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
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-full text-sm sm:w-[180px]">
                <SelectValue placeholder="Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal sm:w-[150px]",
                    !dateFrom && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => {
                    setDateFrom(d);
                    setPeriodFilter("all");
                    setPage(1);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal sm:w-[150px]",
                    !dateTo && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "MMM d") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => {
                    setDateTo(d);
                    setPeriodFilter("all");
                    setPage(1);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearFilters}
              >
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
                Shifts{" "}
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
                <Clock className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {periodFilter === "today" && summary.total > 0
                    ? "No shifts scheduled for today"
                    : "No shifts found"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {periodFilter === "today" && summary.total > 0
                    ? "Switch to All dates to see upcoming or completed shifts."
                    : "Adjust filters or schedule a new shift for your staff."}
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide">Employee</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Time</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">Hours</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide">Sales</TableHead>
                      <TableHead className="min-w-[260px] text-right text-xs uppercase tracking-wide">
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
                          {formatDate(row.start_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatTimeTo12Hour(row.start_time)} –{" "}
                          {formatTimeTo12Hour(row.end_time)}
                        </TableCell>
                        <TableCell className="text-right font-medium nums">
                          {(row.total_hours ?? 0).toFixed(1)}h
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(row.status)}>
                            {statusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right nums">
                          {formatMoney(row.sales || 0)}
                        </TableCell>
                        <TableCell>{renderActions(row)}</TableCell>
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
                        <p className="text-xs text-muted-foreground">
                          {formatDate(row.start_date)}
                        </p>
                      </div>
                      <Badge variant="outline" className={statusBadgeClass(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-foreground">
                      {formatTimeTo12Hour(row.start_time)} –{" "}
                      {formatTimeTo12Hour(row.end_time)}
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      {(row.total_hours ?? 0).toFixed(1)}h
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sales</span>
                      <span className="font-semibold nums">
                        {formatMoney(row.sales || 0)}
                      </span>
                    </div>
                    {renderActions(row)}
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
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
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

      {/* Schedule / Edit — >6 fields (employee, date, shift type, start, end,
          break, sales, completed), so a DetailSheet with the form in the body. */}
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
          title={editing ? "Edit shift" : "Schedule shift"}
          subtitle={
            editing
              ? "Update hours, break, sales, or completion status"
              : "Assign a shift to an employee for a specific date"
          }
          icon={<Clock className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {!editing && (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Employee</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, employee_id: v }))
                }
              >
                <SelectTrigger className={fieldControl}>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.employee_code ? ` (${emp.employee_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {editing && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium text-foreground">
                {editing.employee?.name || "Employee"}
              </p>
              <p className="text-xs text-muted-foreground">
                {editing.employee?.employee_code || "—"}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className={fieldLabel}>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal",
                    !form.date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.date ? format(form.date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.date}
                  onSelect={(d) => setForm((prev) => ({ ...prev, date: d }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className={fieldLabel}>Shift type</Label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_PRESETS.map((type) => {
                const Icon = type.icon;
                const selected = form.shiftType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => applyPreset(type.id)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-2.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="block text-xs font-semibold text-foreground">
                        {type.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {type.time}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Start time</Label>
              <TimePicker
                value={form.startTime}
                onChange={(val) =>
                  setForm((prev) => ({
                    ...prev,
                    startTime: val,
                    shiftType: "custom",
                  }))
                }
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>End time</Label>
              <TimePicker
                value={form.endTime}
                onChange={(val) =>
                  setForm((prev) => ({
                    ...prev,
                    endTime: val,
                    shiftType: "custom",
                  }))
                }
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Break (hours)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={form.breakHours}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, breakHours: e.target.value }))
                }
                className={cn(fieldControl, "nums")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Net hours</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-semibold text-foreground">
                {previewHours.toFixed(1)}h
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={fieldLabel}>Sales (optional)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.sales}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sales: e.target.value }))
              }
              placeholder="0"
              className={cn(fieldControl, "nums")}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={form.markCompleted}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, markCompleted: e.target.checked }))
              }
            />
            Mark as completed
          </label>

          {formError ? (
            <p className="text-xs text-destructive">{formError}</p>
          ) : null}
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
            loading={submitting}
            loadingText={editing ? "Saving…" : "Scheduling…"}
            onClick={handleSubmit}
          >
            {editing ? "Save changes" : "Schedule shift"}
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
          title={detail?.employee?.name || "Shift details"}
          subtitle={
            detail
              ? `${detail.employee?.employee_code || "—"}${
                  detail.employee?.department?.name
                    ? ` · ${detail.employee.department.name}`
                    : ""
                }`
              : undefined
          }
          icon={<Clock className="h-5 w-5" />}
        />
        <DetailSheetBody className="space-y-4">
          {detail && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {formatDate(detail.start_date)}
                </span>
                <Badge variant="outline" className={statusBadgeClass(detail.status)}>
                  {statusLabel(detail.status)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Hours</p>
                  <p className="mt-0.5 font-medium nums">
                    {(detail.total_hours ?? 0).toFixed(1)}h
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Sales</p>
                  <p className="mt-0.5 font-semibold nums">
                    {formatMoney(detail.sales || 0)}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Start</p>
                  <p className="mt-0.5 font-medium">
                    {formatTimeTo12Hour(detail.start_time)}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">End</p>
                  <p className="mt-0.5 font-medium">
                    {formatTimeTo12Hour(detail.end_time)}
                  </p>
                </div>
                <div className="col-span-2 rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Break</p>
                  <p className="mt-0.5 font-medium">
                    {detail.break_time || `${detail.break_hours ?? 0} hour(s)`}
                  </p>
                </div>
              </div>
            </>
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          {detail && (
            <>
              {detail.status !== "completed" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailOpen(false);
                    openEnd(detail);
                  }}
                >
                  End shift
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(detail);
                }}
              >
                Edit
              </Button>
              <Button onClick={() => setDetailOpen(false)}>Close</Button>
            </>
          )}
        </DetailSheetFooter>
      </DetailSheet>

      {/* End shift confirm */}
      <AlertDialog
        open={!!endTarget}
        onOpenChange={(open) => {
          if (!open && !ending) setEndTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {endTarget
                ? `Close the shift for ${endTarget.employee?.name || "this employee"} on ${formatDate(endTarget.start_date)} and record final sales.`
                : "Close this shift and record final sales."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className={fieldLabel}>Final sales amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={endSales}
              onChange={(e) => setEndSales(e.target.value)}
              placeholder="0"
              className={cn(fieldControl, "nums")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleEndShift();
              }}
              disabled={ending}
            >
              {ending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              End shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Remove the shift for ${deleteTarget.employee?.name || "this employee"} on ${formatDate(deleteTarget.start_date)}. This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
