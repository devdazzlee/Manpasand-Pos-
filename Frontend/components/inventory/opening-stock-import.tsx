"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  History,
  Loader2,
  PackagePlus,
  RefreshCw,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import apiClient from "@/lib/apiClient";
import { API_BASE } from "@/config/constants";
import { usePosData } from "@/hooks/use-pos-data";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Column mapping                                                      */
/* ------------------------------------------------------------------ */

type FieldKey = "sku" | "name" | "quantity" | "unitCost" | "salePrice" | "branch" | "category" | "brand" | "size" | "color";

const FIELDS: { key: FieldKey; label: string; hint: string; aliases: string[] }[] = [
  { key: "sku", label: "SKU / Code", hint: "Item code or barcode from the old POS", aliases: ["sku", "code", "itemcode", "productcode", "barcode", "article", "articleno", "customcode", "itemno"] },
  { key: "name", label: "Product name", hint: "Used to match, and to create missing products", aliases: ["productname", "name", "product", "itemname", "item", "description", "title"] },
  { key: "quantity", label: "Quantity", hint: "Required — units on hand", aliases: ["quantity", "qty", "stock", "currentstock", "closingstock", "balance", "balanceqty", "onhand", "instock", "stockqty"] },
  { key: "unitCost", label: "Unit cost", hint: "Purchase price per unit — values the stock", aliases: ["cost", "unitcost", "purchaserate", "purchaseprice", "costprice", "buyprice", "rate", "avgcost"] },
  { key: "salePrice", label: "Sale price", hint: "Only used for new products", aliases: ["saleprice", "salesrate", "salerate", "price", "retailprice", "mrp", "salesrateincdisandtax", "sellingprice"] },
  { key: "branch", label: "Branch", hint: "Name or code — for multi-branch files", aliases: ["branch", "branchname", "branchcode", "location", "store", "warehouse", "shop"] },
  { key: "category", label: "Category", hint: "New products only", aliases: ["category", "categoryname", "department", "group"] },
  { key: "brand", label: "Brand", hint: "New products only", aliases: ["brand", "brandname", "make"] },
  { key: "size", label: "Size", hint: "New products only", aliases: ["size", "sizename"] },
  { key: "color", label: "Color", hint: "New products only", aliases: ["color", "colour", "colorname"] },
];

const NONE = "__none__";
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function guessMapping(headers: string[]): Record<FieldKey, string> {
  const used = new Set<string>();
  const out = {} as Record<FieldKey, string>;
  for (const f of FIELDS) {
    const hit = f.aliases
      .map((a) => headers.find((h) => !used.has(h) && normHeader(h) === a))
      .find(Boolean);
    out[f.key] = hit || NONE;
    if (hit) used.add(hit);
  }
  return out;
}

