"use client"

import { useState, useMemo } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Eye, RotateCcw, CreditCard, DollarSign, CheckCircle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ReturnItem {
  id: string
  saleId: string
  customer: string
  date: string
  reason: string
  amount: number
  status: "pending" | "approved" | "rejected" | "completed"
  method: "cash" | "card" | "store-credit" | "exchange"
  notes?: string
  items?: Array<{
    name: string
    quantity: number
    price: number
    reason: string
  }>
  processedBy?: string
  processedDate?: string
}

interface NewReturn {
  saleId: string
  customer: string
  reason: string
  method: string
  notes: string
  amount: string
}

export function Returns() {
  const { toast } = useToast()

  const [returns, setReturns] = useState<ReturnItem[]>([
    {
      id: "RET-001",
      saleId: "SALE-1234",
      customer: "John Doe",
      date: "2024-01-15",
      reason: "Defective",
      amount: 2500,
      status: "pending",
      method: "cash",
      notes: "Product stopped working after 2 days",
      items: [{ name: "Wireless Headphones", quantity: 1, price: 2500, reason: "Defective - no sound" }],
    },
    {
      id: "RET-002",
      saleId: "SALE-1235",
      customer: "Jane Smith",
      date: "2024-01-14",
      reason: "Wrong Size",
      amount: 1800,
      status: "approved",
      method: "exchange",
      notes: "Customer wants to exchange for larger size",
      items: [{ name: "T-Shirt", quantity: 1, price: 1800, reason: "Size too small" }],
      processedBy: "Manager",
      processedDate: "2024-01-14",
    },
    {
      id: "RET-003",
      saleId: "SALE-1236",
      customer: "Mike Johnson",
      date: "2024-01-13",
      reason: "Not Satisfied",
      amount: 3200,
      status: "completed",
      method: "card",
      notes: "Customer not happy with product quality",
      items: [{ name: "Bluetooth Speaker", quantity: 1, price: 3200, reason: "Poor sound quality" }],
      processedBy: "Sarah Johnson",
      processedDate: "2024-01-13",
    },
    {
      id: "RET-004",
      saleId: "SALE-1237",
      customer: "Emily Davis",
      date: "2024-01-12",
      reason: "Damaged",
      amount: 4500,
      status: "rejected",
      method: "cash",
      notes: "Damage appears to be customer-caused",
      items: [{ name: "Laptop Charger", quantity: 1, price: 4500, reason: "Physical damage" }],
      processedBy: "Manager",
      processedDate: "2024-01-12",
    },
    {
      id: "RET-005",
      saleId: "SALE-1238",
      customer: "Robert Brown",
      date: "2024-01-15",
      reason: "Wrong Item",
      amount: 1200,
      status: "pending",
      method: "exchange",
      notes: "Received wrong color variant",
      items: [{ name: "Phone Case", quantity: 1, price: 1200, reason: "Wrong color - ordered black, got white" }],
    },
  ])

  const [isProcessOpen, setIsProcessOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [newReturn, setNewReturn] = useState<NewReturn>({
    saleId: "",
    customer: "",
    reason: "",
    method: "",
    notes: "",
    amount: "",
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "approved":
        return "bg-green-100 text-green-800"
      case "rejected":
        return "bg-red-100 text-red-800"
      case "completed":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredReturns = useMemo(() => {
    return returns.filter((returnItem) => {
      const matchesSearch =
        returnItem.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.reason.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesSearch
    })
  }, [returns, searchTerm])

  const getFilteredReturnsByStatus = (status: string) => {
    if (status === "all") return filteredReturns
    return filteredReturns.filter((returnItem) => returnItem.status === status)
  }

  // Calculate stats
  const todayReturns = returns.filter((r) => r.date === "2024-01-15").length
  const todayValue = returns.filter((r) => r.date === "2024-01-15").reduce((sum, r) => sum + r.amount, 0)
  const pendingReturns = returns.filter((r) => r.status === "pending").length
  const returnRate = 2.3 // This would be calculated based on total sales

  const generateReturnId = () => {
    const nextId = returns.length + 1
    return `RET-${nextId.toString().padStart(3, "0")}`
  }

  const handleProcessReturn = () => {
    if (!newReturn.saleId || !newReturn.customer || !newReturn.reason || !newReturn.method || !newReturn.amount) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const returnItem: ReturnItem = {
      id: generateReturnId(),
      saleId: newReturn.saleId,
      customer: newReturn.customer,
      date: new Date().toISOString().split("T")[0],
      reason: newReturn.reason,
      amount: Number.parseFloat(newReturn.amount),
      status: "pending",
      method: newReturn.method as any,
      notes: newReturn.notes,
      items: [
        {
          name: "Product from " + newReturn.saleId,
          quantity: 1,
          price: Number.parseFloat(newReturn.amount),
          reason: newReturn.reason,
        },
      ],
    }

    setReturns((prev) => [returnItem, ...prev])
    setNewReturn({
      saleId: "",
      customer: "",
      reason: "",
      method: "",
      notes: "",
      amount: "",
    })
    setIsProcessOpen(false)

    toast({
      title: "Return Processed",
      description: `Return ${returnItem.id} has been created and is pending approval.`,
    })
  }

  const handleApproveReturn = (returnId: string) => {
    setReturns((prev) =>
      prev.map((returnItem) =>
        returnItem.id === returnId
          ? {
            ...returnItem,
            status: "approved" as const,
            processedBy: "Current User",
            processedDate: new Date().toISOString().split("T")[0],
          }
          : returnItem,
      ),
    )

    toast({
      title: "Return Approved",
      description: `Return ${returnId} has been approved for processing.`,
    })
  }

  const handleRejectReturn = (returnId: string) => {
    setReturns((prev) =>
      prev.map((returnItem) =>
        returnItem.id === returnId
          ? {
            ...returnItem,
            status: "rejected" as const,
            processedBy: "Current User",
            processedDate: new Date().toISOString().split("T")[0],
          }
          : returnItem,
      ),
    )

    toast({
      title: "Return Rejected",
      description: `Return ${returnId} has been rejected.`,
    })
  }

  const handleCompleteReturn = (returnId: string) => {
    setReturns((prev) =>
      prev.map((returnItem) =>
        returnItem.id === returnId
          ? {
            ...returnItem,
            status: "completed" as const,
            processedBy: "Current User",
            processedDate: new Date().toISOString().split("T")[0],
          }
          : returnItem,
      ),
    )

    toast({
      title: "Return Completed",
      description: `Return ${returnId} has been completed.`,
    })
  }

  const handleViewReturn = (returnItem: ReturnItem) => {
    setSelectedReturn(returnItem)
    setIsViewOpen(true)
  }

  const renderReturnsTable = (returnsData: ReturnItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Return ID</TableHead>
          <TableHead>Sale ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {returnsData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center py-8 text-gray-500">
              No returns found
            </TableCell>
          </TableRow>
        ) : (
          returnsData.map((returnItem) => (
            <TableRow key={returnItem.id}>
              <TableCell className="font-medium">{returnItem.id}</TableCell>
              <TableCell>{returnItem.saleId}</TableCell>
              <TableCell>{returnItem.customer}</TableCell>
              <TableCell>{returnItem.date}</TableCell>
              <TableCell>{returnItem.reason}</TableCell>
              <TableCell>Rs {returnItem.amount.toLocaleString()}</TableCell>
              <TableCell className="capitalize">{returnItem.method}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(returnItem.status)}>{returnItem.status}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewReturn(returnItem)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  {returnItem.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApproveReturn(returnItem.id)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectReturn(returnItem.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {returnItem.status === "approved" && (
                    <Button variant="outline" size="sm" onClick={() => handleCompleteReturn(returnItem.id)}>
                      Complete
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Returns & Refunds</h1>
          <p className="text-gray-600">Process customer returns and refunds</p>
        </div>
        <Dialog open={isProcessOpen} onOpenChange={setIsProcessOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Process Return
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Process Return</DialogTitle>
              <DialogDescription>Process a customer return or refund</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sale-id">Original Sale ID *</Label>
                  <Input
                    id="sale-id"
                    placeholder="Enter sale ID"
                    value={newReturn.saleId}
                    onChange={(e) => setNewReturn((prev) => ({ ...prev, saleId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Input
                    id="customer"
                    placeholder="Customer name"
                    value={newReturn.customer}
                    onChange={(e) => setNewReturn((prev) => ({ ...prev, customer: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">Return Reason *</Label>
                  <Select
                    value={newReturn.reason}
                    onValueChange={(value) => setNewReturn((prev) => ({ ...prev, reason: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Defective">Defective Product</SelectItem>
                      <SelectItem value="Wrong Size">Wrong Size</SelectItem>
                      <SelectItem value="Not Satisfied">Not Satisfied</SelectItem>
                      <SelectItem value="Damaged">Damaged in Transit</SelectItem>
                      <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Return Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newReturn.amount}
                    onChange={(e) => setNewReturn((prev) => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund-method">Refund Method *</Label>
                <Select
                  value={newReturn.method}
                  onValueChange={(value) => setNewReturn((prev) => ({ ...prev, method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash Refund</SelectItem>
                    <SelectItem value="card">Card Refund</SelectItem>
                    <SelectItem value="store-credit">Store Credit</SelectItem>
                    <SelectItem value="exchange">Exchange</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the return"
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsProcessOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleProcessReturn}>Process Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Returns</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayReturns}</div>
            <p className="text-xs text-muted-foreground">+2 from yesterday</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Return Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Rs {todayValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Today's total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{returnRate}%</div>
            <p className="text-xs text-muted-foreground">Of total sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReturns}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Returns ({filteredReturns.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({getFilteredReturnsByStatus("pending").length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({getFilteredReturnsByStatus("approved").length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({getFilteredReturnsByStatus("completed").length})</TabsTrigger>
        </TabsList>

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search returns..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Returns & Refunds</CardTitle>
              <CardDescription>Manage all customer returns and refunds</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("all"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Returns</CardTitle>
              <CardDescription>Returns awaiting approval or rejection</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("pending"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle>Approved Returns</CardTitle>
              <CardDescription>Returns approved for processing</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("approved"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Returns</CardTitle>
              <CardDescription>Returns that have been fully processed</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("completed"))}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Return Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Return Details - {selectedReturn?.id}</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Return Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Return ID:</strong> {selectedReturn.id}
                    </div>
                    <div>
                      <strong>Original Sale:</strong> {selectedReturn.saleId}
                    </div>
                    <div>
                      <strong>Date:</strong> {selectedReturn.date}
                    </div>
                    <div>
                      <strong>Reason:</strong> {selectedReturn.reason}
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Customer & Status</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Customer:</strong> {selectedReturn.customer}
                    </div>
                    <div>
                      <strong>Method:</strong> {selectedReturn.method}
                    </div>
                    <div>
                      <strong>Status:</strong>{" "}
                      <Badge className={getStatusColor(selectedReturn.status)}>{selectedReturn.status}</Badge>
                    </div>
                    <div>
                      <strong>Amount:</strong> Rs {selectedReturn.amount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {selectedReturn.items && (
                <div>
                  <h3 className="font-medium mb-2">Returned Items</h3>
                  <div className="border rounded-lg p-4">
                    {selectedReturn.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-gray-500">
                            Qty: {item.quantity} • Reason: {item.reason}
                          </div>
                        </div>
                        <div className="font-medium">Rs {item.price.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedReturn.notes && (
                <div>
                  <h3 className="font-medium mb-2">Notes</h3>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">{selectedReturn.notes}</div>
                </div>
              )}

              {selectedReturn.processedBy && (
                <div>
                  <h3 className="font-medium mb-2">Processing Information</h3>
                  <div className="text-sm space-y-1">
                    <div>
                      <strong>Processed by:</strong> {selectedReturn.processedBy}
                    </div>
                    <div>
                      <strong>Processed date:</strong> {selectedReturn.processedDate}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                {selectedReturn.status === "pending" && (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        handleApproveReturn(selectedReturn.id)
                        setIsViewOpen(false)
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Return
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        handleRejectReturn(selectedReturn.id)
                        setIsViewOpen(false)
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Return
                    </Button>
                  </>
                )}
                {selectedReturn.status === "approved" && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      handleCompleteReturn(selectedReturn.id)
                      setIsViewOpen(false)
                    }}
                  >
                    Complete Return
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
