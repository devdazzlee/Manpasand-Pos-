"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { z } from "zod"
import { toast } from "sonner"
import {
  Search,
  Plus,
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  CalendarOff,
  List,
  LayoutGrid,
  X,
  CalendarIcon,
  Upload,
  Download,
  Mail,
  MapPin,
  Briefcase,
  User,
  Clock,
  Wallet,
  History,
} from "lucide-react"

import apiClient from "@/lib/apiClient"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LoadingButton } from "@/components/ui/loading-button"
import { PageLoader } from "@/components/ui/page-loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid"
import {
  downloadExcel,
  formatMoney,
} from "@/components/inventory/stock-ops/export-utils"
import {
  ExcelUploadDialog,
  type ExcelField,
} from "@/components/inventory/excel-upload-dialog"
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED"
type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN"
type StatusFilter = "all" | EmployeeStatus
type DetailTab = "overview" | "job" | "personal" | "shifts" | "salary" | "history"
type FormStep = "personal" | "job" | "emergency" | "review"
type SortKey = "name" | "join_date" | "status"

interface Employee {
  id: string
  employee_code?: string | null
  name: string
  email?: string | null
  phone_number?: string | null
  cnic?: string | null
  gender?: string | null
  join_date: string | Date | null
  is_active: boolean
  status: EmployeeStatus
  employment_type?: EmploymentType | null
  date_of_birth?: string | null
  address?: string | null
  personal_email?: string | null
  emergency_name?: string | null
  emergency_phone?: string | null
  photo_url?: string | null
  deactivated_at?: string | null
  deactivated_reason?: string | null
  department_id?: string | null
  employee_type_id: string
  reporting_manager_id?: string | null
  department?: { id: string; name: string } | null
  employee_type?: { id: string; name: string } | null
  reporting_manager?: {
    id: string
    name: string
    employee_code?: string | null
  } | null
  created_at?: string
}

interface NamedEntity {
  id: string
  name: string
  is_active?: boolean
}

interface ShiftAssignment {
  id: string
  employee_id: string
  shift_time: string
  start_date: string
  end_date?: string | null
  break_time?: string | null
  sales?: number
}

interface SalaryRow {
  id: string
  employee_id: string
  month: number
  year: number
  amount: number | string
  is_paid: boolean
  paid_date?: string | null
  notes?: string | null
  created_at?: string
}

interface EmployeeFormValues {
  name: string
  email: string
  phone_number: string
  personal_email: string
  gender: string
  cnic: string
  date_of_birth: Date | null
  address: string
  employee_type_id: string
  department_id: string
  employment_type: EmploymentType | ""
  join_date: Date | null
  reporting_manager_id: string
  status: EmployeeStatus
  emergency_name: string
  emergency_phone: string
}

type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20

const FORM_STEPS: FormStep[] = ["personal", "job", "emergency", "review"]

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
]

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "TERMINATED", label: "Terminated" },
]

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const

const MONTH_NAMES = [
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
]

const formDialogClass =
  "grid w-[min(96vw,640px)] max-w-[640px] sm:max-w-[640px] gap-4 p-5 sm:rounded-lg"
const detailDialogClass = cn(
  "w-[min(96vw,1180px)] max-w-[1180px] sm:max-w-[1180px]",
  "flex flex-col overflow-hidden max-h-[92vh]",
  "border border-gray-200 p-0 gap-0",
)
const fieldLabelClass = "text-xs font-medium text-gray-900"
const fieldControlClass = "h-9 rounded-md border-gray-200 text-sm"

const IMPORT_FIELDS: ExcelField[] = [
  { name: "name", required: true, description: "Full name" },
  { name: "email", required: false, description: "Work email" },
  { name: "phone_number", required: false, description: "Phone" },
  { name: "cnic", required: false, description: "CNIC / national ID" },
  { name: "gender", required: false, description: "Gender" },
  { name: "department", required: false, description: "Department name" },
  { name: "employee_type", required: false, description: "Designation name" },
  { name: "employment_type", required: false, description: "FULL_TIME | PART_TIME | CONTRACT | INTERN" },
  { name: "join_date", required: false, description: "Join date (YYYY-MM-DD)" },
]

const emptyForm = (): EmployeeFormValues => ({
  name: "",
  email: "",
  phone_number: "",
  personal_email: "",
  gender: "",
  cnic: "",
  date_of_birth: null,
  address: "",
  employee_type_id: "",
  department_id: "",
  employment_type: "",
  join_date: null,
  reporting_manager_id: "",
  status: "ACTIVE",
  emergency_name: "",
  emergency_phone: "",
})

const extractApiError = (err: unknown, fallback: string): string => {
  const data = (err as { response?: { data?: any }; message?: string })?.response?.data
  if (!data) {
    return (err as { message?: string })?.message || fallback
  }
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0]
    if (typeof first === "string") return first
    if (first?.message) return String(first.message)
  }
  if (typeof data.message === "string") return data.message
  return fallback
}

const toUtcMidnightIso = (d: Date): string =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString()

const parseDateValue = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const formatDisplayDate = (value: string | Date | null | undefined): string => {
  const d = parseDateValue(value)
  if (!d) return "—"
  const isCleanUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  if (isCleanUtcMidnight) {
    return format(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      "MMM d, yyyy",
    )
  }
  return format(d, "MMM d, yyyy")
}

const employmentLabel = (v?: EmploymentType | null): string =>
  EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label || "—"

const statusLabel = (s?: EmployeeStatus | null): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label || s || "—"

const statusBadgeClass = (status: EmployeeStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800 border-green-200"
    case "ON_LEAVE":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "INACTIVE":
      return "bg-gray-100 text-gray-700 border-gray-200"
    case "TERMINATED":
      return "bg-red-100 text-red-800 border-red-200"
    default:
      return "bg-gray-100 text-gray-700 border-gray-200"
  }
}

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

const unwrapList = (payload: unknown): any[] => {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object" && Array.isArray((payload as any).data)) {
    return (payload as any).data
  }
  return []
}

const cell = (row: Record<string, any>, ...keys: string[]): string => {
  const lowerMap = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) {
    lowerMap.set(k.toLowerCase().replace(/[\s_-]+/g, ""), String(v ?? "").trim())
  }
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[\s_-]+/g, "")
    const found = lowerMap.get(normalized)
    if (found) return found
  }
  return ""
}

const parseJoinDateFlexible = (raw: string): string | undefined => {
  if (!raw.trim()) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  return toUtcMidnightIso(d)
}

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: "Invalid email address",
  })

