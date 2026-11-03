"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { PageLoader } from "@/components/ui/page-loader"
import {
  DetailSheet,
  DetailSheetBody,
  DetailSheetFooter,
  DetailSheetHeader,
} from "@/components/ui/detail-sheet"
import { useLoading } from "@/hooks/use-loading"
import { useToast } from "@/hooks/use-toast"
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  Download,
  Loader2,
  MapPin,
  Building2,
  Wallet,
  CreditCard,
  Smartphone,
  Receipt,
  Boxes,
  Tag,
  UserPlus,
  ArrowUpRight,
  ChevronRight,
  CalendarDays,
  Undo2,
} from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { mapBranchOption, type BranchOption } from "@/lib/branch-utils"
import apiClient from "@/lib/apiClient"
import { API_BASE } from "@/config/constants"
import { normalizeUserRole, type UserRole } from "@/lib/role-utils"
import { cn } from "@/lib/utils"

const INVENTORY_NAV_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
]

interface TopProduct {
  id: string
  name: string
  sku: string
  quantity_sold: number
  order_count: number
  price: number
  category: string
  topBranch: { id: string; name: string; quantity: number } | null
}

interface RecentSale {
  id: string
  saleNumber: string
  totalAmount: string | number
  status: string
  paymentMethod: string
  saleDate: string
  customerName: string
  branch: { id: string; name: string } | null
  productName: string | null
}

interface TodaySale {
  id: string
  sale_number: string
  total_amount: string | number
  status: string
  created_at: string
  branch: { id: string; name: string } | null
}

interface DashboardStats {
  branch: { id: string; name: string } | null
  isAllBranches: boolean
  totalCustomers: number
  newCustomersToday: number
  lowStockProducts: Array<{
    id: string
    current_quantity: number
    product: { name: string; sku: string }
    branch: { id: string; name: string } | null
  }>
  lowStockCount: number
  todaySales: TodaySale[]
  todaySalesCount: number
  todaySalesTotal: number
  paymentBreakdown: Array<{ method: string; total: number; count: number }>
  avgOrderValue: number
  itemsSoldToday: number
  discountToday: number
  taxToday: number
  todayRefundsCount?: number
  todayRefundsTotal?: number
  todayNetRevenue?: number
}

interface CustomerRow {
  id: string
  name: string | null
  phone_number: string | null
  email: string | null
  created_at: string
  sale_count?: number
  total_sale_amount?: number
}

interface DashboardHomeProps {
  onNavigate?: (tab: string) => void;
}

type ModalKind = "sales" | "transactions" | "customers" | "lowstock" | null

/** Ranking window for Top Products; values match the API's ?period=. */
const TOP_PERIODS = [
  { value: "today", short: "Today", label: "Today" },
  { value: "7d", short: "7D", label: "Last 7 days" },
  { value: "30d", short: "30D", label: "Last 30 days" },
  { value: "all", short: "All", label: "All time" },
] as const
type TopPeriod = (typeof TOP_PERIODS)[number]["value"]
const topPeriodLabel = (p: TopPeriod) => TOP_PERIODS.find((x) => x.value === p)?.label ?? "Last 30 days"

