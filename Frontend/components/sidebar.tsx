"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  SettingsIcon,
  LogOut,
  History,
  UserCheck,
  Truck,
  Grid3X3,
  Tag,
  StoreIcon as CashRegisterIcon,
  Receipt,
  Calculator,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Calendar,
  CreditCard,
  Gift,
  Clock,
  Shield,
  Database,
  Zap,
  MapPin,
  Bell,
  FileText,
  Pause,
  TagIcon as PriceTag,
  ListOrdered,
  StoreIcon,
} from "lucide-react"
import { useState } from "react"

interface SidebarProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  onLogout: () => void
}

export function Sidebar({ activeTab, setActiveTab, onLogout }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "sales",
    "inventory",
    "people",
    "finance",
    "system",
  ])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]))
  }

  const menuSections = [
    {
      id: "main",
      label: "Main",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "cash-register", label: "Cash Register", icon: CashRegisterIcon, badge: "Live" },
        { id: "notifications", label: "Notifications", icon: Bell, badge: "3" },
      ],
    },
    {
      id: "sales",
      label: "Sales & Transactions",
      expandable: true,
      items: [
        { id: "new-sale", label: "Sales", icon: ShoppingCart },
        { id: "sales-history", label: "Sales History", icon: History },
        { id: "orders", label: "Orders", icon: ListOrdered },
        { id: "suppliers", label: "Suppliers", icon: Truck },
        { id: "returns", label: "Returns & Refunds", icon: RotateCcw },
        // { id: "reservations", label: "Reservations", icon: Calendar },
        // { id: "layaway-holds", label: "Layaway & Holds", icon: Pause },
        // { id: "promotions", label: "Promotions", icon: Tag },
      ],
    },
    {
      id: "inventory",
      label: "Inventory Management",
      expandable: true,
      items: [
        { id: "inventory", label: "Products", icon: Package },
        { id: "categories", label: "Categories", icon: Grid3X3 },
        { id: "sub-categories", label: "Sub-Categories", icon: Grid3X3 },
        { id: "branches", label: "Branches", icon: Grid3X3 },
        { id: "units", label: "Units", icon: Package },
        {id: "brand" , label: "Brands", icon: StoreIcon},
        {id: "colors" , label: "Colors", icon: Package},
        {id : "sizes" , label: "Sizes", icon: Package},
        // { id: "purchase-orders", label: "Purchase Orders", icon: FileText },
        { id: "pricing", label: "Pricing & Margins", icon: PriceTag },
      ],
    },
    {
      id: "people",
      label: "Customer & Staff",
      expandable: true,
      items: [
        { id: "customers", label: "Customers", icon: Users },
        { id: "loyalty", label: "Stocks", icon: Gift },
        // { id: "gift-cards", label: "Gift Cards", icon: CreditCard },
        { id: "employees", label: "Employees", icon: UserCheck },
        { id: "shifts", label: "Shift Management", icon: Clock },
        {id: "salaries",label: "Salaries", icon: CreditCard },
        {id: "designation",label: "Designation", icon: Shield }

      ],
    },
    {
      id: "finance",
      label: "Financial Management",
      expandable: true,
      items: [
        { id: "expenses", label: "Expenses", icon: Receipt },
        // { id: "tax-management", label: "Tax Management", icon: Calculator },
      ],
    },
    {
      id: "system",
      label: "System & Admin",
      expandable: true,
      items: [
        { id: "reports", label: "Reports & Analytics", icon: BarChart3 },
        // { id: "audit", label: "Audit Trail", icon: Shield },
        // { id: "multi-location", label: "Multi-Location", icon: MapPin },
        // { id: "integrations", label: "Integrations", icon: Zap },
        // { id: "backup", label: "Backup & Sync", icon: Database },
        // { id: "settings", label: "Settings", icon: SettingsIcon },
      ],
    },
  ]

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2.5 rounded-xl shadow-lg">
            <Store className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">MANPASAND</h1>
            <p className="text-sm text-gray-500">Enterprise POS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-6">
          {menuSections.map((section) => (
            <div key={section.id}>
              {section.expandable ? (
                <div>
                  <Button
                    variant="ghost"
                    className="w-full justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 h-8"
                    onClick={() => toggleSection(section.id)}
                  >
                    {section.label}
                    {expandedSections.includes(section.id) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                  {expandedSections.includes(section.id) && (
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        return (
                          <Button
                            key={item.id}
                            variant={activeTab === item.id ? "default" : "ghost"}
                            className={`w-full justify-start pl-6 ${
                              activeTab === item.id
                                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                            onClick={() => setActiveTab(item.id)}
                          >
                            <Icon className="h-4 w-4 mr-3" />
                            {item.label}
                            {item.badge && (
                              <Badge
                                variant={item.badge === "Live" ? "destructive" : "secondary"}
                                className="ml-auto text-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {section.label}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <Button
                          key={item.id}
                          variant={activeTab === item.id ? "default" : "ghost"}
                          className={`w-full justify-start ${
                            activeTab === item.id
                              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                          onClick={() => setActiveTab(item.id)}
                        >
                          <Icon className="h-4 w-4 mr-3" />
                          {item.label}
                          {item.badge && (
                            <Badge
                              variant={item.badge === "Live" ? "destructive" : "secondary"}
                              className="ml-auto text-xs"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
              {section.id !== "system" && <Separator className="mt-4" />}
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="mb-3 p-3 bg-white rounded-lg border">
          <div className="text-xs text-gray-500 mb-1">Today's Sales</div>
          <div className="text-lg font-bold text-green-600">$2,847.50</div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  )
}
