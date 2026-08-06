"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { DashboardHome } from "@/components/dashboard-home";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useDashboardTab } from "@/lib/dashboard-tabs";
import { scrollMainToTop } from "@/lib/scroll-main";

import { Customers } from "@/components/customers";
import { Reports } from "@/components/reports";
import { Settings } from "@/components/settings";
import { SalesHistory } from "@/components/sales-history";
import { EmployeeManagement } from "@/components/employee-management";
import { Categories } from "@/components/categories";
import { Promotions } from "@/components/promotions";
import { Expenses } from "@/components/expenses";
import { TaxManagement } from "@/components/tax-management";
import { PurchaseOrders } from "@/components/purchase-orders";
import { Returns } from "@/components/returns";
import { GiftCards } from "@/components/gift-cards";
import { Loyalty } from "@/components/loyalty";
import { Shifts } from "@/components/shifts";
import { Audit } from "@/components/audit";
import { Backup } from "@/components/backup";
import { Integrations } from "@/components/integrations";
import { MultiLocation } from "@/components/multi-location";
import { Reservations } from "@/components/reservations";
import { LayawayHolds } from "@/components/layaway-holds";
import { Pricing } from "@/components/pricing";
import { Branches } from "./branches";
import Inventory from "./inventory";
import { Stocks } from "./Stocks";
import { StockManagement } from "./StockManagement";
import {
  InventoryDashboard,
  Purchases,
  Transfers,
  StockOut,
  StockMovementLog,
  StockAdjustment,
  StockView,
  InventoryReports,
  InventoryAudit,
  BulkProductUpload,
} from "./inventory/index";
import { Sales } from "./sales";
import Orders from "./orders";
import WebsiteOrders from "./website-orders";
import Subcategories from "./sub-categories";
import Units from "./Units";
import Suppliers from "./suppliers";
import Brands from "./Brands";
import Colors from "./color";
import Sizes from "./sizes";
import { Salaries } from "./Salaries";
import { Designation } from "./Designation";
import BarcodeGenerator from "./barcode-generator";
import { NewSale } from "./new-sale";
import { PrinterSettings } from "./printer-settings";
import { ProductExport } from "./product-export";


interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const { activeTab, setActiveTab } = useDashboardTab();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    scrollMainToTop("auto");
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardHome onNavigate={setActiveTab} />;
      case "barcode-generator":
        return <BarcodeGenerator />;
      case "new-sale":
        return <NewSale />;
      case "orders":
        return <Orders />;
      case "website-orders":
        return <WebsiteOrders />;
      case "units":
        return <Units />;
      case "sales-history":
        return <SalesHistory />;
      case "brand":
        return <Brands />;
      case "colors":
        return <Colors />;
      case "sizes":
        return <Sizes />;
      case "returns":
        return <Returns initialTab="returns" hideModuleTabs />;
      case "exchanges":
        return <Returns initialTab="exchanges" hideModuleTabs />;
      case "reservations":
        return <Reservations />;
      case "layaway-holds":
        return <LayawayHolds />;
      case "inventory":
        return <Inventory />;
      case "categories":
        return <Categories />;
      case "sub-categories":
        return <Subcategories />;
      case "branches":
        return <Branches />;
      case "suppliers":
        return <Suppliers />;
      case "purchase-orders":
        return <PurchaseOrders />;
      case "pricing":
        return <Pricing />;
      case "customers":
        return <Customers />;
      case "loyalty":
        return <Stocks />;
      case "stock-management":
        return <StockManagement onNavigate={setActiveTab} />;
      case "inventory-dashboard":
        return <InventoryDashboard onNavigate={setActiveTab} />;
      case "purchases":
        return <Purchases onNavigate={setActiveTab} />;
      case "transfers":
        return <Transfers />;
      case "stock-out":
        return <StockOut onNavigate={setActiveTab} />;
      case "stock-movement-log":
        return <StockMovementLog />;
      case "stock-adjustment":
        return <StockAdjustment />;
      case "stock-view":
        return <StockView onNavigate={setActiveTab} />;
      case "bulk-product-upload":
        return <BulkProductUpload />;
      case "inventory-reports":
        return <InventoryReports />;
      case "inventory-audit":
        return <InventoryAudit />;
      case "designation":
        return <Designation />;
      case "employees":
        return <EmployeeManagement />;
      case "shifts":
        return <Shifts />;
      case "salaries":
        return <Salaries />;
      case "promotions":
        return <Promotions />;
      case "expenses":
        return <Expenses />;
      case "tax-management":
        return <TaxManagement />;
      case "reports":
        return <Reports />;
      case "audit":
        return <Audit />;
      case "multi-location":
        return <MultiLocation />;
      case "integrations":
        return <Integrations />;
      case "backup":
        return <Backup />;
      case "settings":
        return <Settings />;
      case "printer-settings":
        return <PrinterSettings />;
      case "product-export":
        return <ProductExport />;
      default:
        return <DashboardHome />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      {/* Mobile Top App Bar */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 shadow-sm sm:h-16 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarOpen(true)}
          className="h-9 w-9 p-0 text-gray-700 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Manpasand" className="h-8 w-8 object-contain shrink-0" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-gray-900">MANPASAND</p>
            <p className="-mt-0.5 text-[10px] text-gray-500">Enterprise POS</p>
          </div>
        </div>
      </header>

      <main
        id="app-main-scroll"
        className="flex w-full flex-1 flex-col overflow-auto pt-14 sm:pt-16 lg:pt-0"
      >
        {renderContent()}
      </main>
    </div>
  );
}