const PAYMENT_ICON: Record<string, any> = {
  CASH: Wallet,
  CARD: CreditCard,
  ONLINE: Smartphone,
  MOBILE_MONEY: Smartphone,
  BANK_TRANSFER: CreditCard,
  CREDIT: CreditCard,
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [role, setRole] = useState<UserRole | null>(null)
  const [activeModal, setActiveModal] = useState<ModalKind>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [customersFetched, setCustomersFetched] = useState(false)

  const { loading: exportLoading, withLoading: withExportLoading } = useLoading()
  const { toast } = useToast()
  const canOpenInventory = role ? INVENTORY_NAV_ROLES.includes(role) : false
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

  // Admin-only scope filter: "all" = whole business, otherwise one branch id.
  // Branch users never see this — the server pins them to their own branch.
  const [scopeBranchId, setScopeBranchId] = useState<string>("all")
  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([])
  // Guards against a slow response for an older selection overwriting a newer one.
  const loadSeq = useRef(0)
  const scopeParams = (branchId: string) => (branchId && branchId !== "all" ? { branchId } : {})

  const [topPeriod, setTopPeriod] = useState<TopPeriod>("30d")
  const [topLoading, setTopLoading] = useState(false)
  const topSeq = useRef(0)

  const getTopProducts = async (branchId: string, period: TopPeriod) => {
    const seq = ++topSeq.current
    try {
      const response = await apiClient.get('/products/best-selling', {
        params: { ...scopeParams(branchId), period },
      })
      if (seq !== topSeq.current) return // a newer branch/period request superseded this one
      setTopProducts(response?.data?.success ? response.data.data || [] : [])
    } catch (error: any) {
      if (seq !== topSeq.current) return
      setTopProducts([])
      toast({
        variant: "destructive",
        title: "Top Products Error",
        description: error.response?.data?.message || "Failed to fetch top products"
      })
    }
  }

  const getRecentSales = async (branchId: string) => {
    try {
      const response = await apiClient.get('/sale/recent', { params: { limit: 20, ...scopeParams(branchId) } })
      if (response?.data?.success) {
        setRecentSales(response.data.data || [])
      } else {
        setRecentSales([])
      }
    } catch (error: any) {
      setRecentSales([])
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch recent sales"
      })
    }
  }

  const getStats = async (branchId: string) => {
    try {
      const response = await apiClient.get('/dashboard/stats', { params: scopeParams(branchId) })
      if (response?.data?.success) {
        setStats(response.data.data || null)
      } else {
        setStats(null)
      }
    } catch (error: any) {
      setStats(null)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch dashboard stats"
      })
    }
  }

  const loadAllData = async (branchId: string) => {
    const seq = ++loadSeq.current
    setInitialLoading(true) // every card switches to its skeleton while the new scope loads
    await Promise.all([
      getTopProducts(branchId, topPeriod),
      getRecentSales(branchId),
      getStats(branchId)
    ])
    if (seq === loadSeq.current) setInitialLoading(false)
  }

  useEffect(() => {
    const currentRole = normalizeUserRole(localStorage.getItem("role"))
    setRole(currentRole)
    loadAllData("all")
    if (currentRole === "SUPER_ADMIN" || currentRole === "ADMIN") {
      apiClient
        .get("/branches", { params: { page: 1, limit: 100, is_active: true } })
        .then((res) => {
          const raw = Array.isArray(res?.data?.data) ? res.data.data : []
          setBranchOptions(raw.map(mapBranchOption).filter((b: BranchOption) => b.id && b.is_active !== false))
        })
        .catch(() => setBranchOptions([]))
    }
  }, [])

  const handleTopPeriodChange = async (period: TopPeriod) => {
    if (period === topPeriod) return
    setTopPeriod(period)
    setTopLoading(true)
    try {
      await getTopProducts(scopeBranchId, period)
    } finally {
      setTopLoading(false)
    }
  }

  const handleScopeChange = (value: string) => {
    if (value === scopeBranchId) return
    setScopeBranchId(value)
    loadAllData(value)
  }

  useEffect(() => {
    if (activeModal !== "customers" || customersFetched) return
    setCustomersLoading(true)
    apiClient
      .get(`${API_BASE}/customer`)
      .then((res) => {
        const list: CustomerRow[] = res.data?.data || []
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setCustomers(list)
        setCustomersFetched(true)
      })
      .catch((error: any) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.response?.data?.message || "Failed to load customers",
        })
      })
      .finally(() => setCustomersLoading(false))
  }, [activeModal, customersFetched])

  /**
   * Export = fetch fresh data for the selected scope, then render.
   * The PDF never reuses on-screen state, so it can't mix branches if the
   * selection changed mid-load, and it reflects sales made since the page opened.
   */
  const handleExportReport = async () => {
    if (exportLoading) return
    const branchId = isAdmin ? scopeBranchId : "all"
    const params = scopeParams(branchId)
    await withExportLoading(async () => {
      try {
        const [statsRes, topRes] = await Promise.all([
          apiClient.get("/dashboard/stats", { params }),
          apiClient.get("/products/best-selling", { params: { ...params, period: topPeriod } }),
        ])
        const freshStats: DashboardStats | null = statsRes?.data?.data ?? null
        if (!freshStats) throw new Error("No dashboard data returned")

        const scopeLabel =
          freshStats.branch?.name ||
          (branchId !== "all" ? branchOptions.find((b) => b.id === branchId)?.name : undefined) ||
          "All Branches"

        const { downloadDashboardReportPdf } = await import("@/lib/dashboard-report-pdf")
        const filename = await downloadDashboardReportPdf({
          scope: { branchId: branchId === "all" ? null : branchId, label: scopeLabel },
          stats: freshStats,
          topProducts: Array.isArray(topRes?.data?.data) ? topRes.data.data : [],
          topProductsPeriod: topPeriodLabel(topPeriod),
          preparedBy: typeof window !== "undefined" ? localStorage.getItem("userEmail") : null,
        })
        toast({
          variant: "success",
          title: "Report downloaded",
          description: `${scopeLabel} · saved as ${filename}`,
        })
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Export failed",
          description: error?.response?.data?.message || "Could not generate the report. Please try again.",
        })
      }
    })
  }

  const formatCurrency = (amount: string | number) => `Rs ${Number(amount).toFixed(2)}`

  const timeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const formatMoney = (amount: string | number) =>
    `Rs ${Number(amount || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const paymentTotal = (stats?.paymentBreakdown || []).reduce((sum, p) => sum + Number(p.total || 0), 0)
  const visibleTopProducts = topProducts.slice(0, 6)
  const maxSold = Math.max(1, ...visibleTopProducts.map((p) => Number(p.quantity_sold) || 0))
  const lowStockCount = stats?.lowStockCount || 0

  const quickReports = [
    { id: "today-revenue", label: "Today's Revenue", hint: "All completed sales", icon: DollarSign, tone: "bg-slate-900 text-white", accent: "bg-slate-900" },
    { id: "today-cash-sales", label: "Today's Cash Sales", hint: "Cash inflows only", icon: Wallet, tone: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100", accent: "bg-emerald-500" },
    { id: "today-credit-sales", label: "Today's Credit Sales", hint: "Credit invoices", icon: CreditCard, tone: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100", accent: "bg-amber-500" },
    { id: "today-expenses", label: "Today's Expenses", hint: "Outgoing cash", icon: Receipt, tone: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100", accent: "bg-rose-500" },
  ]

  const kpis: Array<{
    key: Exclude<ModalKind, null>
    label: string
    value: string
    meta: string
    icon: any
    tone: string
    alert?: boolean
  }> = [
    {
      key: "sales",
      label: "Today's Sales",
      value: formatMoney(stats?.todaySalesTotal || 0),
      meta: `${plural(stats?.todaySalesCount || 0, "transaction")} today`,
      icon: DollarSign,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "transactions",
      label: "Recent Transactions",
      value: String(recentSales.length),
      meta: "Latest sales activity",
      icon: ShoppingCart,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      key: "customers",
      label: "Total Customers",
      value: String(stats?.totalCustomers || 0),
      meta: `+${stats?.newCustomersToday || 0} new today`,
      icon: Users,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      key: "lowstock",
      label: "Low Stock Items",
      value: String(lowStockCount),
      meta: lowStockCount > 0 ? "Need restocking" : "Stock levels healthy",
      icon: Package,
      tone: "bg-amber-50 text-amber-600",
      alert: lowStockCount > 0,
    },
  ]

  const insights = [
    { label: "Sales Today", value: String(stats?.todaySalesCount || 0), icon: Receipt, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Avg Order Value", value: formatMoney(stats?.avgOrderValue || 0), icon: TrendingUp, tone: "bg-blue-50 text-blue-600" },
    { label: "Items Sold", value: String(stats?.itemsSoldToday || 0), icon: Boxes, tone: "bg-violet-50 text-violet-600" },
    { label: "New Customers", value: String(stats?.newCustomersToday || 0), icon: UserPlus, tone: "bg-amber-50 text-amber-600" },
    { label: "Discounts Given", value: formatMoney(stats?.discountToday || 0), icon: Tag, tone: "bg-rose-50 text-rose-600" },
    { label: "Tax Collected", value: formatMoney(stats?.taxToday || 0), icon: DollarSign, tone: "bg-sky-50 text-sky-600" },
    ...(stats?.todayRefundsCount
      ? [
          {
            label: "Refunds Today",
            value: formatMoney(stats.todayRefundsTotal || 0),
            icon: Undo2,
            tone: "bg-orange-50 text-orange-600",
          },
        ]
      : []),
  ]

  if (initialLoading && !stats) return <PageLoader message="Loading dashboard..." />

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {todayLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back! Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Select value={scopeBranchId} onValueChange={handleScopeChange} disabled={(initialLoading && !stats) || exportLoading}>
              <SelectTrigger
                className={cn(
                  "h-9 w-full gap-0 text-sm font-medium shadow-sm sm:w-[220px] [&>span]:flex-1 [&>span]:text-left",
                  scopeBranchId === "all"
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-blue-300 bg-blue-50 text-blue-900"
                )}
                aria-label="Show dashboard for"
              >
                {/* Icon + value are direct children: SelectTrigger line-clamps child <span>s,
                    which stacked them vertically when wrapped together. */}
                {scopeBranchId === "all" ? (
                  <Building2 className="mr-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                ) : (
                  <MapPin className="mr-2 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                )}
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branchOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.branch_type === "WAREHOUSE" ? " (Warehouse)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
              <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="max-w-[180px] truncate">{stats?.branch?.name || "Your branch"}</span>
            </div>
          )}
          <LoadingButton
            onClick={handleExportReport}
            loading={exportLoading}
            loadingText="Preparing report..."
            disabled={initialLoading && !stats}
            className="h-9 w-full shadow-sm sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </LoadingButton>
        </div>
      </div>

      {/* Today quick reports */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
          {quickReports.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.id)}
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", item.accent)} aria-hidden />
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", item.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="truncate text-xs text-slate-500">{item.hint}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-900" />
              </button>
            )
          })}
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          kpis.map((kpi) => {
            const Icon = kpi.icon
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setActiveModal(kpi.key)}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
              >
                <div className="flex items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                    <p
                      className={cn(
                        "mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-900",
                        kpi.alert && "text-amber-600",
                      )}
                    >
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{kpi.meta}</p>
                  </div>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", kpi.tone)}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-xs font-medium text-slate-600 transition-colors group-hover:text-slate-900">
                  View details
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            )
          })
        )}
      </section>

      {/* Payment Methods + Today's Insights */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden rounded-xl border-slate-200 lg:col-span-2">
          <PanelHeader
            title="Payment Methods Today"
            description="How customers paid today"
            action={<CountPill>{plural(stats?.todaySalesCount || 0, "sale")}</CountPill>}
          />
          {initialLoading ? (
            <PanelLoader />
          ) : stats?.paymentBreakdown?.length ? (
            <ul className="divide-y divide-slate-100">
              {stats.paymentBreakdown.map((p) => {
                const Icon = PAYMENT_ICON[p.method] || Wallet
                const share = paymentTotal > 0 ? (Number(p.total) / paymentTotal) * 100 : 0
                return (
                  <li key={p.method} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium capitalize text-slate-900">
                          {p.method.toLowerCase().replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {plural(p.count, "transaction")} · {share.toFixed(0)}%
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(p.total)}</p>
                    </div>
                    <div className="ml-12 mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={Wallet} title="No sales recorded today" hint="Payment activity will show up here once sales are made." />
          )}
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 lg:col-span-3">
          <PanelHeader title="Today's Insights" description="Key numbers for the day at a glance" />
          {initialLoading ? (
            <PanelLoader />
          ) : (
            <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
              {insights.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex min-w-0 flex-col gap-3 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", item.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <p className="truncate text-xs font-medium text-slate-500">{item.label}</p>
                    </div>
                    <p className="truncate text-xl font-semibold tracking-tight tabular-nums text-slate-900">{item.value}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* Recent Sales */}
        <Card className="overflow-hidden rounded-xl border-slate-200">
          <PanelHeader
            title="Recent Sales"
            description="Latest completed transactions"
            action={<CountPill>{plural(recentSales.length, "transaction")}</CountPill>}
          />
          {initialLoading ? (
            <PanelLoader label="Loading recent sales..." />
          ) : recentSales.length ? (
            <ul className="divide-y divide-slate-100">
              {recentSales.slice(0, 6).map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {initialsOf(sale.customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{sale.customerName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono text-[11px]">{sale.saleNumber}</span>
                      <span className="text-slate-300">•</span>
                      <span>{timeAgo(sale.saleDate)}</span>
                      {isAdmin && sale.branch && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {sale.branch.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(sale.totalAmount)}</p>
                    <StatusPill status={sale.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShoppingCart} title="No recent sales" hint="New sales will appear here as they happen." />
          )}
        </Card>

        {/* Top Products */}
        <Card className="overflow-hidden rounded-xl border-slate-200">
          <PanelHeader
            title="Top Products"
            description={`Best sellers by quantity · ${topPeriodLabel(topPeriod)}`}
            action={
              <div
                role="radiogroup"
                aria-label="Top products period"
                className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              >
                {TOP_PERIODS.map((p) => {
                  const active = p.value === topPeriod
                  return (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={p.label}
                      disabled={initialLoading || topLoading}
                      onClick={() => handleTopPeriodChange(p.value)}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 disabled:cursor-not-allowed",
                        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                      )}
                    >
                      {p.short}
                    </button>
                  )
                })}
              </div>
            }
          />
          {initialLoading || topLoading ? (
            <PanelLoader label="Loading top products..." />
          ) : visibleTopProducts.length ? (
            <ul className="divide-y divide-slate-100">
              {visibleTopProducts.map((product, index) => (
                <li key={product.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                      index === 0
                        ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(product.price)}</p>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                      <span>{plural(product.order_count, "order")}</span>
                      <span className="text-slate-300">•</span>
                      <span>{product.quantity_sold} sold</span>
                      {isAdmin && product.topBranch && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {product.topBranch.name}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${((Number(product.quantity_sold) || 0) / maxSold) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Package}
              title={`No sales ${topPeriod === "today" ? "today" : topPeriod === "all" ? "yet" : "in this period"}`}
              hint="Best sellers will be ranked here once items sell."
            />
          )}
        </Card>
      </div>

      <DetailSheet
        open={activeModal !== null}
        onOpenChange={(open) => !open && setActiveModal(null)}
        size="lg"
      >
        <DetailSheetHeader
          title={
            activeModal === "sales"
              ? "Today's sales"
              : activeModal === "transactions"
                ? "Recent transactions"
                : activeModal === "customers"
                  ? "Customers"
                  : "Low stock items"
          }
          subtitle={
            activeModal === "sales"
              ? `${formatCurrency(stats?.todaySalesTotal || 0)} across ${stats?.todaySalesCount || 0} transactions${stats?.branch ? ` at ${stats.branch.name}` : " — all branches"}`
              : activeModal === "transactions"
                ? `Last ${recentSales.length} sales${isAdmin ? " across all branches" : ""}`
                : activeModal === "customers"
                  ? `${stats?.totalCustomers || 0} total · ${stats?.newCustomersToday || 0} new today`
                  : `${stats?.lowStockCount || 0} items below threshold${stats?.branch ? ` at ${stats.branch.name}` : " — all branches"}`
          }
        />
        <DetailSheetBody className="space-y-2">
          {activeModal === "sales" && (
            stats?.todaySales?.length ? stats.todaySales.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.sale_number}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{timeAgo(s.created_at)}</span>
                        {isAdmin && s.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {s.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                      <div className="font-semibold text-sm tabular-nums">{formatMoney(s.total_amount)}</div>
                      <StatusPill status={s.status} />
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No sales yet today</div>
                )
          )}

          {activeModal === "transactions" && (
            recentSales.length ? recentSales.map((sale) => (
                  <div key={sale.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{sale.customerName}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{sale.saleNumber}</span>
                        <span>·</span>
                        <span>{timeAgo(sale.saleDate)}</span>
                        {isAdmin && sale.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {sale.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right shrink-0">
                      <div className="font-semibold text-sm tabular-nums">{formatMoney(sale.totalAmount)}</div>
                      <StatusPill status={sale.status} />
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No recent transactions</div>
                )
          )}

          {activeModal === "customers" && (
            customersLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading customers…</span>
                  </div>
                ) : customers.length ? customers.slice(0, 20).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.name || "Unnamed Customer"}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone_number || c.email || "No contact info"}</div>
                    </div>
                    {typeof c.sale_count === "number" && (
                      <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{c.sale_count} orders</div>
                    )}
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No customers found</div>
                )
          )}

          {activeModal === "lowstock" && (
            stats?.lowStockProducts?.length ? stats.lowStockProducts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{item.product.name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                        <span>{item.product.sku}</span>
                        {isAdmin && item.branch && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {item.branch.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                      {item.current_quantity} left
                    </Badge>
                  </div>
                )) : (
                  <div className="text-center text-muted-foreground py-8">No low stock items</div>
                )
          )}
        </DetailSheetBody>
        <DetailSheetFooter>
          <Button variant="outline" onClick={() => setActiveModal(null)}>
            Close
          </Button>
          {(activeModal === "sales" || activeModal === "transactions") && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("sales-history") }}>
              Open sales history
            </Button>
          )}
          {activeModal === "customers" && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("customers") }}>
              Open customers
            </Button>
          )}
          {activeModal === "lowstock" && canOpenInventory && (
            <Button onClick={() => { setActiveModal(null); onNavigate?.("inventory-dashboard") }}>
              Open inventory
            </Button>
          )}
        </DetailSheetFooter>
      </DetailSheet>
    </div>
  )
}

function initialsOf(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

function PanelHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
      {children}
    </span>
  )
}

function StatusPill({ status }: { status?: string | null }) {
  const value = status?.toLowerCase() || "completed"
  const tone =
    value === "completed" || value === "paid"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : value === "pending" || value === "partial"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : value === "cancelled" || value === "refunded" || value === "void"
          ? "bg-rose-50 text-rose-700 ring-rose-600/20"
          : "bg-slate-50 text-slate-600 ring-slate-500/20"
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  )
}

function PanelLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      {label && <span className="text-sm text-slate-500">{label}</span>}
    </div>
  )
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
