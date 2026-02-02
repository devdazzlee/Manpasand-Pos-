"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  LogOut,
  History,
  UserCheck,
  Truck,
  Grid3X3,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  CreditCard,
  Gift,
  Clock,
  Shield,
  Bell,
  TagIcon as PriceTag,
  ListOrdered,
  StoreIcon,
  Barcode,
  X,
  Warehouse,
  Globe,
} from "lucide-react";
import { useState, useEffect } from "react";
import apiClient from "@/lib/apiClient";

interface SidebarMenuItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
}

interface SidebarMenuSection {
  id: string;
  label: string;
  expandable?: boolean;
  items: SidebarMenuItem[];
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const menuSections: SidebarMenuSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "notifications", label: "Notifications", icon: Bell },
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
      { id: "website-orders", label: "Website Orders", icon: Globe },
      { id: "suppliers", label: "Suppliers", icon: Truck },
      { id: "returns", label: "Returns & Refunds", icon: RotateCcw },
      { id: "barcode-generater", label: "Barcode Generater", icon: Barcode },
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
      { id: "stock-management", label: "Stock Management", icon: Warehouse },
      { id: "categories", label: "Categories", icon: Grid3X3 },
      { id: "sub-categories", label: "Sub-Categories", icon: Grid3X3 },
      { id: "branches", label: "Branches", icon: Grid3X3 },
      { id: "units", label: "Units", icon: Package },
      { id: "brand", label: "Brands", icon: StoreIcon },
      { id: "colors", label: "Colors", icon: Package },
      { id: "sizes", label: "Sizes", icon: Package },
      // { id: "purchase-orders", label: "Purchase Orders", icon: FileText },
    ],
  },
  {
    id: "people",
    label: "Customer & Staff",
    expandable: true,
    items: [
      { id: "customers", label: "Customers", icon: Users },
      // { id: "gift-cards", label: "Gift Cards", icon: CreditCard },
      { id: "employees", label: "Employees", icon: UserCheck },
      { id: "shifts", label: "Shift Management", icon: Clock },
      { id: "salaries", label: "Salaries", icon: CreditCard },
      { id: "designation", label: "Designation", icon: Shield },
    ],
  },
  // {
  //   id: "finance",
  //   label: "Financial Management",
  //   expandable: true,
  //   items: [
  //     { id: "expenses", label: "Expenses", icon: Receipt },
  //     // { id: "tax-management", label: "Tax Management", icon: Calculator },
  //   ],
  // },
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
];

export function Sidebar({ activeTab, setActiveTab, onLogout, isOpen = true, onClose }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "sales",
    "barcode-generater",
    "inventory",
    "people",
    "finance",
    "system",
  ]);
  const [role, setRole] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  useEffect(() => {
    setRole(localStorage.getItem("role"));
  }, []);

  // Fetch unread notification count
  const fetchUnreadCount = async () => {
    try {
      const response = await apiClient.get('/notifications/stats');
      const stats = response.data?.data || {};
      setUnreadNotificationCount(stats.unread || 0);
    } catch (error) {
      console.error('Failed to fetch notification stats:', error);
      setUnreadNotificationCount(0);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Tabs to show for ADMIN
  const adminTabIds = [
    "dashboard",
    "barcode-generater",
    "notifications",
    "new-sale",
    "sales-history",
    // "inventory",
    "orders",
    "website-orders",
    "returns",
    // "units",
    "customers",
    "expenses",
  ];

  // Tabs to show for BRANCH
  const branchTabIds = [
    "dashboard",
    "notifications",
    "new-sale",
    "sales-history",
    "orders",
    "website-orders",
    "returns",
    "customers",
    "inventory",
    "stock-management",
    "categories",
    "sub-categories",
    "units",
    "brand",
    "colors",
    "sizes",
  ];

  // Filter menuSections based on role
  const filteredMenuSections =
    role === "ADMIN"
      ? menuSections
          .map((section) => ({
            ...section,
            items: section.items.filter((item) =>
              adminTabIds.includes(item.id)
            ),
          }))
          .filter((section) => section.items.length > 0)
      : role === "BRANCH"
      ? menuSections
          .map((section) => ({
            ...section,
            items: section.items.filter((item) =>
              branchTabIds.includes(item.id)
            ),
          }))
          .filter((section) => section.items.length > 0)
      : menuSections; // SUPER_ADMIN or others see all

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const handleMenuClick = (itemId: string) => {
    setActiveTab(itemId);
    // Close sidebar on mobile when item is clicked
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Close button for mobile */}
        <div className="lg:hidden absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

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
          {filteredMenuSections.map((section) => (
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
                        const Icon = item.icon;
                        return (
                          <Button
                            key={item.id}
                            variant={
                              activeTab === item.id ? "default" : "ghost"
                            }
                            className={`w-full justify-start pl-6 ${
                              activeTab === item.id
                                ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                : "text-gray-700 hover:bg-gray-100"
                            }`}
                            onClick={() => handleMenuClick(item.id)}
                          >
                            <Icon className="h-4 w-4 mr-3" />
                            {item.label}
                            {item.badge && (
                              <Badge
                                variant={
                                  item.badge === "Live"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="ml-auto text-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </Button>
                        );
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
                      const Icon = item.icon;
                      // Show dynamic badge for notifications, static badge for others
                      const showBadge = item.id === "notifications" 
                        ? unreadNotificationCount > 0 
                        : item.badge;
                      const badgeValue = item.id === "notifications" 
                        ? unreadNotificationCount.toString() 
                        : item.badge;
                      
                      return (
                        <Button
                          key={item.id}
                          variant={activeTab === item.id ? "default" : "ghost"}
                          className={`w-full justify-start ${
                            activeTab === item.id
                              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                          onClick={() => {
                            handleMenuClick(item.id);
                            // Refresh notification count when clicking on notifications
                            if (item.id === "notifications") {
                              fetchUnreadCount();
                            }
                          }}
                        >
                          <Icon className="h-4 w-4 mr-3" />
                          {item.label}
                          {showBadge && (
                            <Badge
                              variant={
                                item.badge === "Live"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="ml-auto text-xs"
                            >
                              {badgeValue}
                            </Badge>
                          )}
                        </Button>
                      );
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
    </>
  );
}
