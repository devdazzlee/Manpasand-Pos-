"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatMoneyDisplay } from "@/lib/money";
import {
  fetchInventoryDashboard,
  fetchBranchesForFilter,
  type InventoryDashboardStats,
  type BranchOption,
} from "@/lib/inventory-api";
import {
  Package,
  DollarSign,
  MapPin,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  ArrowRightLeft,
  Loader2,
  Truck,
  PackageMinus,
  ClipboardList,
  TrendingUp,
  Warehouse,
  LayoutDashboard,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
} from "recharts";

const CHART_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be185d",
];

const BRANCH_FILTER_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "WAREHOUSE_MANAGER",
  "PURCHASE_MANAGER",
]);

function formatRs(n: number) {
  const value = Number(n) || 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs ${formatMoneyDisplay(Math.abs(value))}`;
}

function formatQty(n: number) {
  const value = Number(n) || 0;
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function truncateLabel(label: string, max = 18) {
  if (!label) return "";
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function movementLabel(type: string) {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type QuickAction = {
  label: string;
  description: string;
  tab: string;
  icon: typeof Package;
  roles?: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Stock In",
    description: "Receive purchases",
    tab: "purchases",
    icon: ShoppingBag,
    roles: ["SUPER_ADMIN", "ADMIN", "PURCHASE_MANAGER"],
  },
  {
    label: "Transfers",
    description: "Move between branches",
    tab: "transfers",
    icon: Truck,
  },
  {
    label: "Stock Out",
    description: "Damage, loss, return",
    tab: "stock-out",
    icon: PackageMinus,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    label: "Adjustments",
    description: "Correct stock levels",
    tab: "stock-adjustment",
    icon: ClipboardList,
  },
  {
    label: "By Location",
    description: "View stock per branch",
    tab: "stock-view",
    icon: Warehouse,
  },
  {
    label: "Stock Mgmt",
    description: "Full stock tools",
    tab: "stock-management",
    icon: ArrowRightLeft,
  },
];

export function InventoryDashboard({
  onNavigate,
}: {
  onNavigate?: (tab: string) => void;
}) {
  const [stats, setStats] = useState<InventoryDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const { toast } = useToast();

  const canFilterBranches = userRole ? BRANCH_FILTER_ROLES.has(userRole) : false;

  const visibleActions = useMemo(
    () =>
      QUICK_ACTIONS.filter(
        (a) => !a.roles || (userRole ? a.roles.includes(userRole) : false),
      ),
    [userRole],
  );

  const loadStats = useCallback(
    async (branchId?: string, soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchInventoryDashboard(branchId || undefined);
        setStats(data);
      } catch (e: any) {
        toast({
          title: "Failed to load inventory",
          description:
            e?.response?.data?.message || "Could not fetch dashboard data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const role = localStorage.getItem("role");
    setUserRole(role);

    let initialBranchId = "";
    const raw = localStorage.getItem("branch");
    if (raw && raw !== "Not Found") {
      try {
        const obj = JSON.parse(raw);
        initialBranchId = obj.id || raw;
      } catch {
        initialBranchId = raw;
      }
    }

    if (role === "BRANCH_MANAGER" && initialBranchId) {
      setSelectedBranchId(initialBranchId);
      loadStats(initialBranchId);
    } else {
      setSelectedBranchId("");
      loadStats();
    }

    fetchBranchesForFilter()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [loadStats]);

  const goTo = (tab: string) => {
    onNavigate?.(tab);
  };

  const onBranchChange = (value: string) => {
    const bid = value === "all" ? "" : value;
    setSelectedBranchId(bid);
    loadStats(bid, true);
  };

  const healthScore = useMemo(() => {
    if (!stats || stats.totalSkus === 0) return 100;
    const problem =
      (stats.outOfStockCount || 0) + (stats.negativeStockCount || 0);
    const score = Math.round(
      ((stats.totalSkus - Math.min(problem, stats.totalSkus)) /
        stats.totalSkus) *
        100,
    );
    return Math.max(0, Math.min(100, score));
  }, [stats]);

  const categoryChartData = useMemo(() => {
    if (!stats?.categorySummary?.length) return [];
    return stats.categorySummary.slice(0, 7).map((c) => ({
      name: c.name,
      value: Math.max(0, Number(c.value) || 0),
      items: c.items,
    }));
  }, [stats]);

  const velocityData = useMemo(() => {
    if (!stats?.velocity?.length) return [];
    return [...stats.velocity]
      .sort((a, b) => a.quantity - b.quantity)
      .map((v) => ({
        name: truncateLabel(v.name, 22),
        fullName: v.name,
        quantity: Number(v.quantity) || 0,
      }));
  }, [stats]);

  const movementData = useMemo(() => {
    if (!stats?.movementTrend?.length) return [];
    return stats.movementTrend.map((m) => ({
      name: movementLabel(m.movement_type),
      count: Number(m.count ?? m._count ?? 0),
    }));
  }, [stats]);

  const absTotalValue = useMemo(() => {
    if (!stats?.branchSummary?.length) return 0;
    return stats.branchSummary.reduce(
      (sum, b) => sum + Math.abs(Number(b.value) || 0),
      0,
    );
  }, [stats]);

  if (loading && !stats) {
    return <PageLoader message="Loading inventory data..." />;
  }

  const displayValue =
    stats?.positiveInventoryValue ?? stats?.totalInventoryValue ?? 0;
  const hasNegativeStock = (stats?.negativeStockCount ?? 0) > 0;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-1 border-b border-gray-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
              Overview
            </span>
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-gray-900 tracking-tight leading-none">
            Inventory Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Stock health, valuation, and quick operations
          </p>
        </div>

        {canFilterBranches && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 h-10 self-start sm:self-auto shrink-0">
            {refreshing ? (
              <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4 text-gray-400" />
            )}
            <Select
              value={selectedBranchId || "all"}
              disabled={refreshing}
              onValueChange={onBranchChange}
            >
              <SelectTrigger className="w-[170px] border-none shadow-none h-8 focus:ring-0 text-sm">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Stock Value"
          loading={refreshing}
          value={formatRs(displayValue)}
          icon={DollarSign}
          hint={
            hasNegativeStock
              ? `Ledger: ${formatRs(stats?.totalInventoryValue ?? 0)}`
              : undefined
          }
        />
        <KpiCard
          label="Out of Stock"
          loading={refreshing}
          value={stats?.outOfStockCount ?? 0}
          icon={AlertTriangle}
          tone={(stats?.outOfStockCount ?? 0) > 0 ? "danger" : "default"}
          onClick={() => goTo("stock-view")}
        />
        <KpiCard
          label="Low Stock"
          loading={refreshing}
          value={stats?.lowStockCount ?? 0}
          icon={Package}
          tone={(stats?.lowStockCount ?? 0) > 0 ? "warning" : "default"}
          onClick={() => goTo("stock-view")}
        />
        <KpiCard
          label="Negative Stock"
          loading={refreshing}
          value={stats?.negativeStockCount ?? 0}
          icon={AlertTriangle}
          tone={hasNegativeStock ? "danger" : "success"}
          onClick={() => goTo("stock-adjustment")}
        />
        <KpiCard
          label="Pending Transfers"
          loading={refreshing}
          value={stats?.pendingTransferCount ?? 0}
          icon={Truck}
          onClick={() => goTo("transfers")}
        />
        <KpiCard
          label="Health"
          loading={refreshing}
          value={`${healthScore}%`}
          icon={TrendingUp}
          tone={
            healthScore >= 80
              ? "success"
              : healthScore >= 50
                ? "warning"
                : "danger"
          }
          hint={`${stats?.totalSkus ?? 0} active SKUs`}
        />
      </div>

      {/* Quick actions */}
      <Card className="border border-gray-200 shadow-sm">
        <CardHeader className="py-3 px-4 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-900">
            Quick Actions
          </CardTitle>
          <CardDescription className="text-xs">
            Jump to the operation you need
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.tab}
                  type="button"
                  onClick={() => goTo(action.tab)}
                  className="flex flex-col items-start gap-1 rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                >
                  <Icon className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-900">
                    {action.label}
                  </span>
                  <span className="text-[11px] text-gray-500 leading-tight">
                    {action.description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left: charts */}
        <div className="xl:col-span-2 space-y-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold text-gray-900">
                Sales Velocity
              </CardTitle>
              <CardDescription className="text-xs">
                Top sold items in the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="h-[280px] w-full">
                {refreshing ? (
                  <Skeleton className="h-full w-full" />
                ) : velocityData.length === 0 ? (
                  <EmptyBlock message="No sales movements in the last 7 days" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={velocityData}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        fontSize={11}
                        tick={{ fill: "#6b7280" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        axisLine={false}
                        tickLine={false}
                        fontSize={11}
                        tick={{ fill: "#374151" }}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          formatQty(value),
                          "Sold",
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.fullName || ""
                        }
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="quantity"
                        fill="#2563eb"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  Valuation by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 h-[260px]">
                {refreshing ? (
                  <div className="h-full flex items-center justify-center">
                    <Skeleton className="h-32 w-32 rounded-full" />
                  </div>
                ) : categoryChartData.length === 0 ? (
                  <EmptyBlock message="No positive stock value by category" />
                ) : (
                  <div className="h-full flex gap-2">
                    <div className="flex-1 min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={48}
                            outerRadius={72}
                            paddingAngle={3}
                          >
                            {categoryChartData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={CHART_COLORS[i % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => formatRs(value)}
                            contentStyle={{
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-[42%] overflow-y-auto space-y-1.5 py-2 pr-1">
                      {categoryChartData.map((c, i) => (
                        <div
                          key={c.name}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span
                            className="mt-1 h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{
                              background:
                                CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 truncate">
                              {c.name}
                            </p>
                            <p className="text-gray-500">
                              {formatRs(c.value)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  Location Allocation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[260px] overflow-y-auto">
                  {refreshing ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-3 flex gap-3">
                        <Skeleton className="h-7 w-7 rounded-lg" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))
                  ) : stats?.branchSummary?.length ? (
                    stats.branchSummary.map((b, i) => {
                      const weight = absTotalValue
                        ? (
                            (Math.abs(b.value) / absTotalValue) *
                            100
                          ).toFixed(1)
                        : "0";
                      return (
                        <div
                          key={b.branchId}
                          className="p-3 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                              {i + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">
                                {b.name}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {weight}% · {b.items} SKUs
                              </p>
                            </div>
                          </div>
                          <p
                            className={`text-xs font-semibold tabular-nums shrink-0 ${
                              b.value < 0 ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {formatRs(b.value)}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyBlock message="No location stock data" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {movementData.length > 0 && (
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  Movement Activity (7 days)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="h-[180px]">
                  {refreshing ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={movementData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#f1f5f9"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          fontSize={10}
                          tick={{ fill: "#6b7280" }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          fontSize={10}
                          tick={{ fill: "#6b7280" }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            fontSize: 12,
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="#059669"
                          radius={[4, 4, 0, 0]}
                          barSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: alerts + procurement */}
        <div className="space-y-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    This Month Purchases
                  </CardTitle>
                  {refreshing ? (
                    <Skeleton className="h-7 w-28 mt-2" />
                  ) : (
                    <p className="text-xl font-semibold text-gray-900 mt-1 tabular-nums">
                      {formatRs(stats?.procurementHealth?.totalValue || 0)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {stats?.procurementHealth?.count || 0} purchase records
                  </p>
                </div>
                <ShoppingBag className="h-5 w-5 text-gray-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {(!userRole ||
                ["SUPER_ADMIN", "ADMIN", "PURCHASE_MANAGER"].includes(
                  userRole,
                )) && (
                <Button
                  className="w-full h-9 text-sm bg-blue-600 hover:bg-blue-700"
                  onClick={() => goTo("purchases")}
                >
                  Open Stock In
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {stats?.recentPurchases?.length ? (
                <div className="mt-3 space-y-2">
                  {stats.recentPurchases.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {p.product?.name || "Product"}
                        </p>
                        <p className="text-gray-500 truncate">
                          {p.supplier?.name || "No supplier"}
                        </p>
                      </div>
                      <span className="tabular-nums text-gray-700 shrink-0">
                        {formatQty(p.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden bg-gradient-to-b from-white to-slate-50/80">
            <Tabs defaultValue="low" className="w-full">
              <div className="px-4 pt-4 pb-3 border-b border-gray-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Needs Attention
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Critical stock & open transfers
                    </p>
                  </div>
                  {(stats?.lowStockCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 text-[10px] font-semibold">
                      <AlertTriangle className="h-3 w-3" />
                      {stats?.lowStockCount} alerts
                    </span>
                  )}
                </div>
                <TabsList className="bg-slate-100/80 p-1 rounded-xl h-10 w-full grid grid-cols-2 gap-1">
                  <TabsTrigger
                    value="low"
                    className="text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                  >
                    Low Stock
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
                  >
                    Transfers
                    {(stats?.pendingTransferCount ?? 0) > 0 ? (
                      <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] px-1">
                        {stats?.pendingTransferCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="low" className="m-0">
                <div className="p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
                  {refreshing ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
                    ))
                  ) : stats?.lowStockAlerts?.length ? (
                    stats.lowStockAlerts.map((a, i) => {
                      const qty = Number(a.currentQuantity) || 0;
                      const min = Number(a.minThreshold) || 0;
                      const critical = qty <= 0;
                      const fillPct =
                        min > 0
                          ? Math.max(0, Math.min(100, (Math.max(qty, 0) / min) * 100))
                          : 0;
                      return (
                        <button
                          key={`${a.product?.id}-${a.branch?.id}-${i}`}
                          type="button"
                          onClick={() => goTo("stock-view")}
                          className="w-full text-left rounded-xl border border-gray-200/80 bg-white p-3 shadow-sm hover:border-blue-200 hover:shadow transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                                {a.product?.name}
                              </p>
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{a.branch?.name}</span>
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                critical
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-amber-50 text-amber-700 border border-amber-100"
                              }`}
                            >
                              {critical ? "Critical" : "Low"}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-end justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    critical ? "bg-red-500" : "bg-amber-400"
                                  }`}
                                  style={{ width: `${critical ? 4 : fillPct}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[10px] text-gray-400">
                                Target min {formatQty(min)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className={`text-sm font-bold tabular-nums leading-none ${
                                  critical ? "text-red-600" : "text-amber-600"
                                }`}
                              >
                                {formatQty(qty)}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                on hand
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-10 px-4 text-center rounded-xl border border-dashed border-gray-200 bg-white">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-70" />
                      <p className="text-sm font-medium text-gray-700">
                        All levels healthy
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        No products below minimum
                      </p>
                    </div>
                  )}
                </div>
                <div className="p-3 pt-1 border-t border-gray-100 bg-white">
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs font-medium border-gray-200"
                    onClick={() => goTo("stock-view")}
                  >
                    Open stock by location
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="pending" className="m-0">
                <div className="p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
                  {refreshing ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-[84px] w-full rounded-xl" />
                    ))
                  ) : stats?.pendingTransfers?.length ? (
                    stats.pendingTransfers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left rounded-xl border border-gray-200/80 bg-white p-3 shadow-sm hover:border-blue-200 hover:shadow transition-all"
                        onClick={() => goTo("transfers")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {t.product?.name}
                          </p>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px] font-semibold border-blue-100 bg-blue-50 text-blue-700"
                          >
                            {t.status}
                          </Badge>
                        </div>

                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
                            <p className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">
                              From
                            </p>
                            <p className="text-[11px] font-medium text-gray-700 truncate">
                              {t.from_branch?.name}
                            </p>
                          </div>
                          <div className="h-7 w-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0 rounded-lg bg-blue-50/60 border border-blue-100 px-2 py-1.5">
                            <p className="text-[9px] uppercase tracking-wide text-blue-400 font-medium">
                              To
                            </p>
                            <p className="text-[11px] font-medium text-blue-800 truncate">
                              {t.to_branch?.name}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-gray-400">Qty</span>
                          <span className="text-sm font-bold tabular-nums text-gray-900">
                            {formatQty(t.quantity)}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="py-10 px-4 text-center rounded-xl border border-dashed border-gray-200 bg-white">
                      <Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        No transfers in progress
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Pending and dispatched moves appear here
                      </p>
                    </div>
                  )}
                </div>
                <div className="p-3 pt-1 border-t border-gray-100 bg-white">
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs font-medium border-gray-200"
                    onClick={() => goTo("transfers")}
                  >
                    Manage transfers
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: typeof Package;
  tone?: "default" | "warning" | "danger" | "success";
  loading?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/50"
        : tone === "success"
          ? "border-green-200 bg-green-50/40"
          : "border-gray-200 bg-white";

  const className = `p-3.5 rounded-xl border shadow-sm text-left transition-colors ${toneClass} ${
    onClick ? "hover:border-blue-300 cursor-pointer" : ""
  }`;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      </div>
      {loading ? (
        <Skeleton className="h-7 w-16 mt-1.5" />
      ) : (
        <p className="text-xl font-semibold text-gray-900 mt-1 tabular-nums leading-tight">
          {value}
        </p>
      )}
      {hint ? (
        <p className="text-[10px] text-gray-500 mt-1 truncate">{hint}</p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="h-full min-h-[120px] flex items-center justify-center px-4">
      <p className="text-xs text-gray-400 text-center">{message}</p>
    </div>
  );
}
