"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CameraOff,
  CircleCheck,
  CircleX,
  Flashlight,
  FlashlightOff,
  Pause,
  Play,
  ScanBarcode,
  SwitchCamera,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-screen phone camera scanner.
 *
 * Keeps scanning until closed: every barcode it reads is handed to `onDetected`
 * (which adds it to the cart) and the result is shown, beeped and vibrated.
 * Uses the browser's own BarcodeDetector when it has one (Android Chrome) and
 * the ZXing decoder everywhere else (iPhone Safari, Firefox).
 */

export type ScanOutcome = { ok: boolean; name?: string; message?: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once per accepted scan; resolve with what happened. */
  onDetected: (code: string) => Promise<ScanOutcome>;
  title?: string;
};

type Recent = { key: string; code: string; ok: boolean; label: string; count: number; at: number };

/** Same label held in front of the camera is counted once per this many ms. */
const SAME_CODE_GAP = 2000;
/** Minimum gap between any two accepted scans. */
const ANY_CODE_GAP = 700;

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "codabar", "itf", "qr_code"];

/* ---------------- sound ---------------- */

let audioCtx: AudioContext | null = null;
/** Call from the tap that opens the scanner so iPhone allows the beep. */
export function primeScannerAudio() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    // no sound available
  }
}

/** Phone buzz on scan — Android Chrome supports this; iPhone Safari does not. */
function vibrateOnScan(ok: boolean) {
  try {
    const vibrate =
      typeof navigator !== "undefined"
        ? navigator.vibrate?.bind(navigator) ||
          (navigator as any).webkitVibrate?.bind(navigator) ||
          (navigator as any).mozVibrate?.bind(navigator)
        : null;
    if (!vibrate) return;
    // Cancel any ongoing buzz, then pulse so it is easy to feel in the hand.
    vibrate(0);
    if (ok) {
      vibrate([50, 40, 80]); // detect: short + stronger tap
    } else {
      vibrate([100, 60, 100, 60, 120]); // miss: longer triple buzz
    }
  } catch {
    // ignore — some browsers block vibration
  }
}

/** Retail-scanner style chirp — short high beep on detect, low buzz on miss. */
function beep(ok: boolean) {
  // Vibration first so it still fires even if audio is blocked / unavailable.
  vibrateOnScan(ok);
  try {
    if (!audioCtx) primeScannerAudio();
    const ctx = audioCtx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const playTone = (freq: number, start: number, dur: number, type: OscillatorType, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.exponentialRampToValueAtTime(vol, t + start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.02);
    };
    if (ok) {
      // Classic handheld scanner: two quick high chirps.
      playTone(1800, 0, 0.07, "square", 0.45);
      playTone(2200, 0.08, 0.08, "square", 0.4);
    } else {
      playTone(280, 0, 0.18, "square", 0.35);
      playTone(180, 0.2, 0.22, "square", 0.3);
    }
  } catch {
    // ignore
  }
}

/* ---------------- decoders ---------------- */

type Stopper = () => void;

/** Draw the live video into a canvas (scaled down for speed). */
function grabVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return false;
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, w, h);
  return true;
}

