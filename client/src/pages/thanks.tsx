import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Zap, Package } from "lucide-react";
import QRCode from "qrcode";
import { Shell } from "@/components/brand/Shell";
import { clearCart } from "@/lib/cart";

interface OrderInfo {
  id: number;
  firstName: string;
  lastNameInitial: string;
  subtotalCents: number;
  shippingCents: number;
  amountPaidCents: number;
  itemCount: number;
  paymentStatus: string;
  items: Array<{ productName: string; productSlug: string; size: string | null; quantity: number; unitPriceCents: number }>;
}

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
  const [order, setOrder] = useState<OrderInfo | null>(null);

  // On a successful merch return, clear the local cart once.
  useEffect(() => {
    if (type === "merch" && regId) clearCart();
  }, [type, regId]);

  // Load merch order details (line items + totals) for the receipt view.
  useEffect(() => {
    if (type !== "merch" || !regId) return;
    let cancelled = false;
    async function load() {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`/api/orders/${regId}`);
          if (res.ok) {
            const data: OrderInfo = await res.json();
            if (!cancelled) setOrder(data);
            return;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1200));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [regId, type]);

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

        {type === "merch" && order && order.items.length > 0 && (
          <div className="mt-10 mx-auto max-w-md text-left rounded-2xl border-2 border-cc-lime/50 bg-card/80 p-5 glow-lime">
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} className="text-cc-lime"/>
              <p className="font-display font-extrabold text-lg italic text-cc-lime">ORDER #{order.id}</p>
            </div>
            <ul className="divide-y divide-cc-purple/30">
              {order.items.map((it, idx) => (
                <li key={idx} className="py-2 flex justify-between text-sm">
                  <span className="text-foreground/90">
                    {it.quantity}× {it.productName}
                    {it.size ? <span className="text-cc-cyan"> · {it.size}</span> : null}
                  </span>
                  <span className="font-mono text-foreground/80">${(it.unitPriceCents * it.quantity / 100).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t border-cc-purple/30 space-y-1 text-sm">
              <div className="flex justify-between text-foreground/70">
                <span>Subtotal</span><span>${(order.subtotalCents/100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-foreground/70">
                <span>Shipping</span><span>${(order.shippingCents/100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 mt-1 border-t border-cc-purple/30">
                <span className="font-display font-bold">TOTAL PAID</span>
                <span className="font-display font-extrabold text-cc-lime">${(order.amountPaidCents/100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

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
