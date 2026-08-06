"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Loader2,
  Edit,
  Eye,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Package,
  List,
  LayoutGrid,
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  CalendarIcon,
  CreditCard,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { z } from "zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageLoader } from "@/components/ui/page-loader";
import { cn } from "@/lib/utils";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  formatMoney,
  formatQty,
} from "@/components/inventory/stock-ops/export-utils";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { Textarea } from "@/components/ui/textarea";

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
  balance_due?: number;
}

interface ProductSummaryRow {
  productId: string;
  productName: string;
  sku: string | null;
  totalQty: number;
  totalValue: number;
  orderCount: number;
}

interface PurchaseItem {
  id: string;
  product_id?: string;
  quantity: number;
  unit_price?: number;
  unitPrice?: number;
  line_total?: number;
  lineTotal?: number;
  productName?: string;
  sku?: string | null;
  product?: { id: string; name: string; sku: string | null } | null;
}

interface PurchaseOrder {
  id: string;
  sale_number?: string;
  saleNumber?: string;
  invoice_number?: string | null;
  invoiceNumber?: string | null;
  sale_date?: string;
  saleDate?: string;
  status?: string;
  payment_method?: string;
  paymentMethod?: string;
  payment_status?: string;
  paymentStatus?: string;
  total_amount?: number;
  totalAmount?: number;
  payment_received?: number;
  paymentReceived?: number;
  balanceOnSale?: number;
  branch?: { id: string; name: string } | null;
  items: PurchaseItem[];
}

interface LedgerEntry {
  id: string;
  date: string;
  type: "OPENING" | "SALE" | "SALE_PAYMENT" | "PAYMENT";
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerSummary {
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  totalPaidAtSale?: number;
  totalManualPaid?: number;
  balanceDue: number;
  creditLimit: number | null;
  creditAvailable: number | null;
  saleCount: number;
  paymentCount: number;
}

interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  user?: { email: string } | null;
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
    .regex(
      phoneRegex,
      "Phone number must contain only digits, +, -, or spaces",
    ),
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
  Record<keyof CustomerFormValues, string>
>;

const customerDialogContentClass =
  "grid w-[min(96vw,580px)] max-w-[580px] sm:max-w-[580px] gap-4 p-5 sm:rounded-lg";
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

const displayEmail = (email?: string | null) => {
  if (!email || email.includes("@pos.local")) return null;
  return email;
};

const toFormValues = (
  customer?: Partial<Customer> | null,
): CustomerFormValues => ({
  name: customer?.name || "",
  phone_number: customer?.phone_number || "",
  email: displayEmail(customer?.email) || "",
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

const buildCreatePayload = (data: z.infer<typeof customerFormSchema>) => ({
  name: data.name.trim(),
  phone_number: data.phone_number.trim(),
  email: data.email?.trim() || undefined,
  address: data.address?.trim() || undefined,
  billing_address: data.billing_address?.trim() || undefined,
  credit_limit: data.credit_limit ?? null,
  previous_credit_balance: data.previous_credit_balance ?? undefined,
  is_active: true,
});

const buildUpdatePayload = (data: z.infer<typeof customerFormSchema>) => ({
  name: data.name.trim(),
  phone_number: data.phone_number.trim(),
  email: data.email?.trim() ? data.email.trim() : null,
  address: data.address?.trim() ? data.address.trim() : null,
  billing_address: data.billing_address?.trim()
    ? data.billing_address.trim()
    : null,
  credit_limit: data.credit_limit ?? null,
  previous_credit_balance: data.previous_credit_balance ?? null,
});

const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "OTHER",
] as const;

const PAGE_SIZE = 20;

type StatusFilter = "all" | "active" | "inactive" | "new";
type DetailTab = "overview" | "purchases" | "ledger";

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function asNum(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function orderSaleNumber(o: PurchaseOrder) {
  return o.saleNumber || o.sale_number || "—";
}

function orderInvoice(o: PurchaseOrder) {
  return o.invoiceNumber || o.invoice_number || null;
}

function orderDate(o: PurchaseOrder) {
  return o.saleDate || o.sale_date || null;
}

function orderTotal(o: PurchaseOrder) {
  return asNum(o.totalAmount ?? o.total_amount);
}

function orderPaid(o: PurchaseOrder) {
  return asNum(o.paymentReceived ?? o.payment_received);
}

function itemUnitPrice(item: PurchaseItem) {
  return asNum(item.unitPrice ?? item.unit_price);
}

function itemLineTotal(item: PurchaseItem) {
  return asNum(item.lineTotal ?? item.line_total);
}

function itemProductName(item: PurchaseItem) {
  return item.productName || item.product?.name || "—";
}

function itemSku(item: PurchaseItem) {
  return item.sku ?? item.product?.sku ?? null;
}

function monthStartDate() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isNewThisMonth(c: Customer) {
  return new Date(c.created_at) >= monthStartDate();
}

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
        <Label
          htmlFor={`${idPrefix}-phone_number`}
          className={customerFieldLabelClass}
        >
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
        <Label
          htmlFor={`${idPrefix}-address`}
          className={customerFieldLabelClass}
        >
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
        <Label
          htmlFor={`${idPrefix}-billing_address`}
          className={customerFieldLabelClass}
        >
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
          <Label
            htmlFor={`${idPrefix}-credit_limit`}
            className={customerFieldLabelClass}
          >
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
              errors.credit_limit &&
                "border-red-500 focus-visible:ring-red-500",
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
              if (errors.previous_credit_balance) {
                onClearError("previous_credit_balance");
              }
            }}
            placeholder="Amount owed before POS"
            disabled={disabled}
            aria-invalid={
              errors.previous_credit_balance ? true : undefined
            }
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
        Use for existing customers who already owed you money before using this
        software.
      </p>
    </div>
  );
}

