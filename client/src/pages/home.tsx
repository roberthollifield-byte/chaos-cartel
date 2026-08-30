import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, Calendar, Clock, Cone, Circle } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import { Marquee } from "@/components/brand/Marquee";
import heroImg from "@/assets/hero-drift-car.jpg";
import type { EventAvailability } from "@shared/schema";

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function formatTimeRange(start: number, end: number) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  return `${new Date(start * 1000).toLocaleTimeString("en-US", opts)} — ${new Date(end * 1000).toLocaleTimeString("en-US", opts)}`;
}

export default function HomePage() {
  const { data: events, isLoading } = useQuery<EventAvailability[]>({ queryKey: ["/api/events"] });
  const upcoming = (events || []).slice(0, 3);

  return (
    <Shell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Corner checker accents */}
        <div className="absolute top-4 right-4 w-24 h-24 checkered opacity-70 hidden md:block" aria-hidden />
        <div className="absolute bottom-4 left-4 w-20 h-20 checkered-magenta opacity-50 hidden md:block" aria-hidden />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-20 md:pt-20 md:pb-28 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4" data-testid="text-tagline">
              // FC CREW DRIFT PRACTICE — FOREST CITY, NC
            </p>
            <h1 className="font-display font-extrabold text-5xl sm:text-7xl lg:text-8xl italic leading-[0.85]">
              <span className="block text-cc-lime text-shadow-neon-lime cc-skew">SLIDE.</span>
              <span className="block text-cc-magenta text-shadow-neon-magenta cc-skew">SEND IT.</span>
              <span className="block text-cc-cyan text-shadow-neon-cyan cc-skew">REPEAT.</span>
            </h1>
            <p className="mt-8 max-w-lg text-lg text-foreground/90" data-testid="text-hero-desc">
              FC CREW brings you underground drift practice at the track in Forest City, North Carolina.
              Drivers, ride-alongs, spectators — book your slot, sign the waiver, come slide.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/sessions"
                data-testid="button-register-practice"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-md btn-neon-lime"
              >
                <Zap size={20} className="fill-black" /> REGISTER FOR PRACTICE
              </Link>
              <Link
                href="/sessions"
                data-testid="button-view-schedule"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-md btn-neon-outline-cyan"
              >
                VIEW SCHEDULE
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden border-2 border-cc-purple/60 glow-magenta">
              <img
                src={heroImg}
                alt="Neon drift car sending it sideways"
                className="w-full h-auto"
                data-testid="img-hero"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SESSION CARDS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display font-extrabold text-4xl md:text-5xl italic text-cc-lime cc-skew">
              <span className="slash-under">UPCOMING SESSIONS</span>
            </h2>
            <p className="mt-3 text-muted-foreground">Book a driver slot, ride-along, or spectator entry.</p>
          </div>
          <Link
            href="/sessions"
            className="font-display font-bold tracking-widest text-cc-cyan hover:text-cc-lime"
            data-testid="link-all-sessions"
          >
            ALL SESSIONS →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading && [1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cc-purple/40 bg-card p-6 h-72 animate-pulse" />
          ))}
          {upcoming.map((e, i) => (
            <SessionCard key={e.id} event={e} accent={["lime","magenta","cyan"][i % 3] as any} />
          ))}
          {!isLoading && upcoming.length === 0 && (
            <div className="col-span-full p-10 rounded-2xl border border-dashed border-cc-purple/40 text-center text-muted-foreground">
              No sessions on the calendar yet. Check back soon.
            </div>
          )}
        </div>
      </section>

      <div className="mt-14">
        <Marquee items={[
          "FC CREW DRIFT PRACTICE",
          "FOREST CITY, NC",
          "DRIVER & SPECTATOR ENTRY",
          "SLIDE SAFE, SEND HARD",
          "CHAOS CARTEL",
        ]} />
      </div>

      {/* WHY CHAOS CARTEL */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid gap-10 lg:grid-cols-3">
          {[
            { icon: Cone, title: "REAL TRACK TIME", color: "cc-lime", text: "Not a parking lot. A proper skid pad with cones, walls, and space to actually push." },
            { icon: Circle, title: "OPEN TO ALL LEVELS", color: "cc-magenta", text: "First timer? Grab a ride-along. Been sliding for years? Book a driver slot." },
            { icon: Zap, title: "COACHED WHEN YOU NEED IT", color: "cc-cyan", text: "FC Crew veterans on-site to coach beginners through initiation, transitions, and line." },
          ].map((f, i) => (
            <div
              key={i}
              className="p-8 rounded-2xl border-2 border-cc-purple/50 bg-card/60 backdrop-blur-sm hover:border-cc-lime/70 transition-all"
              data-testid={`card-feature-${i}`}
            >
              <div className={`inline-flex p-3 rounded-lg mb-5 text-${f.color}`}
                   style={{ background: `hsl(var(--${f.color}) / 0.12)` }}>
                <f.icon size={28} />
              </div>
              <h3 className="font-display font-extrabold text-2xl italic mb-3">{f.title}</h3>
              <p className="text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function SessionCard({ event, accent }: { event: EventAvailability; accent: "lime"|"magenta"|"cyan" }) {
  const accentClass = { lime: "text-cc-lime", magenta: "text-cc-magenta", cyan: "text-cc-cyan" }[accent];
  const borderClass = { lime: "border-cc-lime/60", magenta: "border-cc-magenta/60", cyan: "border-cc-cyan/60" }[accent];
  const price = (event.driverPriceCents / 100).toFixed(0);
  const status =
    event.driverRemaining === 0 ? "SOLD OUT" :
    event.driverRemaining <= 4 ? "LIMITED SPOTS" : "SPOTS AVAILABLE";
  const statusColor = event.driverRemaining === 0 ? "bg-destructive text-white" : "bg-cc-lime text-black";
  return (
    <div className={`relative rounded-2xl border-2 ${borderClass} bg-card p-6 hover:-translate-y-1 transition-transform`}
         data-testid={`card-session-${event.slug}`}>
      <div className="absolute -top-3 right-4 px-3 py-1 text-[10px] font-display font-extrabold tracking-widest rounded rotate-2" style={{ background: "hsl(74 92% 55%)", color: "hsl(240 12% 4%)" }}>
        {status}
      </div>
      <div className="flex items-start gap-4">
        <Cone className={accentClass} size={44} strokeWidth={2} />
        <div className="flex-1">
          <div className="text-xs font-mono tracking-widest text-muted-foreground">{event.title}</div>
          <h3 className="font-display font-extrabold text-2xl italic mt-0.5">{event.subtitle || event.title}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar size={16} className="text-cc-cyan" /> {formatDate(event.startsAt)}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock size={16} className="text-cc-cyan" /> {formatTimeRange(event.startsAt, event.endsAt)}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div>
          <div className={`font-display font-extrabold text-3xl italic ${accentClass}`}>${price}</div>
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground">DRIVER ENTRY</div>
        </div>
        <Link
          href={`/sessions/${event.slug}`}
          data-testid={`button-register-${event.slug}`}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md btn-neon-lime text-sm"
        >
          REGISTER →
        </Link>
      </div>
    </div>
  );
}
