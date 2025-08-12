"use client";

import React, { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Loader2, Edit, Eye } from "lucide-react";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface Size {
  id: string;
  code: string;
  name: string;
  product_count: number;
  created_at: string;
}

const Sizes: React.FC = () => {
  const { toast } = useToast();
  const [sizes, setSizes] = useState<Size[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<Size | null>(null);
  const [formName, setFormName] = useState("");
  const [error, setError] = useState<string>("");
  const isFormValid = formName.trim() !== "";

  useEffect(() => {
    fetchSizes();
  }, []);

  const fetchSizes = async (q: string = search) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/sizes`, { params: { search: q } });
      setSizes(res.data.data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    fetchSizes(v);
  };

  const openAdd = () => {
    setFormName("");
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (s: Size) => {
    setCurrent(s);
    setFormName(s.name);
    setEditOpen(true);
  };

  const openDetail = (s: Size) => {
    setCurrent(s);
    setDetailOpen(true);
  };

  const submit = async () => {
    if (!formName.trim()) {
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
      const payload = { name: formName };
      if (current) {
        await apiClient.patch(`${API_BASE}/sizes/${current.id}`, payload);
        setEditOpen(false);
        toast({
          title: "Success",
          description: "Size updated successfully",
        });
      } else {
        await apiClient.post(`${API_BASE}/sizes`, payload);
        setAddOpen(false);
        toast({
          title: "Success",
          description: "Size created successfully",
        });
      }
      fetchSizes();
    } catch (err: any) {
      setError("Submission failed");
      toast({
        title: "Error",
        description: err?.response?.data?.message || err?.message || "Submission failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = sizes.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.code.includes(search)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sizes</h1>
          <p className="text-gray-600">Create & manage sizes</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          New Size
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
        <CardHeader><CardTitle>Size List</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <LoadingSpinner size="lg" />
              <p className="text-gray-600 mt-2">Loading sizes...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-600">No sizes found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id} className="hover:bg-gray-50">
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.product_count}</TableCell>
                    <TableCell>{s.created_at.split('T')[0]}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openDetail(s)}><Eye className="h-4 w-4"/></Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Edit className="h-4 w-4"/></Button>
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
          <DialogHeader><DialogTitle>{current ? 'Edit Size' : 'Create Size'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="size-name">Name<span className="text-red-500 ml-1">*</span></Label>
              <Input 
                id="size-name" 
                value={formName} 
                onChange={e => setFormName(e.target.value)}
                placeholder="Enter size name"
                className={formName.trim() === "" ? "border-red-500" : ""}
                disabled={submitting}
              />
              {formName.trim() === "" && (
                <p className="text-xs text-red-600 mt-1">Name is required</p>
              )}
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
          <DialogHeader><DialogTitle>Size Details</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-2">
              <p><strong>Code:</strong> {current.code}</p>
              <p><strong>Name:</strong> {current.name}</p>
              <p><strong>Products:</strong> {current.product_count}</p>
              <p><strong>Created:</strong> {current.created_at.split('T')[0]}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sizes;
