"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

type StatusFilter = "all" | "active" | "scheduled" | "completed";
type PeriodFilter = "all" | "today" | "week" | "month";

interface EmployeeOption {
  id: string;
  name: string;
  employee_code?: string | null;
  status?: string;
}

interface ShiftRow {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    name: string;
    employee_code?: string | null;
    department?: { id: string; name: string } | null;
    employee_type?: { id: string; name: string } | null;
  } | null;
  shift_time: string;
  start_date: string;
  end_date?: string | null;
  sales: number;
  break_time?: string | null;
  start_time?: string;
  end_time?: string;
  break_hours?: number;
  total_hours?: number;
  status?: "scheduled" | "active" | "completed";
}

interface Summary {
  total: number;
  active: number;
  scheduled: number;
  completed: number;
  today: number;
  todayHours: number;
  todaySales: number;
  totalSales: number;
}

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

const dialogClass =
  "grid w-[min(96vw,640px)] max-w-[640px] sm:max-w-[640px] gap-4 p-5";
const fieldLabel = "text-xs font-medium text-gray-900";
const fieldControl = "h-9 rounded-md border-gray-200 text-sm";

const shiftFormSchema = z.object({
  employee_id: z.string().min(1, "Select an employee"),
  date: z.date({ required_error: "Select a date" }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  breakHours: z.number().min(0, "Break cannot be negative"),
});

const SHIFT_PRESETS = [
  {
    id: "morning" as const,
    name: "Morning",
    time: "9:00 AM – 5:00 PM",
    start: "09:00",
    end: "17:00",
    icon: Sun,
  },
  {
    id: "evening" as const,
    name: "Evening",
    time: "1:00 PM – 9:00 PM",
    start: "13:00",
    end: "21:00",
    icon: Sunset,
  },
  {
    id: "night" as const,
    name: "Night",
    time: "9:00 PM – 5:00 AM",
    start: "21:00",
    end: "05:00",
    icon: Moon,
  },
  {
    id: "custom" as const,
    name: "Custom",
    time: "Set your own hours",
    start: "09:00",
    end: "17:00",
    icon: Clock,
  },
];

const extractApiError = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (data?.errors?.length) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  return data?.message || err?.message || fallback;
};

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
  if (
    timeStr.toUpperCase().includes("AM") ||
    timeStr.toUpperCase().includes("PM")
  ) {
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

const calculateHours = (
  startTime: string,
  endTime: string,
  breakHours: number,
) => {
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

  const handleTimeChange = (
    newHour: string,
    newMinute: string,
    newAmpm: string,
  ) => {
    let hNum = parseInt(newHour, 10);
    if (newAmpm === "PM" && hNum < 12) hNum += 12;
    else if (newAmpm === "AM" && hNum === 12) hNum = 0;
    onChange(`${String(hNum).padStart(2, "0")}:${newMinute}`);
  };

  const hours = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0"),
  );
  const minutes = ["00", "15", "30", "45"];

  return (
    <div className="flex w-full items-center gap-1 rounded-md border border-gray-200 bg-white p-1">
      <Select
        disabled={disabled}
        value={hour}
        onValueChange={(val) => handleTimeChange(val, minute, ampm)}
      >
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
      <span className="text-gray-400 select-none">:</span>
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
      <Select
        disabled={disabled}
        value={ampm}
        onValueChange={(val) => handleTimeChange(hour, minute, val)}
      >
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
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "scheduled":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "completed":
      return "bg-gray-100 text-gray-700 border-gray-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
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
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    scheduled: 0,
    completed: 0,
    today: 0,
    todayHours: 0,
    todaySales: 0,
    totalSales: 0,
  });
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("today");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<ShiftRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [endTarget, setEndTarget] = useState<ShiftRow | null>(null);
  const [endSales, setEndSales] = useState("");
  const [ending, setEnding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ShiftRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
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
    }
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { fetch_all: "true" };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (periodFilter !== "all" && !dateFrom && !dateTo) {
        params.period = periodFilter;
      }
      if (employeeFilter !== "all") params.employee_id = employeeFilter;
      if (dateFrom) params.date_from = format(dateFrom, "yyyy-MM-dd");
      if (dateTo) params.date_to = format(dateTo, "yyyy-MM-dd");

      const res = await apiClient.get("/shift-assignment", { params });
      setRows(res.data?.data || []);
      const s = res.data?.meta?.summary;
      setSummary({
        total: Number(s?.total) || 0,
        active: Number(s?.active) || 0,
        scheduled: Number(s?.scheduled) || 0,
        completed: Number(s?.completed) || 0,
        today: Number(s?.today) || 0,
        todayHours: Number(s?.todayHours) || 0,
        todaySales: Number(s?.todaySales) || 0,
        totalSales: Number(s?.totalSales) || 0,
      });
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load shifts"));
      setRows([]);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [
    search,
    statusFilter,
    periodFilter,
    employeeFilter,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    periodFilter !== "today" ||
    employeeFilter !== "all" ||
    !!dateFrom ||
    !!dateTo;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPeriodFilter("today");
    setEmployeeFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const previewHours = useMemo(
    () =>
      calculateHours(
        form.startTime,
        form.endTime,
        Number(form.breakHours) || 0,
      ),
    [form.startTime, form.endTime, form.breakHours],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (row: ShiftRow) => {
    const start =
      row.start_time || row.shift_time?.split("-")[0]?.trim() || "09:00";
    const end =
      row.end_time || row.shift_time?.split("-")[1]?.trim() || "17:00";
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

  const handleSubmit = async () => {
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
      toast.error(msg);
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const breakVal = Number(form.breakHours) || 0;
      const break_time = `${breakVal} hour${breakVal === 1 ? "" : "s"}`;
      const shift_time = `${form.startTime} - ${form.endTime}`;
      const payload: Record<string, unknown> = {
        shift_time,
        start_date: toUtcMidnightIso(parsed.data.date),
        break_time,
        sales: form.sales === "" ? 0 : Number(form.sales) || 0,
      };

      if (editing) {
        payload.end_date = form.markCompleted
          ? new Date().toISOString()
          : null;
        await apiClient.patch(`/shift-assignment/${editing.id}`, payload);
        toast.success("Shift updated");
      } else {
        payload.employee_id = parsed.data.employee_id;
        if (form.markCompleted) {
          payload.end_date = new Date().toISOString();
        }
        await apiClient.post("/shift-assignment", payload);
        toast.success("Shift scheduled");
      }
      setFormOpen(false);
      await fetchShifts();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to save shift"));
    } finally {
      setSubmitting(false);
    }
  };

  const openEnd = (row: ShiftRow) => {
    setEndTarget(row);
    setEndSales(row.sales ? String(row.sales) : "");
  };

  const handleEndShift = async () => {
    if (!endTarget) return;
    setEnding(true);
    try {
      await apiClient.patch(`/shift-assignment/${endTarget.id}/end`, {
        sales: endSales === "" ? 0 : Number(endSales) || 0,
      });
      toast.success("Shift ended");
      setEndTarget(null);
      if (detail?.id === endTarget.id) {
        setDetailOpen(false);
        setDetail(null);
      }
      await fetchShifts();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to end shift"));
    } finally {
      setEnding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/shift-assignment/${deleteTarget.id}`);
      toast.success("Shift deleted");
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) {
        setDetailOpen(false);
        setDetail(null);
      }
      await fetchShifts();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete shift"));
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
      rows.map((r) => [
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

  const statusChips: Array<{
    key: StatusFilter;
    label: string;
    count: number;
  }> = [
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

  if (initialLoading) {
    return <PageLoader message="Loading shifts..." />;
  }

  const renderActions = (row: ShiftRow) => (
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
      {row.status !== "completed" && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          disabled={actionId === row.id}
          onClick={() => {
            setActionId(row.id);
            openEnd(row);
            setActionId(null);
          }}
        >
          End
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
        onClick={() => setDeleteTarget(row)}
      >
        Delete
      </Button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Staff
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Shift Management
          </h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Schedule staff shifts, track active coverage, and close completed
            days
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
            Schedule Shift
          </Button>
        </div>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && rows.length === 0}
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
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {chip.label}
              <span className="tabular-nums text-gray-500">{chip.count}</span>
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
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {chip.label}
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
                  "h-9 justify-start text-left font-normal w-full sm:w-[150px]",
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
                  "h-9 justify-start text-left font-normal w-full sm:w-[150px]",
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
              variant="ghost"
              className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              className="h-9 w-9"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="h-9 w-9"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-[240px]">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">
            Loading shifts…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 rounded-lg">
            <Clock className="h-8 w-8 text-gray-300 mb-2" />
            <p className="font-medium text-gray-800">No shifts found</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              Adjust filters or schedule a new shift for your staff.
            </p>
            <Button className="mt-4 h-9" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Shift
            </Button>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right min-w-[260px]">
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
                      {formatDate(row.start_date)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatTimeTo12Hour(row.start_time)} –{" "}
                      {formatTimeTo12Hour(row.end_time)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {(row.total_hours ?? 0).toFixed(1)}h
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(row.status)}
                      >
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.sales || 0)}
                    </TableCell>
                    <TableCell>{renderActions(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pageRows.map((row) => (
              <div
                key={row.id}
                className="border border-gray-200 rounded-lg p-4 bg-white space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {row.employee?.name || "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(row.start_date)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusBadgeClass(row.status)}
                  >
                    {statusLabel(row.status)}
                  </Badge>
                </div>
                <div className="text-sm text-gray-700">
                  {formatTimeTo12Hour(row.start_time)} –{" "}
                  {formatTimeTo12Hour(row.end_time)}
                  <span className="text-gray-400 mx-1.5">·</span>
                  {(row.total_hours ?? 0).toFixed(1)}h
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Sales</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(row.sales || 0)}
                  </span>
                </div>
                {renderActions(row)}
              </div>
            ))}
          </div>
        )}

        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-gray-500">
              Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
              {Math.min(pageSafe * PAGE_SIZE, rows.length)} of {rows.length}
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
      </div>

      {/* Create / Edit */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setFormError("");
          }
        }}
      >
        <DialogContent className={dialogClass}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit shift" : "Schedule shift"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update hours, break, sales, or completion status"
                : "Assign a shift to an employee for a specific date"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
              <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <p className="font-medium text-gray-900">
                  {editing.employee?.name || "Employee"}
                </p>
                <p className="text-xs text-gray-500">
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
                      "w-full justify-start text-left font-normal h-9",
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
                    onSelect={(d) =>
                      setForm((prev) => ({ ...prev, date: d }))
                    }
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
                          ? "border-blue-400 bg-blue-50/50"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                    >
                      <Icon className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-xs font-semibold text-gray-900">
                          {type.name}
                        </span>
                        <span className="block text-[10px] text-gray-500">
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
                    setForm((prev) => ({
                      ...prev,
                      breakHours: e.target.value,
                    }))
                  }
                  className={cn(
                    fieldControl,
                    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Net hours</Label>
                <div className="h-9 flex items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-900">
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
                className={cn(
                  fieldControl,
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                )}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={form.markCompleted}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    markCompleted: e.target.checked,
                  }))
                }
              />
              Mark as completed
            </label>

            {formError ? (
              <p className="text-xs text-red-600">{formError}</p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => setFormOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <LoadingButton
                className="h-9"
                loading={submitting}
                loadingText={editing ? "Saving…" : "Scheduling…"}
                onClick={handleSubmit}
              >
                {editing ? "Save changes" : "Schedule shift"}
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={dialogClass}>
          <DialogHeader>
            <DialogTitle>Shift details</DialogTitle>
            <DialogDescription>
              Coverage and sales for this assignment
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {detail.employee?.name || "—"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {detail.employee?.employee_code || "—"}
                    {detail.employee?.department?.name
                      ? ` · ${detail.employee.department.name}`
                      : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={statusBadgeClass(detail.status)}
                >
                  {statusLabel(detail.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-medium mt-0.5">
                    {formatDate(detail.start_date)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Hours</p>
                  <p className="font-medium mt-0.5">
                    {(detail.total_hours ?? 0).toFixed(1)}h
                  </p>
                </div>
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Start</p>
                  <p className="font-medium mt-0.5">
                    {formatTimeTo12Hour(detail.start_time)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">End</p>
                  <p className="font-medium mt-0.5">
                    {formatTimeTo12Hour(detail.end_time)}
                  </p>
                </div>
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Break</p>
                  <p className="font-medium mt-0.5">
                    {detail.break_time ||
                      `${detail.break_hours ?? 0} hour(s)`}
                  </p>
                </div>
                <div className="rounded-md border border-gray-100 p-3">
                  <p className="text-xs text-gray-500">Sales</p>
                  <p className="font-semibold mt-0.5 tabular-nums">
                    {formatMoney(detail.sales || 0)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {detail.status !== "completed" && (
                  <Button
                    variant="outline"
                    className="h-9"
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
                  className="h-9"
                  onClick={() => {
                    setDetailOpen(false);
                    openEdit(detail);
                  }}
                >
                  Edit
                </Button>
                <Button
                  className="h-9"
                  onClick={() => setDetailOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* End shift */}
      <Dialog
        open={!!endTarget}
        onOpenChange={(open) => {
          if (!open) setEndTarget(null);
        }}
      >
        <DialogContent className="grid w-[min(96vw,440px)] max-w-[440px] sm:max-w-[440px] gap-4 p-5">
          <DialogHeader>
            <DialogTitle>End shift</DialogTitle>
            <DialogDescription>
              Close this shift and record final sales
            </DialogDescription>
          </DialogHeader>
          {endTarget && (
            <div className="space-y-4">
              <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <p className="font-medium">{endTarget.employee?.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDate(endTarget.start_date)} ·{" "}
                  {formatTimeTo12Hour(endTarget.start_time)} –{" "}
                  {formatTimeTo12Hour(endTarget.end_time)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Final sales amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={endSales}
                  onChange={(e) => setEndSales(e.target.value)}
                  placeholder="0"
                  className={fieldControl}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={() => setEndTarget(null)}
                  disabled={ending}
                >
                  Cancel
                </Button>
                <LoadingButton
                  className="h-9"
                  loading={ending}
                  loadingText="Ending…"
                  onClick={handleEndShift}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  End shift
                </LoadingButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
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
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