async function sha256(buf: ArrayBuffer) {
  try {
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // non-secure context — duplicate-file check falls back to the reference
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ImportRow = {
  rowNo: number;
  branch?: string | null;
  sku?: string | null;
  name?: string | null;
  quantity?: string | number | null;
  unitCost?: string | number | null;
  salePrice?: string | number | null;
  category?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  productId?: string | null;
  skip?: boolean;
};

type PreviewRow = {
  rowNo: number;
  status: "matched" | "new" | "unmatched" | "error" | "skipped";
  matchedBy?: "manual" | "code" | "name";
  message?: string;
  warnings: string[];
  branchName: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  sku: string | null;
  name: string | null;
  quantity: number;
  currentQty: number | null;
  change: number | null;
  unitCost: number | null;
  value: number | null;
  suggestions: { id: string; name: string; sku: string; score: number }[];
};

type Duplicate = { id: string; reference: string; fileName: string | null; sourceReference: string | null; createdAt: string; lines: number; by: string | null; reason: "same-file" | "same-reference" };

type PreviewResult = {
  rows: PreviewRow[];
  summary: {
    total: number;
    matched: number;
    newProducts: number;
    newRows: number;
    unmatched: number;
    errors: number;
    skipped: number;
    totalQty: number;
    totalValue: number;
    newCategories: string[];
    newBrands: string[];
    branches: string[];
  };
  duplicates: Duplicate[];
};

type Progress = {
  id: string;
  reference: string;
  status: "PROCESSING" | "COMMITTED" | "REVERSED";
  totalLines: number;
  pending: number;
  applied: number;
  errors: number;
  createdProducts: number;
  totalQty: number;
  totalValue: number;
  done: boolean;
};

type Batch = {
  id: string;
  reference: string;
  fileName: string | null;
  sourceReference: string | null;
  mode: "ADD" | "SET";
  status: "PROCESSING" | "COMMITTED" | "REVERSED";
  stockDate: string;
  totalLines: number;
  appliedLines: number;
  errorLines: number;
  createdProducts: number;
  totalQty: number;
  totalValue: number;
  voucherNo: string | null;
  reversalVoucherNo: string | null;
  createdBy: string | null;
  reversedBy: string | null;
  reversedAt: string | null;
  createdAt: string;
};

type Step = "upload" | "map" | "preview" | "run";

const money = (n: number) => `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const qty = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

const STATUS_STYLE: Record<PreviewRow["status"], { label: string; cls: string }> = {
  matched: { label: "Matched", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  new: { label: "New product", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  unmatched: { label: "Not found", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  error: { label: "Error", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  skipped: { label: "Skipped", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

const PAGE = 100;

/* ------------------------------------------------------------------ */

export function OpeningStockImport() {
  const { branches, fetchBranches } = usePosData();
  useEffect(() => {
    fetchBranches?.();
  }, [fetchBranches]);

  const [step, setStep] = useState<Step>("upload");

  // upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [checksum, setChecksum] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<Record<string, any>[]>([]);
  const [parsing, setParsing] = useState(false);

  // map + options
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(() => guessMapping([]));
  const [mode, setMode] = useState<"SET" | "ADD">("SET");
  const [defaultBranchId, setDefaultBranchId] = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [updateCost, setUpdateCost] = useState(false);
  const [stockDate, setStockDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [sourceReference, setSourceReference] = useState("");
  const [notes, setNotes] = useState("");

  // preview
  const [overrides, setOverrides] = useState<Record<number, { productId?: string | null; skip?: boolean }>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [filter, setFilter] = useState<"all" | PreviewRow["status"] | "warnings">("all");
  const [page, setPage] = useState(1);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const lastChecked = useRef("{}");

  // run
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // history
  const [batches, setBatches] = useState<Batch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [undoTarget, setUndoTarget] = useState<Batch | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [linesFor, setLinesFor] = useState<Batch | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiClient.get(`${API_BASE}/stock-imports`, { params: { page: 1, limit: 50 } });
      setBatches(res.data?.data || []);
    } catch {
      // history is secondary — the wizard still works
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const resetWizard = () => {
    setStep("upload");
    setFileName("");
    setChecksum(null);
    setHeaders([]);
    setSheetRows([]);
    setOverrides({});
    setPreview(null);
    setProgress(null);
    setRunError(null);
    setSourceReference("");
    setNotes("");
    setFilter("all");
    setPage(1);
  };

  /* ---------------- upload ---------------- */

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false }) : [];
      if (!rows.length) {
        toast.error("No data rows found — the first row must be column headers");
        return;
      }
      if (rows.length > 20000) {
        toast.error(`${rows.length.toLocaleString()} rows — at most 20,000 per import. Split the file.`);
        return;
      }
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setSheetRows(rows);
      setMapping(guessMapping(hdrs));
      setFileName(file.name);
      setChecksum(await sha256(buf));
      setOverrides({});
      setPreview(null);
      setStep("map");
    } catch (e: any) {
      toast.error(errMsg(e, "Couldn't read the file"));
    } finally {
      setParsing(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["SKU", "Product Name", "Quantity", "Unit Cost", "Sale Price", "Branch", "Category", "Brand", "Size", "Color"],
      ["OLD-1001", "Lawn Suit - Red - M", 12, 1850, 3200, "", "Lawn", "Pehnawa", "M", "Red"],
      ["OLD-1002", "Lawn Suit - Red - L", 8, 1850, 3200, "", "Lawn", "Pehnawa", "L", "Red"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening stock");
    XLSX.writeFile(wb, "opening_stock_template.xlsx");
  };

  /* ---------------- map ---------------- */

  const mappingError = useMemo(() => {
    if (mapping.quantity === NONE) return "Choose the Quantity column";
    if (mapping.sku === NONE && mapping.name === NONE) return "Choose a SKU/Code or Product name column";
    if (mapping.branch === NONE && !defaultBranchId) return "Choose a default branch (or map a Branch column)";
    return null;
  }, [mapping, defaultBranchId]);

  const buildRows = useCallback((): ImportRow[] => {
    const get = (r: Record<string, any>, key: FieldKey) => {
      const col = mapping[key];
      if (!col || col === NONE) return null;
      const v = r[col];
      const s = v === null || v === undefined ? "" : String(v).trim();
      return s || null;
    };
    const rows: ImportRow[] = [];
    sheetRows.forEach((r, i) => {
      const row: ImportRow = {
        rowNo: i + 2, // +1 for the header, +1 for 1-based rows — matches Excel
        sku: get(r, "sku"),
        name: get(r, "name"),
        quantity: get(r, "quantity"),
        unitCost: get(r, "unitCost"),
        salePrice: get(r, "salePrice"),
        branch: get(r, "branch"),
        category: get(r, "category"),
        brand: get(r, "brand"),
        size: get(r, "size"),
        color: get(r, "color"),
      };
      if (!row.sku && !row.name && !row.quantity) return; // blank line
      const o = overrides[row.rowNo];
      if (o?.productId) row.productId = o.productId;
      if (o?.skip) row.skip = true;
      rows.push(row);
    });
    return rows;
  }, [sheetRows, mapping, overrides]);

  const options = useMemo(
    () => ({
      mode,
      defaultBranchId: defaultBranchId || null,
      createMissing,
      updateCost,
      fileChecksum: checksum,
      sourceReference: sourceReference.trim() || null,
    }),
    [mode, defaultBranchId, createMissing, updateCost, checksum, sourceReference],
  );

  const runPreview = async () => {
    if (mappingError) {
      toast.error(mappingError);
      return;
    }
    setPreviewing(true);
    lastChecked.current = JSON.stringify(overrides);
    try {
      const res = await apiClient.post(`${API_BASE}/stock-imports/preview`, { rows: buildRows(), options });
      setPreview(res.data?.data);
      setStep("preview");
    } catch (e: any) {
      toast.error(errMsg(e, "Couldn't check the file"));
    } finally {
      setPreviewing(false);
    }
  };

  // Re-check after accepting suggestions / skipping rows.
  const overridesKey = JSON.stringify(overrides);
  useEffect(() => {
    if (step !== "preview" || lastChecked.current === overridesKey) return;
    lastChecked.current = overridesKey;
    const t = setTimeout(() => void runPreview(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesKey, step]);

  const acceptSuggestion = (rowNo: number, productId: string) => setOverrides((o) => ({ ...o, [rowNo]: { productId } }));
  const toggleSkip = (rowNo: number) => setOverrides((o) => ({ ...o, [rowNo]: { ...o[rowNo], skip: !o[rowNo]?.skip } }));
  const clearOverride = (rowNo: number) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[rowNo];
      return next;
    });
  const acceptAllTopSuggestions = () => {
    if (!preview) return;
    const next = { ...overrides };
    let n = 0;
    for (const r of preview.rows) {
      if ((r.status === "unmatched" || r.status === "new") && r.suggestions[0] && r.suggestions[0].score >= 0.8) {
        next[r.rowNo] = { productId: r.suggestions[0].id };
        n += 1;
      }
    }
    if (!n) {
      toast.info("No close matches (80%+) to accept");
      return;
    }
    setOverrides(next);
    toast.success(`Accepted ${n} suggested match${n === 1 ? "" : "es"}`);
  };

  const filteredRows = useMemo(() => {
    if (!preview) return [];
    if (filter === "all") return preview.rows;
    if (filter === "warnings") return preview.rows.filter((r) => r.warnings.length);
    return preview.rows.filter((r) => r.status === filter);
  }, [preview, filter]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE));
  const pageRows = filteredRows.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => setPage(1), [filter]);

  const downloadReport = () => {
    if (!preview) return;
    const ws = XLSX.utils.json_to_sheet(
      preview.rows.map((r) => ({
        Row: r.rowNo,
        Status: STATUS_STYLE[r.status].label,
        "File SKU": r.sku || "",
        "File name": r.name || "",
        "Matched product": r.productName || "",
        "Product SKU": r.productSku || "",
        Branch: r.branchName || "",
        "File qty": r.quantity,
        "On hand now": r.currentQty ?? "",
        Change: r.change ?? "",
        "Unit cost": r.unitCost ?? "",
        Value: r.value ?? "",
        "Best suggestion": r.suggestions[0] ? `${r.suggestions[0].name} (${Math.round(r.suggestions[0].score * 100)}%)` : "",
        Message: [r.message, ...r.warnings].filter(Boolean).join(" · "),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Check");
    XLSX.writeFile(wb, `import_check_${fileName.replace(/\.[^.]+$/, "")}.xlsx`);
  };

  /* ---------------- run ---------------- */

  const processUntilDone = async (batchId: string) => {
    setRunning(true);
    setRunError(null);
    try {
      for (let guard = 0; guard < 2000; guard++) {
        const res = await apiClient.post(`${API_BASE}/stock-imports/${batchId}/process`);
        const p: Progress = res.data?.data;
        setProgress(p);
        if (p.done) {
          toast.success(`Import ${p.reference} saved`, {
            description: `${p.applied} lines · ${qty(p.totalQty)} units · ${money(p.totalValue)}`,
          });
          void fetchHistory();
          return;
        }
      }
    } catch (e: any) {
      setRunError(errMsg(e, "The import stopped"));
    } finally {
      setRunning(false);
    }
  };

  const startImport = async (allowDuplicate = false) => {
    if (!preview) return;
    if (preview.duplicates.length && !allowDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setStep("run");
    setProgress(null);
    setRunError(null);
    setRunning(true);
    try {
      const res = await apiClient.post(`${API_BASE}/stock-imports`, {
        rows: buildRows(),
        options,
        fileName,
        notes: notes.trim() || null,
        stockDate: new Date(`${stockDate}T12:00:00`).toISOString(),
        allowDuplicate,
      });
      const { id, reference, totalLines } = res.data?.data || {};
      setProgress({
        id,
        reference,
        status: "PROCESSING",
        totalLines,
        pending: totalLines,
        applied: 0,
        errors: 0,
        createdProducts: 0,
        totalQty: 0,
        totalValue: 0,
        done: false,
      });
      void fetchHistory();
      await processUntilDone(id);
    } catch (e: any) {
      setRunning(false);
      setRunError(errMsg(e, "Couldn't start the import"));
    }
  };

  /* ---------------- undo ---------------- */

  const doUndo = async () => {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      const res = await apiClient.post(`${API_BASE}/stock-imports/${undoTarget.id}/reverse`);
      const d = res.data?.data || {};
      toast.success(`Import ${undoTarget.reference} undone`, {
        description: `${d.reversedLines ?? 0} lines reversed${d.removedProducts ? `, ${d.removedProducts} new products removed` : ""}`,
      });
      setUndoTarget(null);
      void fetchHistory();
    } catch (e: any) {
      const details: string[] = (e?.response?.data?.errors || []).map((x: any) => x?.message).filter(Boolean);
      toast.error(errMsg(e, "Couldn't undo the import"), details.length ? { description: details.slice(0, 5).join("\n") } : undefined);
    } finally {
      setUndoing(false);
    }
  };

  const resumable = batches.find((b) => b.status === "PROCESSING");

  /* ---------------- render ---------------- */

  const pct = progress && progress.totalLines ? Math.round(((progress.totalLines - progress.pending) / progress.totalLines) * 100) : 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <PackagePlus className="h-6 w-6 text-emerald-600" />
            Opening Stock Import
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Bring stock across from another POS. Products are matched by SKU/code or name, missing ones can be created, and the stock value is
            posted to <span className="font-medium text-slate-700">Opening Balance Equity</span>. Every import can be undone.
          </p>
        </div>
        {step !== "upload" && step !== "run" ? (
          <Button variant="outline" onClick={resetWizard}>
            Start over
          </Button>
        ) : null}
      </div>

      {resumable && step !== "run" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Import {resumable.reference} didn&apos;t finish ({resumable.appliedLines} of {resumable.totalLines} lines applied).
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setStep("run");
                void processUntilDone(resumable.id);
              }}
            >
              Resume
            </Button>
            <Button size="sm" variant="outline" className="h-8 bg-white" onClick={() => setUndoTarget(resumable)}>
              Undo it
            </Button>
          </div>
        </div>
      ) : null}

      <Stepper step={step} />

      {/* ---------------- Step 1: upload ---------------- */}
      {step === "upload" ? (
        <Card className="p-6">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50/50 hover:border-slate-400",
            )}
          >
            {parsing ? (
              <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-slate-400" />
            ) : (
              <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            )}
            <p className="text-base font-medium text-slate-900">Drop the stock file from your old POS</p>
            <p className="mt-1 text-sm text-slate-500">Excel or CSV, up to 20,000 rows. You&apos;ll choose which column is which next.</p>
            <Button type="button" size="sm" className="mt-4" disabled={parsing}>
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>Needs at least a Quantity column and a SKU/code or product name. Cost, branch, category and brand are optional.</span>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download template
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ---------------- Step 2: map ---------------- */}
      {step === "map" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Match your columns</h2>
                <p className="text-sm text-slate-500">
                  {fileName} · {sheetRows.length.toLocaleString()} rows. We guessed from the headers — fix any that are wrong.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-600">
                    {f.label}
                    {f.key === "quantity" ? <span className="text-rose-600"> *</span> : null}
                  </Label>
                  <Select value={mapping[f.key]} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}>
                    <SelectTrigger className={cn("h-9 bg-white text-sm", mapping[f.key] !== NONE && "border-emerald-300")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Not in file —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">{f.hint}</p>
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">First rows, as mapped</h3>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {FIELDS.filter((f) => mapping[f.key] !== NONE).map((f) => (
                      <TableHead key={f.key} className="whitespace-nowrap text-xs">
                        {f.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetRows.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>
                      {FIELDS.filter((f) => mapping[f.key] !== NONE).map((f) => (
                        <TableCell key={f.key} className="whitespace-nowrap text-xs">
                          {String(r[mapping[f.key]] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold text-slate-900">Import options</h2>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Quantities in the file are…</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["SET", "The stock on hand", "Sets on-hand to the file. Safe to re-run."],
                    ["ADD", "Extra stock to add", "Adds on top of what's there."],
                  ] as const
                ).map(([v, title, hint]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMode(v)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left text-sm transition",
                      mode === v ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="block font-medium text-slate-900">{title}</span>
                    <span className="block text-[11px] text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                {mapping.branch !== NONE ? "Branch when the Branch cell is empty" : "Branch"}
              </Label>
              <Select value={defaultBranchId || NONE} onValueChange={(v) => setDefaultBranchId(v === NONE ? "" : v)}>
                <SelectTrigger className="h-9 bg-white text-sm">
                  <SelectValue placeholder="Choose branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Choose —</SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Stock date</Label>
                <Input type="date" value={stockDate} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setStockDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Reference</Label>
                <Input placeholder="e.g. Old POS 30-Sep" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            <ToggleRow
              checked={createMissing}
              onChange={setCreateMissing}
              title="Create products that don't exist"
              hint="Needs a product name. Unknown categories and brands are created too."
            />
            <ToggleRow
              checked={updateCost}
              onChange={setUpdateCost}
              title="Update product cost from the file"
              hint="Off: keep current cost (file cost only fills products with no cost)."
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Note (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] resize-none text-sm" />
            </div>

            {mappingError ? <p className="text-sm text-rose-600">{mappingError}</p> : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700" disabled={!!mappingError || previewing} onClick={runPreview}>
                {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Check {sheetRows.length.toLocaleString()} rows
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* ---------------- Step 3: preview ---------------- */}
      {step === "preview" && preview ? (
        <div className="space-y-4">
          {preview.duplicates.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                This looks like it was imported before
              </p>
              <ul className="mt-1 list-disc pl-6">
                {preview.duplicates.map((d) => (
                  <li key={d.id}>
                    {d.reference} — {d.reason === "same-file" ? "same file" : `same reference "${d.sourceReference}"`}, {format(new Date(d.createdAt), "dd MMM yyyy HH:mm")}
                    {d.by ? ` by ${d.by}` : ""} ({d.lines} lines)
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-rose-800">Importing again {mode === "ADD" ? "would add the stock twice" : "will reset on-hand to the file again"}. Undo the old import first if it was wrong.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="Rows" value={preview.summary.total.toLocaleString()} onClick={() => setFilter("all")} active={filter === "all"} />
            <Stat label="Matched" value={preview.summary.matched.toLocaleString()} tone="emerald" onClick={() => setFilter("matched")} active={filter === "matched"} />
            <Stat label="New products" value={preview.summary.newProducts.toLocaleString()} tone="sky" onClick={() => setFilter("new")} active={filter === "new"} />
            <Stat label="Not found" value={preview.summary.unmatched.toLocaleString()} tone="amber" onClick={() => setFilter("unmatched")} active={filter === "unmatched"} />
            <Stat label="Errors" value={preview.summary.errors.toLocaleString()} tone="rose" onClick={() => setFilter("error")} active={filter === "error"} />
            <Stat label="Units" value={qty(preview.summary.totalQty)} />
            <Stat label="Stock value" value={money(preview.summary.totalValue)} />
          </div>

          {preview.summary.newCategories.length || preview.summary.newBrands.length ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
              Will also create
              {preview.summary.newCategories.length ? (
                <>
                  {" "}
                  categories: <strong>{preview.summary.newCategories.slice(0, 15).join(", ")}</strong>
                  {preview.summary.newCategories.length > 15 ? ` +${preview.summary.newCategories.length - 15} more` : ""}
                </>
              ) : null}
              {preview.summary.newCategories.length && preview.summary.newBrands.length ? ";" : ""}
              {preview.summary.newBrands.length ? (
                <>
                  {" "}
                  brands: <strong>{preview.summary.newBrands.slice(0, 15).join(", ")}</strong>
                  {preview.summary.newBrands.length > 15 ? ` +${preview.summary.newBrands.length - 15} more` : ""}
                </>
              ) : null}
              . Check the spelling — a typo makes a duplicate category.
            </div>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50/60 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                {(["all", "matched", "new", "unmatched", "error", "skipped", "warnings"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
                    )}
                  >
                    {f === "all" ? "All" : f === "warnings" ? "With warnings" : STATUS_STYLE[f].label}
                  </button>
                ))}
                {previewing ? <Loader2 className="ml-1 h-4 w-4 animate-spin text-slate-400" /> : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 bg-white" onClick={acceptAllTopSuggestions}>
                  Accept close matches
                </Button>
                <Button size="sm" variant="outline" className="h-8 bg-white" onClick={downloadReport}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Report
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-xs">Row</TableHead>
                    <TableHead className="text-xs">From file</TableHead>
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Branch</TableHead>
                    <TableHead className="text-right text-xs">On hand</TableHead>
                    <TableHead className="text-right text-xs">{mode === "SET" ? "New qty" : "Add"}</TableHead>
                    <TableHead className="text-right text-xs">Change</TableHead>
                    <TableHead className="text-right text-xs">Cost</TableHead>
                    <TableHead className="text-right text-xs">Value</TableHead>
                    <TableHead className="w-20 text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => {
                    const s = STATUS_STYLE[r.status];
                    const overridden = !!overrides[r.rowNo];
                    return (
                      <TableRow key={r.rowNo} className={cn(r.status === "skipped" && "opacity-60")}>
                        <TableCell className="text-xs text-slate-500">{r.rowNo}</TableCell>
                        <TableCell className="max-w-[220px] text-xs">
                          <div className="truncate font-medium text-slate-800">{r.name || "—"}</div>
                          <div className="truncate text-slate-500">{r.sku || ""}</div>
                        </TableCell>
                        <TableCell className="max-w-[300px] text-xs">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", s.cls)}>
                            {s.label}
                            {r.matchedBy === "name" ? " by name" : r.matchedBy === "manual" ? " (chosen)" : ""}
                          </span>
                          {r.productName ? <div className="mt-0.5 truncate text-slate-700">{r.productName}</div> : null}
                          {r.message && r.status !== "matched" ? <div className="mt-0.5 text-slate-500">{r.message}</div> : null}
                          {r.warnings.map((w, i) => (
                            <div key={i} className="mt-0.5 text-amber-700">
                              {w}
                            </div>
                          ))}
                          {(r.status === "unmatched" || r.status === "new") && r.suggestions.length ? (
                            <div className="mt-1 space-y-0.5">
                              <span className="text-slate-500">Did you mean:</span>
                              {r.suggestions.map((sg) => (
                                <button
                                  key={sg.id}
                                  onClick={() => acceptSuggestion(r.rowNo, sg.id)}
                                  className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left text-emerald-700 hover:bg-emerald-50"
                                >
                                  <span className="truncate">{sg.name}</span>
                                  <span className="shrink-0 text-[10px] text-slate-500">{Math.round(sg.score * 100)}% · Use</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">{r.branchName || "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{qty(r.currentQty)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{qty(r.quantity)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-medium tabular-nums",
                            (r.change ?? 0) > 0 ? "text-emerald-700" : (r.change ?? 0) < 0 ? "text-rose-700" : "text-slate-500",
                          )}
                        >
                          {r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${qty(r.change)}`}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{r.unitCost === null ? "—" : r.unitCost.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{r.value === null ? "—" : r.value.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {overridden && !overrides[r.rowNo]?.skip ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => clearOverride(r.rowNo)}>
                              Reset
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleSkip(r.rowNo)}>
                              {overrides[r.rowNo]?.skip ? "Include" : "Skip"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!pageRows.length ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-500">
                        Nothing here.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {pageCount > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-slate-500">
                <span>
                  {((page - 1) * PAGE + 1).toLocaleString()}–{Math.min(page * PAGE, filteredRows.length).toLocaleString()} of {filteredRows.length.toLocaleString()}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    Prev
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              <strong className="text-slate-900">{(preview.summary.matched + preview.summary.newRows).toLocaleString()}</strong> rows will be imported
              {preview.summary.newProducts ? `, creating ${preview.summary.newProducts.toLocaleString()} products` : ""}. Journal:{" "}
              <strong className="text-slate-900">
                Dr Inventory / Cr Opening Balance Equity {money(Math.abs(preview.summary.totalValue))}
              </strong>
              {preview.summary.unmatched + preview.summary.errors > 0 ? (
                <span className="text-amber-700"> · {(preview.summary.unmatched + preview.summary.errors).toLocaleString()} rows left out</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("map")}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={previewing || preview.summary.matched + preview.summary.newRows === 0}
                onClick={() => startImport(false)}
              >
                <FileUp className="mr-2 h-4 w-4" />
                Import stock
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- Step 4: run ---------------- */}
      {step === "run" ? (
        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            {runError ? (
              <XCircle className="h-8 w-8 text-rose-600" />
            ) : progress?.done ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            )}
            <div>
              <h2 className="font-semibold text-slate-900">
                {runError ? "Import stopped" : progress?.done ? `Import ${progress.reference} saved` : `Importing${progress ? ` ${progress.reference}` : ""}…`}
              </h2>
              <p className="text-sm text-slate-500">
                {runError
                  ? runError
                  : progress?.done
                    ? "Stock, movements and the opening journal are posted. You can undo this from the history below."
                    : "Keep this page open. If it's interrupted, you can resume from where it stopped."}
              </p>
            </div>
          </div>
          {progress ? (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>
                    {(progress.totalLines - progress.pending).toLocaleString()} of {progress.totalLines.toLocaleString()} lines
                  </span>
                  <span className="text-slate-500">{progress.done ? 100 : pct}%</span>
                </div>
                <Progress value={progress.done ? 100 : pct} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Applied" value={progress.applied.toLocaleString()} tone="emerald" />
                <Stat label="Failed" value={progress.errors.toLocaleString()} tone={progress.errors ? "rose" : undefined} />
                <Stat label="Products created" value={progress.createdProducts.toLocaleString()} tone="sky" />
                <Stat label="Stock value" value={progress.done ? money(progress.totalValue) : "…"} />
              </div>
            </>
          ) : null}
          <div className="flex gap-2">
            {runError && progress?.id ? (
              <Button onClick={() => processUntilDone(progress.id)} disabled={running}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resume
              </Button>
            ) : null}
            {progress?.done && progress.errors ? (
              <Button
                variant="outline"
                onClick={() => {
                  const b = batches.find((x) => x.id === progress.id);
                  if (b) setLinesFor(b);
                }}
              >
                See failed lines
              </Button>
            ) : null}
            {!running ? (
              <Button variant="outline" onClick={resetWizard}>
                New import
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* ---------------- History ---------------- */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <History className="h-4 w-4 text-slate-500" />
            Import history
          </h2>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={fetchHistory} disabled={historyLoading}>
            <RefreshCw className={cn("h-4 w-4", historyLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Reference</TableHead>
                <TableHead className="text-xs">File</TableHead>
                <TableHead className="text-xs">Stock date</TableHead>
                <TableHead className="text-xs">By</TableHead>
                <TableHead className="text-right text-xs">Lines</TableHead>
                <TableHead className="text-right text-xs">Units</TableHead>
                <TableHead className="text-right text-xs">Value</TableHead>
                <TableHead className="text-xs">Journal</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs font-medium">
                    {b.reference}
                    {b.sourceReference ? <div className="font-normal text-slate-500">{b.sourceReference}</div> : null}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{b.fileName || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{format(new Date(b.stockDate), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{b.createdBy || "—"}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {b.appliedLines}/{b.totalLines}
                    {b.errorLines ? <span className="text-rose-600"> · {b.errorLines} failed</span> : null}
                    {b.createdProducts ? <div className="text-sky-700">{b.createdProducts} new products</div> : null}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{qty(b.totalQty)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(b.totalValue)}</TableCell>
                  <TableCell className="text-xs">
                    {b.voucherNo || "—"}
                    {b.reversalVoucherNo ? <div className="text-slate-500">rev. {b.reversalVoucherNo}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                        b.status === "COMMITTED"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : b.status === "REVERSED"
                            ? "bg-slate-100 text-slate-600 ring-slate-500/20"
                            : "bg-amber-50 text-amber-800 ring-amber-600/20",
                      )}
                    >
                      {b.status === "COMMITTED" ? "Saved" : b.status === "REVERSED" ? "Undone" : "In progress"}
                    </span>
                    {b.reversedAt ? (
                      <div className="mt-0.5 text-slate-500">
                        {format(new Date(b.reversedAt), "dd MMM HH:mm")}
                        {b.reversedBy ? ` · ${b.reversedBy}` : ""}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setLinesFor(b)}>
                      Lines
                    </Button>
                    {b.status !== "REVERSED" ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-700 hover:bg-rose-50" onClick={() => setUndoTarget(b)}>
                        <Undo2 className="mr-1 h-3.5 w-3.5" />
                        Undo
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {!batches.length && !historyLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-slate-500">
                    No imports yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Duplicate confirm */}
      <AlertDialog open={confirmDuplicate} onOpenChange={setConfirmDuplicate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import this again?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview?.duplicates[0]?.reason === "same-file"
                ? `This exact file was already imported as ${preview?.duplicates[0]?.reference}.`
                : `The reference was already used by ${preview?.duplicates[0]?.reference}.`}{" "}
              {mode === "ADD" ? "Because quantities are added, stock will be counted twice." : "On-hand will be set to the file's figures again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                setConfirmDuplicate(false);
                void startImport(true);
              }}
            >
              Import anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Undo confirm */}
      <AlertDialog open={!!undoTarget} onOpenChange={(o) => !o && !undoing && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo import {undoTarget?.reference}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This reverses {undoTarget?.appliedLines.toLocaleString()} stock lines ({qty(undoTarget?.totalQty)} units) and posts a reversing journal for{" "}
                  {money(undoTarget?.totalValue || 0)}.
                </p>
                {undoTarget?.createdProducts ? (
                  <p>The {undoTarget.createdProducts} products it created are deleted, unless they have been sold, bought or moved since.</p>
                ) : null}
                <p>If any item would go below zero (sold since the import), nothing is changed and you&apos;ll see which items.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={undoing}
              onClick={(e) => {
                e.preventDefault();
                void doUndo();
              }}
            >
              {undoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BatchLinesDialog batch={linesFor} onClose={() => setLinesFor(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Columns & options" },
    { key: "preview", label: "Check" },
    { key: "run", label: "Import" },
  ];
  const at = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
              i < at ? "bg-emerald-600 text-white" : i === at ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500",
            )}
          >
            {i < at ? "✓" : i + 1}
          </span>
          <span className={cn(i === at ? "font-medium text-slate-900" : "text-slate-500")}>{s.label}</span>
          {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-300" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Stat({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "sky" | "amber" | "rose";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-700" : tone === "sky" ? "text-sky-700" : tone === "amber" ? "text-amber-700" : tone === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition disabled:cursor-default",
        onClick && "hover:border-slate-300",
        active && "ring-2 ring-slate-900",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", toneCls)}>{value}</div>
    </button>
  );
}

function ToggleRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 p-2.5">
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

type BatchLine = {
  id: string;
  rowNo: number;
  status: string;
  branch: string;
  productName: string | null;
  productSku: string | null;
  fileSku: string | null;
  quantity: number;
  unitCost: number | null;
  previousQty: number | null;
  newQty: number | null;
  change: number | null;
  value: number | null;
  createdProduct: boolean;
  error: string | null;
};

function BatchLinesDialog({ batch, onClose }: { batch: Batch | null; onClose: () => void }) {
  const [lines, setLines] = useState<BatchLine[]>([]);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
    setStatus(batch?.errorLines ? "ERROR" : "all");
  }, [batch]);

  useEffect(() => {
    if (!batch) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`${API_BASE}/stock-imports/${batch.id}/lines`, { params: { page, limit: 100, status: status === "all" ? undefined : status } })
      .then((res) => {
        if (cancelled) return;
        setLines(res.data?.data || []);
        setTotalPages(res.data?.meta?.totalPages || 1);
      })
      .catch((e) => toast.error(errMsg(e, "Couldn't load lines")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [batch, page, status]);

  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lines of {batch?.reference}</DialogTitle>
          <DialogDescription>{batch?.fileName || ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {["all", "APPLIED", "ERROR", "SKIPPED", "REVERSED"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                status === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
              )}
            >
              {s === "all" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Row</TableHead>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs">Branch</TableHead>
                <TableHead className="text-right text-xs">Before</TableHead>
                <TableHead className="text-right text-xs">After</TableHead>
                <TableHead className="text-right text-xs">Change</TableHead>
                <TableHead className="text-right text-xs">Value</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{l.rowNo}</TableCell>
                  <TableCell className="max-w-[260px] text-xs">
                    <div className="truncate">{l.productName || "—"}</div>
                    <div className="text-slate-500">
                      {l.productSku || l.fileSku || ""}
                      {l.createdProduct ? <span className="ml-1 text-sky-700">· created</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{l.branch}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{qty(l.previousQty)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{qty(l.newQty)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{qty(l.change)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{l.value === null ? "—" : l.value.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">
                    {l.status}
                    {l.error ? <div className="text-rose-600">{l.error}</div> : null}
                  </TableCell>
                </TableRow>
              ))}
              {!lines.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    No lines.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Prev
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
