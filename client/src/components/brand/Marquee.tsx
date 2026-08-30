import { Zap } from "lucide-react";

export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden bg-cc-lime py-3 border-y-2 border-black">
      <div className="cc-marquee items-center gap-8">
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-8 whitespace-nowrap px-4">
            <span className="font-display font-extrabold text-lg tracking-widest" style={{ color: "hsl(240 12% 4%)" }}>
              {item}
            </span>
            <Zap size={20} className="fill-black text-black" strokeWidth={2.5} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CheckerStripe({ variant = "lime" }: { variant?: "lime" | "magenta" }) {
  const cls = variant === "lime" ? "checkered" : "checkered-magenta";
  return <div className={`h-6 w-full ${cls}`} aria-hidden="true" />;
}
