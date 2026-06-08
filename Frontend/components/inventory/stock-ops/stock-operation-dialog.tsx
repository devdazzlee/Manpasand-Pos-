"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const STOCK_DLG = {
  content:
    "max-w-4xl w-[95vw] border border-gray-200 p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden",
  header: "px-6 py-4 border-b border-gray-200 shrink-0 bg-white",
  title: "text-lg font-semibold text-black",
  desc: "text-sm text-gray-600 font-normal mt-0.5",
  body: "px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0",
  footer:
    "flex justify-between items-center gap-3 px-6 py-4 border-t border-gray-200 shrink-0 bg-gray-50/80",
  label: "text-sm font-medium text-black",
  field: "h-9 text-sm text-black border-gray-200",
} as const;

interface StockOperationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onCancel?: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  footerHint?: React.ReactNode;
  size?: "md" | "lg";
}

export function StockOperationDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onCancel,
  onSubmit,
  submitLabel = "Save",
  submitting = false,
  submitDisabled = false,
  footerHint,
  size = "lg",
}: StockOperationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          STOCK_DLG.content,
          size === "md" && "max-w-2xl",
        )}
      >
        <DialogHeader className={STOCK_DLG.header}>
          <DialogTitle className={STOCK_DLG.title}>{title}</DialogTitle>
          {description ? (
            <DialogDescription className={STOCK_DLG.desc}>
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className={STOCK_DLG.body}>{children}</div>

        <DialogFooter className={STOCK_DLG.footer}>
          <div className="text-xs text-gray-500">{footerHint}</div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => {
                onCancel?.();
                onOpenChange(false);
              }}
              className="text-sm text-black"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSubmit}
              disabled={submitting || submitDisabled}
              className="text-sm min-w-[100px]"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