function ledgerTypeBadge(type: LedgerEntry["type"]) {
  switch (type) {
    case "OPENING":
      return {
        label: "Opening",
        className: "bg-slate-50 text-slate-800 border-slate-200",
      };
    case "SALE":
      return {
        label: "Sale",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "SALE_PAYMENT":
      return {
        label: "Sale payment",
        className: "bg-sky-50 text-sky-800 border-sky-200",
      };
    case "PAYMENT":
      return {
        label: "Payment",
        className: "bg-green-50 text-green-800 border-green-200",
      };
    default:
      return {
        label: type,
        className: "bg-gray-50 text-gray-700 border-gray-200",
      };
  }
}

export function Customers() {
  const [list, setList] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [current, setCurrent] = useState<Customer | null>(null);

  const [form, setForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [errors, setErrors] = useState<CustomerFormErrors>({});

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [productSummary, setProductSummary] = useState<ProductSummaryRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState({
    orderCount: 0,
    productCount: 0,
    lineCount: 0,
    totalQuantity: 0,
    totalValue: 0,
  });
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(
    null,
  );
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentKind, setPaymentKind] = useState<"settle" | "upfront">(
    "settle",
  );
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentDeleteId, setPaymentDeleteId] = useState<string | null>(null);
  const [paymentDeleting, setPaymentDeleting] = useState(false);

  useScrollToTopOnPageChange(page);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/customer`);
      setList(res.data.data || []);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load customers"));
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date());
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentKind("settle");
  };

  const loadPurchases = async (customerId: string) => {
    setPurchasesLoading(true);
    try {
      const res = await apiClient.get(
        `${API_BASE}/customer/${customerId}/purchases`,
      );
      const data = res.data?.data || {};
      const nextOrders: PurchaseOrder[] = data.orders || [];
      setOrders(nextOrders);
      setProductSummary(data.productSummary || []);
      const lineCount =
        data.summary?.lineCount ??
        nextOrders.reduce((acc, o) => acc + (o.items?.length || 0), 0);
      setPurchaseSummary({
        orderCount: data.summary?.orderCount ?? nextOrders.length,
        productCount:
          data.summary?.productCount ?? (data.productSummary || []).length,
        lineCount,
        totalQuantity: data.summary?.totalQuantity ?? 0,
        totalValue: data.summary?.totalValue ?? 0,
      });
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load purchases"));
      setOrders([]);
      setProductSummary([]);
      setPurchaseSummary({
        orderCount: 0,
        productCount: 0,
        lineCount: 0,
        totalQuantity: 0,
        totalValue: 0,
      });
    } finally {
      setPurchasesLoading(false);
    }
  };

  const loadLedger = async (customerId: string) => {
    setLedgerLoading(true);
    try {
      const res = await apiClient.get(
        `${API_BASE}/customer/${customerId}/ledger`,
      );
      const data = res.data?.data || {};
      const entries: LedgerEntry[] = data.entries || [];
      const summary = data.summary || {};
      const totalSalesFromEntries = entries
        .filter((e) => e.type === "SALE")
        .reduce((acc, e) => acc + asNum(e.debit), 0);
      const totalPaidAtSale = entries
        .filter((e) => e.type === "SALE_PAYMENT")
        .reduce((acc, e) => acc + asNum(e.credit), 0);
      const totalManualPaid = entries
        .filter((e) => e.type === "PAYMENT")
        .reduce((acc, e) => acc + asNum(e.credit), 0);

      setLedgerSummary({
        openingBalance: asNum(summary.openingBalance),
        totalSales: asNum(summary.totalSales, totalSalesFromEntries),
        totalPaid: asNum(summary.totalPaid),
        totalPaidAtSale: asNum(summary.totalPaidAtSale, totalPaidAtSale),
        totalManualPaid: asNum(summary.totalManualPaid, totalManualPaid),
        balanceDue: asNum(summary.balanceDue),
        creditLimit:
          summary.creditLimit === null || summary.creditLimit === undefined
            ? null
            : asNum(summary.creditLimit),
        creditAvailable:
          summary.creditAvailable === null ||
          summary.creditAvailable === undefined
            ? null
            : asNum(summary.creditAvailable),
        saleCount: asNum(summary.saleCount),
        paymentCount: asNum(summary.paymentCount),
      });
      setLedgerEntries(entries);
      setPayments(data.payments || []);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load ledger"));
      setLedgerSummary(null);
      setLedgerEntries([]);
      setPayments([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const openDetail = async (c: Customer, tab: DetailTab = "overview") => {
    setCurrent(c);
    setDetailTab(tab);
    setDetailOpen(true);
    resetPaymentForm();
    await Promise.all([loadPurchases(c.id), loadLedger(c.id)]);
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const openAdd = () => {
    setForm(emptyCustomerForm());
    setErrors({});
    setAddOpen(true);
  };

  const openEdit = (c: Customer) => {
    setCurrent(c);
    setForm(toFormValues(c));
    setErrors({});
    setEditOpen(true);
  };

  const setField = (patch: Partial<CustomerFormValues>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  const clearError = (field: keyof CustomerFormErrors) => {
    setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const submit = async () => {
    const parsed = customerFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      toast.error(firstZodError(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (editOpen && current) {
        await apiClient.put(
          `${API_BASE}/customer/${current.id}`,
          buildUpdatePayload(parsed.data),
        );
        setEditOpen(false);
        toast.success("Customer updated successfully");
      } else {
        await apiClient.post(
          `${API_BASE}/customer`,
          buildCreatePayload(parsed.data),
        );
        setAddOpen(false);
        toast.success("Customer created successfully");
      }
      await fetchList();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to save customer"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`${API_BASE}/customer/${deleteTarget.id}`);
      toast.success("Customer deleted successfully");
      setDeleteTarget(null);
      if (current?.id === deleteTarget.id) {
        setDetailOpen(false);
        setCurrent(null);
      }
      await fetchList();
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete customer"));
    } finally {
      setIsDeleting(false);
    }
  };

  const submitPayment = async () => {
    if (!current) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaymentSubmitting(true);
    try {
      const kindNote =
        paymentKind === "upfront"
          ? "Upfront / advance payment"
          : "Settle credit";
      await apiClient.post(`${API_BASE}/customer/${current.id}/payments`, {
        amount,
        paymentDate: paymentDate ? paymentDate.toISOString() : undefined,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
        notes:
          [kindNote, paymentNotes.trim()].filter(Boolean).join(" · ") ||
          undefined,
      });
      toast.success(
        paymentKind === "upfront"
          ? "Upfront payment recorded"
          : "Credit payment recorded",
      );
      resetPaymentForm();
      await Promise.all([loadLedger(current.id), fetchList()]);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to record payment"));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const confirmDeletePayment = async () => {
    if (!current || !paymentDeleteId) return;
    setPaymentDeleting(true);
    try {
      await apiClient.delete(
        `${API_BASE}/customer/${current.id}/payments/${paymentDeleteId}`,
      );
      toast.success("Payment deleted");
      setPaymentDeleteId(null);
      await Promise.all([loadLedger(current.id), fetchList()]);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete payment"));
    } finally {
      setPaymentDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const activeCount = list.filter((c) => c.is_active).length;
    const inactiveCount = list.length - activeCount;
    const newCount = list.filter(isNewThisMonth).length;
    return { activeCount, inactiveCount, newCount };
  }, [list]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list.filter((c) => {
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (statusFilter === "new" && !isNewThisMonth(c)) return false;
      if (!term) return true;
      const email = displayEmail(c.email) || "";
      return (
        (c.name || "").toLowerCase().includes(term) ||
        (c.phone_number || "").toLowerCase().includes(term) ||
        email.toLowerCase().includes(term) ||
        (c.address || "").toLowerCase().includes(term)
      );
    });
  }, [list, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );

  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const statusChips: Array<{
    key: StatusFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All", count: list.length },
    { key: "active", label: "Active", count: stats.activeCount },
    { key: "inactive", label: "Inactive", count: stats.inactiveCount },
  ];

  const flatOrderLines = useMemo(() => {
    const rows: Array<{
      key: string;
      orderNumber: string;
      date: string | null;
      productName: string;
      sku: string | null;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      branchName: string | null;
    }> = [];
    for (const order of orders) {
      const orderNumber =
        orderInvoice(order) || orderSaleNumber(order) || "—";
      const date = orderDate(order);
      for (const item of order.items || []) {
        rows.push({
          key: `${order.id}-${item.id}`,
          orderNumber,
          date,
          productName: itemProductName(item),
          sku: itemSku(item),
          quantity: asNum(item.quantity),
          unitPrice: itemUnitPrice(item),
          lineTotal: itemLineTotal(item),
          branchName: order.branch?.name || null,
        });
      }
    }
    return rows;
  }, [orders]);

  const creditLimitDisplay =
    current?.credit_limit == null || current.credit_limit === ""
      ? "Unlimited"
      : formatMoney(current.credit_limit);

  const previousCreditDisplay = formatMoney(
    current?.previous_credit_balance ?? 0,
  );

  if (isInitialLoading) {
    return <PageLoader message="Loading customers..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Customers
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Customer Management
          </h1>
          <p className="text-sm text-gray-600 mt-0.5 break-words">
            Manage customers, purchase history, and receivables ledger
          </p>
        </div>
        <Button onClick={openAdd} className="h-9 shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && list.length === 0}
        items={[
          {
            label: "Total Customers",
            value: list.length.toLocaleString(),
            icon: Users,
            hint: "All customers in the system",
            onClick: () => {
              setStatusFilter("all");
              setPage(1);
            },
          },
          {
            label: "Active",
            value: stats.activeCount.toLocaleString(),
            icon: CheckCircle2,
            tone: "success",
            hint: "Available for new sales",
            onClick: () => {
              setStatusFilter("active");
              setPage(1);
            },
          },
          {
            label: "Inactive",
            value: stats.inactiveCount.toLocaleString(),
            icon: XCircle,
            tone: "danger",
            hint: "Hidden from sales selection",
            onClick: () => {
              setStatusFilter("inactive");
              setPage(1);
            },
          },
          {
            label: "New this month",
            value: stats.newCount.toLocaleString(),
            icon: UserPlus,
            hint: `Added since ${monthStartDate().toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}`,
            onClick: () => {
              setStatusFilter("new");
              setPage(1);
            },
          },
        ]}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {statusChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setStatusFilter(chip.key);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === chip.key
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
              )}
            >
              {chip.label}
              <span className="tabular-nums text-gray-500">{chip.count}</span>
            </button>
          ))}
          {statusFilter === "new" && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("new");
                setPage(1);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800"
            >
              New this month
              <span className="tabular-nums text-gray-500">
                {stats.newCount}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by name, phone, or email"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
          <div className="flex items-center gap-1 ml-auto border border-gray-200 rounded-md p-0.5 bg-white">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              onClick={() => setViewMode("table")}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              Customer List{" "}
              <span className="font-normal text-gray-500">
                ({filtered.length})
              </span>
            </p>
          </div>

          {loading && list.length === 0 ? (
            <div className="py-16">
              <PageLoader message="Loading customers..." />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No customers found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Try clearing filters or create a new customer.
              </p>
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[200px]">Contact</TableHead>
                    <TableHead className="min-w-[120px]">Total Sales</TableHead>
                    <TableHead className="min-w-[90px]">Sales</TableHead>
                    <TableHead className="min-w-[120px]">Balance due</TableHead>
                    <TableHead className="min-w-[120px]">Last visit</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                    <TableHead className="min-w-[220px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((c) => {
                    const email = displayEmail(c.email);
                    const balanceDue = asNum(c.balance_due);
                    return (
                      <TableRow key={c.id} className="hover:bg-gray-50/80">
                        <TableCell>
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {c.name || "—"}
                            </p>
                            {email && (
                              <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                {email}
                              </p>
                            )}
                            {c.phone_number && (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {c.phone_number}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums text-gray-900">
                          {formatMoney(c.total_sale_amount ?? 0)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {c.sale_count ?? 0}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-semibold tabular-nums",
                            balanceDue > 0 ? "text-red-700" : "text-green-700",
                          )}
                        >
                          {formatMoney(balanceDue)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {formatDate(c.last_sale_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              c.is_active
                                ? "bg-green-100 text-green-800 border-green-200"
                                : "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {c.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => openDetail(c, "overview")}
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(c, "purchases")}
                            >
                              Purchases
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(c, "ledger")}
                            >
                              Ledger
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => openEdit(c)}
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-red-600 hover:text-red-700"
                              onClick={() => setDeleteTarget(c)}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
              {pageRows.map((c) => {
                const email = displayEmail(c.email);
                const balanceDue = asNum(c.balance_due);
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {c.name || "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.phone_number || "No phone"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          c.is_active
                            ? "bg-green-100 text-green-800 border-green-200 shrink-0"
                            : "bg-red-100 text-red-800 border-red-200 shrink-0"
                        }
                      >
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p className="truncate">{email || "No email"}</p>
                      <p>
                        Sales:{" "}
                        <span className="font-medium tabular-nums">
                          {formatMoney(c.total_sale_amount ?? 0)}
                        </span>
                      </p>
                      <p>
                        Balance due:{" "}
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            balanceDue > 0 ? "text-red-700" : "text-green-700",
                          )}
                        >
                          {formatMoney(balanceDue)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(c, "overview")}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(c, "purchases")}
                      >
                        Purchases
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(c, "ledger")}
                      >
                        Ledger
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Page {pageSafe} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit */}
      <Dialog
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setEditOpen(false);
            setErrors({});
            if (!detailOpen) setCurrent(null);
          }
        }}
      >
        <DialogContent className={customerDialogContentClass}>
          <DialogHeader className="space-y-0">
            <DialogTitle className={customerDialogTitleClass}>
              {editOpen && current ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>

          <CustomerFormFields
            idPrefix={editOpen ? "edit" : "add"}
            values={form}
            errors={errors}
            onChange={setField}
            onClearError={clearError}
            disabled={submitting}
          />

          <LoadingButton
            onClick={submit}
            loading={submitting}
            className={customerSubmitButtonClass}
            disabled={submitting}
          >
            {editOpen && current ? "Update Customer" : "Create Customer"}
          </LoadingButton>
        </DialogContent>
      </Dialog>

      {/* Detail: Overview / Purchases / Ledger */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setCurrent(null);
            resetPaymentForm();
          }
        }}
      >
        <DialogContent
          className={cn(
            "w-[min(96vw,1180px)] max-w-[1180px] sm:max-w-[1180px]",
            "border border-gray-200 p-0 gap-0 max-h-[92vh]",
            "flex flex-col overflow-hidden",
          )}
        >
          {current && (
            <>
              <div className="shrink-0 bg-white border-b border-gray-200 px-5 pt-5 pb-0 pr-12">
                <DialogHeader className="space-y-2 text-left pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-xl font-bold text-gray-900 truncate pr-2">
                        {current.name || "Customer"}
                      </DialogTitle>
                      <DialogDescription className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
                        {current.phone_number && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {current.phone_number}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            current.is_active
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }
                        >
                          {current.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Since {formatDate(current.created_at)}
                        </span>
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openEdit(current)}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <Tabs
                  value={detailTab}
                  onValueChange={(v) => setDetailTab(v as DetailTab)}
                  className="w-full"
                >
                  <TabsList className="h-auto w-full justify-start gap-0 rounded-none bg-transparent p-0 border-0">
                    {(
                      [
                        { key: "overview", label: "Overview" },
                        { key: "purchases", label: "Purchases" },
                        { key: "ledger", label: "Ledger" },
                      ] as const
                    ).map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className={cn(
                          "rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-sm font-medium text-gray-500 shadow-none",
                          "data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:shadow-none",
                        )}
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0 min-w-0">
                {detailTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Contact
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">Name</span>
                          <span className="font-medium text-gray-900 text-right">
                            {current.name || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500">Phone</span>
                          <span className="font-medium text-gray-900">
                            {current.phone_number || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-500 inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" /> Email
                          </span>
                          <span className="font-medium text-gray-900 break-all text-right">
                            {displayEmail(current.email) || "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        Address
                      </h3>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {current.address || "No address provided."}
                      </p>
                      {current.billing_address && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-1">
                            Billing address
                          </p>
                          <p className="text-sm text-gray-800 leading-relaxed">
                            {current.billing_address}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        Credit
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Credit limit</span>
                          <span className="font-semibold tabular-nums">
                            {creditLimitDisplay}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Previous credit balance
                          </span>
                          <span className="font-semibold tabular-nums">
                            {previousCreditDisplay}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Scale className="h-3.5 w-3.5" />
                        Quick balances
                      </h3>
                      {ledgerLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Total sales</span>
                            <span className="font-semibold tabular-nums">
                              {formatMoney(
                                ledgerSummary?.totalSales ??
                                  current.total_sale_amount ??
                                  0,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Paid</span>
                            <span className="font-semibold tabular-nums text-green-700">
                              {formatMoney(ledgerSummary?.totalPaid || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-gray-100 pt-2">
                            <span className="text-gray-700 font-medium">
                              Balance due
                            </span>
                            <span
                              className={cn(
                                "font-bold tabular-nums",
                                (ledgerSummary?.balanceDue ||
                                  asNum(current.balance_due)) > 0
                                  ? "text-red-700"
                                  : "text-green-700",
                              )}
                            >
                              {formatMoney(
                                ledgerSummary?.balanceDue ??
                                  current.balance_due ??
                                  0,
                              )}
                            </span>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs flex-1"
                              onClick={() => setDetailTab("purchases")}
                            >
                              View purchases
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs flex-1"
                              onClick={() => setDetailTab("ledger")}
                            >
                              Open ledger
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === "purchases" && (
                  <div className="space-y-4">
                    <InventoryKpiGrid
                      columns={4}
                      loading={purchasesLoading}
                      items={[
                        {
                          label: "Orders",
                          value: purchaseSummary.orderCount.toLocaleString(),
                          icon: Package,
                        },
                        {
                          label: "Products",
                          value: purchaseSummary.productCount.toLocaleString(),
                          icon: Users,
                        },
                        {
                          label: "Total qty",
                          value: formatQty(purchaseSummary.totalQuantity),
                          icon: Package,
                        },
                        {
                          label: "Total value",
                          value: formatMoney(purchaseSummary.totalValue),
                          icon: Wallet,
                        },
                      ]}
                    />

                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        Products purchased
                      </h3>
                      {purchasesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading purchases…
                        </div>
                      ) : productSummary.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-lg">
                          No purchases recorded for this customer yet.
                        </p>
                      ) : (
                        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200">
                          <Table className="min-w-[640px]">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Product</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">
                                  Value
                                </TableHead>
                                <TableHead className="text-right">
                                  Orders
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {productSummary.map((row) => (
                                <TableRow key={row.productId}>
                                  <TableCell className="font-medium">
                                    {row.productName}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-gray-600">
                                    {row.sku || "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatQty(row.totalQty)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatMoney(row.totalValue)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {row.orderCount}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        Order history
                      </h3>
                      {purchasesLoading ? null : flatOrderLines.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">
                          No line items.
                        </p>
                      ) : (
                        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200 max-h-[360px]">
                          <Table className="min-w-[900px]">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Order #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">
                                  Unit price
                                </TableHead>
                                <TableHead className="text-right">
                                  Line total
                                </TableHead>
                                <TableHead>Branch</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {flatOrderLines.map((row) => (
                                <TableRow key={row.key}>
                                  <TableCell className="font-mono text-xs text-gray-700">
                                    {row.orderNumber}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-sm">
                                    {formatDate(row.date)}
                                  </TableCell>
                                  <TableCell className="font-medium text-sm">
                                    {row.productName}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-gray-600">
                                    {row.sku || "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatQty(row.quantity)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatMoney(row.unitPrice)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {formatMoney(row.lineTotal)}
                                  </TableCell>
                                  <TableCell className="text-sm text-gray-600">
                                    {row.branchName || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    {!purchasesLoading && orders.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">
                          Orders summary
                        </h3>
                        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200 max-h-[280px]">
                          <Table className="min-w-[720px]">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Sale #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                  Total
                                </TableHead>
                                <TableHead className="text-right">
                                  Paid
                                </TableHead>
                                <TableHead className="text-right">
                                  Remaining on credit
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {orders.map((o) => {
                                const total = orderTotal(o);
                                const paid = orderPaid(o);
                                const remaining =
                                  o.balanceOnSale != null
                                    ? asNum(o.balanceOnSale)
                                    : Math.max(0, total - paid);
                                return (
                                  <TableRow key={o.id}>
                                    <TableCell className="font-mono text-xs">
                                      {orderInvoice(o) || orderSaleNumber(o)}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm">
                                      {formatDate(orderDate(o))}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className="bg-gray-50 text-gray-700 border-gray-200"
                                      >
                                        {o.paymentStatus ||
                                          o.payment_status ||
                                          o.status ||
                                          "—"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatMoney(total)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-green-700">
                                      {formatMoney(paid)}
                                    </TableCell>
                                    <TableCell
                                      className={cn(
                                        "text-right tabular-nums font-medium",
                                        remaining > 0
                                          ? "text-red-700"
                                          : "text-green-700",
                                      )}
                                    >
                                      {formatMoney(remaining)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "ledger" && (
                  <div className="space-y-4">
                    <InventoryKpiGrid
                      columns={4}
                      loading={ledgerLoading}
                      items={[
                        {
                          label: "Total sales",
                          value: formatMoney(ledgerSummary?.totalSales || 0),
                          icon: ArrowUpRight,
                          hint: `${ledgerSummary?.saleCount || 0} sales`,
                        },
                        {
                          label: "Total paid",
                          value: formatMoney(ledgerSummary?.totalPaid || 0),
                          icon: ArrowDownLeft,
                          tone: "success",
                          hint: `${ledgerSummary?.paymentCount || 0} manual payments`,
                        },
                        {
                          label: "Balance due",
                          value: formatMoney(ledgerSummary?.balanceDue || 0),
                          icon: Scale,
                          tone:
                            (ledgerSummary?.balanceDue || 0) > 0
                              ? "danger"
                              : "success",
                          hint:
                            (ledgerSummary?.balanceDue || 0) > 0
                              ? "Still owed by this customer"
                              : "Settled / advance on books",
                        },
                        {
                          label: "Credit limit",
                          value:
                            ledgerSummary?.creditLimit == null
                              ? "Unlimited"
                              : formatMoney(ledgerSummary.creditLimit),
                          icon: CreditCard,
                          hint:
                            ledgerSummary?.creditAvailable == null
                              ? "No limit set"
                              : `Available: ${formatMoney(ledgerSummary.creditAvailable)}`,
                        },
                      ]}
                    />

                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            Record payment
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Pay down the balance due or record an upfront /
                            advance payment
                          </p>
                        </div>
                        {(ledgerSummary?.balanceDue || 0) > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setPaymentKind("settle");
                              setPaymentAmount(
                                String(
                                  Number(
                                    (ledgerSummary?.balanceDue || 0).toFixed(2),
                                  ),
                                ),
                              );
                            }}
                          >
                            Pay full balance
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPaymentKind("settle")}
                          className={cn(
                            "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                            paymentKind === "settle"
                              ? "border-blue-400 bg-blue-50/60"
                              : "border-gray-200 hover:border-gray-300",
                          )}
                        >
                          <span className="font-semibold text-gray-900 block">
                            Settle credit
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Pay amount still owed
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentKind("upfront")}
                          className={cn(
                            "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                            paymentKind === "upfront"
                              ? "border-blue-400 bg-blue-50/60"
                              : "border-gray-200 hover:border-gray-300",
                          )}
                        >
                          <span className="font-semibold text-gray-900 block">
                            Upfront / advance
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Pay before next purchase
                          </span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className={customerFieldLabelClass}>
                            Amount <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="0.00"
                            className={customerFieldControlClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={customerFieldLabelClass}>Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                  customerFieldControlClass,
                                  "w-full justify-start font-normal px-3",
                                  !paymentDate && "text-muted-foreground",
                                )}
                              >
                                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                                {paymentDate
                                  ? format(paymentDate, "PPP")
                                  : "Pick date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <CalendarComponent
                                mode="single"
                                selected={paymentDate}
                                onSelect={setPaymentDate}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-1">
                          <Label className={customerFieldLabelClass}>
                            Method
                          </Label>
                          <Select
                            value={paymentMethod}
                            onValueChange={(v) =>
                              setPaymentMethod(
                                v as (typeof PAYMENT_METHODS)[number],
                              )
                            }
                          >
                            <SelectTrigger
                              className={customerFieldControlClass}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map((m) => (
                                <SelectItem key={m} value={m}>
                                  {m.replace(/_/g, " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className={customerFieldLabelClass}>
                            Reference
                          </Label>
                          <Input
                            value={paymentReference}
                            onChange={(e) =>
                              setPaymentReference(e.target.value)
                            }
                            placeholder="Txn / receipt ref"
                            className={customerFieldControlClass}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className={customerFieldLabelClass}>Notes</Label>
                        <Textarea
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          placeholder="Optional notes"
                          className="min-h-[72px] text-sm"
                        />
                      </div>
                      {(ledgerSummary?.balanceDue || 0) > 0 &&
                      paymentKind === "settle" ? (
                        <p className="text-xs text-gray-500">
                          Current balance due:{" "}
                          <span className="font-semibold text-red-700 tabular-nums">
                            {formatMoney(ledgerSummary?.balanceDue || 0)}
                          </span>
                          {Number(paymentAmount) > 0
                            ? ` · after this payment ≈ ${formatMoney(
                                Math.max(
                                  0,
                                  (ledgerSummary?.balanceDue || 0) -
                                    (Number(paymentAmount) || 0),
                                ),
                              )}`
                            : null}
                        </p>
                      ) : null}
                      <LoadingButton
                        onClick={submitPayment}
                        loading={paymentSubmitting}
                        className="h-9"
                        disabled={paymentSubmitting}
                      >
                        Record payment
                      </LoadingButton>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        Ledger entries
                      </h3>
                      {ledgerLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading ledger…
                        </div>
                      ) : ledgerEntries.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-lg">
                          No sales or payments yet. Balance due starts when this
                          customer has credit sales or an opening balance.
                        </p>
                      ) : (
                        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200 max-h-[420px]">
                          <Table className="min-w-[920px]">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Ref</TableHead>
                                <TableHead className="text-right">
                                  Debit
                                </TableHead>
                                <TableHead className="text-right">
                                  Credit
                                </TableHead>
                                <TableHead className="text-right">
                                  Balance
                                </TableHead>
                                <TableHead className="w-10" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ledgerEntries.map((e) => {
                                const paymentId =
                                  e.type === "PAYMENT"
                                    ? e.id.replace(/^payment-/, "")
                                    : null;
                                const badge = ledgerTypeBadge(e.type);
                                return (
                                  <TableRow key={e.id}>
                                    <TableCell className="whitespace-nowrap text-sm">
                                      {formatDate(e.date)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={badge.className}
                                      >
                                        {badge.label}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm max-w-[280px]">
                                      {e.description}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-gray-600">
                                      {e.reference || "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm">
                                      {e.debit > 0
                                        ? formatMoney(e.debit)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm text-green-700">
                                      {e.credit > 0
                                        ? formatMoney(e.credit)
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-semibold">
                                      {formatMoney(e.balance)}
                                    </TableCell>
                                    <TableCell>
                                      {paymentId && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-red-600"
                                          title="Delete payment"
                                          onClick={() =>
                                            setPaymentDeleteId(paymentId)
                                          }
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    {payments.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Tip: delete a payment only to correct a mistake. Balance
                        updates immediately.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTarget?.name ||
                  displayEmail(deleteTarget?.email) ||
                  "this customer"}
              </span>{" "}
              and any linked sales, orders, and hold records. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
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

      <AlertDialog
        open={!!paymentDeleteId}
        onOpenChange={(open) => {
          if (!open && !paymentDeleting) setPaymentDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payment from the customer ledger and increases
              the balance due. Only do this to correct an entry error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={paymentDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeletePayment();
              }}
              disabled={paymentDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {paymentDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
