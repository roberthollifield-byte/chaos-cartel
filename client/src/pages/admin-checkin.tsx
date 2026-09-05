import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import jsQR from "jsqr";
import { Camera, CheckCircle2, XCircle, AlertTriangle, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { Shell } from "@/components/brand/Shell";

interface CheckinResult {
  ok: boolean;
  reason?: string;
  message: string;
  registration?: { id: number; firstName: string; lastName: string; ticketType: string; checkedInAt?: number | null };
  checkedInAt?: number | null;
  checkedInBy?: string | null;
}

type Mode = "idle" | "scanning" | "processing" | "result";

export default function AdminCheckinPage() {
  const [authState, setAuthState] = useState<"checking" | "ok" | "unauthenticated">("checking");
  const [mode, setMode] = useState<Mode>("idle");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);

  // Auth check + auto-scan a code from the URL (?code=...)
  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.isAdmin) setAuthState("ok");
      else setAuthState("unauthenticated");
    }).catch(() => setAuthState("unauthenticated"));
  }, []);

  useEffect(() => {
    if (authState !== "ok") return;
    const hashSearch = window.location.hash.split("?")[1] || "";
    const p = new URLSearchParams(hashSearch);
    const code = p.get("code");
    if (code) {
      submitCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setCameraError(null);
    setResult(null);
    setError(null);
    setMode("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        loop();
      }
    } catch (err: any) {
      setCameraError(err?.message || "Could not access camera. Check browser permissions.");
      setMode("idle");
    }
  }

  function loop() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        // Parse the URL-encoded ticket URL (which looks like https://.../#/admin/checkin?code=CC-XXXX-YYYY)
        // We accept either the full URL or a raw code
        const parsed = parseTicketPayload(code.data);
        if (parsed) {
          // Debounce: don't rescan the same code within 3 seconds
          const now = Date.now();
          if (lastScannedRef.current === parsed && now - lastScannedAtRef.current < 3000) {
            // Still scanning same code — keep looping
          } else {
            lastScannedRef.current = parsed;
            lastScannedAtRef.current = now;
            stopCamera();
            submitCode(parsed);
            return;
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function parseTicketPayload(raw: string): string | null {
    const s = raw.trim();
    // Try to extract a code=... param from any URL
    const m = s.match(/[?&]code=([^&#\s]+)/i);
    if (m) return decodeURIComponent(m[1]).toUpperCase();
    // Otherwise treat as a raw code if it matches our shape
    if (/^CC-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(s)) return s.toUpperCase();
    return null;
  }

  async function submitCode(code: string) {
    setMode("processing");
    setError(null);
    try {
      const res = await fetch(`/api/admin/checkin/${encodeURIComponent(code)}`, { method: "POST" });
      if (res.status === 401) {
        setAuthState("unauthenticated");
        setMode("idle");
        return;
      }
      const data: CheckinResult = await res.json();
      setResult(data);
      setMode("result");
      // Haptic feedback (mobile)
      if ("vibrate" in navigator) navigator.vibrate(data.ok ? [80] : [40, 40, 40]);
    } catch (err: any) {
      setError(err?.message || "Network error");
      setMode("idle");
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setManualCode("");
    setMode("idle");
    lastScannedRef.current = null;
    stopCamera();
  }

  async function undoLast() {
    if (!result?.registration) return;
    const code = result.registration && (result as any).registration.confirmationCode
      ? (result as any).registration.confirmationCode
      : null;
    // We didn't return code on the ok response — look up by name isn't safe. Use last scanned.
    const scanned = lastScannedRef.current;
    if (!scanned) return;
    if (!confirm(`Undo check-in for ${result.registration.firstName} ${result.registration.lastName}?`)) return;
    await fetch(`/api/admin/checkin/${encodeURIComponent(scanned)}/undo`, { method: "POST" });
    reset();
  }

  if (authState === "checking") {
    return <Shell><div className="mx-auto max-w-lg py-24 text-center text-foreground/60">Checking session...</div></Shell>;
  }

  if (authState === "unauthenticated") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg py-24 text-center">
          <p className="text-foreground/70 mb-6">Admin login required to check in tickets.</p>
          <Link href="/admin" className="inline-block px-6 py-3 rounded-md btn-neon-lime">GO TO ADMIN LOGIN</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin" className="text-sm text-foreground/60 hover:text-cc-cyan inline-flex items-center gap-1"><ArrowLeft size={16} /> Admin</Link>
          <div className="font-mono text-xs tracking-widest text-cc-cyan">// GATE CHECK-IN</div>
        </div>

        <h1 className="font-display font-extrabold text-4xl italic text-cc-lime text-shadow-neon-lime cc-skew mb-6">SCAN TICKET</h1>

        {/* Result panel */}
        {mode === "result" && result && (
          <div className={`rounded-2xl p-6 mb-6 border-2 ${resultClass(result)}`}>
            <div className="flex items-center gap-3 mb-3">
              {result.ok ? <CheckCircle2 size={48} className="text-cc-lime" /> :
                result.reason === "already_checked_in" ? <AlertTriangle size={48} className="text-cc-magenta" /> :
                <XCircle size={48} className="text-red-500" />}
              <div>
                <div className={`font-display font-extrabold text-2xl italic ${result.ok ? "text-cc-lime" : result.reason === "already_checked_in" ? "text-cc-magenta" : "text-red-400"}`}>
                  {result.ok ? "CHECKED IN" : result.reason === "already_checked_in" ? "ALREADY CHECKED IN" : "REJECTED"}
                </div>
                <div className="text-sm text-foreground/70">{result.message}</div>
              </div>
            </div>
            {result.registration && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-3xl font-bold">{result.registration.firstName} {result.registration.lastName}</div>
                <div className="mt-2 font-mono text-xs tracking-widest text-cc-cyan">// {ticketLabel(result.registration.ticketType)}</div>
                {result.reason === "already_checked_in" && result.checkedInAt && (
                  <div className="mt-3 text-sm text-foreground/60">
                    Checked in at {new Date(result.checkedInAt * 1000).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })}
                    {result.checkedInBy ? ` by ${result.checkedInBy}` : ""}
                  </div>
                )}
              </div>
            )}
            <div className="mt-6 flex gap-3 flex-wrap">
              <button onClick={reset} className="px-5 py-3 rounded-md btn-neon-lime inline-flex items-center gap-2"><RefreshCw size={16} /> SCAN NEXT</button>
              {result.ok && (
                <button onClick={undoLast} className="px-5 py-3 rounded-md text-sm text-foreground/60 border border-white/10 hover:text-cc-magenta">Undo</button>
              )}
            </div>
          </div>
        )}

        {/* Idle: buttons to start */}
        {(mode === "idle" || mode === "scanning" || mode === "processing") && (
          <>
            {mode === "scanning" ? (
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-cc-lime/50 aspect-square max-w-md mx-auto">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-8 border-2 border-cc-lime/70 rounded-xl pointer-events-none" />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-xs tracking-widest text-cc-lime bg-black/70 px-3 py-1 rounded">// AIM AT QR CODE</div>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-white/10 p-10 text-center max-w-md mx-auto">
                {mode === "processing" ? (
                  <div className="inline-flex items-center gap-2 text-foreground/70"><Loader2 className="animate-spin" size={20} /> Checking in...</div>
                ) : (
                  <>
                    <Camera size={48} className="mx-auto text-cc-cyan mb-4" />
                    <p className="text-foreground/70 mb-4">Point your phone camera at the ticket QR code.</p>
                    <button onClick={startCamera} className="px-6 py-3 rounded-md btn-neon-lime">START CAMERA</button>
                    {cameraError && <div className="mt-4 text-sm text-red-400">{cameraError}</div>}
                  </>
                )}
              </div>
            )}

            {mode === "scanning" && (
              <div className="text-center mt-3">
                <button onClick={() => { stopCamera(); setMode("idle"); }} className="text-sm text-foreground/60 hover:text-cc-magenta">Cancel</button>
              </div>
            )}

            {/* Manual code entry */}
            <div className="mt-8 max-w-md mx-auto">
              <div className="font-mono text-xs tracking-widest text-foreground/40 mb-2">// OR ENTER CODE MANUALLY</div>
              <form onSubmit={e => { e.preventDefault(); if (manualCode.trim()) submitCode(manualCode.trim().toUpperCase()); }} className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value.toUpperCase())}
                  placeholder="CC-XXXX-YYYY"
                  className="flex-1 rounded-md bg-black/50 border border-white/10 px-4 py-3 font-mono tracking-widest text-white placeholder:text-white/30 focus:outline-none focus:border-cc-cyan"
                  data-testid="input-manual-code"
                />
                <button type="submit" className="px-5 py-3 rounded-md btn-neon-outline-cyan">CHECK IN</button>
              </form>
            </div>

            {error && <div className="mt-4 max-w-md mx-auto text-sm text-red-400 text-center">{error}</div>}
          </>
        )}
      </section>
    </Shell>
  );
}

function resultClass(r: CheckinResult): string {
  if (r.ok) return "border-cc-lime/60 bg-cc-lime/5";
  if (r.reason === "already_checked_in") return "border-cc-magenta/60 bg-cc-magenta/5";
  return "border-red-500/60 bg-red-500/5";
}

function ticketLabel(t: string): string {
  if (t === "ride_along") return "RIDE-ALONG";
  return t.toUpperCase();
}
