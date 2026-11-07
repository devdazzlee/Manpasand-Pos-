"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Per-product quantity choices for the website ("250g, 500g, 1kg").
 * Stored in the product's own unit (a Kg product stores 250 g as 0.25), so
 * the website and the POS agree on what a quantity means. Empty = the website
 * shows its standard choices for the unit.
 */

const unitKind = (unitName?: string) => {
  const u = (unitName || "").toLowerCase().trim();
  if (u.includes("kg") || u.includes("kilogram")) return "kg" as const;
  if (u === "g" || u === "gm" || u.includes("gram")) return "g" as const;
  if (u === "l" || u.includes("litre") || u.includes("liter")) return "l" as const;
  if (u === "ml") return "ml" as const;
  return "other" as const;
};

const trim = (n: number) => Number(n.toFixed(6));

/** "250g" / "0.25kg" / "1.5" → quantity in the product's unit, or null. */
export function parseWebsiteQuantity(raw: string, unitName?: string): number | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = v.match(/^(\d*\.?\d+)(kg|kgs|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!(n > 0)) return null;
  const suffix = m[2];
  const kind = unitKind(unitName);
  const isGrams = suffix === "g" || suffix === "gm" || suffix === "gram" || suffix === "grams";
  const isKg = suffix === "kg" || suffix === "kgs";
  const isMl = suffix === "ml";
  const isL = suffix === "l" || suffix === "ltr" || suffix === "litre" || suffix === "liter";
  if (kind === "kg") return trim(isGrams ? n / 1000 : n);
  if (kind === "g") return trim(isKg ? n * 1000 : n);
  if (kind === "l") return trim(isMl ? n / 1000 : n);
  if (kind === "ml") return trim(isL ? n * 1000 : n);
  return trim(n);
}

/** How a stored quantity reads to a customer: 0.25 (Kg) → "250 g". */
export function formatWebsiteQuantity(q: number, unitName?: string): string {
  const kind = unitKind(unitName);
  if (kind === "kg") return q < 1 ? `${trim(q * 1000)} g` : `${trim(q)} kg`;
  if (kind === "g") return q >= 1000 ? `${trim(q / 1000)} kg` : `${trim(q)} g`;
  if (kind === "l") return q < 1 ? `${trim(q * 1000)} ml` : `${trim(q)} L`;
  if (kind === "ml") return q >= 1000 ? `${trim(q / 1000)} L` : `${trim(q)} ml`;
  return `${trim(q)}${unitName ? ` ${unitName}` : ""}`;
}

const EXAMPLE: Record<ReturnType<typeof unitKind>, string> = {
  kg: "250g, 500g, 1kg",
  g: "100g, 250g, 500g",
  l: "500ml, 1L",
  ml: "250ml, 500ml",
  other: "1, 6, 12",
};

export function WebsiteQuantityOptions({
  value,
  onChange,
  unitName,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  unitName?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const kind = unitKind(unitName);

  const add = () => {
    const parts = draft.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const parsed: number[] = [];
    for (const p of parts) {
      const q = parseWebsiteQuantity(p, unitName);
      if (q === null) {
        setError(`"${p}" isn't a quantity. Try ${EXAMPLE[kind]}.`);
        return;
      }
      parsed.push(q);
    }
    const next = [...new Set([...value, ...parsed])].sort((a, b) => a - b);
    if (next.length > 20) {
      setError("At most 20 website quantities.");
      return;
    }
    onChange(next);
    setDraft("");
    setError("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div>
        <Label htmlFor="website-qty-input" className="text-sm font-medium">
          Website quantity options
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The choices customers see on this product&apos;s website page. Leave empty to use the standard choices
          for the unit.
        </p>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Website quantity options">
          {value.map((q) => (
            <span
              key={q}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-blue-900"
            >
              {formatWebsiteQuantity(q, unitName)}
              <button
                type="button"
                aria-label={`Remove ${formatWebsiteQuantity(q, unitName)}`}
                className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
                onClick={() => onChange(value.filter((x) => x !== q))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          id="website-qty-input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={onKeyDown}
          placeholder={`e.g. ${EXAMPLE[kind]}`}
          className="h-9"
          aria-invalid={!!error}
          aria-describedby="website-qty-help"
        />
        <Button type="button" variant="outline" className="h-9 shrink-0" onClick={add} disabled={!draft.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      <p id="website-qty-help" className={error ? "text-xs font-medium text-red-600" : "text-xs text-muted-foreground"}>
        {error ||
          (value.length
            ? "Only these quantities will show on the website for this product."
            : "Empty: the website shows its standard choices for this unit.")}
      </p>
    </div>
  );
}
