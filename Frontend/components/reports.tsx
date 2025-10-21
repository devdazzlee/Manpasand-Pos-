"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package, Download, Calendar } from "lucide-react"

export function Reports() {
  const dailySales = [
    { date: "2024-01-15", sales: 2847.5, orders: 156, customers: 89 },
    { date: "2024-01-14", sales: 3125.75, orders: 178, customers: 102 },
    { date: "2024-01-13", sales: 2456.25, orders: 134, customers: 76 },
    { date: "2024-01-12", sales: 2789.0, orders: 145, customers: 85 },
    { date: "2024-01-11", sales: 3456.75, orders: 189, customers: 112 },
  ]

  const topProducts = [
    { name: "Banana", quantity: 245, revenue: 183.75, percentage: 15.2 },
    { name: "Orange", quantity: 198, revenue: 118.8, percentage: 12.8 },
    { name: "Milk", quantity: 156, revenue: 546.0, percentage: 11.5 },
    { name: "Bread", quantity: 134, revenue: 335.0, percentage: 10.2 },
    { name: "Apple", quantity: 125, revenue: 150.0, percentage: 9.8 },
  ]

  const categoryWiseSales = [
    { category: "Fruits", sales: 1245.5, percentage: 35.2 },
    { category: "Dairy", sales: 856.75, percentage: 24.3 },
    { category: "Bakery", sales: 645.25, percentage: 18.3 },
    { category: "Beverages", sales: 432.0, percentage: 12.2 },
    { category: "Snacks", sales: 356.5, percentage: 10.0 },
  ]

  const employeePerformance = [
    { name: "John Smith", sales: 15420.5, orders: 245, avgOrder: 62.94 },
    { name: "Sarah Johnson", sales: 12850.75, orders: 198, avgOrder: 64.95 },
    { name: "Mike Davis", sales: 11245.25, orders: 176, avgOrder: 63.89 },
    { name: "Lisa Wilson", sales: 9875.0, orders: 154, avgOrder: 64.12 },
  ]

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm md:text-base text-gray-600">Comprehensive business insights and performance metrics</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline">
            <Calendar className="h-4 w-4 mr-2" />
            Date Range
          </Button>
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$14,675.25</div>
            <div className="flex items-center space-x-1 text-sm">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+12.5%</span>
              <span className="text-gray-500">vs last week</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">802</div>
            <div className="flex items-center space-x-1 text-sm">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+8.2%</span>
              <span className="text-gray-500">vs last week</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$18.31</div>
            <div className="flex items-center space-x-1 text-sm">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+3.8%</span>
              <span className="text-gray-500">vs last week</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">464</div>
            <div className="flex items-center space-x-1 text-sm">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600">+5.2%</span>
              <span className="text-gray-500">vs last week</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Daily Sales Report */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Date</TableHead>
                      <TableHead className="min-w-[100px]">Sales</TableHead>
                      <TableHead className="min-w-[100px]">Orders</TableHead>
                      <TableHead className="min-w-[120px]">Customers</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {dailySales.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>${day.sales.toFixed(2)}</TableCell>
                    <TableCell>{day.orders}</TableCell>
                    <TableCell>{day.customers}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Products */}
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-full">
                      <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.quantity} units sold</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">${product.revenue.toFixed(2)}</p>
                    <Badge variant="secondary">{product.percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category-wise Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Category-wise Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryWiseSales.map((category, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-green-100 p-2 rounded-full">
                      <BarChart3 className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{category.category}</p>
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${category.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">${category.sales.toFixed(2)}</p>
                    <Badge variant="secondary">{category.percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Employee Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Employee</TableHead>
                      <TableHead className="min-w-[100px]">Sales</TableHead>
                      <TableHead className="min-w-[100px]">Orders</TableHead>
                      <TableHead className="min-w-[100px]">Avg Order</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {employeePerformance.map((employee, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>${employee.sales.toFixed(2)}</TableCell>
                    <TableCell>{employee.orders}</TableCell>
                    <TableCell>${employee.avgOrder.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
