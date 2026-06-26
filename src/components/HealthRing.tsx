import { useEffect, useState } from "react";

type Props = {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
};

export function HealthRing({ value, size = 168, stroke = 12, label = "Overall Health", sublabel = "Excellent" }: Props) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (display / 100) * c;
  const color = value >= 90 ? "var(--color-success)" : value >= 70 ? "var(--color-warning)" : "var(--color-destructive)";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="var(--color-chart-5)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 12px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-semibold tabular-nums">{Math.round(display)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xs font-medium" style={{ color }}>{sublabel}</div>
        </div>
      </div>
    </div>
  );
}