const personalStepSchema = z.object({
  name: z
    .string({ required_error: "Full name is required" })
    .trim()
    .min(2, "Full name must be at least 2 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .min(1, "Email is required")
    .email("Email is not valid"),
  phone_number: z.string().trim().optional(),
  personal_email: optionalEmail,
  gender: z.string().trim().optional(),
  cnic: z.string().trim().optional(),
  date_of_birth: z.date().nullable().optional(),
  address: z.string().trim().optional(),
})

const jobStepSchema = z.object({
  employee_type_id: z
    .string({ required_error: "Designation is required" })
    .uuid("Select a designation"),
  department_id: z.string().optional(),
  employment_type: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"])
    .optional()
    .or(z.literal("")),
  join_date: z.date({
    required_error: "Join date is required",
    invalid_type_error: "Join date is required",
  }),
  reporting_manager_id: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"]).optional(),
})

const emergencyStepSchema = z.object({
  emergency_name: z.string().trim().optional(),
  emergency_phone: z.string().trim().optional(),
})

const employeeFormSchema = personalStepSchema
  .merge(jobStepSchema)
  .merge(emergencyStepSchema)

const zodErrorsToMap = (err: z.ZodError): EmployeeFormErrors => {
  const map: EmployeeFormErrors = {}
  for (const issue of err.errors) {
    const key = issue.path[0]
    if (typeof key === "string" && !(key in map)) {
      ;(map as Record<string, string>)[key] = issue.message
    }
  }
  return map
}

const firstZodError = (err: z.ZodError): string =>
  err.errors[0]?.message || "Please check the form fields"

/* -------------------------------------------------------------------------- */
/* Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

function DatePickerField({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  error,
}: {
  id?: string
  value: Date | null
  onChange: (d: Date | null) => void
  disabled?: boolean
  placeholder?: string
  error?: string
}) {
  return (
    <div className="space-y-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              fieldControlClass,
              "w-full justify-start text-left font-normal",
              !value && "text-gray-500",
              error && "border-red-500 focus-visible:ring-red-500",
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
            {value ? format(value, "MMM d, yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={value ?? undefined}
            onSelect={(date) => onChange(date ?? null)}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right break-words min-w-0">
        {value || "—"}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export function EmployeeManagement() {
  const [list, setList] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<NamedEntity[]>([])
  const [employeeTypes, setEmployeeTypes] = useState<NamedEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [employmentFilter, setEmploymentFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmployeeFormValues>(emptyForm)
  const [formErrors, setFormErrors] = useState<EmployeeFormErrors>({})
  const [formStep, setFormStep] = useState<FormStep>("personal")
  const [submitting, setSubmitting] = useState(false)
  const [newDesignation, setNewDesignation] = useState("")
  const [newDepartment, setNewDepartment] = useState("")
  const [addingDesignation, setAddingDesignation] = useState(false)
  const [addingDepartment, setAddingDepartment] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [current, setCurrent] = useState<Employee | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>("overview")
  const [detailLoading, setDetailLoading] = useState(false)

  const [shifts, setShifts] = useState<ShiftAssignment[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [shiftTime, setShiftTime] = useState("09:00-17:00")
  const [shiftStart, setShiftStart] = useState<Date | null>(new Date())
  const [shiftBreak, setShiftBreak] = useState("1 hour")
  const [shiftSaving, setShiftSaving] = useState(false)
  const [endingShift, setEndingShift] = useState(false)

  const [salaries, setSalaries] = useState<SalaryRow[]>([])
  const [salariesLoading, setSalariesLoading] = useState(false)
  const [salaryMonth, setSalaryMonth] = useState(String(new Date().getMonth() + 1))
  const [salaryYear, setSalaryYear] = useState(String(new Date().getFullYear()))
  const [salaryAmount, setSalaryAmount] = useState("")
  const [salaryNotes, setSalaryNotes] = useState("")
  const [salarySaving, setSalarySaving] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [deactivateReason, setDeactivateReason] = useState("")
  const [deactivateStatus, setDeactivateStatus] = useState<"INACTIVE" | "TERMINATED">(
    "INACTIVE",
  )
  const [deactivating, setDeactivating] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)

  useScrollToTopOnPageChange(page)

  /* ---------- data fetch ---------- */

  const fetchEmployees = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const params: Record<string, string> = { fetch_all: "true" }
      if (search.trim()) params.search = search.trim()
      if (statusFilter !== "all") params.status = statusFilter
      if (departmentFilter !== "all") params.department_id = departmentFilter
      if (typeFilter !== "all") params.employee_type_id = typeFilter
      if (employmentFilter !== "all") params.employment_type = employmentFilter

      const res = await apiClient.get("/employee", { params })
      setList(unwrapList(res.data?.data))
    } catch (err) {
      toast.error("Failed to load employees", {
        description: extractApiError(err, "Could not fetch employees."),
      })
      setList([])
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [search, statusFilter, departmentFilter, typeFilter, employmentFilter])

  const fetchLookups = useCallback(async () => {
    try {
      const [typesRes, depsRes] = await Promise.all([
        apiClient.get("/employee/types"),
        apiClient.get("/employee/departments", { params: { fetch_all: "true" } }),
      ])
      setEmployeeTypes(unwrapList(typesRes.data?.data))
      setDepartments(unwrapList(depsRes.data?.data))
    } catch {
      setEmployeeTypes([])
      setDepartments([])
    }
  }, [])

  useEffect(() => {
    setIsInitialLoading(true)
    Promise.all([fetchEmployees(), fetchLookups()]).finally(() =>
      setIsInitialLoading(false),
    )
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isInitialLoading) return
    const t = setTimeout(() => {
      void fetchEmployees()
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [
    search,
    statusFilter,
    departmentFilter,
    typeFilter,
    employmentFilter,
    fetchEmployees,
    isInitialLoading,
  ])

  const fetchShifts = useCallback(async (employeeId: string) => {
    setShiftsLoading(true)
    try {
      const res = await apiClient.get(`/shift-assignment/history/${employeeId}`)
      setShifts(unwrapList(res.data?.data))
    } catch {
      setShifts([])
    } finally {
      setShiftsLoading(false)
    }
  }, [])

  const fetchSalaries = useCallback(async (employeeId: string) => {
    setSalariesLoading(true)
    try {
      const res = await apiClient.get("/salaries", {
        params: { employee_id: employeeId, limit: 100 },
      })
      setSalaries(unwrapList(res.data?.data))
    } catch {
      setSalaries([])
    } finally {
      setSalariesLoading(false)
    }
  }, [])

  const loadEmployeeDetail = useCallback(
    async (employeeId: string) => {
      setDetailLoading(true)
      try {
        const res = await apiClient.get(`/employee/${employeeId}`)
        const emp = res.data?.data as Employee
        setCurrent(emp)
        return emp
      } catch (err) {
        toast.error("Failed to load employee", {
          description: extractApiError(err, "Could not fetch details."),
        })
        return null
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  /* ---------- derived list ---------- */

  const stats = useMemo(() => {
    const total = list.length
    const active = list.filter((e) => e.status === "ACTIVE").length
    const inactive = list.filter((e) => e.status === "INACTIVE").length
    const onLeave = list.filter((e) => e.status === "ON_LEAVE").length
    const terminated = list.filter((e) => e.status === "TERMINATED").length
    return { total, active, inactive, onLeave, terminated }
  }, [list])

  const sorted = useMemo(() => {
    const rows = [...list]
    rows.sort((a, b) => {
      if (sortKey === "name") {
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        })
      }
      if (sortKey === "status") {
        return (a.status || "").localeCompare(b.status || "")
      }
      const da = parseDateValue(a.join_date)?.getTime() ?? 0
      const db = parseDateValue(b.join_date)?.getTime() ?? 0
      return db - da
    })
    return rows
  }, [list, sortKey])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pageRows = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const hasFilters =
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    typeFilter !== "all" ||
    employmentFilter !== "all" ||
    search.trim().length > 0

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setDepartmentFilter("all")
    setTypeFilter("all")
    setEmploymentFilter("all")
    setPage(1)
  }

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "ACTIVE", label: "Active", count: stats.active },
    { key: "INACTIVE", label: "Inactive", count: stats.inactive },
    { key: "ON_LEAVE", label: "On leave", count: stats.onLeave },
    { key: "TERMINATED", label: "Terminated", count: stats.terminated },
  ]

  /* ---------- form helpers ---------- */

  const setField = (patch: Partial<EmployeeFormValues>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const clearError = (field: keyof EmployeeFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormErrors({})
    setFormStep("personal")
    setNewDesignation("")
    setNewDepartment("")
    setFormOpen(true)
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      phone_number: emp.phone_number || "",
      personal_email: emp.personal_email || "",
      gender: emp.gender || "",
      cnic: emp.cnic || "",
      date_of_birth: parseDateValue(emp.date_of_birth),
      address: emp.address || "",
      employee_type_id: emp.employee_type_id || emp.employee_type?.id || "",
      department_id: emp.department_id || emp.department?.id || "",
      employment_type: emp.employment_type || "",
      join_date: parseDateValue(emp.join_date) || new Date(),
      reporting_manager_id: emp.reporting_manager_id || emp.reporting_manager?.id || "",
      status: emp.status || "ACTIVE",
      emergency_name: emp.emergency_name || "",
      emergency_phone: emp.emergency_phone || "",
    })
    setFormErrors({})
    setFormStep("personal")
    setNewDesignation("")
    setNewDepartment("")
    setFormOpen(true)
  }

  const validateStep = (step: FormStep): boolean => {
    let result: z.SafeParseReturnType<any, any>
    if (step === "personal") {
      result = personalStepSchema.safeParse(form)
    } else if (step === "job") {
      result = jobStepSchema.safeParse({
        ...form,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        employment_type: form.employment_type || undefined,
      })
    } else if (step === "emergency") {
      result = emergencyStepSchema.safeParse(form)
    } else {
      result = employeeFormSchema.safeParse({
        ...form,
        department_id: form.department_id || undefined,
        reporting_manager_id: form.reporting_manager_id || undefined,
        employment_type: form.employment_type || undefined,
      })
    }
    if (!result.success) {
      setFormErrors(zodErrorsToMap(result.error))
      toast.error("Please fix the form", { description: firstZodError(result.error) })
      return false
    }
    setFormErrors({})
    return true
  }

  const goNext = () => {
    const idx = FORM_STEPS.indexOf(formStep)
    if (formStep !== "review" && !validateStep(formStep)) return
    if (idx < FORM_STEPS.length - 1) setFormStep(FORM_STEPS[idx + 1]!)
  }

  const goBack = () => {
    const idx = FORM_STEPS.indexOf(formStep)
    if (idx > 0) setFormStep(FORM_STEPS[idx - 1]!)
  }

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      employee_type_id: form.employee_type_id,
      join_date: toUtcMidnightIso(form.join_date || new Date()),
    }
    if (form.phone_number.trim()) payload.phone_number = form.phone_number.trim()
    if (form.personal_email.trim()) payload.personal_email = form.personal_email.trim()
    if (form.gender.trim()) payload.gender = form.gender.trim()
    if (form.cnic.trim()) payload.cnic = form.cnic.trim()
    if (form.address.trim()) payload.address = form.address.trim()
    if (form.date_of_birth) payload.date_of_birth = toUtcMidnightIso(form.date_of_birth)
    if (form.department_id) payload.department_id = form.department_id
    if (form.employment_type) payload.employment_type = form.employment_type
    if (form.reporting_manager_id) {
      payload.reporting_manager_id = form.reporting_manager_id
    }
    if (form.emergency_name.trim()) payload.emergency_name = form.emergency_name.trim()
    if (form.emergency_phone.trim()) {
      payload.emergency_phone = form.emergency_phone.trim()
    }
    if (editing) payload.status = form.status
    return payload
  }

  const submitForm = async () => {
    if (!validateStep("review")) return
    setSubmitting(true)
    try {
      const payload = buildPayload()
      if (editing) {
        await apiClient.put(`/employee/${editing.id}`, payload)
        toast.success("Employee updated", {
          description: `${form.name.trim()} has been updated.`,
        })
      } else {
        await apiClient.post("/employee", payload)
        toast.success("Employee added", {
          description: `${form.name.trim()} has been added.`,
        })
      }
      setFormOpen(false)
      setEditing(null)
      setForm(emptyForm())
      await fetchEmployees({ silent: true })
      if (detailOpen && current && editing && current.id === editing.id) {
        await loadEmployeeDetail(current.id)
      }
    } catch (err) {
      toast.error(editing ? "Failed to update employee" : "Failed to add employee", {
        description: extractApiError(err, "Server rejected the request."),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddDesignation = async () => {
    const name = newDesignation.trim()
    if (name.length < 2) {
      toast.error("Enter a designation name")
      return
    }
    setAddingDesignation(true)
    try {
      const res = await apiClient.post("/employee/type", { name })
      const created = res.data?.data as NamedEntity
      await fetchLookups()
      if (created?.id) {
        setField({ employee_type_id: created.id })
        clearError("employee_type_id")
      }
      setNewDesignation("")
      toast.success("Designation added")
    } catch (err) {
      toast.error("Failed to add designation", {
        description: extractApiError(err, "Could not create designation."),
      })
    } finally {
      setAddingDesignation(false)
    }
  }

  const handleAddDepartment = async () => {
    const name = newDepartment.trim()
    if (name.length < 2) {
      toast.error("Enter a department name")
      return
    }
    setAddingDepartment(true)
    try {
      const res = await apiClient.post("/employee/departments", { name })
      const created = res.data?.data as NamedEntity
      await fetchLookups()
      if (created?.id) setField({ department_id: created.id })
      setNewDepartment("")
      toast.success("Department added")
    } catch (err) {
      toast.error("Failed to add department", {
        description: extractApiError(err, "Could not create department."),
      })
    } finally {
      setAddingDepartment(false)
    }
  }

  /* ---------- detail / actions ---------- */

  const openDetail = async (emp: Employee, tab: DetailTab = "overview") => {
    setDetailTab(tab)
    setDetailOpen(true)
    setCurrent(emp)
    const full = await loadEmployeeDetail(emp.id)
    const id = full?.id || emp.id
    if (tab === "shifts" || tab === "overview") void fetchShifts(id)
    if (tab === "salary") void fetchSalaries(id)
  }

  useEffect(() => {
    if (!detailOpen || !current?.id) return
    if (detailTab === "shifts") void fetchShifts(current.id)
    if (detailTab === "salary") void fetchSalaries(current.id)
  }, [detailTab, detailOpen, current?.id, fetchShifts, fetchSalaries])

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    if (!deactivateReason.trim()) {
      toast.error("Reason is required")
      return
    }
    setDeactivating(true)
    try {
      await apiClient.patch(`/employee/${deactivateTarget.id}/deactivate`, {
        reason: deactivateReason.trim(),
        status: deactivateStatus,
      })
      toast.success("Employee deactivated")
      setDeactivateTarget(null)
      setDeactivateReason("")
      await fetchEmployees({ silent: true })
      if (current?.id === deactivateTarget.id) {
        await loadEmployeeDetail(deactivateTarget.id)
      }
    } catch (err) {
      toast.error("Failed to deactivate", {
        description: extractApiError(err, "Could not deactivate employee."),
      })
    } finally {
      setDeactivating(false)
    }
  }

  const handleReactivate = async (emp: Employee) => {
    setReactivatingId(emp.id)
    try {
      await apiClient.patch(`/employee/${emp.id}/reactivate`)
      toast.success("Employee reactivated")
      await fetchEmployees({ silent: true })
      if (current?.id === emp.id) await loadEmployeeDetail(emp.id)
    } catch (err) {
      toast.error("Failed to reactivate", {
        description: extractApiError(err, "Could not reactivate employee."),
      })
    } finally {
      setReactivatingId(null)
    }
  }

  const assignShift = async () => {
    if (!current) return
    if (!shiftTime.trim()) {
      toast.error("Shift time is required")
      return
    }
    if (!shiftStart) {
      toast.error("Start date is required")
      return
    }
    setShiftSaving(true)
    try {
      const body: Record<string, unknown> = {
        employee_id: current.id,
        shift_time: shiftTime.trim(),
        start_date: toUtcMidnightIso(shiftStart),
      }
      if (shiftBreak.trim()) body.break_time = shiftBreak.trim()
      await apiClient.post("/shift-assignment", body)
      toast.success("Shift assigned")
      setShiftTime("09:00-17:00")
      setShiftBreak("1 hour")
      await fetchShifts(current.id)
    } catch (err) {
      toast.error("Failed to assign shift", {
        description: extractApiError(err, "Could not assign shift."),
      })
    } finally {
      setShiftSaving(false)
    }
  }

  const endCurrentShift = async () => {
    if (!current) return
    setEndingShift(true)
    try {
      await apiClient.patch(`/shift-assignment/end/${current.id}`)
      toast.success("Current shift ended")
      await fetchShifts(current.id)
    } catch (err) {
      toast.error("Failed to end shift", {
        description: extractApiError(err, "Could not end current shift."),
      })
    } finally {
      setEndingShift(false)
    }
  }

  const createSalary = async () => {
    if (!current) return
    const month = Number(salaryMonth)
    const year = Number(salaryYear)
    const amount = Number(salaryAmount)
    if (!month || month < 1 || month > 12) {
      toast.error("Select a valid month")
      return
    }
    if (!year || year < 2020) {
      toast.error("Enter a valid year")
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    setSalarySaving(true)
    try {
      await apiClient.post("/salaries", {
        employee_id: current.id,
        month,
        year,
        amount,
        notes: salaryNotes.trim() || undefined,
      })
      toast.success("Salary record created")
      setSalaryAmount("")
      setSalaryNotes("")
      await fetchSalaries(current.id)
    } catch (err) {
      toast.error("Failed to create salary", {
        description: extractApiError(err, "Could not create salary record."),
      })
    } finally {
      setSalarySaving(false)
    }
  }

  const markSalaryPaid = async (row: SalaryRow) => {
    setMarkingPaidId(row.id)
    try {
      await apiClient.put(`/salaries/${row.id}`, {
        is_paid: true,
        paid_date: new Date().toISOString(),
      })
      toast.success("Marked as paid")
      if (current) await fetchSalaries(current.id)
    } catch (err) {
      toast.error("Failed to mark paid", {
        description: extractApiError(err, "Could not update salary."),
      })
    } finally {
      setMarkingPaidId(null)
    }
  }

  /* ---------- import / export ---------- */

  const mapImportRow = (row: Record<string, any>): Record<string, unknown> | null => {
    const name = cell(row, "name", "full_name", "employee_name")
    if (!name || name.length < 2) return null

    const departmentName = cell(row, "department", "department_name")
    const typeName = cell(row, "employee_type", "designation", "employee_type_name", "type")
    const employmentRaw = cell(row, "employment_type", "employment").toUpperCase().replace(
      /[\s-]+/g,
      "_",
    )

    const department_id = departmentName
      ? departments.find(
          (d) => d.name.toLowerCase() === departmentName.toLowerCase(),
        )?.id
      : cell(row, "department_id") || undefined

    const employee_type_id = typeName
      ? employeeTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase())?.id
      : cell(row, "employee_type_id") || undefined

    const employment_type = (
      ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as EmploymentType[]
    ).includes(employmentRaw as EmploymentType)
      ? (employmentRaw as EmploymentType)
      : undefined

    const joinRaw = cell(row, "join_date", "joindate", "date_joined")
    const payload: Record<string, unknown> = {
      name,
      email: cell(row, "email", "work_email") || undefined,
      phone_number: cell(row, "phone_number", "phone", "mobile") || undefined,
      cnic: cell(row, "cnic", "national_id") || undefined,
      gender: cell(row, "gender") || undefined,
      join_date: parseJoinDateFlexible(joinRaw),
    }
    if (department_id) payload.department_id = department_id
    if (employee_type_id) payload.employee_type_id = employee_type_id
    if (employment_type) payload.employment_type = employment_type
    return payload
  }

  const handleImportRow = async (
    row: Record<string, any>,
  ): Promise<{ ok: boolean; error?: string }> => {
    const mapped = mapImportRow(row)
    if (!mapped) {
      return { ok: false, error: "Name is required (min 2 characters)" }
    }
    try {
      await apiClient.post("/employee/import", { rows: [mapped] })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: extractApiError(err, "Import failed") }
    }
  }

  const downloadImportTemplate = () => {
    downloadExcel(
      "employee-import-template.xlsx",
      "Employees",
      [
        "name",
        "email",
        "phone_number",
        "cnic",
        "gender",
        "department",
        "employee_type",
        "employment_type",
        "join_date",
      ],
      [
        [
          "Ali Khan",
          "ali@example.com",
          "03001234567",
          "42101-1234567-1",
          "Male",
          "Sales",
          "Cashier",
          "FULL_TIME",
          "2024-01-15",
        ],
      ],
    )
  }

  const handleExport = () => {
    if (sorted.length === 0) {
      toast.error("Nothing to export")
      return
    }
    downloadExcel(
      `employees-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Employees",
      [
        "code",
        "name",
        "email",
        "phone",
        "designation",
        "department",
        "status",
        "employment_type",
        "join_date",
      ],
      sorted.map((e) => [
        e.employee_code || "",
        e.name || "",
        e.email || "",
        e.phone_number || "",
        e.employee_type?.name || "",
        e.department?.name || "",
        e.status || "",
        e.employment_type || "",
        formatDisplayDate(e.join_date) === "—" ? "" : formatDisplayDate(e.join_date),
      ]),
    )
    toast.success(`Exported ${sorted.length} employees`)
  }

  const managerOptions = useMemo(
    () => list.filter((e) => !editing || e.id !== editing.id),
    [list, editing],
  )

  const typeNameById = (id?: string | null) =>
    employeeTypes.find((t) => t.id === id)?.name || "—"
  const deptNameById = (id?: string | null) =>
    departments.find((d) => d.id === id)?.name || "—"
  const managerNameById = (id?: string | null) =>
    list.find((e) => e.id === id)?.name || "—"

  const activeShift = shifts.find((s) => !s.end_date)

  /* ---------- render ---------- */

  if (isInitialLoading) {
    return <PageLoader message="Loading employees..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">Staff</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Employees
          </h1>
          <p className="text-sm text-gray-600 mt-0.5 break-words">
            Manage your roster, shift assignments, and salary records
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Button type="button" variant="outline" className="h-9" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button type="button" className="h-9" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <InventoryKpiGrid
        columns={4}
        loading={loading && list.length === 0}
        items={[
          {
            label: "Total",
            value: stats.total.toLocaleString(),
            icon: Users,
            hint: "All employees",
            onClick: () => {
              setStatusFilter("all")
              setPage(1)
            },
          },
          {
            label: "Active",
            value: stats.active.toLocaleString(),
            icon: CheckCircle2,
            tone: "success",
            hint: "Currently on roster",
            onClick: () => {
              setStatusFilter("ACTIVE")
              setPage(1)
            },
          },
          {
            label: "Inactive",
            value: stats.inactive.toLocaleString(),
            icon: XCircle,
            tone: "danger",
            hint: "Deactivated staff",
            onClick: () => {
              setStatusFilter("INACTIVE")
              setPage(1)
            },
          },
          {
            label: "On leave",
            value: stats.onLeave.toLocaleString(),
            icon: CalendarOff,
            tone: "warning",
            hint: "Temporarily away",
            onClick: () => {
              setStatusFilter("ON_LEAVE")
              setPage(1)
            },
          },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {statusChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setStatusFilter(chip.key)
                setPage(1)
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

        <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
          <Select
            value={departmentFilter}
            onValueChange={(v) => {
              setDepartmentFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-full xl:w-[180px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-full xl:w-[180px]">
              <SelectValue placeholder="Designation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All designations</SelectItem>
              {employeeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={employmentFilter}
            onValueChange={(v) => {
              setEmploymentFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-9 w-full xl:w-[180px]">
              <SelectValue placeholder="Employment type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employment types</SelectItem>
              {EMPLOYMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search name, code, email, phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
            />
          </div>

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

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-full xl:w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="join_date">Sort: Join date</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 xl:ml-auto border border-gray-200 rounded-md p-0.5 bg-white self-start">
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

      {/* List */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              Employee List{" "}
              <span className="font-normal text-gray-500">({sorted.length})</span>
            </p>
          </div>

          {loading && list.length === 0 ? (
            <div className="py-16">
              <PageLoader message="Loading employees..." />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">No employees found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try clearing filters or add a new employee.
              </p>
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[220px]">Employee</TableHead>
                    <TableHead className="min-w-[120px]">Designation</TableHead>
                    <TableHead className="min-w-[120px]">Department</TableHead>
                    <TableHead className="min-w-[110px]">Employment</TableHead>
                    <TableHead className="min-w-[110px]">Join date</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[320px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-gray-50/80">
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="bg-blue-50 text-blue-700 text-xs font-semibold">
                              {initials(emp.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{emp.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {emp.employee_code || "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-800">
                        {emp.employee_type?.name || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-800">
                        {emp.department?.name || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-800">
                        {employmentLabel(emp.employment_type)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {formatDisplayDate(emp.join_date)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(emp.status)}
                        >
                          {statusLabel(emp.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openDetail(emp, "overview")}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openEdit(emp)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openDetail(emp, "shifts")}
                          >
                            Shifts
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            onClick={() => openDetail(emp, "salary")}
                          >
                            Salary
                          </Button>
                          {emp.status === "ACTIVE" || emp.status === "ON_LEAVE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700"
                              onClick={() => {
                                setDeactivateTarget(emp)
                                setDeactivateReason("")
                                setDeactivateStatus("INACTIVE")
                              }}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs text-green-700 hover:text-green-800"
                              disabled={reactivatingId === emp.id}
                              onClick={() => handleReactivate(emp)}
                            >
                              {reactivatingId === emp.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Reactivate"
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {pageRows.map((emp) => (
                <div
                  key={emp.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-blue-50 text-blue-700 text-xs font-semibold">
                          {initials(emp.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.employee_code || "—"}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(statusBadgeClass(emp.status), "shrink-0")}
                    >
                      {statusLabel(emp.status)}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>Designation: {emp.employee_type?.name || "—"}</p>
                    <p>Department: {emp.department?.name || "—"}</p>
                    <p>Joined: {formatDisplayDate(emp.join_date)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openDetail(emp, "overview")}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openEdit(emp)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openDetail(emp, "shifts")}
                    >
                      Shifts
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openDetail(emp, "salary")}
                    >
                      Salary
                    </Button>
                    {emp.status === "ACTIVE" || emp.status === "ON_LEAVE" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600"
                        onClick={() => {
                          setDeactivateTarget(emp)
                          setDeactivateReason("")
                          setDeactivateStatus("INACTIVE")
                        }}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-green-700"
                        disabled={reactivatingId === emp.id}
                        onClick={() => handleReactivate(emp)}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
                {Math.min(pageSafe * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-gray-600 tabular-nums">
                  {pageSafe} / {totalPages}
                </span>
                <Button
                  type="button"
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

      {/* Add / Edit multi-step dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditing(null)
            setFormErrors({})
            setFormStep("personal")
          }
        }}
      >
        <DialogContent className={formDialogClass}>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {editing ? "Edit Employee" : "Add Employee"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Step {FORM_STEPS.indexOf(formStep) + 1} of {FORM_STEPS.length}:{" "}
              {formStep === "personal"
                ? "Personal"
                : formStep === "job"
                  ? "Job"
                  : formStep === "emergency"
                    ? "Emergency"
                    : "Review"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 mb-1">
            {FORM_STEPS.map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  FORM_STEPS.indexOf(s) <= FORM_STEPS.indexOf(formStep)
                    ? "bg-blue-600"
                    : "bg-gray-200",
                )}
              />
            ))}
          </div>

          {formStep === "personal" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Full name<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      setField({ name: e.target.value })
                      clearError("name")
                    }}
                    className={cn(fieldControlClass, formErrors.name && "border-red-500")}
                    placeholder="Enter full name"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.name} />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Email<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setField({ email: e.target.value })
                      clearError("email")
                    }}
                    className={cn(fieldControlClass, formErrors.email && "border-red-500")}
                    placeholder="work@email.com"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.email} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Phone</Label>
                  <Input
                    value={form.phone_number}
                    onChange={(e) => setField({ phone_number: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Phone number"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Personal email</Label>
                  <Input
                    type="email"
                    value={form.personal_email}
                    onChange={(e) => {
                      setField({ personal_email: e.target.value })
                      clearError("personal_email")
                    }}
                    className={cn(
                      fieldControlClass,
                      formErrors.personal_email && "border-red-500",
                    )}
                    placeholder="personal@email.com"
                    disabled={submitting}
                  />
                  <FieldError message={formErrors.personal_email} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Gender</Label>
                  <Select
                    value={form.gender || undefined}
                    onValueChange={(v) => setField({ gender: v })}
                    disabled={submitting}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>CNIC</Label>
                  <Input
                    value={form.cnic}
                    onChange={(e) => setField({ cnic: e.target.value })}
                    className={fieldControlClass}
                    placeholder="National ID"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Date of birth</Label>
                  <DatePickerField
                    value={form.date_of_birth}
                    onChange={(d) => setField({ date_of_birth: d })}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1 sm:col-span-1">
                  <Label className={fieldLabelClass}>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setField({ address: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Address"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          )}

          {formStep === "job" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className={fieldLabelClass}>
                  Designation<span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.employee_type_id || undefined}
                  onValueChange={(v) => {
                    setField({ employee_type_id: v })
                    clearError("employee_type_id")
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger
                    className={cn(
                      fieldControlClass,
                      formErrors.employee_type_id && "border-red-500",
                    )}
                  >
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={formErrors.employee_type_id} />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
                  <span className="text-xs text-gray-500 shrink-0">Or add new:</span>
                  <Input
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    placeholder="e.g. Cashier"
                    disabled={submitting || addingDesignation}
                    className={cn(fieldControlClass, "flex-1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-xs shrink-0"
                    onClick={handleAddDesignation}
                    disabled={submitting || addingDesignation}
                  >
                    {addingDesignation ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className={fieldLabelClass}>Department</Label>
                <Select
                  value={form.department_id || undefined}
                  onValueChange={(v) => setField({ department_id: v })}
                  disabled={submitting}
                >
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
                  <span className="text-xs text-gray-500 shrink-0">Or add new:</span>
                  <Input
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="e.g. Sales"
                    disabled={submitting || addingDepartment}
                    className={cn(fieldControlClass, "flex-1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-3 text-xs shrink-0"
                    onClick={handleAddDepartment}
                    disabled={submitting || addingDepartment}
                  >
                    {addingDepartment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Employment type</Label>
                  <Select
                    value={form.employment_type || undefined}
                    onValueChange={(v) =>
                      setField({ employment_type: v as EmploymentType })
                    }
                    disabled={submitting}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>
                    Join date<span className="text-red-500">*</span>
                  </Label>
                  <DatePickerField
                    value={form.join_date}
                    onChange={(d) => {
                      setField({ join_date: d })
                      clearError("join_date")
                    }}
                    disabled={submitting}
                    error={formErrors.join_date}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Reporting manager</Label>
                  <Select
                    value={form.reporting_manager_id || undefined}
                    onValueChange={(v) => setField({ reporting_manager_id: v })}
                    disabled={submitting}
                  >
                    <SelectTrigger className={fieldControlClass}>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.employee_code ? ` (${m.employee_code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editing && (
                  <div className="space-y-1">
                    <Label className={fieldLabelClass}>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setField({ status: v as EmployeeStatus })}
                      disabled={submitting}
                    >
                      <SelectTrigger className={fieldControlClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {formStep === "emergency" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Emergency contact name</Label>
                  <Input
                    value={form.emergency_name}
                    onChange={(e) => setField({ emergency_name: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Contact name"
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label className={fieldLabelClass}>Emergency phone</Label>
                  <Input
                    value={form.emergency_phone}
                    onChange={(e) => setField({ emergency_phone: e.target.value })}
                    className={fieldControlClass}
                    placeholder="Contact phone"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          )}

          {formStep === "review" && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Review details
              </p>
              <ReadOnlyRow label="Name" value={form.name} />
              <ReadOnlyRow label="Email" value={form.email} />
              <ReadOnlyRow label="Phone" value={form.phone_number || "—"} />
              <ReadOnlyRow label="Designation" value={typeNameById(form.employee_type_id)} />
              <ReadOnlyRow label="Department" value={deptNameById(form.department_id)} />
              <ReadOnlyRow
                label="Employment"
                value={employmentLabel(form.employment_type || null)}
              />
              <ReadOnlyRow
                label="Join date"
                value={form.join_date ? format(form.join_date, "MMM d, yyyy") : "—"}
              />
              <ReadOnlyRow
                label="Manager"
                value={managerNameById(form.reporting_manager_id)}
              />
              <ReadOnlyRow label="Emergency" value={form.emergency_name || "—"} />
              {editing && <ReadOnlyRow label="Status" value={statusLabel(form.status)} />}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {formStep !== "personal" && (
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 text-sm"
                onClick={goBack}
                disabled={submitting}
              >
                Back
              </Button>
            )}
            {formStep !== "review" ? (
              <Button
                type="button"
                className="h-10 flex-[1.4] text-sm"
                onClick={goNext}
                disabled={submitting}
              >
                Continue
              </Button>
            ) : (
              <LoadingButton
                className="h-10 flex-[1.4] text-sm"
                loading={submitting}
                onClick={submitForm}
              >
                {editing ? "Update Employee" : "Create Employee"}
              </LoadingButton>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false)
            setCurrent(null)
            setShifts([])
            setSalaries([])
          }
        }}
      >
        <DialogContent className={detailDialogClass}>
          {current && (
            <>
              <div className="shrink-0 bg-white border-b border-gray-200 px-5 pt-5 pb-0 pr-12">
                <DialogHeader className="space-y-2 text-left pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarFallback className="bg-blue-50 text-blue-700 font-semibold">
                          {initials(current.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <DialogTitle className="text-xl font-bold text-gray-900 truncate pr-2">
                          {current.name}
                        </DialogTitle>
                        <DialogDescription className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
                          <span>{current.employee_code || "No code"}</span>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(current.status)}
                          >
                            {statusLabel(current.status)}
                          </Badge>
                          {current.employee_type?.name && (
                            <span className="inline-flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5" />
                              {current.employee_type.name}
                            </span>
                          )}
                        </DialogDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openEdit(current)}
                      >
                        Edit
                      </Button>
                      {current.status === "ACTIVE" || current.status === "ON_LEAVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-red-600"
                          onClick={() => {
                            setDeactivateTarget(current)
                            setDeactivateReason("")
                            setDeactivateStatus("INACTIVE")
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-green-700"
                          disabled={reactivatingId === current.id}
                          onClick={() => handleReactivate(current)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                <Tabs
                  value={detailTab}
                  onValueChange={(v) => setDetailTab(v as DetailTab)}
                  className="w-full"
                >
                  <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0 border-0 overflow-x-auto">
                    {(
                      [
                        { key: "overview", label: "Overview" },
                        { key: "job", label: "Job" },
                        { key: "personal", label: "Personal" },
                        { key: "shifts", label: "Shifts" },
                        { key: "salary", label: "Salary" },
                        { key: "history", label: "History" },
                      ] as const
                    ).map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className={cn(
                          "rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 shadow-none",
                          "data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:shadow-none",
                        )}
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0 min-w-0">
                {detailLoading && (
                  <div className="py-8">
                    <PageLoader message="Loading details..." />
                  </div>
                )}

                {!detailLoading && detailTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        Identity
                      </h3>
                      <ReadOnlyRow label="Name" value={current.name} />
                      <ReadOnlyRow label="Code" value={current.employee_code || "—"} />
                      <ReadOnlyRow label="Email" value={current.email || "—"} />
                      <ReadOnlyRow label="Phone" value={current.phone_number || "—"} />
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        Role
                      </h3>
                      <ReadOnlyRow
                        label="Status"
                        value={
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(current.status)}
                          >
                            {statusLabel(current.status)}
                          </Badge>
                        }
                      />
                      <ReadOnlyRow
                        label="Department"
                        value={current.department?.name || "—"}
                      />
                      <ReadOnlyRow
                        label="Designation"
                        value={current.employee_type?.name || "—"}
                      />
                      <ReadOnlyRow
                        label="Join date"
                        value={formatDisplayDate(current.join_date)}
                      />
                    </div>
                    {(current.deactivated_reason || current.deactivated_at) && (
                      <div className="rounded-lg border border-red-100 bg-red-50/40 p-4 space-y-2 md:col-span-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">
                          Deactivation
                        </h3>
                        <ReadOnlyRow
                          label="Deactivated at"
                          value={formatDisplayDate(current.deactivated_at)}
                        />
                        <ReadOnlyRow
                          label="Reason"
                          value={current.deactivated_reason || "—"}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!detailLoading && detailTab === "job" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(current)}>
                        Edit
                      </Button>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <ReadOnlyRow
                        label="Designation"
                        value={current.employee_type?.name || "—"}
                      />
                      <ReadOnlyRow
                        label="Department"
                        value={current.department?.name || "—"}
                      />
                      <ReadOnlyRow
                        label="Employment type"
                        value={employmentLabel(current.employment_type)}
                      />
                      <ReadOnlyRow
                        label="Join date"
                        value={formatDisplayDate(current.join_date)}
                      />
                      <ReadOnlyRow
                        label="Reporting manager"
                        value={
                          current.reporting_manager
                            ? `${current.reporting_manager.name}${
                                current.reporting_manager.employee_code
                                  ? ` (${current.reporting_manager.employee_code})`
                                  : ""
                              }`
                            : "—"
                        }
                      />
                      <ReadOnlyRow label="Status" value={statusLabel(current.status)} />
                    </div>
                  </div>
                )}

                {!detailLoading && detailTab === "personal" && (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(current)}>
                        Edit
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          Contact
                        </h3>
                        <ReadOnlyRow label="Email" value={current.email || "—"} />
                        <ReadOnlyRow
                          label="Personal email"
                          value={current.personal_email || "—"}
                        />
                        <ReadOnlyRow label="Phone" value={current.phone_number || "—"} />
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          Profile
                        </h3>
                        <ReadOnlyRow label="Gender" value={current.gender || "—"} />
                        <ReadOnlyRow label="CNIC" value={current.cnic || "—"} />
                        <ReadOnlyRow
                          label="Date of birth"
                          value={formatDisplayDate(current.date_of_birth)}
                        />
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 space-y-3 md:col-span-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          Address & emergency
                        </h3>
                        <ReadOnlyRow label="Address" value={current.address || "—"} />
                        <ReadOnlyRow
                          label="Emergency name"
                          value={current.emergency_name || "—"}
                        />
                        <ReadOnlyRow
                          label="Emergency phone"
                          value={current.emergency_phone || "—"}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!detailLoading && detailTab === "shifts" && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Assign shift
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Shift time</Label>
                          <Input
                            value={shiftTime}
                            onChange={(e) => setShiftTime(e.target.value)}
                            placeholder="09:00-17:00"
                            className={fieldControlClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Start date</Label>
                          <DatePickerField
                            value={shiftStart}
                            onChange={setShiftStart}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Break time</Label>
                          <Input
                            value={shiftBreak}
                            onChange={(e) => setShiftBreak(e.target.value)}
                            placeholder="1 hour"
                            className={fieldControlClass}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <LoadingButton
                          loading={shiftSaving}
                          className="h-9 text-sm"
                          onClick={assignShift}
                        >
                          Assign shift
                        </LoadingButton>
                        <LoadingButton
                          loading={endingShift}
                          variant="outline"
                          className="h-9 text-sm"
                          onClick={endCurrentShift}
                          disabled={!activeShift}
                        >
                          End current shift
                        </LoadingButton>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">Shift history</p>
                      </div>
                      {shiftsLoading ? (
                        <div className="py-10">
                          <PageLoader message="Loading shifts..." />
                        </div>
                      ) : shifts.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-10">
                          No shift assignments yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Shift</TableHead>
                                <TableHead>Start</TableHead>
                                <TableHead>End</TableHead>
                                <TableHead>Break</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {shifts.map((s) => (
                                <TableRow key={s.id}>
                                  <TableCell className="font-medium">
                                    {s.shift_time}
                                  </TableCell>
                                  <TableCell>{formatDisplayDate(s.start_date)}</TableCell>
                                  <TableCell>
                                    {s.end_date ? formatDisplayDate(s.end_date) : "—"}
                                  </TableCell>
                                  <TableCell>{s.break_time || "—"}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={
                                        s.end_date
                                          ? "bg-gray-100 text-gray-700 border-gray-200"
                                          : "bg-green-100 text-green-800 border-green-200"
                                      }
                                    >
                                      {s.end_date ? "Ended" : "Current"}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!detailLoading && detailTab === "salary" && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        Add salary record
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Month</Label>
                          <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                            <SelectTrigger className={fieldControlClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MONTH_NAMES.map((m, i) => (
                                <SelectItem key={m} value={String(i + 1)}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Year</Label>
                          <Input
                            type="number"
                            value={salaryYear}
                            onChange={(e) => setSalaryYear(e.target.value)}
                            className={fieldControlClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Amount</Label>
                          <Input
                            type="number"
                            value={salaryAmount}
                            onChange={(e) => setSalaryAmount(e.target.value)}
                            className={fieldControlClass}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={fieldLabelClass}>Notes</Label>
                          <Input
                            value={salaryNotes}
                            onChange={(e) => setSalaryNotes(e.target.value)}
                            className={fieldControlClass}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <LoadingButton
                        loading={salarySaving}
                        className="h-9 text-sm"
                        onClick={createSalary}
                      >
                        Save salary
                      </LoadingButton>
                    </div>

                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">Salary history</p>
                      </div>
                      {salariesLoading ? (
                        <div className="py-10">
                          <PageLoader message="Loading salaries..." />
                        </div>
                      ) : salaries.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-10">
                          No salary records yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Period</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Paid</TableHead>
                                <TableHead>Paid date</TableHead>
                                <TableHead>Notes</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {salaries.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="font-medium">
                                    {MONTH_NAMES[(row.month || 1) - 1] || row.month}{" "}
                                    {row.year}
                                  </TableCell>
                                  <TableCell className="tabular-nums">
                                    {formatMoney(row.amount)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={
                                        row.is_paid
                                          ? "bg-green-100 text-green-800 border-green-200"
                                          : "bg-amber-100 text-amber-800 border-amber-200"
                                      }
                                    >
                                      {row.is_paid ? "Paid" : "Unpaid"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {row.paid_date
                                      ? formatDisplayDate(row.paid_date)
                                      : "—"}
                                  </TableCell>
                                  <TableCell className="max-w-[160px] truncate">
                                    {row.notes || "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {!row.is_paid && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        disabled={markingPaidId === row.id}
                                        onClick={() => markSalaryPaid(row)}
                                      >
                                        {markingPaidId === row.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          "Mark paid"
                                        )}
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!detailLoading && detailTab === "history" && (
                  <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" />
                      Employment history
                    </h3>
                    <ReadOnlyRow
                      label="Created at"
                      value={formatDisplayDate(current.created_at)}
                    />
                    <ReadOnlyRow label="Status" value={statusLabel(current.status)} />
                    <ReadOnlyRow
                      label="Deactivated at"
                      value={formatDisplayDate(current.deactivated_at)}
                    />
                    <ReadOnlyRow
                      label="Deactivation reason"
                      value={current.deactivated_reason || "—"}
                    />
                    <ReadOnlyRow
                      label="Join date"
                      value={formatDisplayDate(current.join_date)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Soft deactivate */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null)
            setDeactivateReason("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Soft-deactivate{" "}
              <span className="font-medium text-gray-900">
                {deactivateTarget?.name}
              </span>
              . They will no longer appear as active on the roster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className={fieldLabelClass}>
                Status<span className="text-red-500">*</span>
              </Label>
              <Select
                value={deactivateStatus}
                onValueChange={(v) =>
                  setDeactivateStatus(v as "INACTIVE" | "TERMINATED")
                }
              >
                <SelectTrigger className={fieldControlClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={fieldLabelClass}>
                Reason<span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="Why is this employee being deactivated?"
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivating || !deactivateReason.trim()}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                void confirmDeactivate()
              }}
            >
              {deactivating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import */}
      <ExcelUploadDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import employees from Excel"
        description={
          <>
            Upload a spreadsheet to create employees in bulk. Department and designation
            columns are matched by name against your existing lookups.
          </>
        }
        fields={IMPORT_FIELDS}
        footnote={
          <>
            Accepted headers include <span className="font-medium">name</span>,{" "}
            <span className="font-medium">email</span>,{" "}
            <span className="font-medium">phone_number</span>,{" "}
            <span className="font-medium">department</span>,{" "}
            <span className="font-medium">employee_type</span>, and{" "}
            <span className="font-medium">employment_type</span>.
          </>
        }
        nameColumns={["name", "Name", "full_name", "employee_name"]}
        onRow={handleImportRow}
        onBatchComplete={({ ok, failed, total }) => {
          void fetchEmployees({ silent: true })
          if (failed === 0) {
            toast.success(`Imported ${ok} of ${total} employee${total === 1 ? "" : "s"}`)
          } else if (ok === 0) {
            toast.error(`All ${total} rows failed — see the list for details`)
          } else {
            toast.warning(`Imported ${ok} of ${total}, ${failed} failed`)
          }
        }}
        onDownloadTemplate={downloadImportTemplate}
      />
    </div>
  )
}
