export function Logo({ className = "", size = 40 }: { className?: string; size?: number }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="cc-grad" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="hsl(320 95% 60%)" />
            <stop offset="50%" stopColor="hsl(275 85% 62%)" />
            <stop offset="100%" stopColor="hsl(178 90% 55%)" />
          </linearGradient>
        </defs>
        {/* Angled C — chaos + cartel */}
        <path
          d="M40 12 Q28 4 18 12 T8 30 Q10 40 22 42 T40 36"
          stroke="url(#cc-grad)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M32 20 L38 14 M32 34 L40 42"
          stroke="hsl(74 92% 55%)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="font-display font-extrabold text-lg tracking-tight italic" style={{ color: "hsl(74 92% 55%)" }}>
          CHAOS
        </span>
        <span className="font-display font-extrabold text-lg tracking-tight italic -mt-1" style={{ color: "hsl(320 95% 60%)" }}>
          CARTEL
        </span>
      </div>
    </div>
  );
}
