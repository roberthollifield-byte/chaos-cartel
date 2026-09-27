import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import { SpectatorWaiverText } from "@/components/spectator-waiver-text";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TRACK_ADDRESS_LINE1, TRACK_ADDRESS_LINE2, TRACK_MAPS_URL } from "@shared/venue";

interface WaiverInfo {
  plusOneName: string | null;
  driverName: string;
  signedAt: number | null;
  signatureName: string | null;
  event: { title: string; subtitle: string | null; startsAt: number; endsAt: number; venue: string | null; location: string } | null;
}

const TZ = "America/New_York";
const fmtDate = (u: number) => new Date(u * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: TZ });
const fmtTime = (u: number) => new Date(u * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });

export default function PlusOneWaiverPage() {
  const { token } = useParams();
  const queryKey = [`/api/plus-one-waiver/${token}`];
  const { data, isLoading, isError } = useQuery<WaiverInfo>({ queryKey, retry: false });
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/plus-one-waiver/${token}`, { signatureName: name.trim(), agreed: true })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: any) => setError(e?.message || "Could not sign. Please try again."),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Type your full legal name to sign.");
    if (!agreed) return setError("Check the box to agree to the waiver.");
    sign.mutate();
  }

  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14">
        {isLoading && <div className="h-80 rounded-2xl bg-card animate-pulse" />}

        {isError && (
          <div className="text-center py-16">
            <AlertTriangle size={40} className="mx-auto text-cc-magenta mb-4" />
            <h1 className="font-display text-3xl mb-2">Waiver link not found</h1>
            <p className="text-muted-foreground">Double-check the link in your email, or ask your driver to contact Chaos Cartel.</p>
          </div>
        )}

        {data && (
          <>
            <p className="font-mono text-xs tracking-widest text-cc-cyan mb-3">// PLUS 1 WAIVER</p>
            <h1 className="font-display font-extrabold text-4xl md:text-6xl italic text-cc-lime text-shadow-neon-lime cc-skew leading-none">
              {data.plusOneName ? `${data.plusOneName.split(" ")[0]}, sign your waiver` : "Sign your waiver"}
            </h1>
            <p className="mt-5 text-lg text-foreground/90">
              {data.driverName} is bringing you as their plus 1. You must sign this waiver before you can be admitted at the gate.
            </p>

            {data.event && (
              <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm">
                <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
                  <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><Calendar size={14} /> DATE</div>
                  <div>{fmtDate(data.event.startsAt)}</div>
                </div>
                <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
                  <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><Clock size={14} /> TIME</div>
                  <div>{fmtTime(data.event.startsAt)} — {fmtTime(data.event.endsAt)}</div>
                </div>
                <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
                  <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><MapPin size={14} /> LOCATION</div>
                  <div>{TRACK_ADDRESS_LINE1}, {TRACK_ADDRESS_LINE2}</div>
                  <a href={TRACK_MAPS_URL} target="_blank" rel="noreferrer" className="text-cc-lime underline text-xs">Get directions</a>
                </div>
              </div>
            )}

            {data.signedAt ? (
              <div className="mt-10 p-6 rounded-2xl border-2 border-cc-lime/60 bg-cc-lime/5" data-testid="waiver-signed">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={40} className="text-cc-lime" />
                  <div>
                    <div className="font-display font-extrabold text-2xl italic text-cc-lime">WAIVER SIGNED</div>
                    <div className="text-sm text-muted-foreground">
                      Signed by {data.signatureName} on {fmtDate(data.signedAt)}. You're good to go. Arrive with {data.driverName.split(" ")[0]} and give your name at the gate.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-10 p-6 rounded-2xl border border-cc-purple/40 bg-card/60" data-testid="form-plus-one-waiver">
                <h2 className="font-display font-extrabold text-2xl italic text-cc-magenta cc-skew mb-4 flex items-center gap-2">
                  <AlertTriangle size={18} /> SPECTATOR WAIVER
                </h2>
                <SpectatorWaiverText />
                <p className="mt-3 text-xs text-muted-foreground">If the plus 1 is under 18, a parent or guardian must sign below on their behalf.</p>
                <div className="mt-5">
                  <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">TYPE YOUR FULL LEGAL NAME TO SIGN</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 text-foreground focus:border-cc-lime focus:outline-none"
                    data-testid="input-plus-one-signature"
                  />
                  <div className="mt-1 text-xs font-mono tracking-widest text-muted-foreground">SIGNED {new Date().toLocaleDateString("en-US", { timeZone: TZ })}</div>
                </div>
                <label className="flex items-start gap-3 mt-4 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(74_92%_55%)]" data-testid="checkbox-plus-one-agree" />
                  <span className="text-sm">I have read, understood, and agree to the waiver above.</span>
                </label>
                {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
                <div className="mt-6 flex justify-end">
                  <button type="submit" disabled={sign.isPending} className="px-8 py-4 rounded-md btn-neon-lime inline-flex items-center gap-2" data-testid="button-sign-waiver">
                    {sign.isPending && <Loader2 size={18} className="animate-spin" />} SIGN WAIVER
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </Shell>
  );
}
