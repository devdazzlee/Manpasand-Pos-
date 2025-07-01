"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Loader2,
  RefreshCcw,
  DollarSign,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";

interface Branch { id: string; name: string; }
interface Customer { id: string; email: string; name: string | null; }
interface Product { id: string; name: string; }
interface SaleItem { productId: string; quantity: number; price: number; }
interface Sale {
  id: string;
  sale_number: string;
  branch_id: string;
  customer_id: string | null;
  total_amount: number;
  payment_method: string;
  status: string;
  sale_date: string;
  customer: Customer;
}

export function Sales() {
  const { toast } = useToast();

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Dialogs
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [saleForm, setSaleForm] = useState<{
    branchId: string;
    customerId: string;
    paymentMethod: string;
    items: SaleItem[];
  }>({
    branchId: "",
    customerId: "",
    paymentMethod: "CASH",
    items: [{ productId: "", quantity: 1, price: 0 }],
  });

  // 1) Load branches, customers, products
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const [bRes, cRes, pRes] = await Promise.all([
          apiClient.get(`${API_BASE}/branches?limit=100`),
          apiClient.get(`${API_BASE}/customer`),
          apiClient.get(`${API_BASE}/products?limit=100`),
        ]);
        setBranches(bRes.data.data);
        setCustomers(cRes.data.data);
        setProducts(pRes.data.data);
        // default branch filter
        if (bRes.data.data.length) {
          setBranchFilter(bRes.data.data[0].id);
          setSaleForm(f => ({ ...f, branchId: bRes.data.data[0].id }));
        }
        toast({
          title: "Success",
          description: "Sales data loaded successfully",
        });
      } catch (err) {
        console.error(err);
        toast({
          title: "Error",
          description: "Failed to load sales data",
          variant: "destructive",
        });
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadMeta();
  }, [toast]);

  // 2) Fetch sales when branchFilter changes
  useEffect(() => {
    if (!branchFilter) return;
    setIsLoading(true);
    apiClient
      .get(`${API_BASE}/sale`, { params: { branchId: branchFilter } })
      .then(res => {
        setSales(res.data.data);
        toast({
          title: "Success",
          description: `Sales loaded for selected branch`,
        });
      })
      .catch(err => {
        console.error(err);
        toast({
          title: "Error",
          description: "Failed to load sales",
          variant: "destructive",
        });
      })
      .finally(() => setIsLoading(false));
  }, [branchFilter, toast]);

  // Handlers
  const handleAddSale = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post(`${API_BASE}/sale`, {
        branchId: saleForm.branchId,
        customerId: saleForm.customerId || undefined,
        paymentMethod: saleForm.paymentMethod,
        items: saleForm.items,
      });
      
      toast({
        title: "Success",
        description: "Sale created successfully",
      });
      
      setIsAddOpen(false);
      // reset form
      setSaleForm({
        branchId,
        customerId: "",
        paymentMethod: "CASH",
        items: [{ productId: "", quantity: 1, price: 0 }],
      });
      // refresh
      const res = await apiClient.get(`${API_BASE}/sale`, {
        params: { branchId },
      });
      setSales(res.data.data);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to create sale",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefund = async (saleId: string) => {
    try {
      await apiClient.patch(`${API_BASE}/sale/${saleId}/refund`, {});
      toast({
        title: "Success",
        description: "Sale refunded successfully",
      });
      // refresh
      const res = await apiClient.get(`${API_BASE}/sale`, { params: { branchId } });
      setSales(res.data.data);
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to refund sale",
        variant: "destructive",
      });
    }
  };

  // Add/remove item rows
  const addItemRow = () =>
    setSaleForm(f => ({
      ...f,
      items: [...f.items, { productId: "", quantity: 1, price: 0 }],
    }));
  const removeItemRow = (idx: number) =>
    setSaleForm(f => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx),
    }));

  const branchId = saleForm.branchId;

  // Filter sales based on search term
  const filteredSales = sales.filter(sale => 
    sale.sale_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalSales = sales.length;
  const totalRevenue = sales.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);
  const activeSales = sales.filter(sale => sale.status === 'COMPLETED').length;

  if (isInitialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading sales data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header + Add Sale */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales</h1>
          <p className="text-gray-600">Create & view sales</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Sale</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Branch */}
              <div>
                <Label htmlFor="sale-branch">Branch</Label>
                <select
                  id="sale-branch"
                  className="block w-full border rounded p-2"
                  value={saleForm.branchId}
                  onChange={e =>
                    setSaleForm({ ...saleForm, branchId: e.target.value })
                  }
                >
                  <option value="">Select branch</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer */}
              <div>
                <Label htmlFor="sale-customer">Customer</Label>
                <select
                  id="sale-customer"
                  className="block w-full border rounded p-2"
                  value={saleForm.customerId}
                  onChange={e =>
                    setSaleForm({ ...saleForm, customerId: e.target.value })
                  }
                >
                  <option value="">-- walk-in --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <Label htmlFor="sale-payment">Payment Method</Label>
                <select
                  id="sale-payment"
                  className="block w-full border rounded p-2"
                  value={saleForm.paymentMethod}
                  onChange={e =>
                    setSaleForm({ ...saleForm, paymentMethod: e.target.value })
                  }
                >
                  {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "CREDIT"].map(m => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items */}
              {saleForm.items.map((item, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end">
                  <div>
                    <Label htmlFor={`prod-${i}`}>Product</Label>
                    <select
                      id={`prod-${i}`}
                      className="block w-full border rounded p-2"
                      value={item.productId}
                      onChange={e => {
                        const pid = e.target.value;
                        setSaleForm(f => {
                          const items = [...f.items];
                          items[i].productId = pid;
                          return { ...f, items };
                        });
                      }}
                    >
                      <option value="">Select product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={`qty-${i}`}>Qty</Label>
                    <Input
                      id={`qty-${i}`}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => {
                        const qty = Number(e.target.value);
                        setSaleForm(f => {
                          const items = [...f.items];
                          items[i].quantity = qty;
                          return { ...f, items };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`price-${i}`}>Price</Label>
                    <Input
                      id={`price-${i}`}
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.price}
                      onChange={e => {
                        const pr = Number(e.target.value);
                        setSaleForm(f => {
                          const items = [...f.items];
                          items[i].price = pr;
                          return { ...f, items };
                        });
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeItemRow(i)}
                    disabled={saleForm.items.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}

              <Button variant="link" onClick={addItemRow}>
                + Add another item
              </Button>

              <Button
                onClick={handleAddSale}
                className="w-full"
                disabled={isSubmitting || !saleForm.branchId || saleForm.items.some(item => !item.productId || item.quantity <= 0 || item.price <= 0)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating Sale...
                  </>
                ) : (
                  "Save Sale"
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
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSales}</div>
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
            <CardTitle className="text-sm font-medium">Completed Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeSales}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="filter-branch">View Branch</Label>
          <select
            id="filter-branch"
            className="block w-full border rounded p-2"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
          >
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative max-w-md top-[25px]">
          <Search className="absolute left-3 top-[20px] -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search sale #..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales ({filteredSales.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="text-center">
                <Loader2 className="animate-spin h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-600">Loading sales...</p>
              </div>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No sales found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale #</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sale_number}</TableCell>
                    <TableCell>
                      {branches.find(b => b.id === s.branch_id)?.name || s.branch_id}
                    </TableCell>
                    <TableCell>
                      {s.customer?.email || "—"}
                    </TableCell>
                    <TableCell>{s.sale_date.split("T")[0]}</TableCell>
                    <TableCell className="font-medium">${Number(s.total_amount).toFixed(2)}</TableCell>
                    <TableCell>{s.payment_method.replace("_", " ")}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        s.status === 'COMPLETED' 
                          ? 'bg-green-100 text-green-800' 
                          : s.status === 'REFUNDED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {s.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRefund(s.id)}
                        disabled={s.status === 'REFUNDED'}
                        className={s.status === 'REFUNDED' ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        <RefreshCcw className="h-4 w-4 mr-1" />
                        {s.status === 'REFUNDED' ? 'Refunded' : 'Refund'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
