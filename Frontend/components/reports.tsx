"use client"

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react"
import * as XLSX from "xlsx"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DateField } from "@/components/ui/date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { CompactReportFilters } from "@/components/report-filters-shell"
import {
  BarChart3,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Users,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react"
import apiClient from "@/lib/apiClient"
import { useToast } from "@/hooks/use-toast"
import {
  rangeForPreset,
  shiftBusinessYmd,
  toBusinessYmd,
  type DatePreset,
} from "@/lib/business-timezone"
import { cn } from "@/lib/utils"

/** Format YYYY-MM-DD without UTC shift. */
const formatYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const moneyScale = (value: number): string | null => {
  const n = Math.abs(Number(value || 0))
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} Lac`
  return null
}

const thCls =
  "h-10 whitespace-nowrap bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500"

type Preset = DatePreset

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 Days" },
  { id: "last30", label: "Last 30 Days" },
  { id: "thisWeek", label: "This Week" },
  { id: "lastWeek", label: "Last Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "all", label: "All dates" },
  { id: "custom", label: "Custom Range" },
]

interface DailySale {
  date: string
  sales: number
  orders: number
  customers: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
  percentage: number
}

interface CategorySale {
  category: string
  sales: number
  percentage: number
}

interface EmployeePerformance {
  name: string
  sales: number
  orders: number
  avgOrder: number
}

const DEFAULT_PRESET: Exclude<Preset, "custom"> = "last30"

export function Reports() {
  const { toast } = useToast()
  const initial = rangeForPreset(DEFAULT_PRESET)
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [draftFrom, setDraftFrom] = useState(initial.from)
  const [draftTo, setDraftTo] = useState(initial.to)

  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalOrders, setTotalOrders] = useState(0)
  const [avgOrderValue, setAvgOrderValue] = useState(0)
  const [uniqueCustomers, setUniqueCustomers] = useState(0)
  const [revenueChange, setRevenueChange] = useState(0)
  const [ordersChange, setOrdersChange] = useState(0)
  const [avgOrderChange, setAvgOrderChange] = useState(0)
  const [customersChange, setCustomersChange] = useState(0)
  const [dailySales, setDailySales] = useState<DailySale[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [categoryWiseSales, setCategoryWiseSales] = useState<CategorySale[]>([])
  const [employeePerformance, setEmployeePerformance] = useState<EmployeePerformance[]>([])

  const buildDaily = useCallback((sales: any[], rangeFrom: string, rangeTo: string): DailySale[] => {
    const byDay = new Map<string, { sales: number; orders: number; customers: Set<string> }>()
    for (const sale of sales) {
      if (!sale) continue
      const field = sale.sale_date || sale.created_at || sale.createdAt || sale.date
      if (!field) continue
      let day: string
      try {
        day = toBusinessYmd(new Date(field))
      } catch {
        continue
      }
      if (day < rangeFrom || day > rangeTo) continue
      const row = byDay.get(day) || { sales: 0, orders: 0, customers: new Set<string>() }
      row.sales += Math.abs(Number(sale.total_amount || sale.total || 0))
      row.orders += 1
      const cust = sale.customer_id || sale.customer?.id
      if (cust) row.customers.add(cust)
      byDay.set(day, row)
    }

    const days: string[] = []
    let cursor = rangeFrom
    let guard = 0
    while (cursor <= rangeTo && guard < 400) {
      days.push(cursor)
      cursor = shiftBusinessYmd(cursor, 1)
      guard++
    }

    const list = days.length > 62 ? days.filter((d) => byDay.has(d)) : days
    return list.map((date) => {
      const row = byDay.get(date)
      return {
        date,
        sales: row?.sales || 0,
        orders: row?.orders || 0,
        customers: row?.customers.size || 0,
      }
    })
  }, [])

  const fetchReportsData = useCallback(async () => {
    setLoading(true)
    try {
      const userRole = localStorage.getItem("role")
      const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN"

      const params: Record<string, string> = { from, to }
      if (!isAdmin) {
        const branchStr = localStorage.getItem("branch")
        if (branchStr && branchStr !== "Not Found") {
          try {
            const branchObj = JSON.parse(branchStr)
            params.branch_id = branchObj.id || branchStr
          } catch {
            params.branch_id = branchStr
          }
        }
      }

      const reportsRes = await apiClient.get("/reports", { params })
      const reportsData = reportsRes.data?.data || {}
      const sales = reportsData.sales || []
      const bestSellingProducts = reportsData.bestSellingProducts || []
      const stats = reportsData.stats || {}
      const employees = reportsData.employeePerformance || []
      const periodFrom = reportsData.period?.from || from
      const periodTo = reportsData.period?.to || to

      const revenue = Number(stats.totalRevenue ?? 0)
      const orders = Number(stats.totalSales ?? sales.length)
      setTotalRevenue(revenue)
      setTotalOrders(orders)
      setAvgOrderValue(orders > 0 ? revenue / orders : 0)
      setUniqueCustomers(Number(stats.uniqueCustomers ?? 0))
      setRevenueChange(Number(stats.revenueChange ?? 0))
      setOrdersChange(Number(stats.ordersChange ?? 0))
      setAvgOrderChange(Number(stats.avgOrderChange ?? 0))
      setCustomersChange(Number(stats.customersChange ?? 0))

      setDailySales(buildDaily(sales, periodFrom, periodTo))

      const totalProductRevenue = bestSellingProducts.reduce((sum: number, p: any) => {
        const rev =
          p.revenue != null
            ? Number(p.revenue)
            : Number(p.price || 0) * Number(p.quantity_sold || 0)
        return sum + Math.abs(rev)
      }, 0)

      setTopProducts(
        bestSellingProducts.slice(0, 5).map((product: any) => {
          const quantity = Number(product.quantity_sold || 0)
          const revenue =
            product.revenue != null
              ? Math.abs(Number(product.revenue))
              : Number(product.price || 0) * quantity
          return {
            name: product.name || "Unknown",
            quantity,
            revenue,
            percentage: totalProductRevenue > 0 ? (revenue / totalProductRevenue) * 100 : 0,
          }
        }),
      )

      const categoryMap = new Map<string, number>()
      sales.forEach((sale: any) => {
        const saleItems = sale.sale_items || sale.items || []
        saleItems.forEach((item: any) => {
          const categoryName =
            item.product?.category?.name ||
            item.product?.category_name ||
            item.category?.name ||
            item.category_name ||
            "Uncategorized"
          const itemTotal = Math.abs(
            Number(
              item.line_total ||
                item.total ||
                Number(item.unit_price || item.price || 0) * Number(item.quantity || 0) ||
                0,
            ),
          )
          categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + itemTotal)
        })
      })
      const totalCategorySales = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0)
      setCategoryWiseSales(
        Array.from(categoryMap.entries())
          .map(([category, salesAmt]) => ({
            category,
            sales: salesAmt,
            percentage: totalCategorySales > 0 ? (salesAmt / totalCategorySales) * 100 : 0,
          }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5),
      )

      setEmployeePerformance(
        (employees as any[]).map((e) => ({
          name: e.name || "Unknown",
          sales: Number(e.sales || 0),
          orders: Number(e.orders || 0),
          avgOrder: Number(e.avgOrder || 0),
        })),
      )
      setHasLoaded(true)
    } catch (error: any) {
      console.error("Error fetching reports data:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.response?.data?.message || "Failed to load reports data. Please try again.",
      })
    } finally {
      setLoading(false)
    }
  }, [from, to, buildDaily, toast])

  useEffect(() => {
    fetchReportsData()
  }, [fetchReportsData])

  const applyPreset = (next: Preset) => {
    setPreset(next)
    if (next === "custom") return
    const range = rangeForPreset(next)
    setFrom(range.from)
    setTo(range.to)
    setDraftFrom(range.from)
    setDraftTo(range.to)
  }

  const applyCustomDates = () => {
    if (draftTo < draftFrom) {
      toast({ variant: "destructive", title: "To Date cannot be earlier than From Date" })
      return
    }
    setPreset("custom")
    setFrom(draftFrom)
    setTo(draftTo)
  }

  const clearFilters = () => {
    const range = rangeForPreset(DEFAULT_PRESET)
    setPreset(DEFAULT_PRESET)
    setFrom(range.from)
    setTo(range.to)
    setDraftFrom(range.from)
    setDraftTo(range.to)
  }

  const periodLabel =
    from === "2000-01-01"
      ? "All dates"
      : from === to
        ? formatYmd(from)
        : `${formatYmd(from)} – ${formatYmd(to)}`

  const handleExport = (type: "csv" | "xlsx") => {
    setExporting(true)
    try {
      const summary = [
        ["Reports & Analytics"],
        ["Period", periodLabel],
        ["Total Revenue", totalRevenue],
        ["Total Orders", totalOrders],
        ["Avg Order Value", avgOrderValue],
        ["Unique Customers", uniqueCustomers],
        [],
      ]
      const dailyRows = [
        ["Daily Sales"],
        ["Date", "Sales", "Orders", "Customers"],
        ...dailySales.map((d) => [d.date, d.sales, d.orders, d.customers]),
        [],
      ]
      const productRows = [
        ["Top Selling Products"],
        ["Product", "Units", "Revenue", "Share %"],
        ...topProducts.map((p) => [p.name, p.quantity, p.revenue, Number(p.percentage.toFixed(1))]),
        [],
      ]
      const categoryRows = [
        ["Category-wise Sales"],
        ["Category", "Sales", "Share %"],
        ...categoryWiseSales.map((c) => [c.category, c.sales, Number(c.percentage.toFixed(1))]),
        [],
      ]
      const employeeRows = [
        ["Employee Performance"],
        ["Employee", "Sales", "Orders", "Avg Order"],
        ...employeePerformance.map((e) => [e.name, e.sales, e.orders, e.avgOrder]),
      ]

      const aoa = [...summary, ...dailyRows, ...productRows, ...categoryRows, ...employeeRows]
      const sheet = XLSX.utils.aoa_to_sheet(aoa)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, "Reports")
      XLSX.writeFile(workbook, `reports-analytics-${from}_to_${to}.${type === "csv" ? "csv" : "xlsx"}`)
      toast({ title: `Exported ${type.toUpperCase()}`, description: periodLabel })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Could not export report",
      })
    } finally {
      setExporting(false)
    }
  }

  const kpiCards: Array<{
    label: string
    value: string
    scale?: string | null
    hint: string
    change: number
    icon: ComponentType<{ className?: string }>
    tone: string
    accent: string
  }> = [
    {
      label: "Total revenue",
      value: money(totalRevenue),
      scale: moneyScale(totalRevenue),
      hint: `${totalOrders} orders in period`,
      change: revenueChange,
      icon: Wallet,
      tone: "bg-emerald-50 text-emerald-600",
      accent: "bg-emerald-500",
    },
    {
      label: "Total orders",
      value: totalOrders.toLocaleString("en-US"),
      hint: "Completed bills",
      change: ordersChange,
      icon: ShoppingCart,
      tone: "bg-sky-50 text-sky-600",
      accent: "bg-sky-500",
    },
    {
      label: "Avg order value",
      value: money(avgOrderValue),
      scale: moneyScale(avgOrderValue),
      hint: "Revenue ÷ orders",
      change: avgOrderChange,
      icon: BarChart3,
      tone: "bg-violet-50 text-violet-600",
      accent: "bg-violet-500",
    },
    {
      label: "Unique customers",
      value: uniqueCustomers.toLocaleString("en-US"),
      hint: "Distinct buyers",
      change: customersChange,
      icon: Users,
      tone: "bg-amber-50 text-amber-600",
      accent: "bg-amber-500",
    },
  ]

  const maxDaily = Math.max(1, ...dailySales.map((d) => d.sales))
  const isFirstLoad = loading && !hasLoaded

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
              Reports & Analytics
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {periodLabel}
              </span>
              <span className="text-slate-300">•</span>
              <span>Sales performance overview</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-9 bg-white shadow-sm"
            onClick={fetchReportsData}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 shadow-sm" disabled={exporting || loading || !hasLoaded}>
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">
                {periodLabel}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleExport("xlsx")} className="items-start gap-2 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500">Summary, daily, products & staff</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport("csv")} className="items-start gap-2 py-2">
                <FileText className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-medium">CSV (.csv)</p>
                  <p className="text-xs text-slate-500">Opens in Excel or Sheets</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CompactReportFilters
        summary={periodLabel}
        loading={loading && hasLoaded}
        defaultOpen
        actions={
          <>
            <Button size="sm" className="h-8" onClick={applyCustomDates}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        }
        primary={
          <>
            <div className="space-y-1">
              <Label>Date range</Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as Preset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DateField
              label="From date"
              value={draftFrom}
              onChange={(value) => {
                setDraftFrom(value)
                setPreset("custom")
              }}
            />
            <DateField
              label="To date"
              value={draftTo}
              onChange={(value) => {
                setDraftTo(value)
                setPreset("custom")
              }}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          : kpiCards.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.label}
                  className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <span className={cn("absolute inset-x-0 top-0 h-1", card.accent)} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {card.label}
                      </p>
                      <p
                        className={cn(
                          "mt-2 break-words text-xl font-semibold leading-snug tracking-tight tabular-nums text-slate-900 sm:text-2xl",
                          loading && "opacity-40",
                        )}
                      >
                        {card.value}
                      </p>
                      {card.scale ? (
                        <p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-700">
                          ≈ {card.scale}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                      <ChangeHint value={card.change} />
                    </div>
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        card.tone,
                      )}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-5 w-5" />}
                    </div>
                  </div>
                </div>
              )
            })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Daily sales"
          caption="Revenue, orders and customers by business day"
        >
          {isFirstLoad ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : dailySales.length === 0 ? (
            <EmptyState message="No sales in this period." />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Date</TableHead>
                    <TableHead className={cn(thCls, "min-w-[140px]")}>Sales</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Orders</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Customers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySales.map((day, i) => (
                    <TableRow key={day.date} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                      <TableCell className="font-medium text-slate-800">{formatYmd(day.date)}</TableCell>
                      <TableCell>
                        <div className="flex min-w-[10rem] items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${(day.sales / maxDaily) * 100}%` }}
                            />
                          </div>
                          <span className="shrink-0 tabular-nums text-slate-800">{money(day.sales)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">{day.orders}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">{day.customers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top selling products" caption="By units sold · actual line revenue">
          {isFirstLoad ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <EmptyState message="No product sales in this period." />
          ) : (
            <div className="divide-y divide-slate-100">
              {topProducts.map((product, index) => (
                <RankRow
                  key={`${product.name}-${index}`}
                  rank={index + 1}
                  title={product.name}
                  meta={`${product.quantity} units sold`}
                  value={money(product.revenue)}
                  scale={moneyScale(product.revenue)}
                  share={product.percentage}
                  bar="bg-sky-500"
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Category-wise sales" caption="Share of line revenue by category">
          {isFirstLoad ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : categoryWiseSales.length === 0 ? (
            <EmptyState message="No category data in this period." />
          ) : (
            <div className="divide-y divide-slate-100">
              {categoryWiseSales.map((category, index) => (
                <RankRow
                  key={`${category.category}-${index}`}
                  rank={index + 1}
                  title={category.category}
                  meta={`${category.percentage.toFixed(1)}% of category sales`}
                  value={money(category.sales)}
                  scale={moneyScale(category.sales)}
                  share={category.percentage}
                  bar="bg-emerald-500"
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Employee performance" caption="Salesperson or cashier credited on bills">
          {isFirstLoad ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : employeePerformance.length === 0 ? (
            <EmptyState message="No employee sales in this period." />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={thCls}>Employee</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Sales</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Orders</TableHead>
                    <TableHead className={cn(thCls, "text-right")}>Avg order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeePerformance.map((employee, i) => (
                    <TableRow key={`${employee.name}-${i}`} className={i % 2 === 1 ? "bg-slate-50/40" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                            {employee.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-800">{employee.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-800">
                        <span className="inline-flex flex-col items-end leading-tight">
                          <span>{money(employee.sales)}</span>
                          {moneyScale(employee.sales) ? (
                            <span className="text-[10px] font-medium text-emerald-700">
                              ≈ {moneyScale(employee.sales)}
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">{employee.orders}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-800">
                        {money(employee.avgOrder)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function ChangeHint({ value }: { value: number }) {
  const up = value >= 0
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-700" : "text-rose-700",
      )}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {value.toFixed(1)}% vs prior period
    </p>
  )
}

function SectionCard({
  title,
  caption,
  children,
  className,
}: {
  title: string
  caption: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn("overflow-hidden border-slate-200 shadow-sm", className)}>
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{caption}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-12 text-center text-sm text-slate-500">{message}</div>
}

function RankRow({
  rank,
  title,
  meta,
  value,
  scale,
  share,
  bar,
}: {
  rank: number
  title: string
  meta: string
  value: string
  scale?: string | null
  share: number
  bar: string
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900" title={title}>
              {title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{meta}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-slate-900">{value}</p>
            {scale ? (
              <p className="text-[10px] font-medium tabular-nums text-emerald-700">≈ {scale}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full", bar)}
            style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
          />
        </div>
      </div>
    </div>
  )
}
