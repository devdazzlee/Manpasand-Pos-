"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";

interface StockManagementToolbarProps {
  onAddStock: () => void;
  onExportExcel?: () => void | Promise<void>;
  onExportPdf?: () => void | Promise<void>;
  exportDisabled?: boolean;
  exporting?: boolean;
  className?: string;
}

/** Keep header simple: Add stock + Export (Excel / PDF). */
export function StockManagementToolbar({
  onAddStock,
  onExportExcel,
  onExportPdf,
  exportDisabled,
  exporting,
  className,
}: StockManagementToolbarProps) {
  const busy = Boolean(exporting);

  return (
    <div className={className ?? "flex flex-wrap items-center gap-2"}>
      <Button
        size="sm"
        className="h-9 text-sm shrink-0 bg-gray-900 hover:bg-gray-800"
        onClick={onAddStock}
        disabled={busy}
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Add stock
      </Button>

      {(onExportExcel || onExportPdf) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={exportDisabled || busy}
              className="h-9 text-sm text-black"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              )}
              {busy ? "Exporting…" : "Export"}
              {!busy ? (
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onExportExcel ? (
              <DropdownMenuItem
                disabled={busy}
                onSelect={(e) => {
                  e.preventDefault();
                  void onExportExcel();
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
            ) : null}
            {onExportPdf ? (
              <DropdownMenuItem
                disabled={busy}
                onSelect={(e) => {
                  e.preventDefault();
                  void onExportPdf();
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
