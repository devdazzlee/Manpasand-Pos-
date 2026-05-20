"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

export interface ExcelField {
  name: string;
  required?: boolean;
  description: ReactNode;
}

// Per-row status used by the live progress list.
export type RowStatus = "pending" | "uploading" | "ok" | "failed";
export interface RowState {
  name: string;
  status: RowStatus;
  error?: string;
}

// Controls passed to the parent's onFile handler so it can process the rows
// one at a time and report per-row progress back to the dialog.
export interface UploadControls {
  rows: RowState[];
  setRowStatus: (index: number, status: RowStatus, error?: string) => void;
}

export interface ExcelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  fields: ExcelField[];
  footnote?: ReactNode;
  // Called per-row. The dialog parses the file client-side, builds the row
  // list, then invokes onRow(row, index) for each one. The handler should
  // return a result indicating success or failure for that row.
  // (Defining this as a per-row callback is what makes the progress live —
  //  we await one row at a time and update the UI between calls.)
  onRow: (
    row: Record<string, any>,
    index: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  // Which sheet column to display as the row label. Falls back to the first
  // populated key on the row if none of the candidates are present.
  nameColumns?: string[];
  onDownloadTemplate?: () => void;
  // Called when the entire batch has finished (success or partial). The
  // dialog will keep itself open showing the results until the user closes
  // it manually, so the parent can use this for refreshes / summary toasts.
  onBatchComplete?: (summary: { ok: number; failed: number; total: number }) => void;
}

const DEFAULT_NAME_COLUMNS = ["Product Name", "Name", "name", "product_name"];

