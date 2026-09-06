import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import type { EventAvailability } from "@shared/schema";

function fmtDate(u: number) {
  return new Date(u * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(u: number) {
  return new Date(u * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function SessionsPage() {
  const { data: events, isLoading } = useQuery<EventAvailability[]>({ queryKey: ["/api/events"] });
  return (
    <Shell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4">// SCHEDULE</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-lime text-shadow-neon-lime cc-skew">
          <span className="slash-under">SESSIONS</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/90">
          Every session runs at our Forest City, NC track. Register early — driver spots go fast.
        </p>

        <div className="mt-12 grid gap-6">
          {isLoading && [1,2].map(i => (
            <div key={i} className="rounded-2xl border border-cc-purple/40 bg-card h-56 animate-pulse" />
          ))}
          {(events || []).map(e => (
            <SessionRow key={e.id} event={e} />
          ))}
          {!isLoading && (events || []).length === 0 && (
            <div className="p-10 rounded-2xl border border-dashed border-cc-purple/40 text-center text-muted-foreground">
              No sessions on the calendar right now. Follow @chaoscartel for the drop.
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function SessionRow({ event }: { event: EventAvailability }) {
  const soldOut = event.driverRemaining === 0 && event.rideAlongRemaining === 0 && event.spectatorRemaining === 0;
  return (
    <div
      className="rounded-2xl border-2 border-cc-purple/50 bg-card p-6 md:p-8 hover:border-cc-lime/60 transition-colors grid gap-6 md:grid-cols-[1fr_auto] items-center"
      data-testid={`row-session-${event.slug}`}
    >
      <div>
        <div className="text-xs font-mono tracking-widest text-cc-cyan mb-1">{event.title}</div>
        <h3 className="font-display font-extrabold text-3xl md:text-4xl italic text-foreground">
          {event.subtitle || event.title}
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar size={16} className="text-cc-lime" /> {fmtDate(event.startsAt)}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Clock size={16} className="text-cc-lime" /> {fmtTime(event.startsAt)} — {fmtTime(event.endsAt)}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={16} className="text-cc-lime" /> {event.venue || event.location}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Users size={16} className="text-cc-lime" /> {event.driverRemaining}/{event.driverSlots} driver spots left</div>
        </div>
        {event.description && <p className="mt-4 text-muted-foreground max-w-2xl">{event.description}</p>}
        <div className="mt-5 flex flex-wrap gap-3 text-xs font-mono">
          <span className="px-3 py-1.5 rounded-full bg-cc-lime/15 text-cc-lime border border-cc-lime/40">
            DRIVER ${(event.driverPriceCents/100).toFixed(0)} · {event.driverRemaining} left · +1 CREW FREE
          </span>
          <span className="px-3 py-1.5 rounded-full bg-cc-magenta/15 text-cc-magenta border border-cc-magenta/40">
            RIDE-ALONG ${(event.rideAlongPriceCents/100).toFixed(0)} · {event.rideAlongRemaining} left
          </span>
          <span className="px-3 py-1.5 rounded-full bg-cc-cyan/15 text-cc-cyan border border-cc-cyan/40">
            SPECTATOR ${(event.spectatorPriceCents/100).toFixed(0)} · {event.spectatorRemaining} left
          </span>
        </div>
      </div>
      <div>
        <Link
          href={`/sessions/${event.slug}`}
          data-testid={`button-book-${event.slug}`}
          className={`inline-block px-8 py-4 rounded-md text-base ${soldOut ? "bg-muted text-muted-foreground cursor-not-allowed pointer-events-none" : "btn-neon-lime"}`}
        >
          {soldOut ? "SOLD OUT" : "BOOK NOW →"}
        </Link>
      </div>
    </div>
  );
}
