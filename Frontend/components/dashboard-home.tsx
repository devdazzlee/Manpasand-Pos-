"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LoadingButton } from "@/components/ui/loading-button"
import { PageLoader } from "@/components/ui/page-loader"
import { useLoading } from "@/hooks/use-loading"
import { useToast } from "@/hooks/use-toast"
import { DollarSign, ShoppingCart, Users, Package, TrendingUp, TrendingDown, RefreshCw, Download } from "lucide-react"
import { StatCardSkeleton } from "@/components/ui/stat-card-skeleton"
import apiClient from "@/lib/apiClient"

interface TopProduct {
  id: string
  name: string
  sku: string
  sales_rate_inc_dis_and_tax: string
  _count: {
    order_items: number
  }
}

interface RecentSale {
  productName: string
  price: string
}

interface DashboardStats {
  totalCustomers: number
  lowStockProducts: Array<{
    id: string
    current_quantity: number
    product: {
      name: string
      sku: string
    }
  }>
  todaySales: any[]
}

export function DashboardHome() {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>("")

  const { loading: refreshLoading, withLoading: withRefreshLoading } = useLoading()
  const { loading: exportLoading, withLoading: withExportLoading } = useLoading()
  const { toast } = useToast()

  // Update current time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const formattedTime = now.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
      setCurrentTime(formattedTime)
    }
    
    updateTime() // Initial update
    const interval = setInterval(updateTime, 1000) // Update every second
    
    return () => clearInterval(interval) // Cleanup on unmount
  }, [])

  const getTopProducts = async () => {
    try {
      console.log('🔄 Fetching top products...')
      const response = await apiClient.get('/products/best-selling')
      console.log('✅ Top products response:', response.data)
      if (response?.data?.success) {
        setTopProducts(response.data.data || [])
      } else {
        console.warn('⚠️ Top products response not successful:', response.data)
      }
    } catch (error: any) {
      console.error("❌ Error fetching top products:", error)
      console.error("Error details:", error.response?.data)
      toast({
        variant: "destructive",
        title: "Top Products Error",
        description: error.response?.data?.message || "Failed to fetch top products"
      })
    }
  }


  const getRecentSales = async () => {
    try {
      const response = await apiClient.get('/sale/recent')
      console.log('✅ Recent Sales Response:', response.data)
      if (response?.data?.success) {
        setRecentSales(response.data.data || [])
        console.log('📊 Recent Sales Data:', response.data.data)
      } else {
        console.warn('⚠️ Recent sales response not successful:', response.data)
        setRecentSales([])
      }
    } catch (error: any) {
      console.error("❌ Error fetching recent sales:", error.response?.data || error.message)
      setRecentSales([])
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch recent sales"
      })
    }
  }

  const getStats = async () => {
    try {
      const response = await apiClient.get('/dashboard/stats')
      console.log('✅ Dashboard Stats Response:', response.data)
      if (response?.data?.success) {
        setStats(response.data.data || null)
        console.log('📊 Dashboard Stats Data:', response.data.data)
      } else {
        console.warn('⚠️ Dashboard stats response not successful:', response.data)
        setStats(null)
      }
    } catch (error: any) {
      console.error("❌ Error fetching stats:", error.response?.data || error.message)
      setStats(null)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.message || "Failed to fetch dashboard stats"
      })
    }
  }

  const loadAllData = async () => {
    await Promise.all([
      getTopProducts(),
      getRecentSales(),
      getStats()
    ])
    setInitialLoading(false)
    // Format time with both date and time for clarity
    const now = new Date()
    const formattedTime = now.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
    setLastRefresh(formattedTime)
  }

  useEffect(() => {
    loadAllData()
  }, [])

  const handleRefreshData = async () => {
    await withRefreshLoading(async () => {
      try {
        await loadAllData()
        toast({
          variant: "success",
          title: "Data Refreshed",
          description: "Dashboard data has been updated successfully",
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Refresh Failed",
          description: "Could not refresh dashboard data",
        })
      }
    })
  }

  const generateReport = () => {
    if (!stats || !topProducts || !recentSales) return

    const reportContent = `
MANPASAND POS SYSTEM - DAILY SALES REPORT
Generated: ${new Date().toLocaleString()}
================================================

SUMMARY:
- Total Customers: ${stats.totalCustomers}
- Low Stock Items: ${stats.lowStockProducts.length}
${stats.todaySales.length > 0 ? `- Today's Sales: ${stats.todaySales.length}` : '- No sales today'}

RECENT TRANSACTIONS:
${recentSales.map((sale) => `${sale.productName} - Rs ${sale.price}`).join("\n")}

TOP PRODUCTS:
${topProducts.slice(0, 5).map((product, index) => 
  `${index + 1}. ${product.name} - ${product._count.order_items} orders - Rs ${product.sales_rate_inc_dis_and_tax}`
).join("\n")}

LOW STOCK ALERTS:
${stats.lowStockProducts.map(item => 
  `${item.product.name} (${item.product.sku}) - Quantity: ${item.current_quantity}`
).join("\n")}

================================================
Report generated by MANPASAND POS System
    `

    const blob = new Blob([reportContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `daily-sales-report-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportReport = async () => {
    await withExportLoading(async () => {
      try {
        generateReport()
        toast({
          variant: "success",
          title: "Report Exported",
          description: "Daily sales report has been downloaded successfully",
        })
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Export Failed",
          description: "Could not generate the report",
        })
      }
    })
  }

  // Don't show full page loader, show skeletons instead

  const formatCurrency = (amount: string | number) => `Rs ${Number(amount).toFixed(2)}`

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm md:text-base text-gray-600">
            Welcome back! Here's what's happening today.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
            {currentTime && (
              <p className="text-xs md:text-sm text-blue-600">
                🕐 Current Time: {currentTime}
              </p>
            )}
            {lastRefresh && (
              <p className="text-xs md:text-sm text-green-600">
                ✅ Last Refreshed: {lastRefresh}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <LoadingButton
            variant="outline"
            onClick={handleRefreshData}
            loading={refreshLoading}
            loadingText="Refreshing..."
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </LoadingButton>
          <LoadingButton onClick={handleExportReport} loading={exportLoading} loadingText="Generating...">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </LoadingButton>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {initialLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.todaySales?.length || 0}</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{recentSales.length}</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCustomers || 0}</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                <Package className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{stats?.lowStockProducts?.length || 0}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Sales
              <Badge variant="secondary">{recentSales.length} transactions</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.slice(0, 5).map((sale, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{sale.productName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(sale.price)}</div>
                    <Badge
                      variant="default"
                      className="bg-green-100 text-green-800"
                    >
                      completed
                    </Badge>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 && (
                <div className="text-center text-gray-500">No recent sales</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Top Products
              <Badge variant="secondary">Best sellers</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Badge variant="secondary">#{index + 1}</Badge>
                    <div>
                      <div className="font-medium flex items-center space-x-2">
                        <span>{product.name}</span>
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      </div>
                      <div className="text-sm text-gray-500">{product._count.order_items} orders</div>
                    </div>
                  </div>
                  <div className="font-medium">{formatCurrency(product.sales_rate_inc_dis_and_tax)}</div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <div className="text-center text-gray-500">No top products data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
