"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRightLeft,
  BarChart3,
  ChevronDown,
  Edit,
  FileSpreadsheet,
  FileText,
  History,
  MoreHorizontal,
  Plus,
  Printer,
  SlidersHorizontal,
  TrendingDown,
  Upload,
} from "lucide-react";
import { INVENTORY_REPORT_LINKS } from "./constants";

interface StockManagementToolbarProps {
  onAddStock: () => void;
  onAdjustStock: () => void;
  onRemoveStock: () => void;
  onTransferStock: () => void;
  onNavigate?: (tab: string) => void;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  onImport?: () => void;
  exportDisabled?: boolean;
}

export function StockManagementToolbar({
  onAddStock,
  onAdjustStock,
  onRemoveStock,
  onTransferStock,
  onNavigate,
  onExportCsv,
  onExportExcel,
  onPrint,
  onImport,
  exportDisabled,
}: StockManagementToolbarProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-black">Quick actions</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Add, adjust, transfer, export, or open reports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-9 text-sm shrink-0" onClick={onAddStock}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add stock
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-sm text-black">
                <MoreHorizontal className="h-4 w-4 mr-1.5" />
                Operations
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Stock changes</DropdownMenuLabel>
              <DropdownMenuItem onClick={onAdjustStock}>
                <Edit className="h-4 w-4 mr-2" />
                Adjust quantity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRemoveStock}>
                <TrendingDown className="h-4 w-4 mr-2" />
                Remove stock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTransferStock}>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transfer between branches
              </DropdownMenuItem>
              {onNavigate ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Advanced</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onNavigate("stock-adjustment")}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Bulk adjustment
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onNavigate("purchases")}>
                    <Upload className="h-4 w-4 mr-2" />
                    Stock in (GRN)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onNavigate("stock-out")}>
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Stock out
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={exportDisabled}
                className="h-9 text-sm text-black"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Export
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onImport ? (
                <>
                  <DropdownMenuItem onClick={onImport}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import via Stock In
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              {onExportCsv ? (
                <DropdownMenuItem onClick={onExportCsv}>
                  <FileText className="h-4 w-4 mr-2" />
                  Download CSV
                </DropdownMenuItem>
              ) : null}
              {onExportExcel ? (
                <DropdownMenuItem onClick={onExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Download Excel
                </DropdownMenuItem>
              ) : null}
              {onPrint ? (
                <DropdownMenuItem onClick={onPrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print report
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {onNavigate ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-sm text-black">
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  Reports
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Inventory reports</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {INVENTORY_REPORT_LINKS.map((link) => (
                  <DropdownMenuItem
                    key={link.label}
                    onClick={() => onNavigate(link.tab)}
                  >
                    {link.tab === "stock-movement-log" ? (
                      <History className="h-4 w-4 mr-2" />
                    ) : (
                      <BarChart3 className="h-4 w-4 mr-2" />
                    )}
                    {link.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}
