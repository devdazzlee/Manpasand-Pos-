"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, ArrowRightLeft, RefreshCw, TrendingUp, TrendingDown, Package, Loader2, Calendar, Edit } from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { usePosData } from "@/hooks/use-pos-data";
import { PageLoader } from "@/components/ui/page-loader";
import { Textarea } from "@/components/ui/textarea";

interface Product {
  id: string;
  name: string;
  sku?: string;
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

  // Product search state
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
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  // Dropdown state for product selection
  const [addProductDropdownOpen, setAddProductDropdownOpen] = useState(false);
  const [adjustProductDropdownOpen, setAdjustProductDropdownOpen] = useState(false);
  const [transferProductDropdownOpen, setTransferProductDropdownOpen] = useState(false);
  const [removeProductDropdownOpen, setRemoveProductDropdownOpen] = useState(false);
  
  // Refs for dropdown containers
  const addProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const adjustProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const transferProductDropdownRef = React.useRef<HTMLDivElement>(null);
  const removeProductDropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Refs for search inputs
  const addProductSearchRef = React.useRef<HTMLInputElement>(null);
  const adjustProductSearchRef = React.useRef<HTMLInputElement>(null);
  const transferProductSearchRef = React.useRef<HTMLInputElement>(null);
  const removeProductSearchRef = React.useRef<HTMLInputElement>(null);

