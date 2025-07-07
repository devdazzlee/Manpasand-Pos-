"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { DashboardHome } from "@/components/dashboard-home"
import { NewSale } from "@/components/new-sale"
import { Customers } from "@/components/customers"
import { Reports } from "@/components/reports"
import { Settings } from "@/components/settings"
import { SalesHistory } from "@/components/sales-history"
import { EmployeeManagement } from "@/components/employee-management"
import { Categories } from "@/components/categories"
import { Promotions } from "@/components/promotions"
import { CashRegister } from "@/components/cash-register"
import { Expenses } from "@/components/expenses"
import { TaxManagement } from "@/components/tax-management"
import { PurchaseOrders } from "@/components/purchase-orders"
import { Returns } from "@/components/returns"
import { GiftCards } from "@/components/gift-cards"
import { Loyalty } from "@/components/loyalty"
import { Shifts } from "@/components/shifts"
import { Audit } from "@/components/audit"
import { Backup } from "@/components/backup"
import { Integrations } from "@/components/integrations"
import { MultiLocation } from "@/components/multi-location"
import { Reservations } from "@/components/reservations"
import { LayawayHolds } from "@/components/layaway-holds"
import { Pricing } from "@/components/pricing"
import { Notifications } from "@/components/notifications"
import { Branches } from "./branches"
import Inventory from "./inventory"
import { Stocks } from "./Stocks"
import { Sales } from "./sales"
import Orders from "./orders"
import Subcategories from "./sub-categories"
import Units from "./Units"
import Suppliers from "./suppliers"
import Brands from "./Brands"
import Colors from "./color"
import Sizes from "./sizes"
import { Salaries } from "./Salaries"
import { Designation } from "./Designation"

interface DashboardProps {
  onLogout: () => void
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("dashboard")

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardHome />
      case "new-sale":
        return <NewSale />
      case "orders":
        return <Orders />
      case "units":
        return <Units />
      case "sales-history":
        return <SalesHistory />
      case "brand":
        return <Brands />
      case "colors":
        return <Colors/>
      case  "sizes":
        return <Sizes/>
      case "returns":
        return <Returns />
      case "reservations":
        return <Reservations />
      case "layaway-holds":
        return <LayawayHolds />
      case "inventory":
        return <Inventory />
      case "categories":
        return <Categories />
      case "sub-categories":
        return <Subcategories />
      case "branches":
        return <Branches />
      case "suppliers":
        return <Suppliers />
      case "purchase-orders":
        return <PurchaseOrders />
      case "pricing":
        return <Pricing />
      case "customers":
        return <Customers />
      case "loyalty":
        return <Stocks />
      case "designation":
        return <Designation />
      case "employees":
        return <EmployeeManagement />
      case "shifts":
        return <Shifts />
      case "salaries":
        return <Salaries />
      case "promotions":
        return <Promotions />
      case "cash-register":
        return <CashRegister />
      case "expenses":
        return <Expenses />
      case "tax-management":
        return <TaxManagement />
      case "reports":
        return <Reports />
      case "audit":
        return <Audit />
      case "multi-location":
        return <MultiLocation />
      case "integrations":
        return <Integrations />
      case "backup":
        return <Backup />
      case "notifications":
        return <Notifications />
      case "settings":
        return <Settings />
      default:
        return <DashboardHome />
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">{renderContent()}</main>
    </div>
  )
}
