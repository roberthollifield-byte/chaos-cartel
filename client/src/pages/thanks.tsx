import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Zap } from "lucide-react";
import { Shell } from "@/components/brand/Shell";

export default function ThanksPage() {
  // Read query from hash: window.location.hash = '#/thanks?type=...&preview=1'
  const hashSearch = typeof window !== "undefined"
    ? (window.location.hash.split("?")[1] || "")
    : "";
  const params = new URLSearchParams(hashSearch);
  const type = params.get("type") || "registration";
  const isPreview = params.get("preview") === "1";
  const [status, setStatus] = useState<"pending"|"paid"|"error">("pending");

  useEffect(() => {
    // Since we redirect from Stripe with our own success_url (not Stripe session_id),
    // we don't have a session id here. Payment status is set by the webhook OR by
    // the /api/verify endpoint if you retain the session id client-side.
    setStatus("paid");
  }, []);

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
            : "Your registration is confirmed. Check your inbox for the receipt and event details. Show up early, tech starts on time."}
        </p>
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
