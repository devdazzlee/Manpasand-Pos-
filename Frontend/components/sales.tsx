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
  import { Label } from "@/components/ui/label";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import {
    Search,
    Plus,
    Loader2,
    RefreshCcw,
    DollarSign,
    ShoppingCart,
    TrendingUp,
    Receipt,
  } from "lucide-react";
  import { PageLoader } from "@/components/ui/page-loader";
  import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
  import apiClient from "@/lib/apiClient";
  import { API_BASE } from "@/config/constants";
  import { useToast } from "@/hooks/use-toast";
  import { CashRegister } from "@/components/cash-register";
  import { usePrinterSettings } from "@/hooks/use-printer-settings";
  import { useDashboardTab } from "@/lib/dashboard-tabs";

interface Branch { id: string; name: string; }
interface Customer { id: string; email: string; name: string | null; }
interface Product { id: string; name: string; }
interface SaleItem { productId: string; quantity: number; price: number; }
interface PrinterLocal { name: string; isDefault?: boolean; }
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
    const { setActiveTab } = useDashboardTab();

    // Data
    const [branches, setBranches] = useState<Branch[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    // Global printer settings (configured in Printer Settings page)
    const { receiptPrinter, printers: globalPrinters } = usePrinterSettings();

    // UI state
    const [branchFilter, setBranchFilter] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [productQuery, setProductQuery] = useState("");
    const [customerQuery, setCustomerQuery] = useState("");

    // Dialogs
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [saleForm, setSaleForm] = useState<{
      branchId: string;
      customerId: string;
      paymentMethod: string;
      printerName: string;
      items: SaleItem[];
    }>({
      branchId: "",
      customerId: "",
      paymentMethod: "CASH",
      printerName: "",
      items: [{ productId: "", quantity: 1, price: 0 }],
    });

    // 1) Load branches, customers, products
    useEffect(() => {
      const loadMeta = async () => {
        setIsInitialLoading(true);
        try {
          const [bRes] = await Promise.all([
            apiClient.get(`${API_BASE}/branches`, { params: { page: 1, limit: 100 } }),
          ]);
          setBranches(bRes.data.data);
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
          console.log(err);
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

    useEffect(() => {
      const timer = window.setTimeout(async () => {
        try {
          const [cRes, pRes] = await Promise.all([
            apiClient.get(`${API_BASE}/customer`, {
              params: { page: 1, limit: 20, search: customerQuery.trim() || undefined },
            }),
            apiClient.get(`${API_BASE}/products`, {
              params: {
                page: 1,
                limit: 20,
                is_active: true,
                search: productQuery.trim() || undefined,
              },
            }),
          ]);
          setCustomers(cRes.data.data || []);
          setProducts(pRes.data.data || []);
        } catch (err) {
          console.log(err);
        }
      }, 300);
      return () => window.clearTimeout(timer);
    }, [productQuery, customerQuery]);

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
          console.log(err);
          toast({
            title: "Error",
            description: "Failed to load sales",
            variant: "destructive",
          });
        })
        .finally(() => setIsLoading(false));
    }, [branchFilter, toast]);

    // Auto-fill printer from global settings when dialog opens
    useEffect(() => {
      if (!isAddOpen) return;
      if (receiptPrinter) {
        setSaleForm(f => ({ ...f, printerName: receiptPrinter }));
      }
    }, [isAddOpen, receiptPrinter]);

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
          printerName: "",
          items: [{ productId: "", quantity: 1, price: 0 }],
        });
        // refresh
        const res = await apiClient.get(`${API_BASE}/sale`, {
          params: { branchId },
        });
        setSales(res.data.data);
      } catch (err) {
        console.log(err);
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
        console.log(err);
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
      return <PageLoader message="Loading sales data..." />
    }

    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Sales</h1>
            <p className="text-gray-600">Manage sales and cash register</p>
          </div>
        </div>

        {/* Tabs for Sales and Cash Register */}
        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="cash-register" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Cash Register
            </TabsTrigger>
          </TabsList>

          {/* Sales Tab Content */}
          <TabsContent value="sales" className="space-y-4 md:space-y-6 mt-4">
            {/* Add Sale Button */}
            <div className="flex items-center justify-end">
              <Button onClick={() => setActiveTab("new-sale")}>
                <Plus className="h-4 w-4 mr-2" />
                Add Sale
              </Button>
            </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {isInitialLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Filter & Search */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="filter-branch">View Branch</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger id="filter-branch" className="w-full">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <PageLoader message="Loading sales..." />
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
          </TabsContent>

          {/* Cash Register Tab Content */}
          <TabsContent value="cash-register" className="mt-4">
            <CashRegister />
          </TabsContent>
        </Tabs>
      </div>
    );
  }
