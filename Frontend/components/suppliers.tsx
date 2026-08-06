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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Truck,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Phone,
  Mail,
  MapPin,
  Building,
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
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { toast } from "sonner";
import { z } from "zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageLoader } from "@/components/ui/page-loader";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { InventoryKpiGrid } from "@/components/inventory/stock-ops/inventory-kpi-grid";
import {
  formatMoney,
  formatQty,
} from "@/components/inventory/stock-ops/export-utils";
import { useScrollToTopOnPageChange } from "@/hooks/use-scroll-to-top-on-page-change";
import { Textarea } from "@/components/ui/textarea";

interface Supplier {
  id: string;
  code: string;
  name: string;
  phone_number?: string;
  fax_number?: string;
  mobile_number?: string;
  country?: string;
  city?: string;
  email?: string;
  ntn?: string;
  strn?: string;
  gov_id?: string;
  address?: string;
  display_on_pos: boolean;
  status: string;
  product_count: number;
  purchase_count?: number;
  created_at: string;
}

interface ProductSummaryRow {
  productId: string;
  productName: string;
  sku: string | null;
  totalQty: number;
  totalValue: number;
  purchaseCount: number;
}

interface PurchaseRow {
  id: string;
  purchase_date: string;
  quantity: number;
  cost_price: number;
  line_total: number;
  invoice_ref: string | null;
  notes: string | null;
  delivery_status?: string;
  product: { id: string; name: string; sku: string | null } | null;
  warehouse_branch: { id: string; name: string } | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: "PURCHASE" | "PAYMENT";
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerSummary {
  totalPurchased: number;
  totalPaid: number;
  balanceDue: number;
  purchaseCount: number;
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

const phoneRegex = /^[0-9+\-\s()]+$/;

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || (v.length >= 7 && v.length <= 20), {
    message: "Must be 7-20 characters",
  })
  .refine((v) => !v || phoneRegex.test(v), {
    message: "Only digits, +, -, spaces, and ( ) allowed",
  });

const supplierFormSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name is too long"),
  phone_number: optionalPhone,
  fax_number: optionalPhone,
  mobile_number: optionalPhone,
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email address",
    }),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  ntn: z.string().trim().optional(),
  strn: z.string().trim().optional(),
  gov_id: z.string().trim().optional(),
  address: z.string().trim().optional(),
  display_on_pos: z.boolean().optional(),
});

type SupplierFormErrors = Partial<
  Record<keyof z.infer<typeof supplierFormSchema>, string>
>;

