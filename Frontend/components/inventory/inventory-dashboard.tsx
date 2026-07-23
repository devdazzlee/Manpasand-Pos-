"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoader } from "@/components/ui/page-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  RefreshCw,
  DollarSign,
  MapPin,
  ChevronRight,
  Boxes,
  CheckCircle2,
  BarChart3,
  PieChart as PieIcon,
  ShoppingBag,
  Gauge,
  Zap,
  ArrowRightLeft,
  Loader2,
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
  ComposedChart,
} from "recharts";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";

interface DashboardStats {
  totalInventoryValue: number;
  totalSkus: number;
  outOfStockCount: number;
  branchSummary: { branchId: string; name: string; value: number; items: number }[];
  categorySummary: { name: string; value: number; items: number }[];
  velocity: { name: string; quantity: number }[];
  recentPurchases: any[];
  pendingTransfers: any[];
  lowStockAlerts: {
    product: any;
    branch: any;
    currentQuantity: number;
    minThreshold: number;
  }[];
  procurementHealth: { count: number; totalValue: number };
  movementTrend: { movement_type: string; _count: number }[];
  warehouse: any;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];


export function InventoryDashboard({ onNavigate }: { onNavigate?: (tab: string) => void | any }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const { toast } = useToast();

  const handleNavigate = (tab: string, label: string) => {
    toast({
      title: "Action Initialized",
      description: `Switching to ${label} module...`,
      duration: 1500,
    });
    onNavigate?.(tab);
  };

  const fetchStats = async (bid?: string, isInternal = false) => {
    if (isInternal) setSwitchingBranch(true);
    else setLoading(true);
    
    try {
      const res = await apiClient.get(`${API_BASE}/inventory/dashboard`, {
        params: bid ? { branchId: bid } : {},
      });
      setStats(res.data?.data || null);
    } catch (e: any) {
      toast({
        title: "Sync Error",
        description: e?.response?.data?.message || "Failed to load neural inventory data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSwitchingBranch(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/branches`, { params: { fetch_all: true } });
      setBranches(res.data?.data || res.data || []);
    } catch (e) {
      console.error("Failed to load branches", e);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem("role");
    setUserRole(role);
    const b = localStorage.getItem("branch");
    let initialBranchId = "";

    if (b && b !== "Not Found") {
      try {
        const obj = JSON.parse(b);
        initialBranchId = obj.id || b;
      } catch {
        initialBranchId = b;
      }
    }

    if (role === "BRANCH_MANAGER" && initialBranchId) {
      setSelectedBranchId(initialBranchId);
      fetchStats(initialBranchId);
    } else {
      setSelectedBranchId("");
      fetchStats();
    }
    
    fetchBranches();
  }, []);

  const formatCurrency = (n: number) => {
    const value = Number(n) || 0;
    const sign = value < 0 ? "-" : "";
    return `${sign}Rs ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const totalValue = stats?.totalInventoryValue ?? 0;
  const healthScore = useMemo(() => {
    if (!stats) return 0;
    const items = stats.totalSkus;
    const out = stats.outOfStockCount;
    if (items === 0) return 0;
    return Math.round(((items - out) / items) * 100);
  }, [stats]);

  if (loading && !stats) return <PageLoader message="Loading inventory data..." />;

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-gray-900 text-white p-2.5 rounded-lg shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black tracking-tight">Inventory Operations</h1>
            <p className="text-sm text-gray-600 mt-1">Stock valuation, movement, and procurement overview.</p>
          </div>
        </div>

        {(userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "WAREHOUSE_MANAGER" || userRole === "PURCHASE_MANAGER") && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white shadow-sm px-3 h-11 self-start">
            {switchingBranch ? (
              <Loader2 className="h-4 w-4 text-gray-500 shrink-0 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
            )}
            <Select
              value={selectedBranchId || "all"}
              disabled={switchingBranch}
              onValueChange={(v) => {
                const bid = v === "all" ? "" : v;
                setSelectedBranchId(bid);
                fetchStats(bid, true);
              }}
            >
              <SelectTrigger className="w-[180px] border-none focus:ring-0 shadow-none h-9 font-medium text-black text-sm px-1 disabled:opacity-100">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm py-2 pl-8 pr-4 text-black">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-sm py-2 pl-8 pr-4 text-black">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Inventory Value</p>
            <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
          </div>
          {switchingBranch ? <Skeleton className="h-8 w-32 mt-1.5" /> : (
            <p className="text-2xl font-semibold text-black mt-1 tabular-nums">{formatCurrency(totalValue)}</p>
          )}
        </Card>

        <Card className="p-4 border border-red-200 bg-red-50/40 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Out of Stock</p>
            <Zap className="h-4 w-4 text-red-500 shrink-0" />
          </div>
          {switchingBranch ? <Skeleton className="h-8 w-16 mt-1.5" /> : (
            <p className="text-2xl font-semibold text-black mt-1 tabular-nums">{stats?.outOfStockCount ?? 0}</p>
          )}
          <p className="text-xs text-red-600 mt-1">Needs restock</p>
        </Card>

        <Card className="p-4 border border-amber-200 bg-amber-50/40 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Inventory Health</p>
            <Gauge className="h-4 w-4 text-amber-500 shrink-0" />
          </div>
          {switchingBranch ? <Skeleton className="h-8 w-24 mt-1.5" /> : (
            <p className="text-2xl font-semibold text-black mt-1 tabular-nums">
              {healthScore}% <span className="text-sm font-normal text-gray-500">({stats?.lowStockAlerts?.length ?? 0} alerts)</span>
            </p>
          )}
        </Card>

        <Card className="p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Catalog Size</p>
            <Package className="h-4 w-4 text-gray-400 shrink-0" />
          </div>
          {switchingBranch ? <Skeleton className="h-8 w-20 mt-1.5" /> : (
            <p className="text-2xl font-semibold text-black mt-1 tabular-nums">{stats?.totalSkus ?? 0} <span className="text-sm font-normal text-gray-500">SKUs</span></p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ANALYTICS */}
        <div className="lg:col-span-2 space-y-4">

          <Card className="border border-gray-200 rounded-xl bg-white shadow-sm">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-base font-semibold text-black">Sales Velocity</CardTitle>
              <CardDescription className="text-xs text-gray-500">Top moving items (last 7 days)</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-[260px] w-full mt-2">
                {switchingBranch ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stats?.velocity || []}>
                      <XAxis
                         dataKey="name"
                         axisLine={false}
                         tickLine={false}
                         fontSize={10}
                         tick={{fill: '#6b7280'}}
                      />
                      <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{fill: '#6b7280'}} />
                      <Tooltip
                         contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <Bar dataKey="quantity" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="border border-gray-200 rounded-xl bg-white shadow-sm">
                <CardHeader className="p-4 border-b border-gray-100">
                   <CardTitle className="text-sm font-semibold text-black flex items-center gap-2">
                     <PieIcon className="h-4 w-4 text-gray-500" />
                     Valuation by Category
                   </CardTitle>
                </CardHeader>
                <CardContent className="p-3 h-[240px]">
                  {switchingBranch ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <Skeleton className="h-32 w-32 rounded-full" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats?.categorySummary || []}
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {stats?.categorySummary?.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
             </Card>

             <Card className="border border-gray-200 rounded-xl bg-white shadow-sm">
                <CardHeader className="p-4 border-b border-gray-100">
                   <CardTitle className="text-sm font-semibold text-black flex items-center gap-2">
                     <BarChart3 className="h-4 w-4 text-gray-500" />
                     Location Allocation
                   </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="divide-y max-h-[240px] overflow-y-auto">
                     {switchingBranch ? (
                       Array.from({ length: 4 }).map((_, i) => (
                         <div key={i} className="p-3 flex items-center gap-3">
                           <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
                           <div className="flex-1 space-y-1.5">
                             <Skeleton className="h-3 w-24" />
                             <Skeleton className="h-3 w-16" />
                           </div>
                           <Skeleton className="h-3 w-16" />
                         </div>
                       ))
                     ) : stats?.branchSummary.map((b, i) => (
                       <div key={b.branchId} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                             <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center font-semibold text-gray-500 text-xs shrink-0">
                               {i + 1}
                             </div>
                             <div>
                               <p className="text-xs font-semibold text-black">{b.name}</p>
                               <p className="text-xs text-gray-500">{totalValue ? (b.value / totalValue * 100).toFixed(1) : 0}% weight</p>
                             </div>
                          </div>
                          <p className="text-xs font-semibold text-black">{formatCurrency(b.value)}</p>
                       </div>
                     ))}
                   </div>
                </CardContent>
             </Card>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">

           <Card className="border border-gray-200 rounded-xl bg-white shadow-sm">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-gray-500">Procurement Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                 <div className="flex items-end justify-between">
                    {switchingBranch ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ) : (
                      <div>
                        <h4 className="text-xl font-semibold text-black">{formatCurrency(stats?.procurementHealth?.totalValue || 0)}</h4>
                        <p className="text-xs text-gray-500 mt-1">{stats?.procurementHealth?.count || 0} purchase records</p>
                      </div>
                    )}
                    <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                       <ShoppingBag className="h-5 w-5 text-gray-500" />
                    </div>
                 </div>
                 <div className="mt-4">
                    <Button
                      onClick={() => handleNavigate('stock-management', 'Stock Management')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg h-9 text-sm"
                    >
                      Manage Stock
                      <ArrowRightLeft className="ml-2 h-3.5 w-3.5" />
                    </Button>
                 </div>
              </CardContent>
           </Card>

           <Card className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden p-0">
              <Tabs defaultValue="low" className="w-full">
                <div className="p-3 pb-0">
                  <TabsList className="bg-gray-100 p-1 rounded-lg h-9 w-full grid grid-cols-2">
                    <TabsTrigger value="low" className="text-xs font-medium">Low Levels</TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs font-medium">Active Transfers</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="low" className="p-0 m-0 mt-2">
                   <div className="divide-y max-h-[380px] overflow-y-auto">
                     {switchingBranch ? (
                       Array.from({ length: 4 }).map((_, i) => (
                         <div key={i} className="p-3 space-y-2">
                           <div className="flex justify-between">
                             <Skeleton className="h-3 w-24" />
                             <Skeleton className="h-3 w-16" />
                           </div>
                           <Skeleton className="h-3 w-32" />
                         </div>
                       ))
                     ) : stats?.lowStockAlerts?.length ? stats.lowStockAlerts.map((a, i) => (
                       <div key={i} className="p-3 hover:bg-gray-50 transition-colors">
                         <div className="flex justify-between items-start mb-1">
                           <span className="font-semibold text-black text-xs truncate max-w-[140px]">{a.product?.name}</span>
                           <span className="text-amber-600 font-semibold text-xs">Level: {a.currentQuantity}</span>
                         </div>
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <MapPin className="h-3 w-3" />
                              {a.branch?.name}
                            </div>
                            <div className="text-xs text-gray-400">Min: {a.minThreshold}</div>
                         </div>
                       </div>
                     )) : (
                       <div className="p-8 text-center">
                         <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-40" />
                         <p className="text-gray-500 font-medium text-xs">All levels stable</p>
                       </div>
                     )}
                   </div>
                   <div className="p-2 border-t border-gray-100">
                       <Button
                         onClick={() => handleNavigate('stock-view', 'Full System Audit')}
                         variant="ghost"
                         className="w-full text-gray-600 font-medium text-xs h-8"
                       >
                         Full audit <ChevronRight className="h-3 w-3 ml-1" />
                       </Button>
                   </div>
                </TabsContent>
                <TabsContent value="pending" className="p-0 m-0 mt-2">
                   <div className="divide-y max-h-[380px] overflow-y-auto">
                     {switchingBranch ? (
                       Array.from({ length: 4 }).map((_, i) => (
                         <div key={i} className="p-3 flex items-center gap-3">
                           <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                           <div className="flex-1 space-y-1.5">
                             <Skeleton className="h-3 w-28" />
                             <Skeleton className="h-3 w-20" />
                           </div>
                         </div>
                       ))
                     ) : stats?.pendingTransfers?.length ? stats.pendingTransfers.map((t) => (
                       <div key={t.id} className="p-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start gap-3">
                             <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                               <RefreshCw className="h-4 w-4 text-blue-500" />
                             </div>
                             <div className="flex-1 min-w-0">
                               <p className="font-semibold text-black text-xs truncate">{t.product?.name}</p>
                               <div className="flex items-center gap-2 mt-1">
                                 <span className="text-xs text-gray-500">{t.from_branch?.name.split(' ')[0]}</span>
                                 <ChevronRight className="h-3 w-3 text-gray-300" />
                                 <span className="text-xs font-semibold text-blue-600">{t.to_branch?.name.split(' ')[0]}</span>
                               </div>
                             </div>
                             <div className="text-right shrink-0">
                               <p className="text-xs font-semibold text-black">{t.quantity}</p>
                               <Badge variant="outline" className="text-[10px] font-medium py-0.5 px-1.5 border-gray-200 text-gray-500">{t.status}</Badge>
                             </div>
                          </div>
                       </div>
                     )) : (
                       <div className="p-8 text-center">
                          <p className="text-gray-400 font-medium text-xs">No transfers active</p>
                       </div>
                     )}
                   </div>
                </TabsContent>
              </Tabs>
           </Card>

        </div>
      </div>
    </div>
  );
}
