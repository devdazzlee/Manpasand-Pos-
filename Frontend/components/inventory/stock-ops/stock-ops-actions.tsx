"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

interface StockOpsActionsProps {
  onExportExcel?: () => void | Promise<void>;
  onExportPdf?: () => void | Promise<void>;
  disabled?: boolean;
  exporting?: boolean;
}

/** Export-only toolbar: Excel + PDF. */
export function StockOpsActions({
  onExportExcel,
  onExportPdf,
  disabled,
  exporting,
}: StockOpsActionsProps) {
  if (!onExportExcel && !onExportPdf) return null;

  const busy = Boolean(exporting);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || busy}
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
    </div>
  );
}