  // Form state
  const [transferForm, setTransferForm] = useState({
    productId: "",
    fromBranchId: "",
    toBranchId: "",
    quantity: "" as string | number,
    notes: "",
  });

  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    branchId: "",
    quantityChange: "" as string | number,
    reason: "",
  });

  const [removeForm, setRemoveForm] = useState({
    productId: "",
    branchId: "",
    quantity: "" as string | number,
    reason: "",
  });

  // 1) Fetch branches on mount
  useEffect(() => {
    const loadMeta = async () => {
      setIsInitialLoading(true);
      try {
        const bRes = await apiClient.get(`${API_BASE}/branches?fetch_all=true`);
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
        
        // Check if user is admin - don't filter by branch for admin
        const userRole = localStorage.getItem("role");
        const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
        
        // Only add branchId if a specific branch is selected AND user is not admin
        if (branchFilter && branchFilter !== "all" && !isAdmin) {
          params.append('branchId', branchFilter);
        }
        
        if (searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }
        
        const [sRes, hRes, tRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock?${params}`),
          apiClient.get(`${API_BASE}/stock/history${branchFilter && branchFilter !== "all" && !isAdmin ? `?branchId=${branchFilter}` : ""}`),
          apiClient.get(`${API_BASE}/stock/today${branchFilter && branchFilter !== "all" && !isAdmin ? `?branchId=${branchFilter}` : ""}`),
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

  // Function to fetch products from API
  const fetchProductsFromAPI = useCallback(async (searchTerm: string = "") => {
    setLoadingProducts(true);
    try {
      const params: any = {
        fetch_all: true,
      };
      
      // Add search term if provided
      if (searchTerm && searchTerm.trim().length > 0) {
        params.search = searchTerm.trim();
      }
      
      // Don't filter by branch_id or is_active for admin users
      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch");
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr);
            params.branch_id = branchObj.id || branchStr;
          } catch (e) {
            params.branch_id = branchStr;
          }
        }
        params.is_active = true;
      }

      const response = await apiClient.get(`${API_BASE}/products`, { params });
      const data = response.data.data || response.data;
      const productsList = data.products || data || [];
      
      setProducts(productsList);
      setTotalProducts(data.meta?.total || productsList.length);
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
  }, []);

  // Live search products from API with debouncing - like returns modal
  useEffect(() => {
    // Debounce API calls - wait 300ms after user stops typing
    const timeoutId = setTimeout(() => {
      fetchProductsFromAPI(productSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productSearch, fetchProductsFromAPI]); // Fetch when search term changes

  // Fetch initial products when Add Stock modal opens
  useEffect(() => {
    if (isAddOpen) {
      // Fetch initial products when modal opens
      fetchProductsFromAPI("");
    } else {
      // Clear products when modal closes
      setProducts([]);
      setProductSearch("");
    }
  }, [isAddOpen, fetchProductsFromAPI]);

  // Fetch initial products when Adjust Stock modal opens
  useEffect(() => {
    if (isAdjustOpen) {
      // Fetch initial products when modal opens
      fetchProductsFromAPI("");
    } else {
      // Clear products when modal closes
      setProducts([]);
      setProductSearch("");
    }
  }, [isAdjustOpen, fetchProductsFromAPI]);

  // Fetch initial products when Transfer Stock modal opens
  useEffect(() => {
    if (isTransferOpen) {
      // Fetch initial products when modal opens
      fetchProductsFromAPI("");
    } else {
      // Clear products when modal closes
      setProducts([]);
      setProductSearch("");
    }
  }, [isTransferOpen, fetchProductsFromAPI]);

  // Fetch initial products when Remove Stock modal opens
  useEffect(() => {
    if (isRemoveOpen) {
      // Fetch initial products when modal opens
      fetchProductsFromAPI("");
    } else {
      // Clear products when modal closes
      setProducts([]);
      setProductSearch("");
    }
  }, [isRemoveOpen, fetchProductsFromAPI]);

  // Handle clicks outside dropdowns to close them
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        addProductDropdownRef.current &&
        !addProductDropdownRef.current.contains(event.target as Node)
      ) {
        setAddProductDropdownOpen(false);
      }
      if (
        adjustProductDropdownRef.current &&
        !adjustProductDropdownRef.current.contains(event.target as Node)
      ) {
        setAdjustProductDropdownOpen(false);
      }
      if (
        transferProductDropdownRef.current &&
        !transferProductDropdownRef.current.contains(event.target as Node)
      ) {
        setTransferProductDropdownOpen(false);
      }
      if (
        removeProductDropdownRef.current &&
        !removeProductDropdownRef.current.contains(event.target as Node)
      ) {
        setRemoveProductDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
  // Calculate total quantity - use absolute value to show positive total
  const totalQuantity = Math.abs(allStocks.reduce((sum, s) => sum + Number(s.current_quantity || 0), 0));
  const lowStockItems = allStocks.filter((s) => Number(s.current_quantity || 0) <= 10).length;

  // Handlers
  const handleTransfer = async () => {
    const quantity = typeof transferForm.quantity === "string" 
      ? (transferForm.quantity === "" ? 0 : Number(transferForm.quantity) || 0)
      : transferForm.quantity;
    
    if (!transferForm.productId || !transferForm.fromBranchId || !transferForm.toBranchId || quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields with valid values",
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
        quantity: quantity,
        notes: transferForm.notes,
      });

      setIsTransferOpen(false);
      setTransferForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", notes: "" });
      setProductSearch("");
      setTransferProductDropdownOpen(false);

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
    const quantity = typeof addForm.quantity === "string" 
      ? (addForm.quantity === "" ? 0 : Number(addForm.quantity) || 0)
      : addForm.quantity;
    
    if (!addForm.productId || !addForm.branchId || !quantity || quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields with valid values",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId: addForm.productId,
        branchId: addForm.branchId,
        quantity: quantity, // Ensure it's a number
      });

      setIsAddOpen(false);
      setAddForm({ productId: "", branchId: "", quantity: "" });
      setProductSearch("");
      setAddProductDropdownOpen(false);

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
    const quantityChange = typeof adjustForm.quantityChange === "string" 
      ? (adjustForm.quantityChange === "" || adjustForm.quantityChange === "-" ? 0 : Number(adjustForm.quantityChange) || 0)
      : adjustForm.quantityChange;
    
    if (!adjustForm.productId || !adjustForm.branchId || quantityChange === 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields and enter a non-zero quantity change",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId: adjustForm.productId,
        branchId: adjustForm.branchId,
        quantityChange: quantityChange,
        reason: adjustForm.reason,
      });

      setIsAdjustOpen(false);
      setAdjustForm({ productId: "", branchId: "", quantityChange: "", reason: "" });
      setProductSearch("");
      setAdjustProductDropdownOpen(false);

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

  const handleRemoveStock = async () => {
    const quantity = typeof removeForm.quantity === "string" 
      ? (removeForm.quantity === "" ? 0 : Number(removeForm.quantity) || 0)
      : removeForm.quantity;
    
    if (!removeForm.productId || !removeForm.branchId || !quantity || quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill all required fields with valid values",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      await apiClient.delete(`${API_BASE}/stock/remove`, {
        data: {
          productId: removeForm.productId,
          branchId: removeForm.branchId,
          quantity: quantity, // Ensure it's a number
          reason: removeForm.reason,
        },
      });

      setIsRemoveOpen(false);
      setRemoveForm({ productId: "", branchId: "", quantity: "", reason: "" });
      setProductSearch("");
      setRemoveProductDropdownOpen(false);

      // Reload data
      const userRole = localStorage.getItem("role");
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
      
      const params = new URLSearchParams({
        page: stockPage.toString(),
        limit: stockPageSize.toString(),
      });
      
      if (branchFilter && branchFilter !== "all" && !isAdmin) {
        params.append('branchId', branchFilter);
      }
      
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      
      const [sRes, hRes, tRes] = await Promise.all([
        apiClient.get(`${API_BASE}/stock?${params}`),
        apiClient.get(`${API_BASE}/stock/history${branchFilter && branchFilter !== "all" && !isAdmin ? `?branchId=${branchFilter}` : ""}`),
        apiClient.get(`${API_BASE}/stock/today${branchFilter && branchFilter !== "all" && !isAdmin ? `?branchId=${branchFilter}` : ""}`),
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
        description: "Stock removed successfully",
      });
    } catch (e: any) {
      console.log(e);
      let errorMessage = "Failed to remove stock";
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

  const handleProductSearch = (search: string) => {
    setProductSearch(search);
  };

  // Products are already filtered by API search, so use them directly
  const filteredProductsForCombobox = products;

  if (isInitialLoading) {
    return (
      <PageLoader message="Loading stock management data..." />
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
          <Dialog 
            open={isAddOpen} 
            onOpenChange={(open) => {
              setIsAddOpen(open);
              if (!open) {
                setProductSearch("");
                setAddProductDropdownOpen(false);
                setProducts([]);
              }
            }}
          >
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
                <div className="space-y-2" ref={addProductDropdownRef}>
                  <Label htmlFor="add-product-search">Product *</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={addProductSearchRef}
                      id="add-product-search"
                      placeholder="Search product by name or SKU..."
                      value={productSearch}
                      onFocus={() => setAddProductDropdownOpen(true)}
                      autoComplete="off"
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setAddProductDropdownOpen(true);
                      }}
                      className="pl-9"
                    />
                    {addProductDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {loadingProducts ? (
                          <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4" />
                            Loading products...
                          </div>
                        ) : filteredProductsForCombobox.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {productSearch && productSearch.trim().length > 0 
                              ? "No matching products found" 
                              : "No products available"}
                          </div>
                        ) : (
                          filteredProductsForCombobox.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                                addForm.productId === p.id
                                  ? "bg-blue-50 font-semibold text-blue-900"
                                  : "text-gray-800"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setAddForm({ ...addForm, productId: p.id });
                                setAddProductDropdownOpen(false);
                                setProductSearch(products.find(pr => pr.id === p.id)?.name || "");
                                addProductSearchRef.current?.blur();
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                {p.sku && (
                                  <span className="text-xs text-gray-500">SKU: {p.sku}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
                    type="text"
                    inputMode="decimal"
                    value={typeof addForm.quantity === "string" ? addForm.quantity : (addForm.quantity === 1 ? "" : String(addForm.quantity))}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty, numbers, and single decimal point
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setAddForm({ ...addForm, quantity: value }); // Keep as string while typing
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                      setAddForm({ ...addForm, quantity: value <= 0 ? 1 : value });
                    }}
                    placeholder="Enter quantity"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

          <Dialog 
            open={isAdjustOpen} 
            onOpenChange={(open) => {
              setIsAdjustOpen(open);
              if (!open) {
                setProductSearch("");
                setAdjustProductDropdownOpen(false);
                setProducts([]);
              }
            }}
          >
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
                <div className="space-y-2" ref={adjustProductDropdownRef}>
                  <Label htmlFor="adjust-product-search">Product *</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={adjustProductSearchRef}
                      id="adjust-product-search"
                      placeholder="Search product by name or SKU..."
                      value={productSearch}
                      onFocus={() => setAdjustProductDropdownOpen(true)}
                      autoComplete="off"
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setAdjustProductDropdownOpen(true);
                      }}
                      className="pl-9"
                    />
                    {adjustProductDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {loadingProducts ? (
                          <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4" />
                            Loading products...
                          </div>
                        ) : filteredProductsForCombobox.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {productSearch && productSearch.trim().length > 0 
                              ? "No matching products found" 
                              : "No products available"}
                          </div>
                        ) : (
                          filteredProductsForCombobox.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                                adjustForm.productId === p.id
                                  ? "bg-blue-50 font-semibold text-blue-900"
                                  : "text-gray-800"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setAdjustForm({ ...adjustForm, productId: p.id });
                                setAdjustProductDropdownOpen(false);
                                setProductSearch(products.find(pr => pr.id === p.id)?.name || "");
                                adjustProductSearchRef.current?.blur();
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                {p.sku && (
                                  <span className="text-xs text-gray-500">SKU: {p.sku}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
                    type="text"
                    inputMode="decimal"
                    value={typeof adjustForm.quantityChange === "string" ? adjustForm.quantityChange : (adjustForm.quantityChange === 0 ? "" : String(adjustForm.quantityChange))}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty, numbers, negative sign, and single decimal point
                      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                        setAdjustForm({ 
                          ...adjustForm, 
                          quantityChange: value // Keep as string while typing
                        });
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value === "" || e.target.value === "-" ? 0 : Number(e.target.value) || 0;
                      setAdjustForm({ ...adjustForm, quantityChange: value });
                    }}
                    placeholder="Enter positive or negative number"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

          <Dialog 
            open={isRemoveOpen} 
            onOpenChange={(open) => {
              setIsRemoveOpen(open);
              if (!open) {
                setProductSearch("");
                setRemoveProductDropdownOpen(false);
                setProducts([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-red-50 hover:bg-red-100 text-red-700 border-red-300">
                <Package className="h-4 w-4 mr-2" />
                Remove Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Remove Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2" ref={removeProductDropdownRef}>
                  <Label htmlFor="remove-product-search">Product *</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={removeProductSearchRef}
                      id="remove-product-search"
                      placeholder="Search product by name or SKU..."
                      value={productSearch}
                      onFocus={() => setRemoveProductDropdownOpen(true)}
                      autoComplete="off"
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setRemoveProductDropdownOpen(true);
                      }}
                      className="pl-9"
                    />
                    {removeProductDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {loadingProducts ? (
                          <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4" />
                            Loading products...
                          </div>
                        ) : filteredProductsForCombobox.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {productSearch && productSearch.trim().length > 0 
                              ? "No matching products found" 
                              : "No products available"}
                          </div>
                        ) : (
                          filteredProductsForCombobox.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                                removeForm.productId === p.id
                                  ? "bg-blue-50 font-semibold text-blue-900"
                                  : "text-gray-800"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setRemoveForm({ ...removeForm, productId: p.id });
                                setRemoveProductDropdownOpen(false);
                                setProductSearch(products.find(pr => pr.id === p.id)?.name || "");
                                removeProductSearchRef.current?.blur();
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                {p.sku && (
                                  <span className="text-xs text-gray-500">SKU: {p.sku}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="remove-branch">Branch *</Label>
                  <Select
                    value={removeForm.branchId}
                    onValueChange={(value) =>
                      setRemoveForm({ ...removeForm, branchId: value })
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
                  <Label htmlFor="remove-quantity">Quantity to Remove *</Label>
                  <Input
                    id="remove-quantity"
                    type="text"
                    inputMode="decimal"
                    value={typeof removeForm.quantity === "string" ? removeForm.quantity : (removeForm.quantity === 1 ? "" : String(removeForm.quantity))}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty, numbers, and single decimal point
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setRemoveForm({ ...removeForm, quantity: value }); // Keep as string while typing
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                      setRemoveForm({ ...removeForm, quantity: value <= 0 ? 1 : value });
                    }}
                    placeholder="Enter quantity to remove"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <Label htmlFor="remove-reason">Reason (Optional)</Label>
                  <Textarea
                    id="remove-reason"
                    value={removeForm.reason}
                    onChange={(e) =>
                      setRemoveForm({ ...removeForm, reason: e.target.value })
                    }
                    placeholder="Enter reason for removal (e.g., damaged, expired, etc.)..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleRemoveStock}
                  disabled={isTransferring}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4 mr-2" />
                      Remove Stock
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog 
            open={isTransferOpen} 
            onOpenChange={(open) => {
              setIsTransferOpen(open);
              if (!open) {
                setProductSearch("");
                setTransferProductDropdownOpen(false);
                setProducts([]);
              }
            }}
          >
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
                <div className="space-y-2" ref={transferProductDropdownRef}>
                  <Label htmlFor="transfer-product-search">Product *</Label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={transferProductSearchRef}
                      id="transfer-product-search"
                      placeholder="Search product by name or SKU..."
                      value={productSearch}
                      onFocus={() => setTransferProductDropdownOpen(true)}
                      autoComplete="off"
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setTransferProductDropdownOpen(true);
                      }}
                      className="pl-9"
                    />
                    {transferProductDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {loadingProducts ? (
                          <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 className="animate-spin h-4 w-4" />
                            Loading products...
                          </div>
                        ) : filteredProductsForCombobox.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {productSearch && productSearch.trim().length > 0 
                              ? "No matching products found" 
                              : "No products available"}
                          </div>
                        ) : (
                          filteredProductsForCombobox.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                                transferForm.productId === p.id
                                  ? "bg-blue-50 font-semibold text-blue-900"
                                  : "text-gray-800"
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setTransferForm({ ...transferForm, productId: p.id });
                                setTransferProductDropdownOpen(false);
                                setProductSearch(products.find(pr => pr.id === p.id)?.name || "");
                                transferProductSearchRef.current?.blur();
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{p.name}</span>
                                {p.sku && (
                                  <span className="text-xs text-gray-500">SKU: {p.sku}</span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
                    type="text"
                    inputMode="decimal"
                    value={typeof transferForm.quantity === "string" ? transferForm.quantity : (transferForm.quantity === 1 ? "" : String(transferForm.quantity))}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty, numbers, and single decimal point
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setTransferForm({
                          ...transferForm,
                          quantity: value, // Keep as string while typing
                        });
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value === "" ? 0 : Number(e.target.value) || 0;
                      setTransferForm({
                        ...transferForm,
                        quantity: value <= 0 ? 1 : value,
                      });
                    }}
                    placeholder="Enter quantity"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
            <div className={`text-2xl font-bold ${totalQuantity < 0 ? "text-red-600" : "text-green-600"}`}>
              {totalQuantity.toFixed(2)}
            </div>
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
                <PageLoader message="Loading stock data..." />
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
                                  <TableCell className="text-sm text-gray-500">{s.product.sku || s.product.id.slice(0, 8)}</TableCell>
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
                <PageLoader message="Loading stock data..." />
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
                <PageLoader message="Loading stock data..." />
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
