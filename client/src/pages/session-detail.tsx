import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, AlertTriangle, Wrench, ArrowLeft } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EventAvailability } from "@shared/schema";

type TicketType = "driver" | "ride_along" | "spectator";

function fmtDate(u: number) {
  return new Date(u * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtTime(u: number) {
  return new Date(u * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

const TICKET_META: Record<TicketType, { label: string; color: string; needsWaiver: boolean; description: string }> = {
  driver: {
    label: "DRIVER ENTRY",
    color: "cc-lime",
    needsWaiver: true,
    description: "Full-day track access. Bring your car, your helmet, and your line. Includes tech inspection and coaching if needed.",
  },
  ride_along: {
    label: "RIDE-ALONG",
    color: "cc-magenta",
    needsWaiver: true,
    description: "Ride shotgun with a Chaos Cartel driver. First-come first-served at the pit. Requires a signed disclaimer waiver.",
  },
  spectator: {
    label: "SPECTATOR",
    color: "cc-cyan",
    needsWaiver: false,
    description: "Bring a chair, bring earplugs. Watch the crew get sideways all day.",
  },
};

export default function SessionDetailPage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [ticketType, setTicketType] = useState<TicketType>("driver");
  const [showForm, setShowForm] = useState(false);

  const { data: event, isLoading } = useQuery<EventAvailability>({
    queryKey: ["/api/events", slug],
  });

  const bookMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/bookings", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (err: any) => {
      toast({ title: "Booking failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading || !event) {
    return <Shell><div className="mx-auto max-w-7xl px-6 py-24"><div className="h-96 rounded-2xl bg-card animate-pulse" /></div></Shell>;
  }

  const meta = TICKET_META[ticketType];
  const remaining =
    ticketType === "driver" ? event.driverRemaining :
    ticketType === "ride_along" ? event.rideAlongRemaining : event.spectatorRemaining;
  const priceCents =
    ticketType === "driver" ? event.driverPriceCents :
    ticketType === "ride_along" ? event.rideAlongPriceCents : event.spectatorPriceCents;

  return (
    <Shell>
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14">
        <button
          onClick={() => setLocation("/sessions")}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-cc-lime mb-6"
          data-testid="button-back-sessions"
        >
          <ArrowLeft size={18} /> All sessions
        </button>

        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-3">// {event.title}</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-lime text-shadow-neon-lime cc-skew leading-none">
          {event.subtitle || event.title}
        </h1>

        <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm">
          <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
            <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><Calendar size={14} /> DATE</div>
            <div className="text-foreground">{fmtDate(event.startsAt)}</div>
          </div>
          <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
            <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><Clock size={14} /> TIME</div>
            <div className="text-foreground">{fmtTime(event.startsAt)} — {fmtTime(event.endsAt)}</div>
          </div>
          <div className="p-4 rounded-lg border border-cc-purple/40 bg-card">
            <div className="flex items-center gap-2 text-cc-cyan font-mono text-xs tracking-widest mb-1"><MapPin size={14} /> LOCATION</div>
            <div className="text-foreground">{event.venue || event.location}</div>
          </div>
        </div>

        {event.description && (
          <p className="mt-6 text-lg text-foreground/90">{event.description}</p>
        )}

        {/* Ticket type selector */}
        <div className="mt-12">
          <h2 className="font-display font-extrabold text-3xl italic text-cc-magenta text-shadow-neon-magenta cc-skew mb-6">
            <span className="slash-under">PICK YOUR ENTRY</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(["driver","ride_along","spectator"] as TicketType[]).map(t => {
              const m = TICKET_META[t];
              const price = t === "driver" ? event.driverPriceCents : t === "ride_along" ? event.rideAlongPriceCents : event.spectatorPriceCents;
              const rem = t === "driver" ? event.driverRemaining : t === "ride_along" ? event.rideAlongRemaining : event.spectatorRemaining;
              const isSelected = ticketType === t;
              const isSold = rem === 0;
              return (
                <button
                  key={t}
                  onClick={() => !isSold && setTicketType(t)}
                  disabled={isSold}
                  data-testid={`ticket-option-${t}`}
                  className={`text-left p-5 rounded-xl border-2 transition-all ${
                    isSold ? "border-muted bg-card/40 opacity-50 cursor-not-allowed" :
                    isSelected ? `border-${m.color} bg-${m.color}/10 glow-${m.color === 'cc-lime' ? 'lime' : m.color === 'cc-magenta' ? 'magenta' : 'cyan'}` :
                    "border-cc-purple/40 bg-card hover:border-cc-lime/50"
                  }`}
                >
                  <div className={`font-display font-extrabold text-lg italic text-${m.color} mb-1`}>{m.label}</div>
                  <div className={`font-display font-extrabold text-3xl italic text-${m.color}`}>${(price/100).toFixed(0)}</div>
                  <div className="text-xs font-mono tracking-widest text-muted-foreground mt-1">
                    {isSold ? "SOLD OUT" : `${rem} SPOTS LEFT`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 p-5 rounded-xl border border-cc-purple/40 bg-card/60">
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>

        {!showForm ? (
          <div className="mt-8 flex justify-end">
            <button
              onClick={() => setShowForm(true)}
              disabled={remaining === 0}
              data-testid="button-continue-registration"
              className={`px-8 py-4 rounded-md ${remaining === 0 ? "bg-muted text-muted-foreground cursor-not-allowed" : "btn-neon-lime"}`}
            >
              {remaining === 0 ? "SOLD OUT" : `CONTINUE — $${(priceCents/100).toFixed(0)} →`}
            </button>
          </div>
        ) : (
          <RegistrationForm
            event={event}
            ticketType={ticketType}
            priceCents={priceCents}
            onSubmit={(payload) => bookMutation.mutate(payload)}
            isSubmitting={bookMutation.isPending}
          />
        )}
      </section>
    </Shell>
  );
}

// -----------------------------------------------------------------------------
// Registration form
// -----------------------------------------------------------------------------

function RegistrationForm({
  event, ticketType, priceCents, onSubmit, isSubmitting,
}: {
  event: EventAvailability;
  ticketType: TicketType;
  priceCents: number;
  onSubmit: (payload: any) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<any>({
    firstName: "", lastName: "", email: "", phone: "",
    emergencyContactName: "", emergencyContactPhone: "",
    carYear: "", carMake: "", carModel: "", carColor: "",
    experienceLevel: "beginner",
    tires: false, brakes: false, seatbelt: false, battery: false, fluids: false, rollCageOrBar: false, helmet: false,
    waiverSignatureName: "", waiverAgreed: false, rideAlongWaiverAgreed: false,
    inviteCode: "",
  });
  const [errors, setErrors] = useState<Record<string,string>>({});

  const meta = TICKET_META[ticketType];
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  function validate() {
    const errs: Record<string,string> = {};
    if ((event as any).requiresInviteCode && !form.inviteCode.trim()) errs.inviteCode = "Invite code required";
    if (!form.firstName) errs.firstName = "Required";
    if (!form.lastName) errs.lastName = "Required";
    if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Valid email required";
    if (form.phone.length < 7) errs.phone = "Valid phone required";
    if (ticketType === "driver") {
      if (!form.carMake) errs.carMake = "Required";
      if (!form.carModel) errs.carModel = "Required";
      if (!form.experienceLevel) errs.experienceLevel = "Required";
      if (!(form.tires && form.brakes && form.seatbelt && form.battery && form.fluids && form.rollCageOrBar && form.helmet)) {
        errs.tech = "You must confirm every tech inspection item to drive.";
      }
    }
    if (meta.needsWaiver) {
      if (!form.waiverSignatureName) errs.waiverSignatureName = "Type your full name to sign";
      if (!form.waiverAgreed) errs.waiverAgreed = "You must agree to the waiver";
      if (ticketType === "ride_along" && !form.rideAlongWaiverAgreed) errs.rideAlongWaiverAgreed = "You must agree to the ride-along disclaimer";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: any = {
      eventId: event.id,
      ticketType,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
      waiverSignatureName: form.waiverSignatureName || form.firstName + " " + form.lastName,
      waiverAgreed: true,
      inviteCode: form.inviteCode?.trim() || undefined,
    };
    if (ticketType === "driver") {
      payload.carYear = form.carYear;
      payload.carMake = form.carMake;
      payload.carModel = form.carModel;
      payload.carColor = form.carColor;
      payload.experienceLevel = form.experienceLevel;
      payload.techInspection = {
        tires: form.tires, brakes: form.brakes, seatbelt: form.seatbelt,
        battery: form.battery, fluids: form.fluids, rollCageOrBar: form.rollCageOrBar, helmet: form.helmet,
      };
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-8" data-testid="form-registration">
      {(event as any).requiresInviteCode && (
        <FormSection title="INVITE CODE" accent="cc-magenta">
          <p className="text-sm text-muted-foreground mb-3">
            This is an invite-only event. Enter the code you were given by the crew.
          </p>
          <Field
            label="Invite code"
            value={form.inviteCode}
            onChange={v => set("inviteCode", v.toUpperCase())}
            error={errors.inviteCode}
            data-testid="input-inviteCode"
          />
        </FormSection>
      )}
      <FormSection title="YOUR INFO" accent="cc-lime">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" value={form.firstName} onChange={v=>set("firstName",v)} error={errors.firstName} data-testid="input-firstName" />
          <Field label="Last name" value={form.lastName} onChange={v=>set("lastName",v)} error={errors.lastName} data-testid="input-lastName" />
          <Field label="Email" type="email" value={form.email} onChange={v=>set("email",v)} error={errors.email} data-testid="input-email" />
          <Field label="Phone" value={form.phone} onChange={v=>set("phone",v)} error={errors.phone} data-testid="input-phone" />
          <Field label="Emergency contact — name" value={form.emergencyContactName} onChange={v=>set("emergencyContactName",v)} data-testid="input-emergency-name" />
          <Field label="Emergency contact — phone" value={form.emergencyContactPhone} onChange={v=>set("emergencyContactPhone",v)} data-testid="input-emergency-phone" />
        </div>
      </FormSection>

      {ticketType === "driver" && (
        <>
          <FormSection title="YOUR CAR" accent="cc-magenta">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Year" value={form.carYear} onChange={v=>set("carYear",v)} data-testid="input-carYear" />
              <Field label="Make" value={form.carMake} onChange={v=>set("carMake",v)} error={errors.carMake} data-testid="input-carMake" />
              <Field label="Model" value={form.carModel} onChange={v=>set("carModel",v)} error={errors.carModel} data-testid="input-carModel" />
              <Field label="Color" value={form.carColor} onChange={v=>set("carColor",v)} data-testid="input-carColor" />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-mono tracking-widest text-cc-cyan mb-2">EXPERIENCE LEVEL</label>
              <div className="flex flex-wrap gap-2">
                {["beginner","intermediate","advanced"].map(lvl => (
                  <button
                    type="button"
                    key={lvl}
                    onClick={()=>set("experienceLevel",lvl)}
                    data-testid={`experience-${lvl}`}
                    className={`px-4 py-2 rounded-md border-2 text-sm font-display tracking-widest uppercase transition-all ${
                      form.experienceLevel===lvl ? "border-cc-lime bg-cc-lime text-black" : "border-cc-purple/40 text-foreground hover:border-cc-lime/50"
                    }`}
                  >{lvl}</button>
                ))}
              </div>
            </div>
          </FormSection>

          <FormSection title="TECH INSPECTION" accent="cc-cyan" icon={<Wrench size={18} />}>
            <p className="text-sm text-muted-foreground mb-4">
              Confirm each item. You will be checked again at the track before you go out — but if anything on this list is a "no", don't come.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["tires","Tires with good tread & correct pressure"],
                ["brakes","Brakes working & fluid topped off"],
                ["seatbelt","Seatbelt or harness in good condition"],
                ["battery","Battery secured (not just sitting)"],
                ["fluids","No leaks (oil, coolant, fuel)"],
                ["rollCageOrBar","Roll cage or roll bar if convertible"],
                ["helmet","Snell/DOT-rated helmet"],
              ].map(([key,label]) => (
                <label key={key} className="flex items-start gap-3 p-3 rounded-lg border border-cc-purple/30 bg-card cursor-pointer hover:border-cc-lime/50">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={e => set(key, e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[hsl(74_92%_55%)]"
                    data-testid={`checkbox-${key}`}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            {errors.tech && <div className="mt-3 text-sm text-destructive flex items-center gap-2"><AlertTriangle size={16}/> {errors.tech}</div>}
          </FormSection>
        </>
      )}

      {meta.needsWaiver && (
        <FormSection title={ticketType === "ride_along" ? "RIDE-ALONG DISCLAIMER + WAIVER" : "LIABILITY WAIVER"} accent="cc-magenta" icon={<AlertTriangle size={18} />}>
          {ticketType === "ride_along" && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/15 border border-destructive/50 text-sm">
              <strong className="text-cc-hot-pink">Ride-Along Disclaimer.</strong> You are voluntarily riding in a
              vehicle that will be intentionally driven at the limit. You accept all inherent risks including
              collision, injury, and death. You confirm you are 18 or older (or have a legal guardian's signed
              consent) and will follow all crew instructions.
            </div>
          )}
          <div className="p-4 rounded-lg bg-card border border-cc-purple/30 max-h-56 overflow-y-auto text-sm text-muted-foreground space-y-2">
            <p><strong>ASSUMPTION OF RISK.</strong> Motorsport is dangerous. Drifting involves loss of traction, high-speed maneuvers, and proximity to walls, cones, and other vehicles. Damage to your vehicle, injury, and death are possible.</p>
            <p><strong>RELEASE.</strong> You release Chaos Cartel, FC Crew, the track owner, all crew and coaches, and other participants from any claim arising out of your participation, whether from negligence or otherwise, to the maximum extent permitted by law.</p>
            <p><strong>MEDICAL.</strong> You are physically fit to participate. You authorize emergency medical treatment if required.</p>
            <p><strong>MEDIA.</strong> Photos and video captured at the event may be used by Chaos Cartel for promotion.</p>
            <p><strong>CONDUCT.</strong> Alcohol and controlled substances are prohibited on-site until the day is called. Follow all flag/marshal instructions.</p>
            <p>By typing your name and checking below, you agree to this waiver as a legally binding electronic signature.</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Type your full legal name to sign"
              value={form.waiverSignatureName}
              onChange={v=>set("waiverSignatureName",v)}
              error={errors.waiverSignatureName}
              data-testid="input-waiverSignatureName"
            />
            <div className="text-xs font-mono tracking-widest text-muted-foreground self-end pb-3">
              SIGNED {new Date().toLocaleDateString()}
            </div>
          </div>
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.waiverAgreed}
              onChange={e => set("waiverAgreed", e.target.checked)}
              className="mt-1 h-4 w-4 accent-[hsl(74_92%_55%)]"
              data-testid="checkbox-waiverAgreed"
            />
            <span className="text-sm">I have read, understood, and agree to the waiver above.</span>
          </label>
          {errors.waiverAgreed && <div className="mt-1 text-sm text-destructive">{errors.waiverAgreed}</div>}
          {ticketType === "ride_along" && (
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.rideAlongWaiverAgreed}
                onChange={e => set("rideAlongWaiverAgreed", e.target.checked)}
                className="mt-1 h-4 w-4 accent-[hsl(320_95%_60%)]"
                data-testid="checkbox-rideAlongWaiverAgreed"
              />
              <span className="text-sm">I acknowledge the ride-along disclaimer above and accept the additional risk.</span>
            </label>
          )}
          {errors.rideAlongWaiverAgreed && <div className="mt-1 text-sm text-destructive">{errors.rideAlongWaiverAgreed}</div>}
        </FormSection>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-cc-purple/30">
        <div>
          <div className="text-xs font-mono tracking-widest text-muted-foreground">TOTAL DUE AT CHECKOUT</div>
          <div className="font-display font-extrabold text-4xl italic text-cc-lime text-shadow-neon-lime">
            ${(priceCents/100).toFixed(0)}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="button-submit-registration"
          className="btn-neon-lime px-8 py-4 rounded-md text-base disabled:opacity-60"
        >
          {isSubmitting ? "REDIRECTING…" : "PAY & CONFIRM →"}
        </button>
      </div>
    </form>
  );
}

function FormSection({ title, accent, icon, children }: { title: string; accent: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`p-6 rounded-2xl border-2 border-${accent}/40 bg-card/60`}>
      <h3 className={`font-display font-extrabold text-2xl italic text-${accent} mb-5 flex items-center gap-2 cc-skew`}>
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", error, ...rest }: any) {
  return (
    <div>
      <label className="block text-xs font-mono tracking-widest text-cc-cyan mb-1.5">{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-md bg-background border-2 border-cc-purple/40 text-foreground focus:border-cc-lime focus:outline-none transition-colors"
        {...rest}
      />
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
    </div>
  );
}
