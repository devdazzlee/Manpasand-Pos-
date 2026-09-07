"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const STOCK_DLG = {
  content:
    "w-full max-w-6xl mx-auto flex flex-col min-h-0 flex-1 overflow-hidden",
  header: "px-6 py-4 border-b shrink-0 bg-background",
  title: "text-lg font-semibold",
  desc: "text-sm text-muted-foreground font-normal mt-0.5",
  body: "px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0",
  footer:
    "flex justify-between items-center gap-3 px-6 py-4 border-t shrink-0 bg-muted/40",
  label: "text-sm font-medium",
  field: "h-9 text-sm",
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
        "h-9 w-full rounded-md border bg-muted/40 px-3 flex items-center gap-2",
        className,
      )}
      aria-busy="true"
      aria-label={label}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      <div className="h-2.5 flex-1 max-w-[55%] rounded bg-muted animate-pulse" />
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

/** Full-page in-tab form for multi-line stock operations (not a centered modal). */
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
}: StockOperationDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onCancel?.();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className={STOCK_DLG.header}>
        <h2 className={STOCK_DLG.title}>{title}</h2>
        {description ? <p className={STOCK_DLG.desc}>{description}</p> : null}
      </div>
      <div className={STOCK_DLG.body}>{children}</div>
      <div className={STOCK_DLG.footer}>
        <div className="text-xs text-muted-foreground">{footerHint}</div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            type="button"
            size="sm"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={submitting || submitDisabled}
            className="min-w-[100px]"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
