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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Edit,
  Users,
  Loader2,
  RefreshCw,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { usePosData } from "@/hooks/use-pos-data";

interface Product {
  id: string;
  name: string;
}
interface Branch {
  id: string;
  name: string;
}
interface Stock {
  id: string;
  product: Product;
  branch_id: string;
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
}

export function Stocks() {
  const { toast } = useToast();
  
  // Global store data
  const { 
    products: globalProducts, 
    isAnyLoading: globalLoading,
    refreshAllData 
  } = usePosData();
  
  // Data lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);

  // UI state
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjOpen, setIsAdjOpen] = useState(false);

  // Form state
  const [addForm, setAddForm] = useState({
    productId: "",
    branchId: "",
    quantity: 1,
  });
  const [adjForm, setAdjForm] = useState({
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
        toast({
          title: "Success",
          description: "Stock metadata loaded successfully",
        });
      } catch (e: any) {
        console.error(e);
        let errorMessage = "Failed to load stock metadata";
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

  // 2) Whenever branches load, set default filter
  useEffect(() => {
    if (branches.length && !branchFilter) {
      setBranchFilter(branches[0].id);
    }
  }, [branches]);

  // 3) Fetch stocks & history whenever branchFilter changes
  useEffect(() => {
    if (!branchFilter) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [sRes, hRes] = await Promise.all([
          apiClient.get(`${API_BASE}/stock`, { params: { branchId: branchFilter } }),
          apiClient.get(`${API_BASE}/stock/history`, { params: { branchId: branchFilter } }),
        ]);
        setStocks(sRes.data.data);
        setHistory(hRes.data.data);
        toast({
          title: "Success",
          description: "Stock data loaded successfully",
        });
      } catch (e: any) {
        console.error(e);
        let errorMessage = "Failed to load stock data";
        if (e.response?.data?.message) errorMessage = e.response.data.message;
        else if (e.message) errorMessage = e.message;
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [branchFilter]);

  // Filter stocks by product name
  const filteredStocks = stocks.filter((s) =>
    s.product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const totalItems = stocks.length;
  const totalQuantity = stocks.reduce((sum, s) => sum + s.current_quantity, 0);

  // Handlers
  const handleAdd = async () => {
    setIsAdding(true);
    try {
      await apiClient.post(`${API_BASE}/stock`, {
        productId: addForm.productId,
        branchId: addForm.branchId,
        quantity: addForm.quantity,
      });
      setIsAddOpen(false);
      // reset form
      setAddForm({ productId: "", branchId: "", quantity: 1 });
      // reload
      const res = await apiClient.get(`${API_BASE}/stock`, { params: { branchId: branchFilter } });
      setStocks(res.data.data);
      toast({
        title: "Success",
        description: "Stock added successfully",
      });
    } catch (e: any) {
      console.error(e);
      let errorMessage = "Failed to add stock";
      if (e.response?.data?.message) errorMessage = e.response.data.message;
      else if (e.message) errorMessage = e.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleAdjust = async () => {
    setIsAdjusting(true);
    try {
      await apiClient.patch(`${API_BASE}/stock/adjust`, {
        productId: adjForm.productId,
        branchId: adjForm.branchId,
        quantityChange: adjForm.quantityChange,
        reason: adjForm.reason,
      });
      setIsAdjOpen(false);
      setAdjForm({ productId: "", branchId: "", quantityChange: 0, reason: "" });
      // reload
      const res = await apiClient.get(`${API_BASE}/stock`, { params: { branchId: branchFilter } });
      setStocks(res.data.data);
      const hRes = await apiClient.get(`${API_BASE}/stock/history`, { params: { branchId: branchFilter } });
      setHistory(hRes.data.data);
      toast({
        title: "Success",
        description: "Stock adjusted successfully",
      });
    } catch (e: any) {
      console.error(e);
      let errorMessage = "Failed to adjust stock";
      if (e.response?.data?.message) errorMessage = e.response.data.message;
      else if (e.message) errorMessage = e.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  if (isInitialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading stock data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stock Management</h1>
          <p className="text-gray-600">
            Create, adjust and view stock levels & history
          </p>
          {globalLoading && (
            <p className="text-sm text-blue-600 mt-1">Loading data from cache...</p>
          )}
        </div>
        <div className="flex space-x-2">
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
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="add-product">Product</Label>
                  <select
                    id="add-product"
                    className="block w-full border rounded p-2"
                    value={addForm.productId}
                    onChange={(e) =>
                      setAddForm({ ...addForm, productId: e.target.value })
                    }
                  >
                    <option value="">Select product</option>
                    {globalProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="add-branch">Branch</Label>
                  <select
                    id="add-branch"
                    className="block w-full border rounded p-2"
                    value={addForm.branchId}
                    onChange={(e) =>
                      setAddForm({ ...addForm, branchId: e.target.value })
                    }
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="add-qty">Quantity</Label>
                  <Input
                    id="add-qty"
                    type="number"
                    min={1}
                    value={addForm.quantity}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="w-full"
                >
                  {isAdding ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAdjOpen} onOpenChange={setIsAdjOpen}>
            <DialogTrigger asChild>
              <Button>
                <Edit className="h-4 w-4 mr-2" />
                Adjust Stock
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adjust Stock</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="adj-product">Product</Label>
                  <select
                    id="adj-product"
                    className="block w-full border rounded p-2"
                    value={adjForm.productId}
                    onChange={(e) =>
                      setAdjForm({ ...adjForm, productId: e.target.value })
                    }
                  >
                    <option value="">Select product</option>
                    {globalProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="adj-branch">Branch</Label>
                  <select
                    id="adj-branch"
                    className="block w-full border rounded p-2"
                    value={adjForm.branchId}
                    onChange={(e) =>
                      setAdjForm({ ...adjForm, branchId: e.target.value })
                    }
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="adj-change">Qty Change</Label>
                  <Input
                    id="adj-change"
                    type="number"
                    value={adjForm.quantityChange}
                    onChange={(e) =>
                      setAdjForm({
                        ...adjForm,
                        quantityChange: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="adj-reason">Reason</Label>
                  <Input
                    id="adj-reason"
                    value={adjForm.reason}
                    onChange={(e) =>
                      setAdjForm({ ...adjForm, reason: e.target.value })
                    }
                  />
                </div>
                <Button
                  onClick={handleAdjust}
                  disabled={isAdjusting}
                  className="w-full"
                >
                  {isAdjusting ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Quantity
            </CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalQuantity}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <select
            id="filter-branch"
            className="block w-full border rounded p-2"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
         <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search Stocks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
      </div>

      {/* Stocks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Stock</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                   {filteredStocks.map((s) => (
                  <TableRow key={s.id}>
                    {/* product stays the same */}
                    <TableCell className="font-medium">
                      {s.product.name}
                    </TableCell>

                    {/* Look up branch name from branches[] by id */}
                    <TableCell>
                      {
                        branches.find((b) => b.id === s.branch_id)
                          ?.name || s.branch_id
                      }
                    </TableCell>

                    <TableCell>{s.current_quantity}</TableCell>
                    <TableCell>
                      {s.last_updated.split("T")[0]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Movement History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8 text-gray-500" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Prev Qty</TableHead>
                  <TableHead>New Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.created_at.split("T")[0]}
                    </TableCell>
                    <TableCell className="font-medium">
                      {m.product.name}
                    </TableCell>
                    <TableCell>{m.movement_type}</TableCell>
                    <TableCell>{m.quantity_change}</TableCell>
                    <TableCell>{m.previous_qty}</TableCell>
                    <TableCell>{m.new_qty}</TableCell>
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
