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
  Trash2,
  Users,
  Phone,
  Mail,
  MapPin,
  Loader2,
  DollarSign,
  UserCheck,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  name: string | null;
  email: string;
  phone_number: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export function Customers() {
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Partial<Customer & { billing_address?: string }>>({});
  const [editingCustomer, setEditingCustomer] = useState<(Customer & { billing_address?: string }) | null>(null);

  // 1) Fetch customers
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/customer`);
      // API shape: { success, message, data: Customer[] }
      setCustomers(res.data.data);
      toast({
        title: "Success",
        description: "Customers loaded successfully",
      });
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Failed to load customers";
      if (err.response?.data?.message) errorMessage = err.response.data.message;
      else if (err.message) errorMessage = err.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsInitialLoading(true);
      try {
        await fetchCustomers();
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, []);

  // 2) Create customer (all fields)
  const handleAddCustomer = async () => {
    if (!newCustomer.email) return;
    setIsAdding(true);
    try {
      await apiClient.post(`${API_BASE}/customer`, {
        email: newCustomer.email,
        name: newCustomer.name,
        phone_number: newCustomer.phone_number,
        address: newCustomer.address,
        billing_address: newCustomer.billing_address,
      });
      setNewCustomer({});
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
      fetchCustomers();
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Failed to create customer";
      if (err.response?.data?.message) errorMessage = err.response.data.message;
      else if (err.message) errorMessage = err.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Edit customer (all fields, use PUT)
  const handleEditCustomer = async () => {
    if (!editingCustomer) return;
    setIsEditing(true);
    try {
      await apiClient.put(`${API_BASE}/customer/${editingCustomer.id}`, {
        email: editingCustomer.email,
        name: editingCustomer.name,
        phone_number: editingCustomer.phone_number,
        address: editingCustomer.address,
        billing_address: editingCustomer.billing_address,
      });
      setEditingCustomer(null);
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
      fetchCustomers();
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Failed to update customer";
      if (err.response?.data?.message) errorMessage = err.response.data.message;
      else if (err.message) errorMessage = err.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsEditing(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async (id: string) => {
    try {
      await apiClient.delete(`${API_BASE}/customer/${id}`);
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      fetchCustomers();
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Failed to delete customer";
      if (err.response?.data?.message) errorMessage = err.response.data.message;
      else if (err.message) errorMessage = err.message;
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Stats (total, active, revenue — revenue = 0 since API doesn't return it)
  const activeCount = customers.filter((c) => c.is_active).length;
  const totalRevenue = 0;

  // Filter by name/email/phone
  const filteredCustomers = customers.filter((customer) =>
    (customer.name || customer.email || customer.phone_number || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  if (isInitialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading customers data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header & Add Dialog */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Customer Management
          </h1>
          <p className="text-gray-600">Manage your customer database</p>
        </div>
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomer.email || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      email: e.target.value,
                    })
                  }
                  placeholder="Enter customer email"
                  required
                />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={newCustomer.name || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={newCustomer.phone_number || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  type="text"
                  value={newCustomer.address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="billing_address">Billing Address</Label>
                <Input
                  id="billing_address"
                  type="text"
                  value={newCustomer.billing_address || ""}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <Button
                onClick={handleAddCustomer}
                className="w-full"
                disabled={isAdding || !newCustomer.email}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Creating Customer...
                  </>
                ) : (
                  "Create Customer"
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
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Customers
            </CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ${totalRevenue.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table with Loader */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="text-center">
                <Loader2 className="animate-spin h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-600">Loading customers...</p>
              </div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No customers found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center text-sm">
                          <Mail className="h-3 w-3 mr-1" />
                          {customer.email}
                        </div>
                        {customer.name && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Users className="h-3 w-3 mr-1" />
                            {customer.name}
                          </div>
                        )}
                        {customer.phone_number && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Phone className="h-3 w-3 mr-1" />
                            {customer.phone_number}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.created_at.split("T")[0]}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          customer.is_active ? "default" : "secondary"
                        }
                        className={
                          customer.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }
                      >
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditingCustomer(customer)
                          }
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleDeleteCustomer(customer.id)
                          }
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingCustomer}
        onOpenChange={() => setEditingCustomer(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingCustomer.email}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      email: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={editingCustomer.name || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone Number</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingCustomer.phone_number || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      phone_number: e.target.value,
                    })
                  }
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  type="text"
                  value={editingCustomer.address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      address: e.target.value,
                    })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div>
                <Label htmlFor="edit-billing-address">Billing Address</Label>
                <Input
                  id="edit-billing-address"
                  type="text"
                  value={editingCustomer.billing_address || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      billing_address: e.target.value,
                    })
                  }
                  placeholder="Enter billing address"
                />
              </div>
              <Button
                onClick={handleEditCustomer}
                className="w-full"
                disabled={isEditing}
              >
                {isEditing ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Updating Customer...
                  </>
                ) : (
                  "Update Customer"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
