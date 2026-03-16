"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/page-loader";
import { useToast } from "@/hooks/use-toast";
import {
  Warehouse,
  Package,
  Truck,
  AlertTriangle,
  Plus,
  ArrowRightLeft,
  TrendingDown,
  RefreshCw,
  DollarSign,
} from "lucide-react";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";

interface DashboardStats {
  totalWarehouseValue: number;
  branchSummary: { branchId: string; name: string; value: number; items: number }[];
  recentPurchases: any[];
  pendingTransfers: any[];
  lowStockAlerts: {
    product: any;
    branch: any;
    currentQuantity: number;
    minThreshold: number;
  }[];
  warehouse: any;
}

export function InventoryDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const branchId = localStorage.getItem("branch");
      let bid: string | undefined;
      if (branchId && branchId !== "Not Found") {
        try {
          const b = JSON.parse(branchId);
          bid = b?.id;
        } catch {
          bid = branchId;
        }
      }
      const res = await apiClient.get(`${API_BASE}/inventory/dashboard`, {
        params: bid ? { branchId: bid } : {},
      });
      setStats(res.data?.data || null);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message || "Failed to load dashboard",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return <PageLoader message="Loading inventory dashboard..." />;
  }

  const formatCurrency = (n: number) =>
    `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Inventory Dashboard
          </h1>
          <p className="text-sm text-gray-600">
            Stock flow, warehouse value, and alerts
          </p>
        </div>
        <Button variant="outline" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warehouse Stock Value</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.totalWarehouseValue ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {stats?.lowStockAlerts?.length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Transfers</CardTitle>
            <Truck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.pendingTransfers?.length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Purchases</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.recentPurchases?.length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.lowStockAlerts?.length ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.lowStockAlerts.slice(0, 10).map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-200"
                  >
                    <div>
                      <p className="font-medium">{a.product?.name}</p>
                      <p className="text-xs text-gray-500">
                        {a.branch?.name} • Stock: {a.currentQuantity} (min: {a.minThreshold})
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800">
                      Low
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No low stock alerts</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              Pending Transfers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.pendingTransfers?.length ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.pendingTransfers.slice(0, 5).map((t: any) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border"
                  >
                    <div>
                      <p className="font-medium">{t.product?.name}</p>
                      <p className="text-xs text-gray-500">
                        {t.from_branch?.name} → {t.to_branch?.name} • Qty: {t.quantity}
                      </p>
                    </div>
                    <Badge variant="outline">{t.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No pending transfers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {stats?.branchSummary?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Stock Value by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {stats.branchSummary.map((b) => (
                <div
                  key={b.branchId}
                  className="p-4 rounded-lg border bg-gray-50"
                >
                  <p className="font-medium">{b.name}</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(b.value)}
                  </p>
                  <p className="text-xs text-gray-500">{b.items} products</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
