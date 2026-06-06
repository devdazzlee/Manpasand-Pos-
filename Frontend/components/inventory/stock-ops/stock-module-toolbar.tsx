"use client";

import { cn } from "@/lib/utils";

interface TabOption {
  id: string;
  label: string;
}

interface StockModuleToolbarProps {
  tabs: TabOption[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children?: React.ReactNode;
}

export function StockModuleToolbar({
  tabs,
  activeTab,
  onTabChange,
  children,
}: StockModuleToolbarProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm shrink-0"
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "rounded-md px-4 py-1.5 font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-black text-white shadow-sm"
                  : "text-gray-600 hover:text-black hover:bg-white/80",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {children ? (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
