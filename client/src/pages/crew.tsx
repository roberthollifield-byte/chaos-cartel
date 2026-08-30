import { useQuery } from "@tanstack/react-query";
import { Instagram } from "lucide-react";
import { Shell } from "@/components/brand/Shell";
import type { CrewMember } from "@shared/schema";

const accents = ["cc-lime","cc-magenta","cc-cyan","cc-purple","cc-hot-pink"] as const;

export default function CrewPage() {
  const { data: crew, isLoading } = useQuery<CrewMember[]>({ queryKey: ["/api/crew"] });
  return (
    <Shell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4">// THE CARTEL</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-purple text-shadow-neon-magenta cc-skew">
          <span className="slash-under">FC CREW</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/90">
          The Forest City core. Founders, drivers, coaches, and the guys who tape the cones every morning.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && [1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cc-purple/40 bg-card h-72 animate-pulse" />
          ))}
          {(crew || []).map((c, i) => {
            const accent = accents[i % accents.length];
            return (
              <div
                key={c.id}
                className={`p-6 rounded-2xl border-2 border-${accent}/50 bg-card hover:-translate-y-1 transition-transform`}
                data-testid={`crew-card-${c.id}`}
              >
                <div className={`aspect-square rounded-xl bg-gradient-to-br from-${accent}/25 to-cc-purple/25 grid place-items-center mb-5 border border-${accent}/40`}>
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <div className={`font-display font-extrabold text-6xl italic text-${accent} cc-skew`}>
                      {c.name.split(" ").map(p => p[0]).join("")}
                    </div>
                  )}
                </div>
                <div className={`text-xs font-mono tracking-widest text-${accent} mb-1`}>{c.role.toUpperCase()}</div>
                <h3 className="font-display font-extrabold text-2xl italic">{c.name}</h3>
                {c.car && <div className="mt-1 text-sm text-muted-foreground">{c.car}</div>}
                {c.bio && <p className="mt-4 text-sm text-foreground/85">{c.bio}</p>}
                {c.instagram && (
                  <a href={`https://instagram.com/${c.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-cc-lime">
                    <Instagram size={16} /> {c.instagram}
                  </a>
                )}
              </div>
            );
          })}
          {!isLoading && (crew || []).length === 0 && (
            <div className="col-span-full p-10 rounded-2xl border border-dashed border-cc-purple/40 text-center text-muted-foreground">
              Add crew members from the admin panel.
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}
