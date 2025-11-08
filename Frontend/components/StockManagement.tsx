"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, ArrowRightLeft, RefreshCw, TrendingUp, TrendingDown, Package, Loader2, Calendar, Edit, Check, ChevronsUpDown } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { usePosData } from "@/hooks/use-pos-data";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stock {
  id: string;
  product: Product;
  branch: Branch;
  current_quantity: number;
  last_updated: string;
}

interface Movement {
  id: string;
  product: Product;
  branch: Branch;
  movement_type: string;
  quantity_change: number;
  previous_qty: number;
  new_qty: number;
  created_at: string;
  notes?: string;
  user?: { email: string };
}

export function StockManagement() {
  const { toast } = useToast();
  
  // Global store data
  const { 
    products: globalProducts, 
    isAnyLoading: globalLoading,
    refreshAllData 
  } = usePosData();
  
  // Data lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [todayMovements, setTodayMovements] = useState<Movement[]>([]);
  
  // Pagination and meta
  const [totalStocks, setTotalStocks] = useState(0);
  const [stockMeta, setStockMeta] = useState({ page: 1, limit: 20, totalPages: 1 });

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Pagination for products
  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Pagination for stock table
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(20);

  // Dialog state
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  // Popover state for product comboboxes
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [adjustProductOpen, setAdjustProductOpen] = useState(false);
  const [transferProductOpen, setTransferProductOpen] = useState(false);

  // Form state
  const [transferForm, setTransferForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: 1,
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: 1,
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    branchId: "",
    quantityChange: 0,
    reason: "",
  });

  // 1) Fetch branches on mount
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const bRes = await apiClient.get(`${API_BASE}/branches?limit=100`);
        setBranches(bRes.data.data);
      } catch (e: any) {
        console.log(e);
        let errorMessage = "Failed to load branches";
        if (e.response?.data?.message) errorMessage = e.response.data.message;
        else if (e.message) errorMessage = e.message;
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadMeta();
  }, []);

  // Reset to page 1 when search changes
  useEffect(() => {
    setStockPage(1);
  }, [searchTerm]);

  // 3) Fetch stocks & history whenever branchFilter or stockPage or searchTerm changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: stockPage.toString(),
          limit: stockPageSize.toString(),
        });
        
        // Only add branchId if a specific branch is selected
        if (branchFilter && branchFilter !== "all") {
          params.append('branchId', branchFilter);
        }
        
        if (searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }
        
        const [sRes, hRes, tRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/history${branchFilter && branchFilter !== "all" ? `?branchId=${branchFilter}` : ""}`),
          apiClient.get(`${API_BASE}/stock/today${branchFilter && branchFilter !== "all" ? `?branchId=${branchFilter}` : ""}`),
        ]);
        
        setAllStocks(sRes.data.data || []);
        setTotalStocks(sRes.data.meta?.total || 0);
        if (sRes.data.meta) {
          setStockMeta(sRes.data.meta);
        }
        setHistory(hRes.data.data || []);
        setTodayMovements(tRes.data.data || []);
      } catch (e: any) {
        console.log(e);
        toast({
          title: "Error",
          description: "Failed to load stock data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [branchFilter, stockPage, stockPageSize, searchTerm]);

  // Fetch products with search and pagination
  useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const params: any = {
          page: productPage,
          limit: 100,
          is_active: true,
        };
        
        if (productSearch) {
          params.search = productSearch;
        }

        const response = await apiClient.get(`${API_BASE}/products`, { params });
        const data = response.data.data || response.data;
        
        if (productPage === 1) {
          setProducts(data.products || data);
        } else {
          setProducts(prev => [...prev, ...(data.products || data)]);
        }
        setTotalProducts(data.meta?.total || (data.products || data).length);
      } catch (e: any) {
        console.log(e);
        toast({
          title: "Error",
          description: "Failed to load products",
          variant: "destructive",
        });
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [productPage, productSearch]);

  // Stock pagination is now handled by backend
  const totalStockPages = stockMeta.totalPages;

  // Dynamic pagination options based on total stocks
  const getPaginationOptions = () => {
    if (totalStocks === 0) return [20, 50, 100, 500];
    if (totalStocks <= 20) return [20, 50];
    if (totalStocks <= 50) return [20, 50, 100];
    if (totalStocks <= 100) return [20, 50, 100, 500];
    if (totalStocks <= 500) return [20, 50, 100, 500, 1000];
    return [20, 50, 100, 500, 1000];
  };
  const paginationOptions = getPaginationOptions();

  // Stats - note: these are for current page only, not total
  const totalItems = totalStocks; // Total from backend
  const totalQuantity = allStocks.reduce((sum, s) => sum + Number(s.current_quantity || 0), 0);
  const lowStockItems = allStocks.filter((s) => Number(s.current_quantity || 0) <= 10).length;

  // Handlers
  const handleTransfer = async () => {
    if (!transferForm.productId || !transferForm.fromBranchId || !transferForm.toBranchId || transferForm.quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock/transfer`, {
        productId: transferForm.productId,
        fromBranchId: transferForm.fromBranchId,
        toBranchId: transferForm.toBranchId,
        quantity: transferForm.quantity,
        notes: transferForm.notes,
      });

      setIsTransferOpen(false);
      setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: 1, notes: "" });

      // Reload data
      const params = new URLSearchParams({
        branchId: branchFilter,
        page: stockPage.toString(),
        limit: stockPageSize.toString(),
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      
      const [sRes, hRes, tRes] = await Promise.all([
        apiClient.get(`${API_BASE}/stock?${params}`),
        apiClient.get(`${API_BASE}/stock/history?branchId=${branchFilter}`),
        apiClient.get(`${API_BASE}/stock/today?branchId=${branchFilter}`),
      ]);
      setAllStocks(sRes.data.data);
      setTotalStocks(sRes.data.meta?.total || 0);
      if (sRes.data.meta) {
        setStockMeta(sRes.data.meta);
      }
      setHistory(hRes.data.data);
      setTodayMovements(tRes.data.data);

      toast({
        title: "Success",
        description: "Stock transferred successfully",
      });
    } catch (e: any) {
      console.log(e);
      let errorMessage = "Failed to transfer stock";
      if (e.response?.data?.message) errorMessage = e.response.data.message;
      else if (e.message) errorMessage = e.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAddStock = async () => {
    if (!addForm.productId || !addForm.branchId || addForm.quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId: addForm.productId,
        branchId: addForm.branchId,
        quantity: addForm.quantity,
      });

      setIsAddOpen(false);
      setAddForm({ productId: "", branchId: "", quantity: 1 });

      // Reload data
      const params = new URLSearchParams({
        branchId: branchFilter,
        page: stockPage.toString(),
        limit: stockPageSize.toString(),
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      
      const [sRes, hRes, tRes] = await Promise.all([
        apiClient.get(`${API_BASE}/stock?${params}`),
        apiClient.get(`${API_BASE}/stock/history?branchId=${branchFilter}`),
        apiClient.get(`${API_BASE}/stock/today?branchId=${branchFilter}`),
      ]);
      setAllStocks(sRes.data.data);
      setTotalStocks(sRes.data.meta?.total || 0);
      if (sRes.data.meta) {
        setStockMeta(sRes.data.meta);
      }
      setHistory(hRes.data.data);
      setTodayMovements(tRes.data.data);

      toast({
        title: "Success",
        description: "Stock added successfully",
      });
    } catch (e: any) {
      console.log(e);
      let errorMessage = "Failed to add stock";
      if (e.response?.data?.message) errorMessage = e.response.data.message;
      else if (e.message) errorMessage = e.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!adjustForm.productId || !adjustForm.branchId) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId: adjustForm.productId,
        branchId: adjustForm.branchId,
        quantityChange: adjustForm.quantityChange,
        reason: adjustForm.reason,
      });

      setIsAdjustOpen(false);
      setAdjustForm({ productId: "", branchId: "", quantityChange: 0, reason: "" });

      // Reload data
      const params = new URLSearchParams({
        branchId: branchFilter,
        page: stockPage.toString(),
        limit: stockPageSize.toString(),
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      
      const [sRes, hRes, tRes] = await Promise.all([
        apiClient.get(`${API_BASE}/stock?${params}`),
        apiClient.get(`${API_BASE}/stock/history?branchId=${branchFilter}`),
        apiClient.get(`${API_BASE}/stock/today?branchId=${branchFilter}`),
      ]);
      setAllStocks(sRes.data.data);
      setTotalStocks(sRes.data.meta?.total || 0);
      if (sRes.data.meta) {
        setStockMeta(sRes.data.meta);
      }
      setHistory(hRes.data.data);
      setTodayMovements(tRes.data.data);

      toast({
        title: "Success",
        description: "Stock adjusted successfully",
      });
    } catch (e: any) {
      console.log(e);
      let errorMessage = "Failed to adjust stock";
      if (e.response?.data?.message) errorMessage = e.response.data.message;
      else if (e.message) errorMessage = e.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const getMovementBadge = (type: string) => {
    const colors: Record<string, string> = {
      PURCHASE: "bg-green-100 text-green-800",
      SALE: "bg-blue-100 text-blue-800",
      ADJUSTMENT: "bg-purple-100 text-purple-800",
      TRANSFER_IN: "bg-emerald-100 text-emerald-800",
      TRANSFER_OUT: "bg-orange-100 text-orange-800",
      RETURN: "bg-yellow-100 text-yellow-800",
      DAMAGE: "bg-red-100 text-red-800",
      EXPIRED: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[type] || "bg-gray-100 text-gray-800"}>{type}</Badge>;
  };

  const loadMoreProducts = () => {
    setProductPage(prev => prev + 1);
  };

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
    setProductPage(1);
    setProducts([]);
  };

  // Use the products directly from API (already filtered by productSearch)
  const filteredProductsForCombobox = products;

  if (isInitialLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-sm md:text-base text-gray-600">Loading stock management data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header + Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage stock arrivals, transfers, and track movements across branches
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Use "Add Stock" to record stock arrivals with date and quantity • Track today's movements in history
          </p>
          {globalLoading && (
            <p className="text-xs md:text-sm text-blue-600 mt-1">Loading data from cache...</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refreshAllData}
            disabled={globalLoading}
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${globalLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Product *</Label>
                  <Popover open={addProductOpen} onOpenChange={setAddProductOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={addProductOpen}
                        className="w-full justify-between"
                      >
                        {addForm.productId
                          ? products.find((p) => p.id === addForm.productId)?.name
                          : "Select product..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search product..." 
                          value={productSearch}
                          onValueChange={handleProductSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {loadingProducts ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="animate-spin h-4 w-4" />
                              </div>
                            ) : (
                              "No product found."
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredProductsForCombobox.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.id}
                                onSelect={() => {
                                  setAddForm({ ...addForm, productId: p.id });
                                  setAddProductOpen(false);
                                  handleProductSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    addForm.productId === p.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {p.name}
                              </CommandItem>
                            ))}
                            {products.length < totalProducts && (
                              <CommandItem disabled>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={loadMoreProducts}
                                  disabled={loadingProducts}
                                  className="w-full"
                                >
                                  {loadingProducts ? (
                                    <Loader2 className="animate-spin h-4 w-4" />
                                  ) : (
                                    `Load More (${totalProducts - products.length} remaining)`
                                  )}
                                </Button>
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="add-branch">Branch *</Label>
                  <Select
                    value={addForm.branchId}
                    onValueChange={(value) =>
                      setAddForm({ ...addForm, branchId: value })
                    }
                  >
                    <SelectTrigger>
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
                <div>
                  <Label htmlFor="add-quantity">Quantity *</Label>
                  <Input
                    id="add-quantity"
                    type="number"
                    min={1}
                    value={addForm.quantity}
                    onChange={(e) =>
                      setAddForm({ ...addForm, quantity: Number(e.target.value) })
                    }
                  />
                </div>
                <Button
                  onClick={handleAddStock}
                  disabled={isTransferring}
                  className="w-full"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Stock
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Adjust Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Adjust Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Product *</Label>
                  <Popover open={adjustProductOpen} onOpenChange={setAdjustProductOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={adjustProductOpen}
                        className="w-full justify-between"
                      >
                        {adjustForm.productId
                          ? products.find((p) => p.id === adjustForm.productId)?.name
                          : "Select product..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search product..." 
                          value={productSearch}
                          onValueChange={handleProductSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {loadingProducts ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="animate-spin h-4 w-4" />
                              </div>
                            ) : (
                              "No product found."
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredProductsForCombobox.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.id}
                                onSelect={() => {
                                  setAdjustForm({ ...adjustForm, productId: p.id });
                                  setAdjustProductOpen(false);
                                  handleProductSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    adjustForm.productId === p.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {p.name}
                              </CommandItem>
                            ))}
                            {products.length < totalProducts && (
                              <CommandItem disabled>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={loadMoreProducts}
                                  disabled={loadingProducts}
                                  className="w-full"
                                >
                                  {loadingProducts ? (
                                    <Loader2 className="animate-spin h-4 w-4" />
                                  ) : (
                                    `Load More (${totalProducts - products.length} remaining)`
                                  )}
                                </Button>
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="adjust-branch">Branch *</Label>
                  <Select
                    value={adjustForm.branchId}
                    onValueChange={(value) =>
                      setAdjustForm({ ...adjustForm, branchId: value })
                    }
                  >
                    <SelectTrigger>
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
                <div>
                  <Label htmlFor="adjust-quantity">Quantity Change *</Label>
                  <Input
                    id="adjust-quantity"
                    type="number"
                    value={adjustForm.quantityChange}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, quantityChange: Number(e.target.value) })
                    }
                    placeholder="Enter positive or negative number"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Positive to add, negative to deduct
                  </p>
                </div>
                <div>
                  <Label htmlFor="adjust-reason">Reason (Optional)</Label>
                  <Textarea
                    id="adjust-reason"
                    value={adjustForm.reason}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, reason: e.target.value })
                    }
                    placeholder="Enter reason for adjustment..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleAdjustStock}
                  disabled={isTransferring}
                  className="w-full"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Adjusting...
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4 mr-2" />
                      Adjust Stock
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transfer Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Transfer Stock Between Branches</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Product *</Label>
                  <Popover open={transferProductOpen} onOpenChange={setTransferProductOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={transferProductOpen}
                        className="w-full justify-between"
                      >
                        {transferForm.productId
                          ? products.find((p) => p.id === transferForm.productId)?.name
                          : "Select product..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search product..." 
                          value={productSearch}
                          onValueChange={handleProductSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {loadingProducts ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="animate-spin h-4 w-4" />
                              </div>
                            ) : (
                              "No product found."
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredProductsForCombobox.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.id}
                                onSelect={() => {
                                  setTransferForm({ ...transferForm, productId: p.id });
                                  setTransferProductOpen(false);
                                  handleProductSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    transferForm.productId === p.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {p.name}
                              </CommandItem>
                            ))}
                            {products.length < totalProducts && (
                              <CommandItem disabled>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={loadMoreProducts}
                                  disabled={loadingProducts}
                                  className="w-full"
                                >
                                  {loadingProducts ? (
                                    <Loader2 className="animate-spin h-4 w-4" />
                                  ) : (
                                    `Load More (${totalProducts - products.length} remaining)`
                                  )}
                                </Button>
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="transfer-from">From Branch *</Label>
                  <Select
                    value={transferForm.fromBranchId}
                    onValueChange={(value) =>
                      setTransferForm({ ...transferForm, fromBranchId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source branch" />
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
                <div>
                  <Label htmlFor="transfer-to">To Branch *</Label>
                  <Select
                    value={transferForm.toBranchId}
                    onValueChange={(value) =>
                      setTransferForm({ ...transferForm, toBranchId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination branch" />
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
                <div>
                  <Label htmlFor="transfer-quantity">Quantity *</Label>
                  <Input
                    id="transfer-quantity"
                    type="number"
                    min={1}
                    value={transferForm.quantity}
                    onChange={(e) =>
                      setTransferForm({
                        ...transferForm,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="transfer-notes">Notes (Optional)</Label>
                  <Textarea
                    id="transfer-notes"
                    value={transferForm.notes}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, notes: e.target.value })
                    }
                    placeholder="Add any additional notes..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleTransfer}
                  disabled={isTransferring}
                  className="w-full"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer Stock
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalQuantity.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{lowStockItems}</div>
            <p className="text-xs text-muted-foreground mt-1">&lt;= 10 units</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Movements</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{todayMovements.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Select value={branchFilter || "all"} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs for Stock and History */}
      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="history">All History</TabsTrigger>
          <TabsTrigger value="today">Today's Movements</TabsTrigger>
        </TabsList>

        {/* Current Stock Tab */}
        <TabsContent value="stock">
          <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                <CardTitle>Current Stock ({totalStocks} total)</CardTitle>
                <Select value={String(stockPageSize)} onValueChange={(v) => { setStockPageSize(Number(v)); setStockPage(1); }}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paginationOptions.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-4 md:mx-0">
                    <div className="inline-block min-w-full align-middle">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Current Stock</TableHead>
                            <TableHead>Last Updated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allStocks.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                No stock found for this branch
                              </TableCell>
                            </TableRow>
                          ) : (
                            allStocks.map((s) => {
                              const qty = Number(s.current_quantity || 0);
                              return (
                                <TableRow key={s.id}>
                                  <TableCell className="font-medium">{s.product.name}</TableCell>
                                  <TableCell className="text-sm text-gray-500">{s.product.id.slice(0, 8)}</TableCell>
                                  <TableCell>
                                    <Badge variant={qty <= 10 ? "destructive" : qty < 0 ? "outline" : "secondary"}>
                                      {qty.toFixed(2)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-gray-500">
                                    {new Date(s.last_updated).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  {totalStockPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-gray-500">
                        Page {stockPage} of {totalStockPages} (Total: {totalStocks} items)
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStockPage(p => Math.max(1, p - 1))}
                          disabled={stockPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStockPage(p => Math.min(totalStockPages, p + 1))}
                          disabled={stockPage === totalStockPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Stock Movement History ({history.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Movement Type</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead>Previous Qty</TableHead>
                          <TableHead>New Qty</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>User</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                              No movement history found
                            </TableCell>
                          </TableRow>
                        ) : (
                          history.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="text-sm">
                                {new Date(m.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="font-medium">{m.product.name}</TableCell>
                              <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={m.quantity_change > 0 ? "default" : "destructive"}
                                >
                                  {m.quantity_change > 0 ? "+" : ""}
                                  {m.quantity_change}
                                </Badge>
                              </TableCell>
                              <TableCell>{Number(m.previous_qty).toFixed(2)}</TableCell>
                              <TableCell>{Number(m.new_qty).toFixed(2)}</TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {m.notes || "-"}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {m.user?.email || "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Movements Tab */}
        <TabsContent value="today">
          <Card>
            <CardHeader>
              <CardTitle>Today's Stock Movements ({todayMovements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Movement Type</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead>Previous Qty</TableHead>
                          <TableHead>New Qty</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayMovements.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                              No movements today
                            </TableCell>
                          </TableRow>
                        ) : (
                          todayMovements.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="text-sm">
                                {new Date(m.created_at).toLocaleTimeString()}
                              </TableCell>
                              <TableCell className="font-medium">{m.product.name}</TableCell>
                              <TableCell>{getMovementBadge(m.movement_type)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={m.quantity_change > 0 ? "default" : "destructive"}
                                >
                                  {m.quantity_change > 0 ? "+" : ""}
                                  {m.quantity_change}
                                </Badge>
                              </TableCell>
                              <TableCell>{Number(m.previous_qty).toFixed(2)}</TableCell>
                              <TableCell>{Number(m.new_qty).toFixed(2)}</TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {m.notes || "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
