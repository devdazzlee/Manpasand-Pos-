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
    "w-[min(96vw,1180px)] max-w-[1180px] sm:max-w-[1180px] border border-gray-200 p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden",
  header: "px-6 py-4 border-b border-gray-200 shrink-0 bg-white",
  title: "text-lg font-semibold text-black",
  desc: "text-sm text-gray-600 font-normal mt-0.5",
  body: "px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0",
  footer:
    "flex justify-between items-center gap-3 px-6 py-4 border-t border-gray-200 shrink-0 bg-gray-50/80",
  label: "text-sm font-medium text-black",
  field: "h-9 text-sm text-black border-gray-200",
} as const;

/** Skeleton stand-in for Select while branch/supplier/etc. options load. */
export function StockSelectSkeleton({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "h-9 w-full rounded-md border border-gray-200 bg-gray-50 px-3 flex items-center gap-2",
        className,
      )}
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" />
      <div className="h-2.5 flex-1 max-w-[55%] rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

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
  size?: "md" | "lg" | "xl";
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
  size = "xl",
}: StockOperationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          STOCK_DLG.content,
          size === "md" && "w-[min(96vw,640px)] max-w-[640px] sm:max-w-[640px]",
          size === "lg" && "w-[min(96vw,900px)] max-w-[900px] sm:max-w-[900px]",
          size === "xl" && "w-[min(96vw,1180px)] max-w-[1180px] sm:max-w-[1180px]",
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
