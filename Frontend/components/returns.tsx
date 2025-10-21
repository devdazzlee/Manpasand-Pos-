"use client"

import { useState, useMemo, useEffect } from "react"
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
import { Plus, Search, Eye, RotateCcw, CreditCard, DollarSign, CheckCircle, XCircle, Loader2, Minus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import apiClient from "@/lib/apiClient"

interface Sale {
  id: string
  sale_number: string
  customer?: {
    name: string
    email: string
  }
  sale_date: string
  total_amount: number
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    unit_price: number
    line_total: number
  }>
}

interface ReturnItem {
  id: string
  sale_number: string
  customer?: {
    name: string
    email: string
  }
  sale_date: string
  total_amount: number
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "REFUNDED" | "EXCHANGED"
  payment_method: string
  notes?: string
  sale_items: Array<{
    id: string
    product: {
      id: string
      name: string
      sku: string
    }
    quantity: number
    unit_price: number
    line_total: number
    item_type: "ORIGINAL" | "RETURN" | "EXCHANGE"
  }>
}

interface NewReturn {
  saleId: string
  customerId?: string
  returnedItems: Array<{
    productId: string
    quantity: number
  }>
  exchangedItems: Array<{
    productId: string
    quantity: number
    price: number
  }>
  notes: string
}

interface SelectedReturnItem {
  productId: string
  productName: string
  sku: string
  originalQuantity: number
  returnQuantity: number
  unitPrice: number
}