export function ExcelUploadDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  footnote,
  onRow,
  nameColumns = DEFAULT_NAME_COLUMNS,
  onDownloadTemplate,
  onBatchComplete,
}: ExcelUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<"idle" | "parsing" | "uploading" | "done">(
    "idle",
  );
  const [rows, setRows] = useState<RowState[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const acceptStr =
    ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

  const setRowStatus = (index: number, status: RowStatus, error?: string) => {
    setRows((prev) => {
      const next = prev.slice();
      if (next[index]) next[index] = { ...next[index], status, error };
      return next;
    });
  };

  const pickName = (row: Record<string, any>) => {
    for (const k of nameColumns) {
      if (row[k] && String(row[k]).trim()) return String(row[k]).trim();
    }
    // Fall back to the first non-empty cell so users still see something.
    for (const k of Object.keys(row)) {
      if (row[k] && String(row[k]).trim()) return String(row[k]).trim();
    }
    return "(unnamed row)";
  };

  const resetState = () => {
    setPhase("idle");
    setRows([]);
    setRawRows([]);
    setErrorMessage(null);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    setErrorMessage(null);
    setPhase("parsing");

    // 1) Parse the spreadsheet client-side so we know how many rows there
    //    are and can display each by name as it processes.
    let parsed: Record<string, any>[];
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Workbook has no sheets");
      parsed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      });
    } catch (err: any) {
      setErrorMessage(err?.message || "Couldn't read the file");
      setPhase("idle");
      return;
    }

    if (parsed.length === 0) {
      setErrorMessage(
        "No data rows found. The first row must be column headers.",
      );
      setPhase("idle");
      return;
    }

    const initialRows: RowState[] = parsed.map((r) => ({
      name: pickName(r),
      status: "pending",
    }));
    setRawRows(parsed);
    setRows(initialRows);
    setPhase("uploading");

    // 2) Process one row at a time. After each row resolves we update its
    //    status, which re-renders the list — that's what makes the progress
    //    feel live instead of a single end-of-batch update.
    let okCount = 0;
    let failCount = 0;
    for (let i = 0; i < parsed.length; i++) {
      setRowStatus(i, "uploading");
      try {
        const result = await onRow(parsed[i], i);
        if (result.ok) {
          setRowStatus(i, "ok");
          okCount += 1;
        } else {
          setRowStatus(i, "failed", result.error);
          failCount += 1;
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Unknown error";
        setRowStatus(i, "failed", msg);
        failCount += 1;
      }
    }

    setPhase("done");
    onBatchComplete?.({ ok: okCount, failed: failCount, total: parsed.length });
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (phase === "uploading" || phase === "parsing") return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.status === "ok").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const uploading = rows.filter((r) => r.status === "uploading").length;
    return {
      ok,
      failed,
      uploading,
      pending: rows.length - ok - failed - uploading,
      total: rows.length,
    };
  }, [rows]);

  const isWorking = phase === "parsing" || phase === "uploading";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't let the user close mid-upload (avoids orphan partial state).
        if (isWorking && !o) return;
        if (!o) resetState();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-black">{title}</DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {description}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={acceptStr}
          className="hidden"
          onChange={onInputChange}
        />

        {/* Idle: drop zone + format guide. */}
        {phase === "idle" && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-black bg-gray-50"
                  : "border-gray-300 hover:border-gray-400 bg-gray-50/40"
              }`}
            >
              <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-base font-medium text-black">Drop your file here</p>
              <p className="text-sm text-gray-500 mt-1">
                CSV, XLSX or XLS — max ~500 rows recommended
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Browse file
              </Button>
            </div>

            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-black">Required sheet format</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    First row = column headers
                  </span>
                </div>
                {onDownloadTemplate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm text-black"
                    onClick={onDownloadTemplate}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download template
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {fields.map((f) => (
                  <div
                    key={f.name}
                    className="border border-gray-200 rounded-md p-3 text-sm bg-white"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium text-black">{f.name}</span>
                      {f.required && (
                        <span className="text-xs text-red-600">*required</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {f.description}
                    </p>
                  </div>
                ))}
              </div>

              {footnote && (
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">{footnote}</p>
              )}
            </div>
          </>
        )}

        {phase === "parsing" && (
          <div className="py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Reading file…</p>
          </div>
        )}

        {(phase === "uploading" || phase === "done") && (
          <ProgressView
            rows={rows}
            summary={summary}
            phase={phase}
            // Once done, allow starting a new upload from the same dialog.
            onUploadAnother={resetState}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProgressView({
  rows,
  summary,
  phase,
  onUploadAnother,
  onClose,
}: {
  rows: RowState[];
  summary: { ok: number; failed: number; uploading: number; pending: number; total: number };
  phase: "uploading" | "done";
  onUploadAnother: () => void;
  onClose: () => void;
}) {
  const done = summary.ok + summary.failed;
  const pct = summary.total === 0 ? 0 : Math.round((done / summary.total) * 100);
  return (
    <div className="space-y-4">
      {/* Summary header + progress bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-black">
            {phase === "uploading"
              ? `Importing ${done} of ${summary.total}…`
              : `Finished — ${summary.ok} succeeded, ${summary.failed} failed`}
          </span>
          <span className="text-gray-500">{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-black transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-row list */}
      <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="flex items-start gap-2 min-w-0">
              {r.status === "pending" && (
                <span className="mt-0.5 inline-block h-4 w-4 rounded-full border border-gray-300 shrink-0" />
              )}
              {r.status === "uploading" && (
                <Loader2 className="mt-0.5 h-4 w-4 text-gray-500 animate-spin shrink-0" />
              )}
              {r.status === "ok" && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600 shrink-0" />
              )}
              {r.status === "failed" && (
                <XCircle className="mt-0.5 h-4 w-4 text-red-600 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-black truncate">{r.name}</p>
                {r.status === "failed" && r.error && (
                  <p className="text-xs text-red-600 mt-0.5">{r.error}</p>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {r.status === "pending"
                ? "Waiting"
                : r.status === "uploading"
                  ? "Uploading…"
                  : r.status === "ok"
                    ? "Imported"
                    : "Failed"}
            </span>
          </div>
        ))}
      </div>

      {phase === "done" && (
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" className="text-sm text-black" onClick={onUploadAnother}>
            Upload another file
          </Button>
          <Button size="sm" className="text-sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
