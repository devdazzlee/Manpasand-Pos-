"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  RefreshCcw,
} from "lucide-react";
import { z } from "zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  formatMoney,
  formatQty,
} from "@/components/inventory/stock-ops/export-utils";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/api/errors";
import {
  useCustomers,
  useCustomerPurchases,
  useCustomerLedger,
  useCustomerMutations,
} from "@/hooks/queries/use-customers";

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

const customerFieldLabelClass = "text-xs font-medium text-foreground";
const customerFieldControlClass = "h-9 text-sm";

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
          Name<span className="text-destructive">*</span>
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
            errors.name && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label
          htmlFor={`${idPrefix}-phone_number`}
          className={customerFieldLabelClass}
        >
          Phone Number<span className="text-destructive">*</span>
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
            errors.phone_number &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {errors.phone_number && (
          <p className="mt-1 text-xs text-destructive" role="alert">
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
            errors.email && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-destructive" role="alert">
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
              "nums",
              errors.credit_limit &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
          {errors.credit_limit && (
            <p className="mt-1 text-xs text-destructive" role="alert">
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
              "nums",
              errors.previous_credit_balance &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
          {errors.previous_credit_balance && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {errors.previous_credit_balance}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
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
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

export function Customers() {
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [current, setCurrent] = useState<Customer | null>(null);

  const [form, setForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [errors, setErrors] = useState<CustomerFormErrors>({});

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentKind, setPaymentKind] = useState<"settle" | "upfront">(
    "settle",
  );
  const [paymentDeleteId, setPaymentDeleteId] = useState<string | null>(null);

  useScrollToTopOnPageChange(page);

  // Debounced search feeds the query hook (guide: 250 ms).
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      isActive:
        statusFilter === "active"
          ? true
          : statusFilter === "inactive"
            ? false
            : undefined,
      createdAfter:
        statusFilter === "new" ? monthStartDate().toISOString() : undefined,
    }),
    [page, debouncedSearch, statusFilter],
  );

  const {
    customers: rawCustomers,
    meta,
    isFirstLoad,
    isRefreshing,
    refetch,
    error: listError,
  } = useCustomers(listParams);

  const allCountQuery = useCustomers({ page: 1, limit: 1 });
  const activeCountQuery = useCustomers({ page: 1, limit: 1, isActive: true });
  const inactiveCountQuery = useCustomers({ page: 1, limit: 1, isActive: false });
  const newCountQuery = useCustomers({
    page: 1,
    limit: 1,
    createdAfter: monthStartDate().toISOString(),
  });
  const statsLoading =
    allCountQuery.isPending ||
    activeCountQuery.isPending ||
    inactiveCountQuery.isPending;
  const stats = {
    total: allCountQuery.meta?.total ?? 0,
    activeCount: activeCountQuery.meta?.total ?? 0,
    inactiveCount: inactiveCountQuery.meta?.total ?? 0,
    newCount: newCountQuery.meta?.total ?? 0,
  };

  const list = rawCustomers as unknown as Customer[];
  const loading = isFirstLoad;
  const listMeta = meta ?? {
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
  };

  const { create, update, remove, addPayment, deletePayment } =
    useCustomerMutations();
  const submitting = create.isPending || update.isPending;

  // ----- detail panel data (gated on the sheet being open) -----
  const detailId = detailOpen && current ? current.id : null;
  const purchasesQuery = useCustomerPurchases(detailId);
  const ledgerQuery = useCustomerLedger(detailId);
  const purchasesLoading = purchasesQuery.isLoading;
  const ledgerLoading = ledgerQuery.isLoading;

  const { orders, productSummary, purchaseSummary } = useMemo(() => {
    const data = (purchasesQuery.data ?? {}) as any;
    const nextOrders: PurchaseOrder[] = data.orders || [];
    const nextProductSummary: ProductSummaryRow[] = data.productSummary || [];
    const lineCount =
      data.summary?.lineCount ??
      nextOrders.reduce((acc, o) => acc + (o.items?.length || 0), 0);
    return {
      orders: nextOrders,
      productSummary: nextProductSummary,
      purchaseSummary: {
        orderCount: data.summary?.orderCount ?? nextOrders.length,
        productCount:
          data.summary?.productCount ?? nextProductSummary.length,
        lineCount,
        totalQuantity: data.summary?.totalQuantity ?? 0,
        totalValue: data.summary?.totalValue ?? 0,
      },
    };
  }, [purchasesQuery.data]);

  const { ledgerSummary, ledgerEntries, payments } = useMemo(() => {
    const data = (ledgerQuery.data ?? {}) as any;
    const entries: LedgerEntry[] = data.entries || [];
    if (!ledgerQuery.data) {
      return {
        ledgerSummary: null as LedgerSummary | null,
        ledgerEntries: entries,
        payments: [] as PaymentRow[],
      };
    }
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
    return {
      ledgerSummary: {
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
      } as LedgerSummary,
      ledgerEntries: entries,
      payments: (data.payments || []) as PaymentRow[],
    };
  }, [ledgerQuery.data]);

  useEffect(() => {
    if (listError) {
      toast({
        variant: "destructive",
        title: "Failed to load customers",
        description: extractApiError(listError, "Failed to load customers"),
      });
    }
  }, [listError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (purchasesQuery.error) {
      toast({
        variant: "destructive",
        title: "Failed to load purchases",
        description: extractApiError(
          purchasesQuery.error,
          "Failed to load purchases",
        ),
      });
    }
  }, [purchasesQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ledgerQuery.error) {
      toast({
        variant: "destructive",
        title: "Failed to load ledger",
        description: extractApiError(ledgerQuery.error, "Failed to load ledger"),
      });
    }
  }, [ledgerQuery.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date());
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentKind("settle");
  };

  useEffect(() => {
    if (paymentKind !== "settle") return;
    const due = Number(ledgerSummary?.balanceDue || 0);
    if (due <= 0) return;
    setPaymentAmount((prev) =>
      prev === "" ? String(Number(due.toFixed(2))) : prev,
    );
  }, [paymentKind, ledgerSummary?.balanceDue]);

  const openDetail = (c: Customer, tab: DetailTab = "overview") => {
    setCurrent(c);
    setDetailTab(tab);
    setDetailOpen(true);
    resetPaymentForm();
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

  const closeForm = () => {
    setAddOpen(false);
    setEditOpen(false);
    setErrors({});
    if (!detailOpen) setCurrent(null);
  };

  const submit = () => {
    const parsed = customerFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodErrorsToMap(parsed.error));
      toast({ variant: "destructive", title: firstZodError(parsed.error) });
      return;
    }
    setErrors({});

    const onError = (e: unknown) =>
      toast({
        variant: "destructive",
        title: "Could not save customer",
        description: extractApiError(e, "Failed to save customer"),
      });

    if (editOpen && current) {
      update.mutate(
        { id: current.id, body: buildUpdatePayload(parsed.data) },
        {
          onSuccess: () => {
            toast({ title: "Customer updated" });
            setEditOpen(false);
            if (!detailOpen) setCurrent(null);
          },
          onError,
        },
      );
    } else {
      create.mutate(buildCreatePayload(parsed.data), {
        onSuccess: () => {
          toast({ title: "Customer created" });
          setAddOpen(false);
        },
        onError,
      });
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast({ title: "Customer deleted" });
        setDeleteTarget(null);
        if (current?.id === target.id) {
          setDetailOpen(false);
          setCurrent(null);
        }
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Could not delete customer",
          description: extractApiError(e, "Failed to delete customer"),
        }),
    });
  };

  const submitPayment = () => {
    if (!current) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid payment amount" });
      return;
    }
    const kindNote =
      paymentKind === "upfront"
        ? "Upfront / advance payment"
        : "Settle credit";
    addPayment.mutate(
      {
        id: current.id,
        body: {
          amount,
          paymentDate: paymentDate ? paymentDate.toISOString() : undefined,
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          notes:
            [kindNote, paymentNotes.trim()].filter(Boolean).join(" · ") ||
            undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title:
              paymentKind === "upfront"
                ? "Upfront payment recorded"
                : "Credit payment recorded",
          });
          resetPaymentForm();
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not record payment",
            description: extractApiError(e, "Failed to record payment"),
          }),
      },
    );
  };

  const confirmDeletePayment = () => {
    if (!current || !paymentDeleteId) return;
    deletePayment.mutate(
      { id: current.id, paymentId: paymentDeleteId },
      {
        onSuccess: () => {
          toast({ title: "Payment deleted" });
          setPaymentDeleteId(null);
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Could not delete payment",
            description: extractApiError(e, "Failed to delete payment"),
          }),
      },
    );
  };

  const filtered = list;
  const totalPages = Math.max(1, listMeta.totalPages);
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered;

  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  const statusChips: Array<{
    key: StatusFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All", count: stats.total },
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

  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage customers, purchase history, and receivables ledger"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCcw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              New customer
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        <InventoryKpiGrid
          columns={4}
          loading={statsLoading}
          items={[
            {
              label: "Total Customers",
              value: stats.total.toLocaleString(),
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
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted/50",
                )}
              >
                {chip.label}
                {statsLoading ? (
                  <span className="inline-block h-3 w-5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <span className="nums text-muted-foreground">{chip.count}</span>
                )}
              </button>
            ))}
            {statusFilter === "new" && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("new");
                  setPage(1);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
              >
                New this month
                <span className="nums text-muted-foreground">
                  {stats.newCount}
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearFilters}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
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

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Customer List{" "}
                <span className="font-normal text-muted-foreground">
                  {loading ? "(loading…)" : `(${listMeta.total})`}
                </span>
              </p>
              {isRefreshing && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 w-full animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No customers found
                </p>
                <p className="text-xs text-muted-foreground">
                  Try clearing filters or create a new customer.
                </p>
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px] text-xs uppercase tracking-wide">
                        Contact
                      </TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">
                        Total Sales
                      </TableHead>
                      <TableHead className="min-w-[90px] text-xs uppercase tracking-wide">
                        Sales
                      </TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">
                        Balance due
                      </TableHead>
                      <TableHead className="min-w-[120px] text-xs uppercase tracking-wide">
                        Last visit
                      </TableHead>
                      <TableHead className="min-w-[90px] text-xs uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="min-w-[220px] text-right text-xs uppercase tracking-wide">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((c) => {
                      const email = displayEmail(c.email);
                      const balanceDue = asNum(c.balance_due);
                      return (
                        <TableRow key={c.id} className="h-11 hover:bg-muted/50">
                          <TableCell>
                            <div className="min-w-0 space-y-0.5">
                              <p className="truncate font-medium text-foreground">
                                {c.name || "—"}
                              </p>
                              {email && (
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  {email}
                                </p>
                              )}
                              {c.phone_number && (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  {c.phone_number}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="nums font-medium text-foreground">
                            {formatMoney(c.total_sale_amount ?? 0)}
                          </TableCell>
                          <TableCell className="nums">
                            {c.sale_count ?? 0}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "nums font-semibold",
                              balanceDue > 0
                                ? "text-red-700"
                                : "text-green-700",
                            )}
                          >
                            {formatMoney(balanceDue)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(c.last_sale_date)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                c.is_active
                                  ? "border-green-200 bg-green-100 text-green-800"
                                  : "border-red-200 bg-red-100 text-red-800"
                              }
                            >
                              {c.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1.5">
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
                                className="h-8 text-destructive hover:text-destructive"
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
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((c) => {
                  const email = displayEmail(c.email);
                  const balanceDue = asNum(c.balance_due);
                  return (
                    <div
                      key={c.id}
                      className="space-y-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {c.name || "—"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.phone_number || "No phone"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            c.is_active
                              ? "shrink-0 border-green-200 bg-green-100 text-green-800"
                              : "shrink-0 border-red-200 bg-red-100 text-red-800"
                          }
                        >
                          {c.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p className="truncate">{email || "No email"}</p>
                        <p>
                          Sales:{" "}
                          <span className="nums font-medium">
                            {formatMoney(c.total_sale_amount ?? 0)}
                          </span>
                        </p>
                        <p>
                          Balance due:{" "}
                          <span
                            className={cn(
                              "nums font-semibold",
                              balanceDue > 0
                                ? "text-red-700"
                                : "text-green-700",
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

            {listMeta.total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
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
      </PageBody>

      {/* Add / Edit — form has > 6 fields, so a DetailSheet with the form in
          the body (guide §2). */}
      <DetailSheet
        open={addOpen || editOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        size="lg"
      >
        <DetailSheetHeader
          title={editOpen && current ? "Edit customer" : "New customer"}
          subtitle="Customer contact, address and credit details"
        />
        <DetailSheetBody>
          <CustomerFormFields
            idPrefix={editOpen ? "edit" : "add"}
            values={form}
            errors={errors}
            onChange={setField}
            onClearError={clearError}
            disabled={submitting}
          />
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={closeForm} disabled={submitting}>
            Cancel
          </Button>
          <LoadingButton
            onClick={submit}
            loading={submitting}
            disabled={submitting}
          >
            {editOpen && current ? "Update customer" : "Create customer"}
          </LoadingButton>
        </DetailSheetFooter>
      </DetailSheet>

      {/* Detail: Overview / Purchases / Ledger */}
      <DetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOpen(false);
            setCurrent(null);
            resetPaymentForm();
          }
        }}
        size="xl"
      >
        <DetailSheetHeader
          title={current?.name || "Customer"}
          subtitle={
            current ? (
              <span className="flex flex-wrap items-center gap-2">
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
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }
                >
                  {current.is_active ? "Active" : "Inactive"}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Since {formatDate(current.created_at)}
                </span>
              </span>
            ) : undefined
          }
          icon={<Users className="h-5 w-5" />}
        >
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
          >
            <TabsList className="h-9 w-full justify-start gap-4 rounded-none border-0 bg-transparent p-0">
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
                  className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DetailSheetHeader>

        <DetailSheetBody className="space-y-4">
          {current && detailTab === "overview" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  Contact
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Name</span>
                    <span className="text-right font-medium text-foreground">
                      {current.name || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium text-foreground">
                      {current.phone_number || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </span>
                    <span className="break-all text-right font-medium text-foreground">
                      {displayEmail(current.email) || "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Address
                </h3>
                <p className="text-sm leading-relaxed text-foreground">
                  {current.address || "No address provided."}
                </p>
                {current.billing_address && (
                  <div className="border-t border-border pt-2">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Billing address
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {current.billing_address}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  Credit
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit limit</span>
                    <span className="nums font-semibold">
                      {creditLimitDisplay}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Previous credit balance
                    </span>
                    <span className="nums font-semibold">
                      {previousCreditDisplay}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  Quick balances
                </h3>
                {ledgerLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total sales</span>
                      <span className="nums font-semibold">
                        {formatMoney(
                          ledgerSummary?.totalSales ??
                            current.total_sale_amount ??
                            0,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="nums font-semibold text-green-700">
                        {formatMoney(ledgerSummary?.totalPaid || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium text-foreground">
                        Balance due
                      </span>
                      <span
                        className={cn(
                          "nums font-bold",
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
                        className="h-8 flex-1 text-xs"
                        onClick={() => setDetailTab("purchases")}
                      >
                        View purchases
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs"
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

          {current && detailTab === "purchases" && (
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
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Products purchased
                </h3>
                {purchasesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading purchases…
                  </div>
                ) : productSummary.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No purchases recorded for this customer yet.
                  </p>
                ) : (
                  <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Product
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            SKU
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Value
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
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
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.sku || "—"}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatQty(row.totalQty)}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatMoney(row.totalValue)}
                            </TableCell>
                            <TableCell className="nums text-right">
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
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Order history
                </h3>
                {purchasesLoading ? null : flatOrderLines.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No line items.
                  </p>
                ) : (
                  <div className="max-h-[360px] w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Order #
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Date
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Product
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            SKU
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Qty
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Unit price
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Line total
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Branch
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flatOrderLines.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-mono text-xs text-foreground">
                              {row.orderNumber}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {formatDate(row.date)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {row.productName}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.sku || "—"}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatQty(row.quantity)}
                            </TableCell>
                            <TableCell className="nums text-right">
                              {formatMoney(row.unitPrice)}
                            </TableCell>
                            <TableCell className="nums text-right font-medium">
                              {formatMoney(row.lineTotal)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
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
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    Orders summary
                  </h3>
                  <div className="max-h-[280px] w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Sale #
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Date
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Status
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Total
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Paid
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
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
                                  className="border-border bg-muted text-muted-foreground"
                                >
                                  {o.paymentStatus ||
                                    o.payment_status ||
                                    o.status ||
                                    "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="nums text-right">
                                {formatMoney(total)}
                              </TableCell>
                              <TableCell className="nums text-right text-green-700">
                                {formatMoney(paid)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "nums text-right font-medium",
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

          {current && detailTab === "ledger" && (
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

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Record payment
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Pay down the balance due or record an upfront / advance
                      payment
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
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="block font-semibold text-foreground">
                      Settle credit
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Pay amount still owed
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentKind("upfront")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                      paymentKind === "upfront"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="block font-semibold text-foreground">
                      Upfront / advance
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Pay before next purchase
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 min-w-0">
                    <Label className={customerFieldLabelClass}>
                      Amount <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Enter amount"
                      className={cn(customerFieldControlClass, "nums")}
                    />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className={customerFieldLabelClass}>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            customerFieldControlClass,
                            "w-full min-w-0 justify-start px-3 font-normal overflow-hidden",
                            !paymentDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {paymentDate
                              ? format(paymentDate, "MMM d, yyyy")
                              : "Pick date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={paymentDate}
                          onSelect={setPaymentDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className={customerFieldLabelClass}>Method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(v) =>
                        setPaymentMethod(
                          v as (typeof PAYMENT_METHODS)[number],
                        )
                      }
                    >
                      <SelectTrigger className={customerFieldControlClass}>
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
                  <div className="space-y-1 min-w-0">
                    <Label className={customerFieldLabelClass}>Reference</Label>
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
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
                  <p className="text-xs text-muted-foreground">
                    Current balance due:{" "}
                    <span className="nums font-semibold text-red-700">
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
                  loading={addPayment.isPending}
                  className="h-9"
                  disabled={addPayment.isPending}
                >
                  Record payment
                </LoadingButton>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Ledger entries
                </h3>
                {ledgerLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ledger…
                  </div>
                ) : ledgerEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No sales or payments yet. Balance due starts when this
                    customer has credit sales or an opening balance.
                  </p>
                ) : (
                  <div className="max-h-[420px] w-full min-w-0 overflow-x-auto rounded-lg border border-border">
                    <Table className="min-w-[920px]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs uppercase tracking-wide">
                            Date
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Type
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Description
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">
                            Ref
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Debit
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
                            Credit
                          </TableHead>
                          <TableHead className="text-right text-xs uppercase tracking-wide">
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
                              <TableCell className="max-w-[280px] text-sm">
                                {e.description}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {e.reference || "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm">
                                {e.debit > 0 ? formatMoney(e.debit) : "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm text-green-700">
                                {e.credit > 0 ? formatMoney(e.credit) : "—"}
                              </TableCell>
                              <TableCell className="nums text-right text-sm font-semibold">
                                {formatMoney(e.balance)}
                              </TableCell>
                              <TableCell>
                                {paymentId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-destructive"
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
                <p className="text-xs text-muted-foreground">
                  Tip: delete a payment only to correct a mistake. Balance
                  updates immediately.
                </p>
              )}
            </div>
          )}
        </DetailSheetBody>

        <DetailSheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDetailOpen(false);
              setCurrent(null);
              resetPaymentForm();
            }}
          >
            Close
          </Button>
          <Button onClick={() => current && openEdit(current)}>
            <Edit className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        </DetailSheetFooter>
      </DetailSheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleteTarget(null);
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
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
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
          if (!open && !deletePayment.isPending) setPaymentDeleteId(null);
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
            <AlertDialogCancel disabled={deletePayment.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeletePayment();
              }}
              disabled={deletePayment.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
