"use client"

import { useEffect, useState, type ReactNode } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Plus, Edit, Trash2, Loader2, Users, CalendarIcon } from "lucide-react"
import apiClient from "@/lib/apiClient"
// sonner is the toast system that's already mounted in app/layout.tsx with
// richColors + bottom-right position. The shadcn useToast() variant in this
// project was not rendering reliably, so we standardize on sonner here.
import { toast } from "sonner"
import { PageLoader } from "@/components/ui/page-loader"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Client-side schema. Mirrors the backend's createEmployeeSchema so the user
// gets instant feedback on obvious mistakes before we hit the network, but
// the backend stays authoritative — any server-side rejection bubbles up
// verbatim in the toast (we never invent a friendlier message).
const employeeFormSchema = z.object({
  name: z
    .string({ required_error: "Full name is required" })
    .refine((v) => v.trim().length >= 2, {
      message: "Full name must be at least 2 characters",
    }),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .min(1, "Email is required")
    .email("Email is not valid"),
  phone_number: z.string().trim().optional(),
  cnic: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  join_date: z.preprocess(
    (v) => (v instanceof Date ? v : undefined),
    z.date().optional(),
  ),
  employee_type_id: z.string().uuid().optional().or(z.literal("")),
})

const employeeDialogContentClass =
  "grid w-[min(580px,calc(100vw-2rem))] max-w-none gap-4 p-5 sm:rounded-lg"
const employeeDialogTitleClass = "text-base font-semibold text-gray-900"
const employeeFieldLabelClass = "text-xs font-medium text-gray-900"
const employeeFieldControlClass = "h-9 rounded-md border-gray-200 text-sm"
const employeeDialogFooterClass = "gap-2 sm:justify-end pt-1"
const employeeDialogButtonClass = "h-9 px-4 text-xs"

const firstZodError = (err: z.ZodError): string =>
  err.errors[0]?.message || "Please check the form fields"

const toUtcMidnightIso = (d: Date): string =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString()

const formatJoinDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return "-"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  const isCleanUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  const y = isCleanUtcMidnight ? d.getUTCFullYear() : d.getFullYear()
  const m = String((isCleanUtcMidnight ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, "0")
  const day = String(isCleanUtcMidnight ? d.getUTCDate() : d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

type EmployeeFormErrors = Partial<
  Record<
    "name" | "email" | "phone_number" | "cnic" | "gender" | "join_date" | "employee_type_id",
    string
  >
>

interface EmployeeFormValues {
  name: string
  email: string
  phone_number: string
  cnic: string
  gender: string
  join_date: Date | null
  employee_type_id: string
}

interface EmployeeType {
  id: string
  name: string
}

interface EmployeeFormFieldsProps {
  idPrefix: string
  values: EmployeeFormValues
  errors: EmployeeFormErrors
  onChange: (patch: Partial<EmployeeFormValues>) => void
  onClearError: (field: keyof EmployeeFormErrors) => void
  employeeTypes: EmployeeType[]
  typesLoading: boolean
  actionLoading: boolean
  designationName: string
  onDesignationNameChange: (value: string) => void
  onAddDesignation: () => void
  addingDesignation: boolean
}

function EmployeeFormFields({
  idPrefix,
  values,
  errors,
  onChange,
  onClearError,
  employeeTypes,
  typesLoading,
  actionLoading,
  designationName,
  onDesignationNameChange,
  onAddDesignation,
  addingDesignation,
}: EmployeeFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-name`} className={employeeFieldLabelClass}>
            Full Name<span className="text-red-500">*</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={values.name}
            onChange={(e) => {
              onChange({ name: e.target.value })
              if (errors.name) onClearError("name")
            }}
            placeholder="Enter full name"
            disabled={actionLoading}
            aria-invalid={errors.name ? true : undefined}
            className={cn(
              employeeFieldControlClass,
              errors.name && "border-red-500 focus-visible:ring-red-500",
            )}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600" role="alert">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-email`} className={employeeFieldLabelClass}>
            Email<span className="text-red-500">*</span>
          </Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={values.email}
            onChange={(e) => {
              onChange({ email: e.target.value })
              if (errors.email) onClearError("email")
            }}
            placeholder="Enter email address"
            disabled={actionLoading}
            aria-invalid={errors.email ? true : undefined}
            className={cn(
              employeeFieldControlClass,
              errors.email && "border-red-500 focus-visible:ring-red-500",
            )}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600" role="alert">{errors.email}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-join_date`} className={employeeFieldLabelClass}>
            Join Date (optional)
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={`${idPrefix}-join_date`}
                variant="outline"
                disabled={actionLoading}
                className={cn(
                  employeeFieldControlClass,
                  "w-full justify-start text-left font-normal",
                  !values.join_date && "text-gray-500",
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
                {values.join_date ? formatJoinDate(values.join_date) : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={values.join_date ?? undefined}
                onSelect={(date) => {
                  onChange({ join_date: date ?? null })
                  if (errors.join_date) onClearError("join_date")
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-phone_number`} className={employeeFieldLabelClass}>
            Phone (optional)
          </Label>
          <Input
            id={`${idPrefix}-phone_number`}
            value={values.phone_number}
            onChange={(e) => onChange({ phone_number: e.target.value })}
            placeholder="Phone number"
            disabled={actionLoading}
            className={employeeFieldControlClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-cnic`} className={employeeFieldLabelClass}>
            CNIC (optional)
          </Label>
          <Input
            id={`${idPrefix}-cnic`}
            value={values.cnic}
            onChange={(e) => onChange({ cnic: e.target.value })}
            placeholder="CNIC"
            disabled={actionLoading}
            className={employeeFieldControlClass}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-gender`} className={employeeFieldLabelClass}>
            Gender (optional)
          </Label>
          <Input
            id={`${idPrefix}-gender`}
            value={values.gender}
            onChange={(e) => onChange({ gender: e.target.value })}
            placeholder="Gender"
            disabled={actionLoading}
            className={employeeFieldControlClass}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-employee_type_id`} className={employeeFieldLabelClass}>
          Employee designation (optional)
        </Label>
        <Select
          value={values.employee_type_id || undefined}
          onValueChange={(val) => {
            onChange({ employee_type_id: val })
            if (errors.employee_type_id) onClearError("employee_type_id")
          }}
          disabled={actionLoading || typesLoading}
        >
          <SelectTrigger id={`${idPrefix}-employee_type_id`} className={employeeFieldControlClass}>
            <SelectValue placeholder={typesLoading ? "Loading..." : "Select designation"} />
          </SelectTrigger>
          <SelectContent>
            {employeeTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-gray-500 shrink-0">Or add new:</span>
          <Input
            value={designationName}
            onChange={(e) => onDesignationNameChange(e.target.value)}
            placeholder="e.g. Cashier, Manager"
            disabled={actionLoading || addingDesignation}
            className={cn(employeeFieldControlClass, "flex-1")}
          />
          <Button
            type="button"
            variant="outline"
            className={cn(employeeDialogButtonClass, "shrink-0")}
            onClick={onAddDesignation}
            disabled={actionLoading || addingDesignation}
          >
            {addingDesignation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface EmployeeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  footer: ReactNode
  children: ReactNode
}

function EmployeeFormDialog({
  open,
  onOpenChange,
  title,
  footer,
  children,
}: EmployeeFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={employeeDialogContentClass}>
        <DialogHeader className="space-y-0">
          <DialogTitle className={employeeDialogTitleClass}>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter className={employeeDialogFooterClass}>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Pull the most descriptive message off an Axios error response. Backend may
// shape errors as `{ message }` or `{ errors: [{ message }] }`. We prefer
// the array's first item (Zod-on-server) and fall back to `message`.
const extractApiError = (err: any, fallback: string): string => {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0]
    if (typeof first === "string") return first
    if (first?.message) return String(first.message)
  }
  if (typeof data.message === "string") return data.message
  return fallback
}

interface Employee {
  id: string
  name: string
  email?: string
  phone_number?: string
  cnic?: string
  gender?: string
  join_date: string
  employee_type_id: string
}

interface NewEmployeeForm {
  name: string
  email: string
  phone_number: string
  cnic: string
  gender: string
  join_date: string
  employee_type_id: string
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeTypes, setEmployeeTypes] = useState<EmployeeType[]>([])
  const [typesLoading, setTypesLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<(Employee & { join_date: Date | null }) | null>(null)
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null)
  const [newEmployee, setNewEmployee] = useState<NewEmployeeForm & { join_date: Date | null }>({
    name: "",
    email: "",
    phone_number: "",
    cnic: "",
    gender: "",
    join_date: null,
    employee_type_id: "",
  })
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  // Field-level validation errors. Toast is still fired for the top-level
  // failure, but inline errors are what stays in front of the user.
  const [addErrors, setAddErrors] = useState<EmployeeFormErrors>({})
  const [editErrors, setEditErrors] = useState<EmployeeFormErrors>({})
  const [newDesignationName, setNewDesignationName] = useState("")
  const [editDesignationName, setEditDesignationName] = useState("")
  const [addingDesignation, setAddingDesignation] = useState(false)

  // Reduce a ZodError to a per-field map for inline rendering.
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

  // Fetch employees from API
  const getEmployees = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/employee")
      // Convert join_date to Date object for all employees
      setEmployees(res.data.data.map((emp: Employee) => ({ ...emp, join_date: emp.join_date ? new Date(emp.join_date) : null })))
    } catch (error) {
      console.log("Get employees error", error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch employee types
  const getEmployeeTypes = async () => {
    setTypesLoading(true)
    try {
      const res = await apiClient.get("/employee/types")
      setEmployeeTypes(res.data.data)
    } catch (error) {
      setEmployeeTypes([])
    } finally {
      setTypesLoading(false)
    }
  }

  useEffect(() => {
    setIsInitialLoading(true)
    getEmployees().finally(() => setIsInitialLoading(false))
    getEmployeeTypes()
  }, [])

  const resetNewEmployeeForm = () => {
    setNewEmployee({
      name: "",
      email: "",
      phone_number: "",
      cnic: "",
      gender: "",
      join_date: null,
      employee_type_id: "",
    })
    setNewDesignationName("")
    setAddErrors({})
  }

  const handleAddDesignation = async (target: "add" | "edit" = "add") => {
    const name = (target === "add" ? newDesignationName : editDesignationName).trim()
    if (name.length < 2) {
      toast.error("Enter a designation name")
      return
    }

    setAddingDesignation(true)
    try {
      const res = await apiClient.post("/employee/type", { name })
      const created = res.data.data
      await getEmployeeTypes()
      if (target === "add") {
        setNewEmployee((prev) => ({ ...prev, employee_type_id: created.id }))
        setNewDesignationName("")
      } else {
        setEditingEmployee((prev) =>
          prev ? { ...prev, employee_type_id: created.id } : null,
        )
        setEditDesignationName("")
      }
      toast.success("Designation added")
    } catch (error: any) {
      toast.error("Failed to add designation", {
        description: extractApiError(error, "Could not create designation."),
      })
    } finally {
      setAddingDesignation(false)
    }
  }

  // Add employee — validates with Zod first, then sends to backend. Any
  // backend rejection is surfaced verbatim in the toast (we do not paper
  // over it with a generic "Failed to add employee" string).
  const handleAddEmployee = async () => {
    const preErrors: EmployeeFormErrors = {}
    if (!newEmployee.name || newEmployee.name.trim().length < 2)
      preErrors.name = "Full name must be at least 2 characters"
    if (!newEmployee.email || !newEmployee.email.trim())
      preErrors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmployee.email.trim()))
      preErrors.email = "Email is not valid"
    if (Object.keys(preErrors).length > 0) {
      setAddErrors(preErrors)
      toast.error("Please fix the form", { description: Object.values(preErrors)[0]! })
      return
    }

    const parsed = employeeFormSchema.safeParse(newEmployee)
    if (!parsed.success) {
      // Inline errors are the primary signal — populate every offending
      // field. The toast still fires as a secondary cue so the user
      // notices the submit failed even if the field is offscreen.
      setAddErrors(zodErrorsToMap(parsed.error))
      toast.error("Please fix the form", { description: firstZodError(parsed.error) })
      return
    }
    setAddErrors({})

    const data = parsed.data
    const payload: Record<string, string> = {
      name: data.name.trim(),
      email: data.email.trim(),
      join_date: toUtcMidnightIso(data.join_date ?? new Date()),
    }
    if (data.employee_type_id) payload.employee_type_id = data.employee_type_id
    if (data.phone_number) payload.phone_number = data.phone_number
    if (data.cnic) payload.cnic = data.cnic
    if (data.gender) payload.gender = data.gender

    setActionLoading(true)
    try {
      await apiClient.post("/employee", payload)
      toast.success("Employee added", { description: `${data.name.trim()} has been added.` })
      setIsAddDialogOpen(false)
      resetNewEmployeeForm()
      getEmployees()
    } catch (error: any) {
      toast.error("Failed to add employee", {
        description: extractApiError(error, "Server rejected the request."),
      })
    } finally {
      setActionLoading(false)
    }
  }

  const openEditDialog = (employee: Employee) => {
    setEditErrors({})
    setEditDesignationName("")
    setEditingEmployee({
      ...employee,
      join_date: employee.join_date ? new Date(employee.join_date) : null,
    })
    setIsEditDialogOpen(true)
  }

  const handleEditEmployee = async () => {
    if (!editingEmployee) return

    const preErrors: EmployeeFormErrors = {}
    if (!editingEmployee.name || editingEmployee.name.trim().length < 2)
      preErrors.name = "Full name must be at least 2 characters"
    if (!editingEmployee.email || !editingEmployee.email.trim())
      preErrors.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editingEmployee.email.trim()))
      preErrors.email = "Email is not valid"
    if (Object.keys(preErrors).length > 0) {
      setEditErrors(preErrors)
      toast.error("Please fix the form", { description: Object.values(preErrors)[0]! })
      return
    }

    const parsed = employeeFormSchema.safeParse({
      name: editingEmployee.name,
      email: editingEmployee.email,
      phone_number: editingEmployee.phone_number || undefined,
      cnic: editingEmployee.cnic || undefined,
      gender: editingEmployee.gender || undefined,
      join_date: editingEmployee.join_date,
      employee_type_id: editingEmployee.employee_type_id || "",
    })
    if (!parsed.success) {
      setEditErrors(zodErrorsToMap(parsed.error))
      toast.error("Please fix the form", { description: firstZodError(parsed.error) })
      return
    }
    setEditErrors({})

    const data = parsed.data
    const payload: Record<string, string | null> = {
      name: data.name.trim(),
      email: data.email.trim(),
      join_date: toUtcMidnightIso(data.join_date ?? editingEmployee.join_date ?? new Date()),
      phone_number: data.phone_number ? data.phone_number : null,
      cnic: data.cnic ? data.cnic : null,
      gender: data.gender ? data.gender : null,
    }
    if (data.employee_type_id) payload.employee_type_id = data.employee_type_id

    setActionLoading(true)
    try {
      await apiClient.put(`/employee/${editingEmployee.id}`, payload)
      toast.success("Employee updated", { description: `${data.name} was saved.` })
      setIsEditDialogOpen(false)
      setEditingEmployee(null)
      getEmployees()
    } catch (error: any) {
      toast.error("Failed to update employee", {
        description: extractApiError(error, "Server rejected the request."),
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Delete employee
  const openDeleteDialog = (employee: Employee) => {
    setDeletingEmployee(employee)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return
    setActionLoading(true)
    try {
      await apiClient.delete(`/employee/${deletingEmployee.id}`)
      toast.success("Employee deleted", {
        description: `${deletingEmployee.name} has been removed.`,
      })
      setIsDeleteDialogOpen(false)
      setDeletingEmployee(null)
      getEmployees()
    } catch (error: any) {
      toast.error("Failed to delete employee", {
        description: extractApiError(error, "Server rejected the request."),
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Filtered employees
  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.email && employee.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Stats
  const totalEmployees = employees.length

  const addFormValues: EmployeeFormValues = {
    name: newEmployee.name,
    email: newEmployee.email,
    phone_number: newEmployee.phone_number,
    cnic: newEmployee.cnic,
    gender: newEmployee.gender,
    join_date: newEmployee.join_date,
    employee_type_id: newEmployee.employee_type_id,
  }

  const editFormValues: EmployeeFormValues | null = editingEmployee
    ? {
        name: editingEmployee.name,
        email: editingEmployee.email || "",
        phone_number: editingEmployee.phone_number || "",
        cnic: editingEmployee.cnic || "",
        gender: editingEmployee.gender || "",
        join_date: editingEmployee.join_date,
        employee_type_id: editingEmployee.employee_type_id || "",
      }
    : null

  if (isInitialLoading) {
    return <PageLoader message="Loading employees data..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Stats Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {isInitialLoading ? (
          <StatCardSkeleton />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEmployees}</div>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-sm md:text-base text-gray-600">Manage your team</p>
        </div>
        <Button
          onClick={() => {
            resetNewEmployeeForm()
            setIsAddDialogOpen(true)
          }}
        >
          Add Employee
        </Button>
      </div>
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageLoader message="Loading employees..." />
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No employees found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="min-w-[120px]">Phone</TableHead>
                      <TableHead className="min-w-[120px]">CNIC</TableHead>
                      <TableHead className="min-w-[80px]">Gender</TableHead>
                      <TableHead className="min-w-[120px]">Join Date</TableHead>
                      <TableHead className="min-w-[150px]">Employee Type ID</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.email || "-"}</TableCell>
                    <TableCell>{employee.phone_number || "-"}</TableCell>
                    <TableCell>{employee.cnic || "-"}</TableCell>
                    <TableCell>{employee.gender || "-"}</TableCell>
                    <TableCell>{formatJoinDate(employee.join_date)}</TableCell>
                    <TableCell>{employee.employee_type_id}</TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(employee)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteDialog(employee)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (open) resetNewEmployeeForm()
          else setAddErrors({})
          setIsAddDialogOpen(open)
        }}
        title="Add New Employee"
        footer={
          <>
            <Button
              variant="outline"
              className={employeeDialogButtonClass}
              onClick={() => setIsAddDialogOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button className={employeeDialogButtonClass} onClick={handleAddEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Add Employee
            </Button>
          </>
        }
      >
        <EmployeeFormFields
          idPrefix="add"
          values={addFormValues}
          errors={addErrors}
          onChange={(patch) => setNewEmployee((prev) => ({ ...prev, ...patch }))}
          onClearError={(field) => setAddErrors((p) => ({ ...p, [field]: undefined }))}
          employeeTypes={employeeTypes}
          typesLoading={typesLoading}
          actionLoading={actionLoading}
          designationName={newDesignationName}
          onDesignationNameChange={setNewDesignationName}
          onAddDesignation={() => handleAddDesignation("add")}
          addingDesignation={addingDesignation}
        />
      </EmployeeFormDialog>

      <EmployeeFormDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditErrors({})
            setEditDesignationName("")
            setEditingEmployee(null)
          }
          setIsEditDialogOpen(open)
        }}
        title="Edit Employee"
        footer={
          <>
            <Button
              variant="outline"
              className={employeeDialogButtonClass}
              onClick={() => setIsEditDialogOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button className={employeeDialogButtonClass} onClick={handleEditEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Update Employee
            </Button>
          </>
        }
      >
        {editFormValues && (
          <EmployeeFormFields
            idPrefix="edit"
            values={editFormValues}
            errors={editErrors}
            onChange={(patch) =>
              setEditingEmployee((prev) => (prev ? { ...prev, ...patch } : null))
            }
            onClearError={(field) => setEditErrors((p) => ({ ...p, [field]: undefined }))}
            employeeTypes={employeeTypes}
            typesLoading={typesLoading}
            actionLoading={actionLoading}
            designationName={editDesignationName}
            onDesignationNameChange={setEditDesignationName}
            onAddDesignation={() => handleAddDesignation("edit")}
            addingDesignation={addingDesignation}
          />
        )}
      </EmployeeFormDialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Are you sure you want to delete <strong>{deletingEmployee?.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              This will also delete their shift and salary records. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteEmployee} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Delete Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
