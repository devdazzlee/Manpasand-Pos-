"use client";

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Loader2,
  UserCheck,
  UserX,
  UserPlus,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/page-loader";
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton";
import { cn } from "@/lib/utils";
import { formatMoneyDisplay } from "@/lib/money";

interface Customer {
  id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  billing_address?: string | null;
  credit_limit?: number | string | null;
  previous_credit_balance?: number | string | null;
  is_active: boolean;
  created_at: string;
  total_sale_amount?: number;
  sale_count?: number;
  last_sale_date?: string | null;
}

const phoneRegex = /^[0-9+\-\s]+$/;

const optionalMoneyField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: "Must be a valid number" })
    .nonnegative("Amount cannot be negative")
    .optional(),
);

const customerFormSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name is required"),
  phone_number: z
    .string({ required_error: "Phone number is required" })
    .trim()
    .min(1, "Phone number is required")
    .min(7, "Phone number must be at least 7 digits")
    .max(20, "Phone number is too long")
    .regex(phoneRegex, "Phone number must contain only digits, +, -, or spaces"),
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Invalid email address",
    }),
  address: z.string().trim().optional(),
  billing_address: z.string().trim().optional(),
  credit_limit: optionalMoneyField,
  previous_credit_balance: optionalMoneyField,
});

type CustomerFormValues = {
  name: string;
  phone_number: string;
  email: string;
  address: string;
  billing_address: string;
  credit_limit: string;
  previous_credit_balance: string;
};

type CustomerFormErrors = Partial<
  Record<
    | "name"
    | "phone_number"
    | "email"
    | "address"
    | "billing_address"
    | "credit_limit"
    | "previous_credit_balance",
    string
  >
>;

const customerDialogContentClass =
  "grid w-[min(580px,calc(100vw-2rem))] max-w-none gap-4 p-5 sm:rounded-lg";
const customerDialogTitleClass = "text-base font-semibold text-gray-900";
const customerFieldLabelClass = "text-xs font-medium text-gray-900";
const customerFieldControlClass = "h-9 rounded-md border-gray-200 text-sm";
const customerSubmitButtonClass = "h-10 w-full text-sm font-medium";

const emptyCustomerForm = (): CustomerFormValues => ({
  name: "",
  phone_number: "",
  email: "",
  address: "",
  billing_address: "",
  credit_limit: "",
  previous_credit_balance: "",
});

const zodErrorsToMap = (err: z.ZodError): CustomerFormErrors => {
  const map: CustomerFormErrors = {};
  for (const issue of err.errors) {
    const key = issue.path[0] as keyof CustomerFormErrors | undefined;
    if (key && !map[key]) map[key] = issue.message;
  }
  return map;
};

const firstZodError = (err: z.ZodError) =>
  err.errors[0]?.message || "Please fix the highlighted fields";

const extractApiError = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  if (data?.message) return data.message;
  if (err?.message) return err.message;
  return fallback;
};

const toFormValues = (
  customer?: Partial<Customer> | null,
): CustomerFormValues => ({
  name: customer?.name || "",
  phone_number: customer?.phone_number || "",
  email: customer?.email?.includes("@pos.local") ? "" : customer?.email || "",
  address: customer?.address || "",
  billing_address: customer?.billing_address || "",
  credit_limit:
    customer?.credit_limit != null && customer.credit_limit !== ""
      ? String(customer.credit_limit)
      : "",
  previous_credit_balance:
    customer?.previous_credit_balance != null &&
    customer.previous_credit_balance !== ""
      ? String(customer.previous_credit_balance)
      : "",
});

const buildPayload = (data: z.infer<typeof customerFormSchema>) => ({
  name: data.name.trim(),
  phone_number: data.phone_number.trim(),
  email: data.email?.trim() || undefined,
  address: data.address?.trim() || undefined,
  billing_address: data.billing_address?.trim() || undefined,
  credit_limit: data.credit_limit ?? null,
  previous_credit_balance: data.previous_credit_balance ?? undefined,
});

