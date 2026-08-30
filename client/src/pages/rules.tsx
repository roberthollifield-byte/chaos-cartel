import { AlertTriangle, ShieldCheck, Wrench, Flag, Ban } from "lucide-react";
import { Shell } from "@/components/brand/Shell";

const sections = [
  {
    title: "TRACK CONDUCT",
    color: "cc-lime",
    icon: Flag,
    items: [
      "Watch and hold the flag/marshal instructions. If you get a black flag, pit immediately.",
      "One driver at a time on grid until called. No queue jumping.",
      "Pass on the outside of the drift unless a coach tells you otherwise.",
      "If someone spins, everyone lifts and gives space. Do not stop on the driving line.",
      "No street driving in the pit lane. Keep it under 15mph everywhere off-course.",
    ],
  },
  {
    title: "TECH INSPECTION",
    color: "cc-cyan",
    icon: Wrench,
    items: [
      "Tires: minimum 3/32 tread on rears, no cords, correct pressure.",
      "Brakes: pedal firm, no leaks, fluid within 30 days.",
      "Seatbelt or harness in good condition. 4-point minimum for caged cars.",
      "Battery must be secured. No loose batteries under the hood or in the trunk.",
      "Zero visible leaks — oil, coolant, fuel. If it drips, you don't run.",
      "Roll cage or roll bar required for open-top convertibles.",
      "Snell/DOT-rated helmet required — no bicycle helmets, no skate helmets.",
    ],
  },
  {
    title: "SAFETY GEAR",
    color: "cc-magenta",
    icon: ShieldCheck,
    items: [
      "Long sleeves and long pants required — no shorts, no sandals in the driver's seat.",
      "Closed-toe shoes. Racing shoes recommended but not required.",
      "Gloves recommended.",
      "No loose objects in the cabin — anything unsecured becomes a projectile.",
    ],
  },
  {
    title: "PROHIBITED",
    color: "cc-hot-pink",
    icon: Ban,
    items: [
      "Alcohol or controlled substances anywhere on-site before the day is called.",
      "Passengers other than a signed ride-along participant.",
      "Cameras or drones without prior approval from FC Crew.",
      "Speed on the pit lane. Reckless behavior gets you black-flagged for the day.",
    ],
  },
];

export default function RulesPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <p className="font-mono text-xs tracking-widest text-cc-cyan mb-4">// READ BEFORE YOU BOOK</p>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl italic text-cc-magenta text-shadow-neon-magenta cc-skew">
          <span className="slash-under">RULES</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/90">
          Drift practice is dangerous. These rules exist so everyone goes home. Every driver and ride-along signs off on these when they register.
        </p>

        <div className="mt-6 p-5 rounded-xl border-2 border-cc-hot-pink/60 bg-cc-hot-pink/5 flex gap-3">
          <AlertTriangle className="text-cc-hot-pink flex-none mt-0.5" />
          <div className="text-sm">
            <strong className="text-cc-hot-pink">Reminder:</strong> Motorsport is inherently dangerous.
            You accept the risk when you register. Chaos Cartel and FC Crew are not liable for damage, injury, or death.
          </div>
        </div>

        <div className="mt-12 space-y-8">
          {sections.map((s, i) => (
            <div key={i} className={`p-6 md:p-8 rounded-2xl border-2 border-${s.color}/40 bg-card/60`} data-testid={`rules-section-${s.title.replace(/\s+/g,'-').toLowerCase()}`}>
              <h2 className={`font-display font-extrabold text-3xl italic text-${s.color} mb-5 flex items-center gap-3 cc-skew`}>
                <s.icon size={28} /> {s.title}
              </h2>
              <ul className="space-y-3">
                {s.items.map((it, j) => (
                  <li key={j} className="flex gap-3 text-foreground/90">
                    <span className={`text-${s.color} font-display font-extrabold mt-0.5`}>0{j+1}</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
