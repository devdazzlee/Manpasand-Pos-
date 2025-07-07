"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Clock, Users, Calendar, DollarSign, Eye, StopCircle, Edit, Trash2, Loader2 } from "lucide-react"
import apiClient from "@/lib/apiClient"

interface Shift {
  id: string
  employee: string
  employeeId: string
  date: string
  startTime: string
  endTime: string
  breakTime: string
  totalHours: number
  status: "scheduled" | "active" | "completed" | "cancelled"
  sales: number
  hourlyRate: number
}

interface NewShiftForm {
  employee: string
  employeeId: string
  date: string
  shiftType: string
  startTime: string
  endTime: string
  breakTime: string
}

const employees = [
  { id: "emp-001", name: "John Doe", hourlyRate: 15 },
  { id: "emp-002", name: "Jane Smith", hourlyRate: 18 },
  { id: "emp-003", name: "Mike Johnson", hourlyRate: 16 },
  { id: "emp-004", name: "Sarah Wilson", hourlyRate: 20 },
]

export function Shifts() {
  const [shifts, setShifts] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreateShiftOpen, setIsCreateShiftOpen] = useState(false)
  const [isEditShiftOpen, setIsEditShiftOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<any | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null)
  const [newShift, setNewShift] = useState({ name: "", start_time: "", end_time: "" })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("all")
  const [addLoading, setAddLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-800"
      case "active":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      case "cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const calculateHours = (startTime: string, endTime: string, breakHours: number) => {
    const start = new Date(`2000-01-01T${startTime}:00`)
    const end = new Date(`2000-01-01T${endTime}:00`)
    let diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60)

    // Handle overnight shifts
    if (diff < 0) {
      diff += 24
    }

    return Math.max(0, diff - breakHours)
  }

  const getShifts = async (pageNum = page) => {
    setIsLoading(true)
    try {
      const res = await apiClient.get(`/shifts?page=${pageNum}&limit=${limit}`)
      const { data, meta } = res.data
      setShifts(data)
      setTotalPages(meta?.totalPages || 1)
    } catch (error) {
      console.log("error", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    getShifts(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleCreateShift = async () => {
    if (newShift.name && newShift.start_time && newShift.end_time) {
      setAddLoading(true)
      try {
        await apiClient.post('/shifts', {
          name: newShift.name,
          start_time: new Date(newShift.start_time).toISOString(),
          end_time: new Date(newShift.end_time).toISOString(),
        })
        setIsCreateShiftOpen(false)
        setNewShift({ name: "", start_time: "", end_time: "" })
        getShifts(1)
        setPage(1)
      } catch (error) {
        console.log("Create shift error", error)
      } finally {
        setAddLoading(false)
      }
    }
  }

  const handleEditShift = (shift: any) => {
    setEditingShift({ ...shift, start_time: shift.start_time?.slice(0, 16), end_time: shift.end_time?.slice(0, 16) })
    setIsEditShiftOpen(true)
  }

  const handleUpdateShift = async () => {
    if (editingShift && editingShift.name && editingShift.start_time && editingShift.end_time) {
      try {
        await apiClient.put(`/shifts/${editingShift.id}`, {
          name: editingShift.name,
          start_time: new Date(editingShift.start_time).toISOString(),
          end_time: new Date(editingShift.end_time).toISOString(),
        })
        setIsEditShiftOpen(false)
        setEditingShift(null)
        getShifts(page)
      } catch (error) {
        console.log("Update shift error", error)
      }
    }
  }

  const handleDeleteShift = async () => {
    if (deletingShiftId) {
      setDeleteLoading(true)
      try {
        await apiClient.delete(`/shifts/${deletingShiftId}`)
        setIsDeleteDialogOpen(false)
        setDeletingShiftId(null)
        getShifts(page)
      } catch (error) {
        console.log("Delete shift error", error)
      } finally {
        setDeleteLoading(false)
      }
    }
  }

  const filteredShifts = shifts.filter((shift) => {
    let matches = true
    if (statusFilter !== "all") {
      matches = statusFilter === "active" ? shift.is_active : !shift.is_active
    }
    if (dateRangeFilter !== "all") {
      const shiftDate = new Date(shift.start_time)
      const now = new Date()
      if (dateRangeFilter === "today") {
        matches = matches &&
          shiftDate.getFullYear() === now.getFullYear() &&
          shiftDate.getMonth() === now.getMonth() &&
          shiftDate.getDate() === now.getDate()
      } else if (dateRangeFilter === "week") {
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - now.getDay())
        startOfWeek.setHours(0,0,0,0)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        endOfWeek.setHours(23,59,59,999)
        matches = matches && shiftDate >= startOfWeek && shiftDate <= endOfWeek
      } else if (dateRangeFilter === "month") {
        matches = matches &&
          shiftDate.getFullYear() === now.getFullYear() &&
          shiftDate.getMonth() === now.getMonth()
      }
    }
    if (searchTerm) {
      matches = matches && (
        shift.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shift.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    return matches
  })

  const ShiftTable = ({ shiftData }: { shiftData: any[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shift ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Start Time</TableHead>
          <TableHead>End Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shiftData.map((shift) => (
          <TableRow key={shift.id}>
            <TableCell className="font-medium">{shift.id}</TableCell>
            <TableCell>{shift.name}</TableCell>
            <TableCell>{shift.start_time ? new Date(shift.start_time).toLocaleString() : ""}</TableCell>
            <TableCell>{shift.end_time ? new Date(shift.end_time).toLocaleString() : ""}</TableCell>
            <TableCell>
              <Badge className={shift.is_active ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                {shift.is_active ? "Active" : "Scheduled"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => handleEditShift(shift)}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDeletingShiftId(shift.id)
                    setIsDeleteDialogOpen(true)
                  }}
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
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Shift Management</h1>
          <p className="text-gray-600">Manage employee shifts</p>
        </div>
        {/* Create Shift Dialog */}
        <Dialog open={isCreateShiftOpen} onOpenChange={setIsCreateShiftOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Shift
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule New Shift</DialogTitle>
              <DialogDescription>Create a new shift</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newShift.name}
                  onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                  placeholder="Shift Name"
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="datetime-local"
                  value={newShift.start_time}
                  onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="datetime-local"
                  value={newShift.end_time}
                  onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  disabled={addLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateShiftOpen(false)} disabled={addLoading}>
                Cancel
              </Button>
              <Button onClick={handleCreateShift} disabled={addLoading}>
                {addLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                Schedule Shift
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search shifts..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={dateRangeFilter} onValueChange={setDateRangeFilter} className="">
          <TabsList>
            <TabsTrigger value="all">All Dates</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {/* Loader and Table */}
      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <span className="text-lg font-semibold">Loading...</span>
        </div>
      ) : (
        <>
          <ShiftTable shiftData={filteredShifts} />
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Prev
            </Button>
            <span className="px-2 py-1 text-sm">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {/* Edit Shift Dialog */}
      <Dialog open={isEditShiftOpen} onOpenChange={setIsEditShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
          </DialogHeader>
          {editingShift && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingShift.name}
                  onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="datetime-local"
                  value={editingShift.start_time}
                  onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={editingShift.end_time}
                  onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditShiftOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateShift}>Update Shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Shift Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shift</DialogTitle>
            <DialogDescription>Are you sure you want to delete this shift?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteShift} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}