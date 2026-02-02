"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Eye, RefreshCcw, Search, ShoppingBag, DollarSign, Clock, Globe } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";

interface OrderItem { 
  productId: string; 
  quantity: number; 
  product: { name: string; id: string }; 
  price: string;
  total_price: string;
}

interface WebsiteOrder { 
  id: string; 
  order_number: string; 
  total_amount: string; 
  status: string; 
  created_at: string; 
  items: OrderItem[];
  payment_method: string;
}

const WebsiteOrders: React.FC = () => {
  const { toast } = useToast();

  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WebsiteOrder | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter) {
        params.status = statusFilter;
      }
      params.page = '1';
      params.pageSize = '100'; // Get more orders for website orders
      
      const res = await apiClient.get(`${API_BASE}/guest/order`, { params });
      setOrders(res.data.data.data || []);
    } catch (err: any) {
      console.log("Website orders load failed", err);
      
      let errorMessage = "Failed to load website orders";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      // Use the regular order status update endpoint
      await apiClient.patch(`${API_BASE}/order/${orderId}/status`, { status: newStatus });
      toast({
        title: "Success",
        description: "Order status updated successfully",
      });
      fetchOrders();
    } catch (err: any) {
      console.log("Status update failed", err);
      
      let errorMessage = "Failed to update order status";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const viewOrderDetail = async (orderId: string) => {
    try {
      const res = await apiClient.get(`${API_BASE}/guest/order/${orderId}`);
      setSelectedOrder(res.data.data);
      setIsDetailOpen(true);
    } catch (err: any) {
      console.log("Fetch detail failed", err);
      
      let errorMessage = "Failed to load order details";
      
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const filtered = orders.filter(o => 
    o.order_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  const pendingOrders = orders.filter(order => order.status === 'PENDING').length;

  if (isInitialLoading) {
    return <PageLoader message="Loading website orders..." />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
            Website Orders
          </h1>
          <p className="text-sm md:text-base text-gray-600">View & manage orders from website</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Website Orders</CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOrders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Rs. {(Number(totalRevenue) || 0).toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{pendingOrders}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search Order #"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="status-filter">Status:</Label>
          <select 
            id="status-filter" 
            className="border rounded p-2" 
            value={statusFilter} 
            onChange={e => { 
              setStatusFilter(e.target.value); 
            }}
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <Button onClick={fetchOrders} variant="outline">
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Website Orders List ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoader message="Loading orders..." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No website orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Order #</TableHead>
                      <TableHead className="min-w-[100px]">Total</TableHead>
                      <TableHead className="min-w-[120px]">Payment</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Date</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="font-medium">Rs. {(Number(o.total_amount) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-sm">{o.payment_method || 'CASH'}</TableCell>
                        <TableCell>
                          <select 
                            className="border rounded p-1 text-sm" 
                            value={o.status} 
                            onChange={e => handleStatusUpdate(o.id, e.target.value)}
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="PROCESSING">PROCESSING</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        </TableCell>
                        <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="flex space-x-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => viewOrderDetail(o.id)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4"/>
                            <span className="hidden sm:inline">View</span>
                          </Button>
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

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={() => setIsDetailOpen(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Website Order Details
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Number</Label>
                      <p className="text-base font-semibold mt-1">{selectedOrder.order_number}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Status</Label>
                      <div className="mt-1">
                        <select 
                          className="border rounded p-2 text-sm font-semibold w-full" 
                          value={selectedOrder.status} 
                          onChange={e => {
                            handleStatusUpdate(selectedOrder.id, e.target.value);
                            setSelectedOrder({...selectedOrder, status: e.target.value});
                          }}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="PROCESSING">PROCESSING</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Order Date</Label>
                      <p className="text-base mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Payment Method</Label>
                      <p className="text-base mt-1 font-semibold">{selectedOrder.payment_method || 'CASH'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-500">Total Amount</Label>
                      <p className="text-2xl font-bold text-green-600 mt-1">Rs. {(Number(selectedOrder.total_amount) || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order Items ({selectedOrder.items.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">Product Name</TableHead>
                          <TableHead className="font-semibold text-center">Quantity</TableHead>
                          <TableHead className="font-semibold text-right">Unit Price</TableHead>
                          <TableHead className="font-semibold text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item, idx) => (
                          <TableRow key={`${item.productId}-${idx}`}>
                            <TableCell className="font-medium">{item.product.name}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right">Rs. {(Number(item.price) || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">Rs. {(Number(item.total_price) || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={3} className="text-right font-bold">Grand Total:</TableCell>
                          <TableCell className="text-right font-bold text-lg text-green-600">
                            Rs. {(Number(selectedOrder.total_amount) || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDetailOpen(false)}
                >
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    fetchOrders();
                    setIsDetailOpen(false);
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebsiteOrders;