/** Rotate src 90° clockwise into dst (portrait ↔ landscape barcodes). */
function rotateCanvas90(src: HTMLCanvasElement, dst: HTMLCanvasElement) {
  dst.width = src.height;
  dst.height = src.width;
  const ctx = dst.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.translate(dst.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
}

async function createNativeDetector(): Promise<any | null> {
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;
  let formats: string[] = NATIVE_FORMATS;
  try {
    const supported: string[] = await BD.getSupportedFormats();
    formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
  } catch {
    // older builds: try the full list
  }
  try {
    return new BD({ formats });
  } catch {
    return null;
  }
}

async function createZxingReader(): Promise<{
  decodeCanvas: (canvas: HTMLCanvasElement) => string | null;
} | null> {
  try {
    const [{ MultiFormatReader, BarcodeFormat, DecodeHintType, BinaryBitmap, HybridBinarizer }, { HTMLCanvasElementLuminanceSource }] =
      await Promise.all([import("@zxing/library"), import("@zxing/browser")]);
    const hints = new Map<any, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.CODABAR,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ]);
    // TRY_HARDER also retries a 90° rotate inside 1D readers.
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    return {
      decodeCanvas: (canvas: HTMLCanvasElement) => {
        try {
          const source = new HTMLCanvasElementLuminanceSource(canvas);
          const bitmap = new BinaryBitmap(new HybridBinarizer(source));
          const result = reader.decodeWithState(bitmap);
          reader.reset();
          return result?.getText?.() || null;
        } catch {
          try {
            reader.reset();
          } catch {
            // ignore
          }
          return null;
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Scan frames at 0° / 90° / 180° / 270° so a barcode works whether the label
 * is held portrait or landscape (and upside-down).
 */
async function startOrientationAwareDecoder(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<Stopper> {
  const detector = await createNativeDetector();
  const zxing = await createZxingReader();
  if (!detector && !zxing) {
    throw new Error("No barcode decoder available");
  }

  // Pre-allocate orientation canvases (avoid creating DOM nodes every frame).
  const o0 = document.createElement("canvas");
  const o90 = document.createElement("canvas");
  const o180 = document.createElement("canvas");
  const o270 = document.createElement("canvas");
  const orientations = [o0, o90, o180, o270];

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Round-robin which angle we try first so landscape/portrait stay equally fast.
  let startAngle = 0;

  const decodeOne = async (canvas: HTMLCanvasElement): Promise<string | null> => {
    if (detector) {
      try {
        const codes = await detector.detect(canvas);
        const value = codes?.[0]?.rawValue;
        if (value) return String(value);
      } catch {
        // frame not ready
      }
    }
    if (zxing) return zxing.decodeCanvas(canvas);
    return null;
  };

  const tick = async () => {
    if (stopped) return;
    if (grabVideoFrame(video, o0)) {
      rotateCanvas90(o0, o90);
      rotateCanvas90(o90, o180);
      rotateCanvas90(o180, o270);

      for (let i = 0; i < 4; i++) {
        const canvas = orientations[(startAngle + i) % 4];
        const value = await decodeOne(canvas);
        if (value && !stopped) {
          onCode(value);
          break;
        }
      }
      startAngle = (startAngle + 1) % 4;
    }
    if (!stopped) timer = setTimeout(tick, 140);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/* ---------------- component ---------------- */

export function CameraBarcodeScanner({ open, onOpenChange, onDetected, title = "Scan barcodes" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopDecoderRef = useRef<Stopper | null>(null);
  const lastRef = useRef({ code: "", at: 0, anyAt: 0 });
  const busyRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [flash, setFlash] = useState<null | "ok" | "bad">(null);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => setMounted(true), []);

  const added = recent.filter((r) => r.ok).reduce((s, r) => s + r.count, 0);

  const handleCode = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    const now = Date.now();
    const l = lastRef.current;
    if (now - l.anyAt < ANY_CODE_GAP) return;
    if (code === l.code && now - l.at < SAME_CODE_GAP) return;
    lastRef.current = { code, at: now, anyAt: now };
    busyRef.current = true;
    // Beep as soon as the camera reads a barcode (like a handheld scanner),
    // before product lookup — so the cashier hears feedback instantly.
    beep(true);
    setFlash("ok");
    setTimeout(() => setFlash(null), 450);
    let outcome: ScanOutcome;
    try {
      outcome = await onDetectedRef.current(code);
    } catch (e: any) {
      outcome = { ok: false, message: e?.message || "Could not add this item" };
    } finally {
      busyRef.current = false;
      lastRef.current = { ...lastRef.current, at: Date.now(), anyAt: Date.now() };
    }
    if (!outcome.ok) {
      beep(false);
      setFlash("bad");
      setTimeout(() => setFlash(null), 450);
    }
    const label = outcome.ok ? outcome.name || code : outcome.message || "No product with this barcode";
    setLast({ ok: outcome.ok, text: outcome.ok ? `Added: ${label}` : `${label} (${code})` });
    setRecent((prev) => {
      const key = `${outcome.ok ? "ok" : "bad"}|${outcome.ok ? label : code}`;
      const found = prev.find((r) => r.key === key);
      if (found) {
        return [{ ...found, count: found.count + 1, at: Date.now() }, ...prev.filter((r) => r !== found)];
      }
      return [{ key, code, ok: outcome.ok, label, count: 1, at: Date.now() }, ...prev].slice(0, 30);
    });
  }, []);

  const stopAll = useCallback(() => {
    stopDecoderRef.current?.();
    stopDecoderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
  }, []);

  // Pause the camera while the app is in the background.
  useEffect(() => {
    if (!open) return;
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open]);

  // Fresh session each time it opens — also unlock audio for the first beep.
  useEffect(() => {
    if (open) {
      primeScannerAudio();
      setRecent([]);
      setLast(null);
      setPaused(false);
      lastRef.current = { code: "", at: 0, anyAt: 0 };
    }
  }, [open]);

  // Lock page scroll behind the scanner.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Start / restart the camera.
  useEffect(() => {
    if (!open || paused || hidden) {
      stopAll();
      return;
    }
    let cancelled = false;
    setStatus("starting");
    setError("");

    (async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setStatus("error");
        setError("The camera only works on the secure (https) address of the POS.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("This browser cannot open the camera. Use Chrome on Android or Safari on iPhone.");
        return;
      }
      const deviceId = cameraIndex != null ? cameras[cameraIndex]?.deviceId : undefined;
      const video: MediaTrackConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        const name = e?.name || "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access is blocked. Allow the camera for this site in your browser settings, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this device."
              : name === "NotReadableError"
                ? "The camera is being used by another app. Close it and try again."
                : "Could not open the camera.",
        );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        const caps: any = track?.getCapabilities?.() ?? {};
        setTorchSupported(!!caps.torch);
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => undefined);
        }
      } catch {
        setTorchSupported(false);
      }

      const el = videoRef.current;
      if (!el) return;
      el.srcObject = stream;
      el.setAttribute("playsinline", "true");
      el.muted = true;
      try {
        await el.play();
      } catch {
        // autoplay hiccup; the decoder still reads frames once it plays
      }
      if (cancelled) return;

      // Labels are only filled in after permission is granted.
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (cancelled) return;
          const cams = list.filter((d) => d.kind === "videoinput");
          setCameras(cams);
          if (cameraIndex == null && track) {
            const current = track.getSettings?.().deviceId;
            const idx = cams.findIndex((c) => c.deviceId === current);
            if (idx >= 0) setCameraIndex(idx);
          }
        })
        .catch(() => undefined);

      try {
        const stop = await startOrientationAwareDecoder(el, (c) => void handleCode(c));
        if (cancelled) {
          stop();
          return;
        }
        stopDecoderRef.current = stop;
        setStatus("live");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError("The barcode reader could not start on this device.");
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
    // cameras is read for the chosen deviceId only; switching sets cameraIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, hidden, cameraIndex, handleCode, stopAll]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    setCameraIndex((i) => ((i ?? 0) + 1) % cameras.length);
  };

  const close = () => {
    stopAll();
    onOpenChange(false);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={() => primeScannerAudio()}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">{title}</p>
          <p className="text-xs text-white/60">Any angle — portrait or landscape</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-300">
            {added} added
          </span>
          <button
            type="button"
            onClick={close}
            className="flex h-10 items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-black active:scale-95"
          >
            <X className="h-4 w-4" />
            Done
          </button>
        </div>
      </div>

      {/* camera */}
      <div className="relative mx-auto w-full max-w-xl flex-1 overflow-hidden bg-black">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />

        {status !== "error" && !paused && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                // Near-square guide so both landscape and portrait labels fit.
                "relative h-[42%] max-h-64 w-[78%] max-w-sm rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors duration-150",
                flash === "ok" && "bg-emerald-400/25",
                flash === "bad" && "bg-red-500/25",
              )}
            >
              {/* corners */}
              {[
                "left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl",
                "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl",
                "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl",
                "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl",
              ].map((c) => (
                <span
                  key={c}
                  className={cn(
                    "absolute h-8 w-8",
                    c,
                    flash === "ok" ? "border-emerald-400" : flash === "bad" ? "border-red-500" : "border-white",
                  )}
                />
              ))}
              {status === "live" && (
                <span className="absolute left-3 right-3 top-1/2 h-0.5 animate-pulse rounded bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
              )}
            </div>
          </div>
        )}

        {status === "starting" && !paused && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="rounded-full bg-black/60 px-4 py-2 text-sm">Opening camera…</p>
          </div>
        )}

        {paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
            <Pause className="h-10 w-10 text-white/70" />
            <p className="text-sm text-white/80">Scanning paused</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <CameraOff className="h-12 w-12 text-white/60" />
            <p className="max-w-xs text-sm text-white/90">{error}</p>
            <button
              type="button"
              onClick={() => {
                setPaused(true);
                setTimeout(() => setPaused(false), 50);
              }}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
            >
              Try again
            </button>
          </div>
        )}

        {last && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
            <div
              className={cn(
                "flex max-w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg",
                last.ok ? "bg-emerald-500 text-white" : "bg-red-600 text-white",
              )}
            >
              {last.ok ? <CircleCheck className="h-5 w-5 shrink-0" /> : <CircleX className="h-5 w-5 shrink-0" />}
              <span className="truncate">{last.text}</span>
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-3">
        {torchSupported && status === "live" && (
          <button
            type="button"
            onClick={toggleTorch}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              torchOn ? "bg-amber-400 text-black" : "bg-white/15 text-white",
            )}
            aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="flex h-12 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold"
        >
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          {paused ? "Resume" : "Pause"}
        </button>
        {cameras.length > 1 && (
          <button
            type="button"
            onClick={switchCamera}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15"
            aria-label="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* this session */}
      <div className="max-h-[28dvh] overflow-y-auto border-t border-white/10 bg-zinc-950 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {recent.length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-sm text-white/50">
            <ScanBarcode className="h-4 w-4" />
            Hold a barcode inside the box — any orientation is fine.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {recent.map((r) => (
              <li key={r.key} className="flex items-center gap-3 py-2 text-sm">
                {r.ok ? (
                  <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <CircleX className="h-4 w-4 shrink-0 text-red-400" />
                )}
                <span className={cn("min-w-0 flex-1 truncate", !r.ok && "text-red-300")}>
                  {r.ok ? r.label : `Not found: ${r.code}`}
                </span>
                {r.count > 1 && <span className="shrink-0 font-semibold tabular-nums text-white/70">×{r.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
