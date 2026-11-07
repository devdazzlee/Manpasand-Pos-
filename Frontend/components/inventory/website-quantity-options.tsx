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

/**
 * The website's standard choices per unit (keep in step with
 * Manpasand-Website app/products/[id]/page.tsx → quantityOptions).
 */
export function standardWebsiteQuantities(unitName?: string): number[] {
  const kind = unitKind(unitName);
  if (kind === "kg") return [0.05, 0.1, 0.125, 0.2, 0.25, 0.375, 0.5, 1];
  if (kind === "g") return [100, 200, 250, 500, 1000];
  return [];
}

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

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
  const standard = standardWebsiteQuantities(unitName);
  const usingStandard = value.length === 0;
  // What the customer sees right now: the product's own list, or the standard one.
  const shown = usingStandard ? standard : value;

  /** Save a change. A list identical to the standard one is stored as "standard" (empty). */
  const commit = (next: number[]) => {
    const sorted = [...new Set(next)].sort((a, b) => a - b);
    onChange(standard.length && sameSet(sorted, standard) ? [] : sorted);
  };

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
    const next = [...new Set([...shown, ...parsed])].sort((a, b) => a - b);
    if (next.length > 20) {
      setError("At most 20 website quantities.");
      return;
    }
    commit(next);
    setDraft("");
    setError("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && shown.length > 1) {
      commit(shown.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div>
        <Label htmlFor="website-qty-input" className="text-sm font-medium">
          Website quantity options
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The choices customers see on this product&apos;s website page. Remove any you don&apos;t have, or add
          your own.
        </p>
      </div>

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Website quantity options">
          {shown.map((q) => (
            <span
              key={q}
              className={
                usingStandard
                  ? "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-xs font-medium text-slate-700"
                  : "inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-blue-900"
              }
            >
              {formatWebsiteQuantity(q, unitName)}
              {shown.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${formatWebsiteQuantity(q, unitName)}`}
                  title="Not available — remove from the website"
                  className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => commit(shown.filter((x) => x !== q))}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!usingStandard && standard.length > 0 && (
            <button
              type="button"
              className="ml-1 text-xs font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={() => onChange([])}
            >
              Reset to standard
            </button>
          )}
          {!usingStandard && standard.length === 0 && (
            <button
              type="button"
              className="ml-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
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
          (usingStandard
            ? standard.length
              ? "Showing the standard choices. Remove any that aren't available — this product then keeps its own list."
              : "No choices set: customers pick the quantity with − / + on the website."
            : "Only these quantities show on the website for this product.")}
      </p>
    </div>
  );
}
