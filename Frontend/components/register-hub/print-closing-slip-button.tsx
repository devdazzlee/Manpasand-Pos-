"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePrinterSettings } from "@/hooks/use-printer-settings";
import { printClosingSlip } from "@/lib/register-closing-slip";

/** Prints (or reprints) a register's closing slip on the receipt printer. */
export function PrintClosingSlipButton({
  sessionId,
  label = "Print closing slip",
  ...buttonProps
}: { sessionId: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const { toast } = useToast();
  const { getReceiptPrinterObj } = usePrinterSettings();
  const [busy, setBusy] = useState(false);

  const print = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await printClosingSlip(sessionId, getReceiptPrinterObj());
      toast({ title: "Closing slip sent to printer" });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not print closing slip",
        description: err?.response?.data?.message || err?.message || "Check the receipt printer and print server.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={print} disabled={busy || buttonProps.disabled} {...buttonProps}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
      {busy ? "Printing…" : label}
    </Button>
  );
}