export function Returns() {
  const { toast } = useToast()

  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(false)
  const [salesLoading, setSalesLoading] = useState(false)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [selectedReturnItems, setSelectedReturnItems] = useState<SelectedReturnItem[]>([])

  const [isProcessOpen, setIsProcessOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [newReturn, setNewReturn] = useState<NewReturn>({
    saleId: "",
    customerId: "",
    returnedItems: [],
    exchangedItems: [],
    notes: "",
  })

  // Fetch sales and returns data
  const fetchSales = async () => {
    setSalesLoading(true)
    try {
      const response = await apiClient.get("/sale/for-returns")
      setSales(response.data.data || [])
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to fetch sales",
        description: "Could not load sales data",
      })
    } finally {
      setSalesLoading(false)
    }
  }

  const fetchReturns = async () => {
    setLoading(true)
    try {
      // Fetch sales that have returns/exchanges (status REFUNDED or EXCHANGED)
      const response = await apiClient.get("/sale")
      const allSales = response.data.data || []
      const returnSales = allSales.filter((sale: any) => 
        sale.status === "REFUNDED" || sale.status === "EXCHANGED"
      )
      setReturns(returnSales)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to fetch returns",
        description: "Could not load returns data",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSales()
    fetchReturns()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      case "COMPLETED":
        return "bg-green-100 text-green-800"
      case "CANCELLED":
        return "bg-red-100 text-red-800"
      case "REFUNDED":
        return "bg-blue-100 text-blue-800"
      case "EXCHANGED":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredReturns = useMemo(() => {
    return returns.filter((returnItem) => {
      const matchesSearch =
        returnItem.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        returnItem.sale_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (returnItem.customer?.name && returnItem.customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (returnItem.customer?.email && returnItem.customer.email.toLowerCase().includes(searchTerm.toLowerCase()))

      return matchesSearch
    })
  }, [returns, searchTerm])

  const getFilteredReturnsByStatus = (status: string) => {
    if (status === "all") return filteredReturns
    return filteredReturns.filter((returnItem) => returnItem.status === status)
  }

  // Calculate stats
  const today = new Date().toISOString().split('T')[0]
  const todayReturns = returns.filter((r) => r.sale_date.startsWith(today)).length
  const todayValue = returns.filter((r) => r.sale_date.startsWith(today)).reduce((sum, r) => sum + Number(r.total_amount), 0)
  const pendingReturns = returns.filter((r) => r.status === "PENDING").length
  const returnRate = returns.length > 0 ? ((returns.length / sales.length) * 100).toFixed(1) : "0.0"

  const handleProcessReturn = async () => {
    if (!newReturn.saleId || (newReturn.returnedItems.length === 0 && newReturn.exchangedItems.length === 0)) {
      toast({
        title: "Missing Information",
        description: "Please select a sale and add items to return or exchange.",
        variant: "destructive",
      })
      return
    }

    // Validate return quantities
    const hasInvalidQuantity = selectedReturnItems.some(item => 
      item.returnQuantity > item.originalQuantity
    )
    
    if (hasInvalidQuantity) {
      toast({
        title: "Invalid Return Quantity",
        description: "Return quantity cannot exceed original sale quantity.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.patch(`/sale/${newReturn.saleId}/refund`, {
        customerId: newReturn.customerId || undefined,
        returnedItems: newReturn.returnedItems,
        exchangedItems: newReturn.exchangedItems,
        notes: newReturn.notes,
      })

      toast({
        title: "Return Processed",
        description: "Return has been processed successfully.",
      })

      // Refresh data
      await fetchReturns()
      await fetchSales()

      setNewReturn({
        saleId: "",
        customerId: "",
        returnedItems: [],
        exchangedItems: [],
        notes: "",
      })
      setSelectedReturnItems([])
      setIsProcessOpen(false)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to process return",
        description: error.response?.data?.message || "An error occurred while processing the return.",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaleSelect = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId)
    setSelectedSale(sale || null)
    setNewReturn(prev => ({ ...prev, saleId }))
    
    // Initialize selected return items
    if (sale) {
      const items: SelectedReturnItem[] = sale.sale_items.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        originalQuantity: item.quantity,
        returnQuantity: 0,
        unitPrice: item.unit_price
      }))
      setSelectedReturnItems(items)
    } else {
      setSelectedReturnItems([])
    }
  }

  const handleReturnQuantityChange = (productId: string, quantity: number) => {
    setSelectedReturnItems(prev => 
      prev.map(item => 
        item.productId === productId 
          ? { ...item, returnQuantity: Math.max(0, Math.min(quantity, item.originalQuantity)) }
          : item
      )
    )

    // Update newReturn.returnedItems
    const updatedItems = selectedReturnItems.map(item => 
      item.productId === productId 
        ? { ...item, returnQuantity: Math.max(0, Math.min(quantity, item.originalQuantity)) }
        : item
    )

    const returnedItems = updatedItems
      .filter(item => item.returnQuantity > 0)
      .map(item => ({
        productId: item.productId,
        quantity: item.returnQuantity
      }))

    setNewReturn(prev => ({
      ...prev,
      returnedItems
    }))
  }

  const handleViewReturn = (returnItem: ReturnItem) => {
    setSelectedReturn(returnItem)
    setIsViewOpen(true)
  }

  const renderReturnsTable = (returnsData: ReturnItem[]) => (
    <div className="overflow-x-auto -mx-4 md:mx-0">
      <div className="inline-block min-w-full align-middle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Sale ID</TableHead>
              <TableHead className="min-w-[150px]">Customer</TableHead>
              <TableHead className="min-w-[120px]">Date</TableHead>
              <TableHead className="min-w-[100px]">Amount</TableHead>
              <TableHead className="min-w-[130px]">Payment Method</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
      <TableBody>
        {returnsData.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
              No returns found
            </TableCell>
          </TableRow>
        ) : (
          returnsData.map((returnItem) => (
            <TableRow key={returnItem.id}>
              <TableCell className="font-medium">{returnItem.sale_number}</TableCell>
              <TableCell>{returnItem.customer?.name || returnItem.customer?.email || "N/A"}</TableCell>
              <TableCell>{new Date(returnItem.sale_date).toLocaleDateString()}</TableCell>
              <TableCell>Rs {Number(returnItem.total_amount).toLocaleString()}</TableCell>
              <TableCell className="capitalize">{returnItem.payment_method}</TableCell>
              <TableCell>
                <Badge className={getStatusColor(returnItem.status)}>{returnItem.status}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleViewReturn(returnItem)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Returns & Refunds</h1>
          <p className="text-sm md:text-base text-gray-600">Process customer returns and refunds</p>
        </div>
        <Dialog open={isProcessOpen} onOpenChange={setIsProcessOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Process Return
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Process Return</DialogTitle>
              <DialogDescription>Process a customer return or refund</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sale-select">Select Sale *</Label>
                <Select
                  value={newReturn.saleId}
                  onValueChange={handleSaleSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a sale to return" />
                  </SelectTrigger>
                  <SelectContent>
                    {sales.map((sale) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{sale.sale_number}</span>
                          <span className="text-xs text-gray-500">
                            {sale.customer?.name || sale.customer?.email || "No customer"} • Rs {Number(sale.total_amount).toLocaleString()}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSale && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <h4 className="font-medium mb-2">Selected Sale Details</h4>
                  <div className="text-sm space-y-1">
                    <div><strong>Sale Number:</strong> {selectedSale.sale_number}</div>
                    <div><strong>Customer:</strong> {selectedSale.customer?.name || selectedSale.customer?.email || "N/A"}</div>
                    <div><strong>Total Amount:</strong> Rs {Number(selectedSale.total_amount).toLocaleString()}</div>
                    <div><strong>Items:</strong> {selectedSale.sale_items.length}</div>
                  </div>
                </div>
              )}

              {selectedReturnItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Items to Return</Label>
                  <div className="border rounded-lg p-4 space-y-3">
                    {selectedReturnItems.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between p-3 bg-white rounded border">
                        <div className="flex-1">
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-gray-500">
                            SKU: {item.sku} • Original Qty: {item.originalQuantity} • Price: Rs {Number(item.unitPrice).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReturnQuantityChange(item.productId, item.returnQuantity - 1)}
                            disabled={item.returnQuantity <= 0}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.returnQuantity}
                            onChange={(e) => handleReturnQuantityChange(item.productId, parseInt(e.target.value) || 0)}
                            className="w-16 text-center"
                            min={0}
                            max={item.originalQuantity}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReturnQuantityChange(item.productId, item.returnQuantity + 1)}
                            disabled={item.returnQuantity >= item.originalQuantity}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Return Summary */}
                  {selectedReturnItems.some(item => item.returnQuantity > 0) && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Return Summary</h4>
                      <div className="text-sm text-blue-800 space-y-1">
                        <div>
                          <strong>Items to Return:</strong> {selectedReturnItems.filter(item => item.returnQuantity > 0).length}
                        </div>
                        <div>
                          <strong>Total Return Value:</strong> Rs {selectedReturnItems
                            .reduce((total, item) => total + (item.returnQuantity * item.unitPrice), 0)
                            .toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
              <Button onClick={handleProcessReturn} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Process Return
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
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
          <TabsTrigger value="REFUNDED">Refunded ({getFilteredReturnsByStatus("REFUNDED").length})</TabsTrigger>
          <TabsTrigger value="EXCHANGED">Exchanged ({getFilteredReturnsByStatus("EXCHANGED").length})</TabsTrigger>
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

        <TabsContent value="REFUNDED">
          <Card>
            <CardHeader>
              <CardTitle>Refunded Sales</CardTitle>
              <CardDescription>Sales that have been refunded to customers</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("REFUNDED"))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="EXCHANGED">
          <Card>
            <CardHeader>
              <CardTitle>Exchanged Sales</CardTitle>
              <CardDescription>Sales that have been exchanged for other products</CardDescription>
            </CardHeader>
            <CardContent>{renderReturnsTable(getFilteredReturnsByStatus("EXCHANGED"))}</CardContent>
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
                  <h3 className="font-medium mb-2">Sale Information</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Sale ID:</strong> {selectedReturn.id}
                    </div>
                    <div>
                      <strong>Sale Number:</strong> {selectedReturn.sale_number}
                    </div>
                    <div>
                      <strong>Date:</strong> {new Date(selectedReturn.sale_date).toLocaleDateString()}
                    </div>
                    <div>
                      <strong>Status:</strong>{" "}
                      <Badge className={getStatusColor(selectedReturn.status)}>{selectedReturn.status}</Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Customer & Payment</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Customer:</strong> {selectedReturn.customer?.name || selectedReturn.customer?.email || "N/A"}
                    </div>
                    <div>
                      <strong>Payment Method:</strong> {selectedReturn.payment_method}
                    </div>
                    <div>
                      <strong>Total Amount:</strong> Rs {Number(selectedReturn.total_amount).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {selectedReturn.sale_items && selectedReturn.sale_items.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Sale Items</h3>
                  <div className="border rounded-lg p-4">
                    {selectedReturn.sale_items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2">
                        <div>
                          <div className="font-medium">{item.product.name}</div>
                          <div className="text-sm text-gray-500">
                            Qty: {item.quantity} • SKU: {item.product.sku} • Type: {item.item_type}
                          </div>
                        </div>
                        <div className="font-medium">Rs {Number(item.line_total).toLocaleString()}</div>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
