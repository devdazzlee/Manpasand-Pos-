import apiClient from "@/lib/apiClient"
import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { LoadingButton } from "@/components/ui/loading-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Loader2, Users, CheckCircle2, XCircle } from "lucide-react"

interface EmployeeType {
  id: string
  name: string
  is_active: boolean
}

export function Designation() {
  const { toast } = useToast()
  const [types, setTypes] = useState<EmployeeType[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editType, setEditType] = useState<EmployeeType | null>(null)
  const [form, setForm] = useState({ name: "", is_active: true })
  const [formError, setFormError] = useState("")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)

  // Fetch all types
  const fetchTypes = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/employee/types")
      setTypes(res.data.data)
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.message || "Failed to fetch types", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true)
      await fetchTypes()
      setInitialLoading(false)
    }
    load()
  }, [])

  // Open modal for add or edit
  const openModal = (type?: EmployeeType) => {
    if (type) {
      setEditType(type)
      setForm({ name: type.name, is_active: type.is_active })
    } else {
      setEditType(null)
      setForm({ name: "", is_active: true })
    }
    setFormError("")
    setModalOpen(true)
  }

  // Handle form change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type: inputType, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: inputType === "checkbox" ? checked : value }))
  }

  // Handle Switch change
  const handleSwitch = (checked: boolean) => {
    setForm((prev) => ({ ...prev, is_active: checked }))
  }

  // Validate form
  const validate = () => {
    if (!form.name.trim()) return "Name is required"
    if (form.name.trim().length < 2) return "Name must be at least 2 characters"
    return ""
  }

  // Submit form (add or edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validate()
    if (error) {
      setFormError(error)
      return
    }
    setSubmitLoading(true)
    try {
      if (editType) {
        // Update
        await apiClient.put(`/employee/type/${editType.id}`, form)
        toast({ title: "Updated", description: "Employee type updated successfully" })
      } else {
        // Create
        await apiClient.post("/employee/type", { name: form.name })
        toast({ title: "Created", description: "Employee type created successfully" })
      }
      setModalOpen(false)
      fetchTypes()
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.message || "Failed to save type", variant: "destructive" })
    } finally {
      setSubmitLoading(false)
    }
  }

  // Delete type
  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this type?")) return
    setDeleteLoadingId(id)
    try {
      await apiClient.delete(`/employee/type/${id}`)
      toast({ title: "Deleted", description: "Employee type deleted successfully" })
      fetchTypes()
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.message || "Failed to delete type", variant: "destructive" })
    } finally {
      setDeleteLoadingId(null)
    }
  }

  // Stats
  const total = types.length
  const active = types.filter((t) => t.is_active).length
  const inactive = total - active

  if (initialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading designation data...</p>
          </div>
        </div>
      </div>
    )
  }

return (
    <div className="p-6 space-y-6">
      {/* Header & Add Dialog */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Designation Management</h1>
          <p className="text-gray-600">Manage your employee types</p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openModal()}>
              <Users className="h-4 w-4 mr-2" />
              Add Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editType ? "Edit Type" : "Add Type"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1 font-medium">Name</label>
                <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Staff" autoFocus />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={handleSwitch} id="is_active" />
                <label htmlFor="is_active">Active</label>
              </div>
              {formError && <div className="text-red-600 text-sm">{formError}</div>}
              <DialogFooter>
                <LoadingButton type="submit" loading={submitLoading} className="w-full">
                  {editType ? "Update" : "Create"}
                </LoadingButton>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Types</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Types</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Types</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inactive}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table with Loader */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Types ({types.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="text-center">
                <Loader2 className="animate-spin h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-600">Loading types...</p>
              </div>
            </div>
          ) : types.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No employee types found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>{type.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={type.is_active ? "default" : "secondary"}
                        className={type.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                      >
                        {type.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openModal(type)}>
                          Edit
                        </Button>
                        <LoadingButton
                          size="sm"
                          variant="destructive"
                          loading={deleteLoadingId === type.id}
                          onClick={() => handleDelete(type.id)}
                        >
                          Delete
                        </LoadingButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
)
}