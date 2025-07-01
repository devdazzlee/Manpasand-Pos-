"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Trash2, Edit, Eye, RefreshCcw, Search, ShoppingBag, DollarSign, Clock } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";

interface Customer { id: string; email: string; name: string | null; }
interface Product { id: string; name: string; }
interface OrderItem { productId: string; quantity: number; product: { name: string }; }
interface Order { id: string; order_number: string; total_amount: string; status: string; created_at: string; items: OrderItem[]; }

const Orders: React.FC = () => {
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [orderForm, setOrderForm] = useState<{
    customerId: string;
    paymentMethod: string;
    items: OrderItem[];
  }>({ customerId: "", paymentMethod: "CASH", items: [{ productId: "", quantity: 1, product: { name: "" } }] });

  useEffect(() => {
    fetchMetadata();
    fetchOrders();
  }, []);

  const fetchMetadata = async () => {
    setIsInitialLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        apiClient.get(`${API_BASE}/customer`),
        apiClient.get(`${API_BASE}/products?limit=100`),
      ]);
      setCustomers(cRes.data.data);
      setProducts(pRes.data.data);
      toast({
        title: "Success",
        description: "Orders data loaded successfully",
      });
    } catch (err: any) {
      console.error("Metadata load failed", err);
      
      // Extract error message from API response
      let errorMessage = "Failed to load orders data";
      
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
      setIsInitialLoading(false);
    }
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await apiClient.get(`${API_BASE}/order`, { params });
      setOrders(res.data.data);
      toast({
        title: "Success",
        description: "Orders loaded successfully",
      });
    } catch (err: any) {
      console.error("Orders load failed", err);
      
      // Extract error message from API response
      let errorMessage = "Failed to load orders";
      
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
    }
  };

  const handleCreateOrder = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/order`, orderForm);
      toast({
        title: "Success",
        description: "Order created successfully",
      });
      setIsAddOpen(false);
      resetForm();
      fetchOrders();
    } catch (err: any) {
      console.error("Order creation failed", err);
      
      // Extract error message from API response
      let errorMessage = "Failed to create order";
      
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
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setOrderForm({ customerId: "", paymentMethod: "CASH", items: [{ productId: "", quantity: 1, product: { name: "" } }] });
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await apiClient.delete(`${API_BASE}/order/${orderId}`);
      toast({
        title: "Success",
        description: "Order cancelled successfully",
      });
      fetchOrders();
    } catch (err: any) {
      console.error("Cancel failed", err);
      
      // Extract error message from API response
      let errorMessage = "Failed to cancel order";
      
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

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await apiClient.patch(`${API_BASE}/order/${orderId}/status`, { status: newStatus });
      toast({
        title: "Success",
        description: "Order status updated successfully",
      });
      fetchOrders();
    } catch (err: any) {
      console.error("Status update failed", err);
      
      // Extract error message from API response
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
      const res = await apiClient.get(`${API_BASE}/order/${orderId}`);
      setSelectedOrder(res.data.data);
      setIsDetailOpen(true);
    } catch (err: any) {
      console.error("Fetch detail failed", err);
      
      // Extract error message from API response
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

  const addItemRow = () => setOrderForm(f => ({ ...f, items: [...f.items, { productId: "", quantity: 1, product: { name: "" } }] }));
  const removeItemRow = (idx: number) => setOrderForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const filtered = orders
    .filter(o => o.order_number.toLowerCase().includes(searchTerm.toLowerCase()));

  // Calculate stats
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  const pendingOrders = orders.filter(order => order.status === 'PENDING').length;

  if (isInitialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading orders data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders Management</h1>
          <p className="text-gray-600">Create & manage customer orders</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Customer</Label>
                <select 
                  className="w-full p-2 border rounded" 
                  value={orderForm.customerId} 
                  onChange={e => setOrderForm({ ...orderForm, customerId: e.target.value })}
                >
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.email}</option>)}
                </select>
              </div>
              <div>
                <Label>Payment Method</Label>
                <select 
                  className="w-full p-2 border rounded" 
                  value={orderForm.paymentMethod} 
                  onChange={e => setOrderForm({ ...orderForm, paymentMethod: e.target.value })}
                >
                  {['CASH','CARD','MOBILE_MONEY'].map(pm => <option key={pm} value={pm}>{pm.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              {orderForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <Label>Product</Label>
                    <select 
                      className="w-full p-2 border rounded" 
                      value={item.productId} 
                      onChange={e => {
                        const pid = e.target.value;
                        setOrderForm(f => { 
                          const items=[...f.items]; 
                          items[idx].productId=pid; 
                          return {...f,items}; 
                        });
                      }}
                    >
                      <option value="">Select product</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input 
                      type="number" 
                      min={1} 
                      value={item.quantity} 
                      onChange={e => {
                        const q=Number(e.target.value);
                        setOrderForm(f=>{
                          const items=[...f.items];
                          items[idx].quantity=q;
                          return{...f,items};
                        });
                      }}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={()=>removeItemRow(idx)}
                    disabled={orderForm.items.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button variant="link" onClick={addItemRow}>+ Add item</Button>
              <Button 
                onClick={handleCreateOrder} 
                disabled={isSubmitting || !orderForm.customerId || orderForm.items.some(item => !item.productId || item.quantity <= 0)}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating Order...
                  </>
                ) : (
                  "Submit Order"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
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
            <div className="text-2xl font-bold text-green-600">${(Number(totalRevenue) || 0).toFixed(2)}</div>
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
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
              fetchOrders(); 
            }}
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <Button onClick={fetchOrders} variant="outline">
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders List ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="text-center">
                <Loader2 className="animate-spin h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-600">Loading orders...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No orders found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(o=> (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.order_number}</TableCell>
                    <TableCell className="font-medium">${(Number(o.total_amount) || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <select 
                        className="border rounded p-1" 
                        value={o.status} 
                        onChange={e=>handleStatusUpdate(o.id,e.target.value)}
                      >
                        <option>PENDING</option>
                        <option>PROCESSING</option>
                        <option>COMPLETED</option>
                      </select>
                    </TableCell>
                    <TableCell>{o.created_at.split('T')[0]}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={()=>viewOrderDetail(o.id)}
                      >
                        <Eye className="w-4 h-4"/>
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={()=>handleCancelOrder(o.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={()=>setIsDetailOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Order #</Label>
                  <p className="text-sm">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <p className="text-sm">{selectedOrder.status}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <p className="text-sm">{selectedOrder.created_at.split('T')[0]}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Total</Label>
                  <p className="text-sm font-medium">${(Number(selectedOrder.total_amount) || 0).toFixed(2)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map(item=>(
                      <TableRow key={item.productId}>
                        <TableCell>{item.product.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