const zodErrorsToMap = (err: z.ZodError): SupplierFormErrors => {
  const map: SupplierFormErrors = {};
  for (const issue of err.errors) {
    const key = issue.path[0] as keyof SupplierFormErrors | undefined;
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

type SupplierForm = z.infer<typeof supplierFormSchema>;

const emptyForm: SupplierForm = {
  name: "",
  phone_number: "",
  fax_number: "",
  mobile_number: "",
  country: "",
  city: "",
  email: "",
  ntn: "",
  strn: "",
  gov_id: "",
  address: "",
  display_on_pos: true,
};

const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CARD",
  "OTHER",
] as const;

const PAGE_SIZE = 20;

const supplierDialogContentClass =
  "grid w-[min(96vw,580px)] max-w-[580px] sm:max-w-[580px] gap-4 p-5 sm:rounded-lg";
const supplierDialogTitleClass = "text-base font-semibold text-gray-900";
const supplierFieldLabelClass = "text-xs font-medium text-gray-900";
const supplierFieldControlClass = "h-9 rounded-md border-gray-200 text-sm";
const supplierSubmitButtonClass = "h-10 w-full text-sm font-medium";

type StatusFilter = "all" | "active" | "inactive" | "pos";
type DetailTab = "overview" | "purchases" | "ledger";

function isActiveSupplier(s: Supplier) {
  return (s.status || "").toLowerCase() === "active";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface SupplierFormFieldsProps {
  idPrefix: string;
  form: SupplierForm;
  errors: SupplierFormErrors;
  onFieldChange: <K extends keyof SupplierForm>(
    key: K,
    value: SupplierForm[K],
  ) => void;
  disabled?: boolean;
}

function SupplierFormFields({
  idPrefix,
  form,
  errors,
  onFieldChange,
  disabled = false,
}: SupplierFormFieldsProps) {
  const renderInput = (
    key: keyof SupplierForm,
    label: string,
    placeholder: string,
    required = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${key}`} className={supplierFieldLabelClass}>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={(form[key] as string) ?? ""}
        onChange={(e) =>
          onFieldChange(key, e.target.value as SupplierForm[typeof key])
        }
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={errors[key] ? true : undefined}
        className={cn(
          supplierFieldControlClass,
          errors[key] && "border-red-500 focus-visible:ring-red-500",
        )}
      />
      {errors[key] && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("name", "Name", "Enter name", true)}
        {renderInput("phone_number", "Phone", "Enter phone")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("fax_number", "Fax", "Enter fax")}
        {renderInput("mobile_number", "Mobile", "Enter mobile")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("email", "Email", "Enter email")}
        {renderInput("country", "Country", "Enter country")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("city", "City", "Enter city")}
        {renderInput("ntn", "NTN", "Enter ntn")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderInput("strn", "STRN", "Enter strn")}
        {renderInput("gov_id", "Gov ID", "Enter gov id")}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-display_on_pos`}
          checked={form.display_on_pos ?? true}
          onCheckedChange={(checked) =>
            onFieldChange("display_on_pos", checked === true)
          }
          disabled={disabled}
        />
        <Label
          htmlFor={`${idPrefix}-display_on_pos`}
          className="text-sm font-normal text-gray-900 cursor-pointer"
        >
          Display on POS
        </Label>
      </div>

      <div className="space-y-1">
        <Label
          htmlFor={`${idPrefix}-address`}
          className={supplierFieldLabelClass}
        >
          Address
        </Label>
        <Input
          id={`${idPrefix}-address`}
          value={form.address || ""}
          onChange={(e) => onFieldChange("address", e.target.value)}
          placeholder="Enter address"
          disabled={disabled}
          className={supplierFieldControlClass}
        />
      </div>
    </div>
  );
}

const Suppliers: React.FC = () => {
  const [list, setList] = useState<Supplier[]>([]);
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
  const [current, setCurrent] = useState<Supplier | null>(null);

  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [errors, setErrors] = useState<SupplierFormErrors>({});

  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [productSummary, setProductSummary] = useState<ProductSummaryRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState({
    purchaseCount: 0,
    productCount: 0,
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

  const fetchList = useCallback(async (q: string = search) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/suppliers`, {
        params: { search: q || undefined, fetch_all: "true" },
      });
      setList(res.data.data || []);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load suppliers"));
    } finally {
      setLoading(false);
      setIsInitialLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchList("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentDate(new Date());
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentKind("settle");
  };

  const loadPurchases = async (supplierId: string) => {
    setPurchasesLoading(true);
    try {
      const res = await apiClient.get(
        `${API_BASE}/suppliers/${supplierId}/purchases`,
      );
      const data = res.data?.data || {};
      setPurchases(data.purchases || []);
      setProductSummary(data.productSummary || []);
      setPurchaseSummary(
        data.summary || {
          purchaseCount: 0,
          productCount: 0,
          totalQuantity: 0,
          totalValue: 0,
        },
      );
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to load purchases"));
      setPurchases([]);
      setProductSummary([]);
    } finally {
      setPurchasesLoading(false);
    }
  };

  const loadLedger = async (supplierId: string) => {
    setLedgerLoading(true);
    try {
      const res = await apiClient.get(
        `${API_BASE}/suppliers/${supplierId}/ledger`,
      );
      const data = res.data?.data || {};
      setLedgerSummary(data.summary || null);
      setLedgerEntries(data.entries || []);
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

  const openDetail = async (s: Supplier, tab: DetailTab = "overview") => {
    setCurrent(s);
    setDetailTab(tab);
    setDetailOpen(true);
    resetPaymentForm();
    await Promise.all([loadPurchases(s.id), loadLedger(s.id)]);
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
    fetchList(v);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
    fetchList("");
  };

  const openAdd = () => {
    setForm(emptyForm);
    setErrors({});
    setCurrent(null);
    setAddOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setCurrent(s);
    setForm({
      name: s.name,
      phone_number: s.phone_number || "",
      fax_number: s.fax_number || "",
      mobile_number: s.mobile_number || "",
      country: s.country || "",
      city: s.city || "",
      email: s.email || "",
      ntn: s.ntn || "",
      strn: s.strn || "",
      gov_id: s.gov_id || "",
      address: s.address || "",
      display_on_pos: s.display_on_pos,
    });
    setErrors({});
    setEditOpen(true);
  };

  const setField = <K extends keyof SupplierForm>(
    key: K,
    value: SupplierForm[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const submit = async () => {
    const parsed = supplierFormSchema.safeParse(form);
    if (!parsed.success) {
      const map = zodErrorsToMap(parsed.error);
      setErrors(map);
      toast.error(firstZodError(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const data = parsed.data;
      const payload: Record<string, any> = {
        name: data.name,
        display_on_pos: data.display_on_pos ?? true,
        status: current?.status === "inactive" ? "inactive" : "active",
      };
      (
        [
          "phone_number",
          "fax_number",
          "mobile_number",
          "email",
          "country",
          "city",
          "ntn",
          "strn",
          "gov_id",
          "address",
        ] as const
      ).forEach((k) => {
        const v = data[k];
        if (v && v.length > 0) payload[k] = v;
        else if (current) payload[k] = null;
      });

      if (current && editOpen) {
        await apiClient.put(`${API_BASE}/suppliers/${current.id}`, payload);
        setEditOpen(false);
        toast.success("Supplier updated successfully");
      } else {
        await apiClient.post(`${API_BASE}/suppliers`, payload);
        setAddOpen(false);
        toast.success("Supplier created successfully");
      }
      fetchList(search);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to save supplier"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.delete(`${API_BASE}/suppliers/${deleteTarget.id}`);
      toast.success("Supplier deleted successfully");
      setDeleteTarget(null);
      if (current?.id === deleteTarget.id) {
        setDetailOpen(false);
        setCurrent(null);
      }
      fetchList(search);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete supplier"));
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
          : "Settle supplier credit";
      await apiClient.post(`${API_BASE}/suppliers/${current.id}/payments`, {
        amount,
        paymentDate: paymentDate
          ? paymentDate.toISOString()
          : undefined,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
        notes: [kindNote, paymentNotes.trim()].filter(Boolean).join(" · ") ||
          undefined,
      });
      toast.success(
        paymentKind === "upfront"
          ? "Upfront payment recorded"
          : "Credit payment recorded",
      );
      resetPaymentForm();
      await loadLedger(current.id);
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
        `${API_BASE}/suppliers/${current.id}/payments/${paymentDeleteId}`,
      );
      toast.success("Payment deleted");
      setPaymentDeleteId(null);
      await loadLedger(current.id);
    } catch (e: any) {
      toast.error(extractApiError(e, "Failed to delete payment"));
    } finally {
      setPaymentDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const activeCount = list.filter(isActiveSupplier).length;
    const inactiveCount = list.length - activeCount;
    const posCount = list.filter((s) => s.display_on_pos).length;
    return { activeCount, inactiveCount, posCount };
  }, [list]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list.filter((s) => {
      if (statusFilter === "active" && !isActiveSupplier(s)) return false;
      if (statusFilter === "inactive" && isActiveSupplier(s)) return false;
      if (statusFilter === "pos" && !s.display_on_pos) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        (s.code || "").toLowerCase().includes(term) ||
        (s.phone_number || "").toLowerCase().includes(term) ||
        (s.mobile_number || "").toLowerCase().includes(term) ||
        (s.email || "").toLowerCase().includes(term)
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
    { key: "pos", label: "On POS", count: stats.posCount },
  ];

  if (isInitialLoading) {
    return <PageLoader message="Loading suppliers..." />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 text-black min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between pb-1 border-b border-gray-100 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Truck className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Master Data
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
            Suppliers
          </h1>
          <p className="text-sm text-gray-600 mt-0.5 break-words">
            Manage suppliers, purchase history, and payables ledger
          </p>
        </div>
        <Button onClick={openAdd} className="h-9 shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          New Supplier
        </Button>
      </div>

      <InventoryKpiGrid
        columns={4}
        loading={loading && list.length === 0}
        items={[
          {
            label: "Total Suppliers",
            value: list.length.toLocaleString(),
            icon: Truck,
            hint: "All suppliers in the system",
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
            hint: "Available for purchases",
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
            hint: "Disabled from new purchases",
            onClick: () => {
              setStatusFilter("inactive");
              setPage(1);
            },
          },
          {
            label: "Shown on POS",
            value: stats.posCount.toLocaleString(),
            icon: ShoppingBag,
            hint: "Visible in POS selection",
            onClick: () => {
              setStatusFilter("pos");
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
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by name, code, phone, or email"
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
              Supplier List{" "}
              <span className="font-normal text-gray-500">
                ({filtered.length})
              </span>
            </p>
          </div>

          {loading && list.length === 0 ? (
            <div className="py-16">
              <PageLoader message="Loading suppliers..." />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 px-4">
              <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-900">
                No suppliers found
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Try clearing filters or create a new supplier.
              </p>
            </div>
          ) : viewMode === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[100px]">Code</TableHead>
                    <TableHead className="min-w-[160px]">Name</TableHead>
                    <TableHead className="min-w-[120px]">Contact</TableHead>
                    <TableHead className="min-w-[140px]">Email</TableHead>
                    <TableHead className="min-w-[70px]">POS</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                    <TableHead className="min-w-[220px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => {
                    const active = isActiveSupplier(s);
                    return (
                      <TableRow key={s.id} className="hover:bg-gray-50/80">
                        <TableCell className="font-mono text-xs text-gray-600">
                          {s.code}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          {s.name}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {s.mobile_number || s.phone_number || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {s.email || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              s.display_on_pos
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-gray-100 text-gray-700 border-gray-200"
                            }
                          >
                            {s.display_on_pos ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              active
                                ? "bg-green-100 text-green-800 border-green-200"
                                : "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => openDetail(s, "overview")}
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(s, "purchases")}
                            >
                              Purchases
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              onClick={() => openDetail(s, "ledger")}
                            >
                              Ledger
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => openEdit(s)}
                              title="Edit"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-red-600 hover:text-red-700"
                              onClick={() => setDeleteTarget(s)}
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
              {pageRows.map((s) => {
                const active = isActiveSupplier(s);
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {s.name}
                        </p>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">
                          {s.code}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          active
                            ? "bg-green-100 text-green-800 border-green-200 shrink-0"
                            : "bg-red-100 text-red-800 border-red-200 shrink-0"
                        }
                      >
                        {active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>{s.mobile_number || s.phone_number || "No phone"}</p>
                      <p className="truncate">{s.email || "No email"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(s, "overview")}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(s, "purchases")}
                      >
                        Purchases
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openDetail(s, "ledger")}
                      >
                        Ledger
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => openEdit(s)}
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
        <DialogContent className={supplierDialogContentClass}>
          <DialogHeader className="space-y-0">
            <DialogTitle className={supplierDialogTitleClass}>
              {editOpen && current ? "Edit Supplier" : "Create Supplier"}
            </DialogTitle>
          </DialogHeader>

          <SupplierFormFields
            idPrefix={editOpen ? "edit" : "add"}
            form={form}
            errors={errors}
            onFieldChange={setField}
            disabled={submitting}
          />

          <LoadingButton
            onClick={submit}
            loading={submitting}
            className={supplierSubmitButtonClass}
            disabled={submitting}
          >
            {editOpen && current ? "Update Supplier" : "Create"}
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
                        {current.name}
                      </DialogTitle>
                      <DialogDescription className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                          {current.code}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            isActiveSupplier(current)
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }
                        >
                          {isActiveSupplier(current) ? "Active" : "Inactive"}
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
                          <span className="text-gray-500">Mobile</span>
                          <span className="font-medium text-gray-900">
                            {current.mobile_number || "—"}
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
                            {current.email || "—"}
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
                      {(current.city || current.country) && (
                        <p className="text-xs text-gray-500 font-medium">
                          {[current.city, current.country]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5" />
                        Tax & IDs
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">NTN</span>
                          <span className="font-mono text-xs font-semibold">
                            {current.ntn || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">STRN</span>
                          <span className="font-mono text-xs font-semibold">
                            {current.strn || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Gov ID</span>
                          <span className="font-mono text-xs font-semibold">
                            {current.gov_id || "—"}
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
                            <span className="text-gray-500">Purchased</span>
                            <span className="font-semibold tabular-nums">
                              {formatMoney(ledgerSummary?.totalPurchased || 0)}
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
                                (ledgerSummary?.balanceDue || 0) > 0
                                  ? "text-red-700"
                                  : "text-green-700",
                              )}
                            >
                              {formatMoney(ledgerSummary?.balanceDue || 0)}
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
                          label: "Purchase lines",
                          value: purchaseSummary.purchaseCount.toLocaleString(),
                          icon: Package,
                        },
                        {
                          label: "Products",
                          value: purchaseSummary.productCount.toLocaleString(),
                          icon: ShoppingBag,
                        },
                        {
                          label: "Total qty",
                          value: formatQty(purchaseSummary.totalQuantity),
                          icon: Truck,
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
                        Products bought from this supplier
                      </h3>
                      {purchasesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading purchases…
                        </div>
                      ) : productSummary.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-lg">
                          No purchases recorded for this supplier yet.
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
                                  Lines
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
                                    {row.purchaseCount}
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
                        Purchase history
                      </h3>
                      {purchasesLoading ? null : purchases.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">
                          No line items.
                        </p>
                      ) : (
                        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200 max-h-[360px]">
                          <Table className="min-w-[860px]">
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Date</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">
                                  Cost
                                </TableHead>
                                <TableHead className="text-right">
                                  Line total
                                </TableHead>
                                <TableHead>Branch</TableHead>
                                <TableHead>Invoice</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {purchases.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="whitespace-nowrap text-sm">
                                    {formatDate(p.purchase_date)}
                                  </TableCell>
                                  <TableCell className="font-medium text-sm">
                                    {p.product?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatQty(p.quantity)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatMoney(p.cost_price)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {formatMoney(p.line_total)}
                                  </TableCell>
                                  <TableCell className="text-sm text-gray-600">
                                    {p.warehouse_branch?.name || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-gray-600">
                                    {p.invoice_ref || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === "ledger" && (
                  <div className="space-y-4">
                    <InventoryKpiGrid
                      columns={4}
                      loading={ledgerLoading}
                      items={[
                        {
                          label: "Total purchased",
                          value: formatMoney(
                            ledgerSummary?.totalPurchased || 0,
                          ),
                          icon: ArrowUpRight,
                          hint: `${ledgerSummary?.purchaseCount || 0} purchase lines`,
                        },
                        {
                          label: "Total paid",
                          value: formatMoney(ledgerSummary?.totalPaid || 0),
                          icon: ArrowDownLeft,
                          tone: "success",
                          hint: `${ledgerSummary?.paymentCount || 0} payments`,
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
                              ? "Still owed to this supplier"
                              : "Settled / advance on books",
                        },
                        {
                          label: "Payments",
                          value: (
                            ledgerSummary?.paymentCount || 0
                          ).toLocaleString(),
                          icon: Wallet,
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
                                    (
                                      ledgerSummary?.balanceDue || 0
                                    ).toFixed(2),
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
                            Pay amount you still owe
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
                            Pay before next stock-in
                          </span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className={supplierFieldLabelClass}>
                            Amount <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="0.00"
                            className={supplierFieldControlClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={supplierFieldLabelClass}>Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                  supplierFieldControlClass,
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
                        <div className="space-y-1">
                          <Label className={supplierFieldLabelClass}>
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
                            <SelectTrigger className={supplierFieldControlClass}>
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
                          <Label className={supplierFieldLabelClass}>
                            Reference
                          </Label>
                          <Input
                            value={paymentReference}
                            onChange={(e) =>
                              setPaymentReference(e.target.value)
                            }
                            placeholder="Cheque / txn ref"
                            className={supplierFieldControlClass}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className={supplierFieldLabelClass}>Notes</Label>
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
                          No purchases or payments yet. Balance due starts when
                          you record stock-in purchases for this supplier.
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
                                return (
                                  <TableRow key={e.id}>
                                    <TableCell className="whitespace-nowrap text-sm">
                                      {formatDate(e.date)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={
                                          e.type === "PURCHASE"
                                            ? "bg-amber-50 text-amber-800 border-amber-200"
                                            : "bg-green-50 text-green-800 border-green-200"
                                        }
                                      >
                                        {e.type === "PURCHASE"
                                          ? "Purchase"
                                          : "Payment"}
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
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">
                {deleteTarget?.name || "this supplier"}
              </span>
              . Linked products will be moved to the default supplier. Payments
              for this supplier will also be removed. This cannot be undone.
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
              This removes the payment from the supplier ledger and increases
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
};

export default Suppliers;
