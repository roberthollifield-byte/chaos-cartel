import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Zap } from "lucide-react";
import QRCode from "qrcode";
import { Shell } from "@/components/brand/Shell";

interface RegistrationInfo {
  id: number;
  firstName: string;
  lastName: string;
  ticketType: string;
  paymentStatus: string;
  confirmationCode: string | null;
  event: { title: string; subtitle: string | null; startsAt: number; location: string; venue: string | null } | null;
}

export default function ThanksPage() {
  const hashSearch = typeof window !== "undefined"
    ? (window.location.hash.split("?")[1] || "")
    : "";
  const params = new URLSearchParams(hashSearch);
  const type = params.get("type") || "registration";
  const isPreview = params.get("preview") === "1";
  const regId = params.get("id");
  const [reg, setReg] = useState<RegistrationInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (type !== "registration" || !regId) return;
    let cancelled = false;
    async function loadWithRetry() {
      // Poll a few times to give the webhook a moment to flip the status
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const res = await fetch(`/api/registration/${regId}`);
          if (!res.ok) throw new Error(String(res.status));
          const data: RegistrationInfo = await res.json();
          if (cancelled) return;
          setReg(data);
          if (data.confirmationCode) {
            const url = `${window.location.origin}/#/admin/checkin?code=${encodeURIComponent(data.confirmationCode)}`;
            const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
            if (!cancelled) setQrDataUrl(dataUrl);
            return;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    loadWithRetry();
    return () => { cancelled = true; };
  }, [regId, type]);

  const ticketLabel = reg?.ticketType === "ride_along" ? "RIDE-ALONG" : (reg?.ticketType || "").toUpperCase();

  return (
    <Shell>
      <section className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-24 text-center">
        <CheckCircle2 className="mx-auto text-cc-lime mb-6" size={72} />
        {isPreview && (
          <div className="mb-6 mx-auto max-w-md rounded-md border border-cc-magenta/50 bg-cc-magenta/10 px-4 py-3">
            <p className="font-mono text-xs tracking-widest text-cc-magenta">// PREVIEW MODE</p>
            <p className="text-sm text-foreground/85 mt-1">No charge was made. This is the site preview — real Stripe payments are enabled once you deploy to Railway with your STRIPE_SECRET_KEY.</p>
          </div>
        )}
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-3">// PAYMENT COMPLETE</p>
        <h1 className="font-display font-extrabold text-5xl md:text-6xl italic text-cc-lime text-shadow-neon-lime cc-skew">
          {type === "merch" ? "SEE YOU AT THE MAILBOX" : "SEE YOU AT THE TRACK"}
        </h1>
        <p className="mt-6 text-lg text-foreground/90">
          {type === "merch"
            ? "Your merch order is confirmed. We ship within 5 business days. Watch your inbox."
            : "Your registration is confirmed. A copy of your ticket is on the way to your inbox — but the QR below is your ticket. Save it or screenshot it."}
        </p>

        {type === "registration" && (
          <div className="mt-10">
            {qrDataUrl && reg?.confirmationCode ? (
              <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-lg">
                <div className="font-mono text-[10px] tracking-widest text-black/60 mb-2">// SHOW AT GATE</div>
                <img src={qrDataUrl} alt="Your ticket QR code" className="mx-auto w-64 h-64" />
                <div className="mt-4 font-mono text-lg tracking-widest text-black font-bold">{reg.confirmationCode}</div>
                {reg && (
                  <div className="mt-3 text-sm text-black/80">
                    <div className="font-bold">{reg.firstName} {reg.lastName}</div>
                    <div className="uppercase tracking-widest text-xs text-black/60 mt-1">{ticketLabel}</div>
                    {reg.event && (
                      <div className="mt-2 text-xs text-black/60">
                        {reg.event.title}{reg.event.subtitle ? ` — ${reg.event.subtitle}` : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-sm rounded-2xl border border-white/10 p-6 text-sm text-foreground/60">
                <div className="animate-pulse">Generating your ticket...</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link
            href="/sessions"
            data-testid="link-more-sessions"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-md btn-neon-lime"
          >
            <Zap size={20} className="fill-black" /> BOOK ANOTHER SESSION
          </Link>
          <Link href="/" className="inline-block px-7 py-4 rounded-md btn-neon-outline-cyan">
            BACK TO HOME
          </Link>
        </div>
      </section>
    </Shell>
  );
}
