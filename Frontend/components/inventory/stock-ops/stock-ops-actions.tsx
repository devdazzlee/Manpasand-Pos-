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
  BarChart3,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  History,
  MoreHorizontal,
  Printer,
  Upload,
} from "lucide-react";
import { INVENTORY_REPORT_LINKS } from "./constants";

interface StockOpsActionsProps {
  onNavigate?: (tab: string) => void;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  onImport?: () => void;
  disabled?: boolean;
}

/** Compact toolbar for Stock In / Stock Out / Stock by Location pages. */
export function StockOpsActions({
  onNavigate,
  onExportCsv,
  onExportExcel,
  onPrint,
  onImport,
  disabled,
}: StockOpsActionsProps) {
  const hasExport = onExportCsv || onExportExcel || onPrint || onImport;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onImport ? (
        <Button variant="outline" size="sm" onClick={onImport} className="h-9 text-sm text-black">
          <Upload className="h-4 w-4 mr-1.5" />
          Import
        </Button>
      ) : null}

      {hasExport ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-9 text-sm text-black"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Export
              <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
      ) : null}

      {onNavigate ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-sm text-black">
              <MoreHorizontal className="h-4 w-4 mr-1.5" />
              More
              <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Go to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate("stock-management")}>
              Stock Management
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("purchases")}>
              Stock In
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("stock-out")}>
              Stock Out
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("transfers")}>
              Transfers
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Reports</DropdownMenuLabel>
            {INVENTORY_REPORT_LINKS.map((link) => (
              <DropdownMenuItem key={link.label} onClick={() => onNavigate(link.tab)}>
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
  );
}