const formatLastVisit = (customer: Customer): string => {
  if (customer.last_sale_date) {
    return customer.last_sale_date.split("T")[0];
  }
  return "-";
};

const formatSaleAmount = (customer: Customer): string => {
  const amount = Number(customer.total_sale_amount ?? 0);
  return `Rs ${formatMoneyDisplay(amount)}`;
};

interface CustomerFormFieldsProps {
  idPrefix: string;
  values: CustomerFormValues;
  errors: CustomerFormErrors;
  onChange: (patch: Partial<CustomerFormValues>) => void;
  onClearError: (field: keyof CustomerFormErrors) => void;
  disabled?: boolean;
}

function CustomerFormFields({
  idPrefix,
  values,
  errors,
  onChange,
  onClearError,
  disabled = false,
}: CustomerFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`} className={customerFieldLabelClass}>
          Name<span className="text-red-500">*</span>
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => {
            onChange({ name: e.target.value });
            if (errors.name) onClearError("name");
          }}
          placeholder="Enter customer name"
          disabled={disabled}
          aria-invalid={errors.name ? true : undefined}
          className={cn(
            customerFieldControlClass,
            errors.name && "border-red-500 focus-visible:ring-red-500",
          )}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-phone_number`} className={customerFieldLabelClass}>
          Phone Number<span className="text-red-500">*</span>
        </Label>
        <Input
          id={`${idPrefix}-phone_number`}
          type="tel"
          value={values.phone_number}
          onChange={(e) => {
            onChange({ phone_number: e.target.value });
            if (errors.phone_number) onClearError("phone_number");
          }}
          placeholder="Enter phone number"
          disabled={disabled}
          aria-invalid={errors.phone_number ? true : undefined}
          className={cn(
            customerFieldControlClass,
            errors.phone_number && "border-red-500 focus-visible:ring-red-500",
          )}
        />
        {errors.phone_number && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.phone_number}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-email`} className={customerFieldLabelClass}>
          Email (optional)
        </Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={values.email}
          onChange={(e) => {
            onChange({ email: e.target.value });
            if (errors.email) onClearError("email");
          }}
          placeholder="customer@example.com"
          disabled={disabled}
          aria-invalid={errors.email ? true : undefined}
          className={cn(
            customerFieldControlClass,
            errors.email && "border-red-500 focus-visible:ring-red-500",
          )}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-address`} className={customerFieldLabelClass}>
          Address (optional)
        </Label>
        <Input
          id={`${idPrefix}-address`}
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="Enter address"
          disabled={disabled}
          className={customerFieldControlClass}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-billing_address`} className={customerFieldLabelClass}>
          Billing Address (optional)
        </Label>
        <Input
          id={`${idPrefix}-billing_address`}
          value={values.billing_address}
          onChange={(e) => onChange({ billing_address: e.target.value })}
          placeholder="Enter billing address"
          disabled={disabled}
          className={customerFieldControlClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-credit_limit`} className={customerFieldLabelClass}>
            Credit limit (Rs) (empty = unlimited)
          </Label>
          <Input
            id={`${idPrefix}-credit_limit`}
            type="number"
            min="0"
            step="0.01"
            value={values.credit_limit}
            onChange={(e) => {
              onChange({ credit_limit: e.target.value });
              if (errors.credit_limit) onClearError("credit_limit");
            }}
            placeholder="Leave empty for unlimited"
            disabled={disabled}
            aria-invalid={errors.credit_limit ? true : undefined}
            className={cn(
              customerFieldControlClass,
              errors.credit_limit && "border-red-500 focus-visible:ring-red-500",
            )}
          />
          {errors.credit_limit && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {errors.credit_limit}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label
            htmlFor={`${idPrefix}-previous_credit_balance`}
            className={customerFieldLabelClass}
          >
            Previous credit balance (Rs) (optional)
          </Label>
          <Input
            id={`${idPrefix}-previous_credit_balance`}
            type="number"
            min="0"
            step="0.01"
            value={values.previous_credit_balance}
            onChange={(e) => {
              onChange({ previous_credit_balance: e.target.value });
              if (errors.previous_credit_balance) onClearError("previous_credit_balance");
            }}
            placeholder="Amount owed before POS"
            disabled={disabled}
            aria-invalid={errors.previous_credit_balance ? true : undefined}
            className={cn(
              customerFieldControlClass,
              errors.previous_credit_balance &&
                "border-red-500 focus-visible:ring-red-500",
            )}
          />
          {errors.previous_credit_balance && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {errors.previous_credit_balance}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Use for existing customers who already owed you money before using this software.
      </p>
    </div>
  );
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  loadingLabel: string;
  loading: boolean;
  onSubmit: () => void;
  children: ReactNode;
}

function CustomerFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  loadingLabel,
  loading,
  onSubmit,
  children,
}: CustomerFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={customerDialogContentClass}>
        <DialogHeader className="space-y-0">
          <DialogTitle className={customerDialogTitleClass}>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <Button
          className={customerSubmitButtonClass}
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [editForm, setEditForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [addErrors, setAddErrors] = useState<CustomerFormErrors>({});
  const [editErrors, setEditErrors] = useState<CustomerFormErrors>({});

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/customer`);
      setCustomers(res.data.data);
    } catch (err: any) {
      toast.error(extractApiError(err, "Failed to load customers"));
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

  const resetAddForm = () => {
    setAddForm(emptyCustomerForm());
    setAddErrors({});
  };

  const openEditDialog = (customer: Customer) => {
    setEditForm(toFormValues(customer));
    setEditErrors({});
    setEditingCustomerId(customer.id);
    setIsEditDialogOpen(true);
  };

  const handleAddCustomer = async () => {
    const parsed = customerFormSchema.safeParse(addForm);
    if (!parsed.success) {
      setAddErrors(zodErrorsToMap(parsed.error));
      toast.error(firstZodError(parsed.error));
      return;
    }

    setAddErrors({});
    setIsAdding(true);
    try {
      await apiClient.post(`${API_BASE}/customer`, {
        ...buildPayload(parsed.data),
        is_active: true,
      });
      resetAddForm();
      setIsAddDialogOpen(false);
      toast.success("Customer created successfully");
      fetchCustomers();
    } catch (err: any) {
      toast.error(extractApiError(err, "Failed to create customer"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditCustomer = async () => {
    if (!editingCustomerId) return;

    const parsed = customerFormSchema.safeParse(editForm);
    if (!parsed.success) {
      setEditErrors(zodErrorsToMap(parsed.error));
      toast.error(firstZodError(parsed.error));
      return;
    }

    setEditErrors({});
    setIsEditing(true);
    try {
      const data = parsed.data;
      await apiClient.put(`${API_BASE}/customer/${editingCustomerId}`, {
        name: data.name.trim(),
        phone_number: data.phone_number.trim(),
        email: data.email?.trim() ? data.email.trim() : null,
        address: data.address?.trim() ? data.address.trim() : null,
        billing_address: data.billing_address?.trim() ? data.billing_address.trim() : null,
        credit_limit: data.credit_limit ?? null,
        previous_credit_balance: data.previous_credit_balance ?? null,
      });
      setIsEditDialogOpen(false);
      setEditingCustomerId(null);
      toast.success("Customer updated successfully");
      fetchCustomers();
    } catch (err: any) {
      toast.error(extractApiError(err, "Failed to update customer"));
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTargetCustomer) return;
    setIsDeletingCustomer(true);
    try {
      await apiClient.delete(`${API_BASE}/customer/${deleteTargetCustomer.id}`);
      toast.success("Customer deleted successfully");
      setDeleteTargetCustomer(null);
      fetchCustomers();
    } catch (err: any) {
      toast.error(extractApiError(err, "Failed to delete customer"));
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const activeCount = customers.filter((c) => c.is_active).length;
  const inactiveCount = customers.length - activeCount;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = customers.filter(
    (c) => new Date(c.created_at) >= monthStart,
  ).length;

  const filteredCustomers = customers.filter((customer) =>
    (customer.name || customer.email || customer.phone_number || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );

  if (isInitialLoading) {
    return <PageLoader message="Loading customers data..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Customer Management
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage your customer database
          </p>
        </div>
        <Button
          onClick={() => {
            resetAddForm();
            setIsAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customers.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  All customers in the system
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                <UserCheck className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Available for new sales
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inactive Customers</CardTitle>
                <UserX className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{inactiveCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Hidden from sales selection
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                <UserPlus className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{newThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Added since{" "}
                  {monthStart.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoader message="Loading customers..." />
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-10">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No customers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Contact</TableHead>
                      <TableHead className="min-w-[130px]">Total Sales</TableHead>
                      <TableHead className="min-w-[90px]">Sales</TableHead>
                      <TableHead className="min-w-[120px]">Last Visit</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="space-y-1">
                            {customer.name && (
                              <div className="flex items-center text-sm font-medium">
                                <Users className="h-3 w-3 mr-1" />
                                {customer.name}
                              </div>
                            )}
                            {customer.email && !customer.email.includes("@pos.local") && (
                              <div className="flex items-center text-sm text-gray-500">
                                <Mail className="h-3 w-3 mr-1" />
                                {customer.email}
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
                        <TableCell className="font-medium text-gray-900">
                          {formatSaleAmount(customer)}
                        </TableCell>
                        <TableCell>
                          {customer.sale_count ?? 0}
                        </TableCell>
                        <TableCell>{formatLastVisit(customer)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={customer.is_active ? "default" : "secondary"}
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
                              onClick={() => openEditDialog(customer)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDeleteTargetCustomer(customer)}
                              disabled={isDeletingCustomer}
                              className="text-red-600 hover:text-red-700"
                            >
                              {isDeletingCustomer &&
                              deleteTargetCustomer?.id === customer.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
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

      <CustomerFormDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetAddForm();
          setIsAddDialogOpen(open);
        }}
        title="Add New Customer"
        submitLabel="Create Customer"
        loadingLabel="Creating Customer..."
        loading={isAdding}
        onSubmit={handleAddCustomer}
      >
        <CustomerFormFields
          idPrefix="add"
          values={addForm}
          errors={addErrors}
          onChange={(patch) => setAddForm((prev) => ({ ...prev, ...patch }))}
          onClearError={(field) => setAddErrors((p) => ({ ...p, [field]: undefined }))}
          disabled={isAdding}
        />
      </CustomerFormDialog>

      <CustomerFormDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditErrors({});
            setEditingCustomerId(null);
          }
          setIsEditDialogOpen(open);
        }}
        title="Edit Customer"
        submitLabel="Update Customer"
        loadingLabel="Updating Customer..."
        loading={isEditing}
        onSubmit={handleEditCustomer}
      >
        <CustomerFormFields
          idPrefix="edit"
          values={editForm}
          errors={editErrors}
          onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
          onClearError={(field) => setEditErrors((p) => ({ ...p, [field]: undefined }))}
          disabled={isEditing}
        />
      </CustomerFormDialog>

      <AlertDialog
        open={!!deleteTargetCustomer}
        onOpenChange={(open) => {
          if (!open && !isDeletingCustomer) {
            setDeleteTargetCustomer(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTargetCustomer?.name ||
                  deleteTargetCustomer?.email ||
                  "this customer"}
              </span>{" "}
              and any linked sales, orders, and hold records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomer}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCustomer();
              }}
              disabled={isDeletingCustomer}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingCustomer ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
