"use client";

import React, { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Loader2, Edit, Eye, ToggleRight, ToggleLeft } from "lucide-react";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";


interface Brand {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  display_on_pos: boolean;
  product_count: number;
  created_at: string;
}

const Brands: React.FC = () => {
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<Brand | null>(null);

  const [form, setForm] = useState({ name: "", is_active: true, display_on_pos: true });
  const [error, setError] = useState<string>("");

  const isFormValid = Object.values(form).every(
    v => typeof v === 'boolean' ? true : (v && String(v).trim() !== "")
  );

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async (q: string = search) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/brands`, { params: { search: q } });
      setBrands(res.data.data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    fetchBrands(v);
  };

  const openAdd = () => {
    setForm({ name: "", is_active: true, display_on_pos: true });
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (b: Brand) => {
    setCurrent(b);
    setForm({ name: b.name, is_active: b.is_active, display_on_pos: b.display_on_pos });
    setEditOpen(true);
  };

  const openDetail = (b: Brand) => {
    setCurrent(b);
    setDetailOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form };
      if (current) {
        await apiClient.patch(`${API_BASE}/brands/${current.id}`, payload);
        setEditOpen(false);
        toast({
          title: "Success",
          description: "Brand updated successfully",
        });
      } else {
        await apiClient.post(`${API_BASE}/brands`, payload);
        setAddOpen(false);
        toast({
          title: "Success",
          description: "Brand created successfully",
        });
      }
      fetchBrands();
    } catch (e: any) {
      setError("Submission failed");
      toast({
        title: "Error",
        description: e?.response?.data?.message || e?.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDisplay = async (id: string) => {
    try {
      await apiClient.patch(`${API_BASE}/brands/${id}/toggle-display`);
      fetchBrands();
    } catch (e) {
      console.log(e);
    }
  };

  const filtered = brands.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.code.includes(search)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Brands</h1>
          <p className="text-gray-600">Create & manage brands</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New Brand
        </Button>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search by name or code"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>
      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
          {error}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Brand List</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <LoadingSpinner size="lg" />
              <p className="text-gray-600 mt-2">Loading brands...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-600">No brands found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>POS</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(b => (
                  <TableRow key={b.id} className="hover:bg-gray-50">
                    <TableCell>{b.code}</TableCell>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>{b.display_on_pos ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{b.is_active ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{b.product_count}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openDetail(b)}><Eye className="h-4 w-4"/></Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(b)}><Edit className="h-4 w-4"/></Button>
                      <Button size="sm" variant="outline" onClick={() => toggleDisplay(b.id)}>
                        {b.display_on_pos ? 'Hide' : 'Show'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {/* Add/Edit Dialog */}
      <Dialog open={addOpen || editOpen} onOpenChange={() => { setAddOpen(false); setEditOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{current ? 'Edit Brand' : 'Create Brand'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="brand-name">Name<span className="text-red-500 ml-1">*</span></Label>
              <Input 
                id="brand-name" 
                value={form.name} 
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Enter brand name"
                className={form.name.trim() === "" ? "border-red-500" : ""}
                disabled={submitting}
              />
              {form.name.trim() === "" && (
                <p className="text-xs text-red-600 mt-1">Name is required</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input id="active" type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} disabled={submitting} />
              <Label htmlFor="active">Active</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input id="pos" type="checkbox" checked={form.display_on_pos} onChange={e => setForm(f => ({ ...f, display_on_pos: e.target.checked }))} disabled={submitting} />
              <Label htmlFor="pos">Display on POS</Label>
            </div>
            <LoadingButton 
              onClick={submit} 
              loading={submitting} 
              className="w-full"
              disabled={submitting || !isFormValid}
            >
              {current ? 'Update' : 'Create'}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>
      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={() => setDetailOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Brand Details</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-2">
              <p><strong>Code:</strong> {current.code}</p>
              <p><strong>Name:</strong> {current.name}</p>
              <p><strong>Active:</strong> {current.is_active ? 'Yes' : 'No'}</p>
              <p><strong>Display on POS:</strong> {current.display_on_pos ? 'Yes' : 'No'}</p>
              <p><strong>Products:</strong> {current.product_count}</p>
              <p><strong>Created:</strong> {current.created_at.split('T')[0]}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Brands;
