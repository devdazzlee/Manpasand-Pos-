"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

/**
 * Physical stock count by scanning. Works with any USB / Bluetooth scanner
 * (they type the code and press Enter) and, on phones whose browser supports
 * the BarcodeDetector API, with the camera. The draft is kept in this
 * browser per branch, so a long count survives a refresh. Saving posts a
 * "Stock count" adjustment (counted − system) for every scanned item.
 */

type CountLine = {
  productId: string;
  name: string;
  sku: string;
  code: string;
  cost: number;
  systemQty: number;
  counted: number;
  lastScan: number;
};

const MAX_BATCH = 500;
const draftKey = (branchId: string) => `scan-count-draft:${branchId}`;
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

function beep(ok: boolean) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => ctx.close();
  } catch {
    // sound is a nicety
  }
}

export function ScanStockCount() {
  const { branches, fetchBranches } = usePosData();
  useEffect(() => {
    fetchBranches?.();
  }, [fetchBranches]);

  const [branchId, setBranchId] = useState("");
  const [lines, setLines] = useState<CountLine[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Omit<CountLine, "counted" | "lastScan">>());

  // Load / save the draft for this branch.
  useEffect(() => {
    cache.current.clear();
    if (!branchId) {
      setLines([]);
      return;
    }
    try {
      const raw = localStorage.getItem(draftKey(branchId));
      setLines(raw ? (JSON.parse(raw) as CountLine[]) : []);
    } catch {
      setLines([]);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [branchId]);
  useEffect(() => {
    if (!branchId) return;
    try {
      if (lines.length) localStorage.setItem(draftKey(branchId), JSON.stringify(lines));
      else localStorage.removeItem(draftKey(branchId));
    } catch {
      // private mode etc. — counting still works, just not resumable
    }
  }, [lines, branchId]);

  const addScan = useCallback(
    async (raw: string, amount = 1) => {
      const value = raw.trim();
      if (!value || !branchId) return;
      setBusy(true);
      try {
        let product = cache.current.get(value.toLowerCase());
        if (!product) {
          const res = await apiClient.get(`${API_BASE}/stock-imports/lookup`, { params: { code: value, branchId } });
          const d = res.data?.data;
          product = { productId: d.id, name: d.name, sku: d.sku, code: d.code, cost: d.cost, systemQty: d.systemQty };
          cache.current.set(value.toLowerCase(), product);
        }
        const p = product;
        setLines((prev) => {
          const i = prev.findIndex((l) => l.productId === p.productId);
          if (i === -1) return [{ ...p, counted: amount, lastScan: Date.now() }, ...prev];
          const next = prev.slice();
          next[i] = { ...next[i], counted: next[i].counted + amount, lastScan: Date.now() };
          // Keep the item just scanned at the top so the user sees it.
          const [item] = next.splice(i, 1);
          return [item, ...next];
        });
        setLastMsg({ ok: true, text: `${p.name}` });
        beep(true);
      } catch (e: any) {
        setLastMsg({ ok: false, text: e?.response?.data?.message || `No product for "${value}"` });
        beep(false);
      } finally {
        setBusy(false);
        setCode("");
        inputRef.current?.focus();
      }
    },
    [branchId],
  );

  /* ---------------- camera ---------------- */
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const cameraSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    let stopped = false;
    let last = { value: "", at: 0 };
    const detector = new (window as any).BarcodeDetector({
      formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "qr_code"],
    });
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.[0]?.rawValue;
            // Same label held in front of the camera: count it once per 1.5s.
            if (value && (value !== last.value || Date.now() - last.at > 1500)) {
              last = { value, at: Date.now() };
              void addScan(value);
            }
          } catch {
            // frame not ready
          }
          setTimeout(tick, 250);
        };
        void tick();
      } catch {
        toast.error("Couldn't open the camera — allow camera access, or use a scanner");
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOn, addScan]);
  useEffect(() => stopCamera, [stopCamera]);

  /* ---------------- edit ---------------- */
  const setCounted = (productId: string, counted: number) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, counted: Math.max(0, counted) } : l)));
  const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId));

  const stats = useMemo(() => {
    let units = 0;
    let over = 0;
    let short = 0;
    let match = 0;
    let value = 0;
    for (const l of lines) {
      units += l.counted;
      const d = l.counted - l.systemQty;
      if (d > 0) over += 1;
      else if (d < 0) short += 1;
      else match += 1;
      value += d * l.cost;
    }
    return { units, over, short, match, value };
  }, [lines]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => [l.name, l.sku, l.code].some((v) => v?.toLowerCase().includes(q)));
  }, [lines, filter]);

  /* ---------------- save ---------------- */
  const save = async () => {
    const changed = lines.filter((l) => l.counted !== l.systemQty);
    if (!changed.length) {
      toast.success("Everything you scanned matches the system — nothing to adjust");
      setLines([]);
      setConfirmSave(false);
      return;
    }
    setSaving(true);
    const refs: string[] = [];
    try {
      for (let i = 0; i < changed.length; i += MAX_BATCH) {
        const chunk = changed.slice(i, i + MAX_BATCH);
        const res = await apiClient.post(`${API_BASE}/stock-adjustments/batch`, {
          branchId,
          adjustmentType: "RECONCILIATION",
          adjustmentCategory: "CORRECTION",
          reason: `Scanned stock count (${lines.length} items scanned)`,
          lines: chunk.map((l) => ({ productId: l.productId, physicalCount: l.counted })),
        });
        if (res.data?.data?.referenceNo) refs.push(res.data.data.referenceNo);
        // Drop the saved part so a failure in a later chunk can be retried safely.
        const saved = new Set(chunk.map((l) => l.productId));
        setLines((prev) => prev.filter((l) => !saved.has(l.productId)));
      }
      toast.success(`Count saved — ${changed.length} item${changed.length === 1 ? "" : "s"} adjusted`, {
        description: refs.join(", "),
      });
      setLines([]);
      setConfirmSave(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Couldn't save the count", {
        description: refs.length ? `Saved so far: ${refs.join(", ")}. The rest is still in your list.` : "Nothing was changed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const branchName = branches.find((b: any) => b.id === branchId)?.name;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <ScanBarcode className="h-6 w-6 text-sky-600" />
          Scan Stock Count
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan every item on the shelf. Each scan adds 1. When you&apos;re done, save — the system quantity is set to what you counted. Your
          progress is kept on this device until you save.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[260px_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Branch</Label>
            <Select
              value={branchId}
              onValueChange={(v) => {
                stopCamera();
                setBranchId(v);
              }}
            >
              <SelectTrigger className="h-11 bg-white">
                <SelectValue placeholder="Choose branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Scan or type barcode / SKU, then Enter</Label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addScan(code);
              }}
              className="relative"
            >
              <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                ref={inputRef}
                autoFocus
                disabled={!branchId}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={branchId ? "Ready to scan…" : "Choose a branch first"}
                className="h-11 pl-10 text-base"
                autoComplete="off"
              />
              {busy ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
            </form>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={!branchId || !cameraSupported}
              title={cameraSupported ? "" : "This browser can't read barcodes from the camera — use Chrome on Android, or a scanner"}
              onClick={() => (cameraOn ? stopCamera() : setCameraOn(true))}
            >
              {cameraOn ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
              {cameraOn ? "Stop camera" : "Use camera"}
            </Button>
          </div>
        </div>

        {cameraOn ? (
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="mx-auto max-h-72 w-full object-contain" muted playsInline />
          </div>
        ) : null}

        {lastMsg ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              lastMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800",
            )}
          >
            {lastMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {lastMsg.ok ? "Counted: " : ""}
            {lastMsg.text}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MiniStat label="Items" value={lines.length.toLocaleString()} />
        <MiniStat label="Units counted" value={fmt(stats.units)} />
        <MiniStat label="Match" value={stats.match.toLocaleString()} tone="text-emerald-700" />
        <MiniStat label="Over / short" value={`${stats.over} / ${stats.short}`} tone="text-amber-700" />
        <MiniStat
          label="Value difference"
          value={`${stats.value >= 0 ? "+" : "−"}Rs ${Math.abs(stats.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          tone={stats.value < 0 ? "text-rose-700" : "text-emerald-700"}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find in list" className="h-8 pl-8 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-rose-700" disabled={!lines.length || saving} onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
            <Button size="sm" className="h-8 bg-sky-600 text-white hover:bg-sky-700" disabled={!lines.length || saving} onClick={() => setConfirmSave(true)}>
              Save count
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-right text-xs">System</TableHead>
                <TableHead className="text-center text-xs">Counted</TableHead>
                <TableHead className="text-right text-xs">Difference</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((l) => {
                const d = l.counted - l.systemQty;
                return (
                  <TableRow key={l.productId}>
                    <TableCell className="text-sm">
                      <div className="font-medium text-slate-900">{l.name}</div>
                      <div className="text-xs text-slate-500">
                        {l.code} · {l.sku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmt(l.systemQty)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCounted(l.productId, l.counted - 1)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          value={l.counted}
                          onChange={(e) => setCounted(l.productId, Number(e.target.value) || 0)}
                          className="h-8 w-20 text-center text-sm tabular-nums"
                        />
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCounted(l.productId, l.counted + 1)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-sm font-medium tabular-nums",
                        d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-400",
                      )}
                    >
                      {d === 0 ? "✓" : `${d > 0 ? "+" : ""}${fmt(d)}`}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-rose-600" onClick={() => removeLine(l.productId)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visible.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    {branchId ? "Scan an item to start counting." : "Choose a branch to start."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={confirmSave} onOpenChange={(o) => !saving && setConfirmSave(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save count for {branchName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {stats.over + stats.short} item{stats.over + stats.short === 1 ? "" : "s"} will be set to the counted quantity ({stats.over} over,{" "}
              {stats.short} short). Items that match are skipped. Only items you scanned are touched — anything not scanned keeps its quantity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep counting</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className="bg-sky-600 hover:bg-sky-700"
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this count?</AlertDialogTitle>
            <AlertDialogDescription>All {lines.length} scanned items are removed from the list. Stock is not changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                setLines([]);
                setLastMsg(null);
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-white px-3 py-2.5 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums text-slate-900", tone)}>{value}</div>
    </div>
  );
}
