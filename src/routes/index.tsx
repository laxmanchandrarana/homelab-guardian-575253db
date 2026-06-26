import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ShieldCheck, Boxes, AlertTriangle, Sparkles, Cpu, MemoryStick,
  HardDrive, Wifi, Brain, RotateCw, FileText, BarChart3, ChevronRight,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/Sparkline";
import { topMetrics, services, liveEvents, infraNodes, genSeries, type Status } from "@/lib/mock-data";
import * as Icons from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Homelab Guardian" },
      { name: "description", content: "Real-time health overview of your homelab infrastructure." },
    ],
  }),
  component: Dashboard,
});

const statusColor: Record<Status, string> = {
  healthy: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const ranges = ["15m", "1h", "6h", "24h"] as const;

function Dashboard() {
  const [range, setRange] = useState<(typeof ranges)[number]>("1h");

  return (
    <AppShell>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <PageHeader />
        <AISummary />
        <MetricGrid />
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <ChartsCard range={range} setRange={setRange} />
            <InfraStatus />
            <ServicesPreview />
          </div>
          <EventFeed />
        </div>
      </div>
    </AppShell>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Is my homelab healthy? At a glance.</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="status-dot text-success" />
        All systems operational
      </div>
    </div>
  );
}

function AISummary() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card relative overflow-hidden p-5 md:p-6"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-chart-5/15 blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
          <Brain className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Guardian AI</h2>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">Healthy</span>
          </div>
          <p className="mt-1 text-sm text-foreground/90">
            Everything looks healthy. <span className="text-muted-foreground">1 container restarted today. CPU stable. Memory normal. No critical alerts.</span>
          </p>
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground/90">
            <span className="font-medium text-warning">Recommendation:</span>{" "}
            <span className="text-foreground/80">Increase RAM limit of <code className="rounded bg-background/50 px-1">n8n</code> — peaked at 812MB / 1GB twice today.</span>
          </div>
        </div>
        <button className="self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent">
          View details
        </button>
      </div>
    </motion.div>
  );
}

function MetricGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {topMetrics.map((m, i) => {
        const Icon = (Icons as any)[m.icon] ?? Cpu;
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ y: -2 }}
            className="surface-card p-4"
          >
            <div className="flex items-start justify-between">
              <div className={`grid h-8 w-8 place-items-center rounded-md bg-card/80 ${statusColor[m.status]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`status-dot ${statusColor[m.status]}`} />
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums">
              {m.display ?? (<><AnimatedNumber value={m.value} />{m.suffix}</>)}
            </div>
            <div className={`mt-2 ${statusColor[m.status]}`}>
              <Sparkline data={m.trend} height={28} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function ChartsCard({ range, setRange }: { range: string; setRange: (r: any) => void }) {
  const charts = [
    { key: "cpu", label: "CPU", color: "var(--color-chart-1)", data: genSeries(48, 25, 15) },
    { key: "ram", label: "RAM", color: "var(--color-chart-2)", data: genSeries(48, 52, 10) },
    { key: "disk", label: "Disk I/O", color: "var(--color-chart-3)", data: genSeries(48, 30, 25) },
    { key: "net", label: "Network", color: "var(--color-chart-5)", data: genSeries(48, 40, 30) },
  ];
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Live charts</h3>
        </div>
        <div className="flex rounded-md border border-border bg-card p-0.5 text-xs">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2.5 py-1 transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {charts.map((c) => (
          <div key={c.key} className="rounded-md border border-border bg-background/40 p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="font-medium tabular-nums">{Math.round(c.data[c.data.length - 1].v)}%</span>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={c.data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={c.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "var(--color-muted-foreground)" }}
                  />
                  <Area type="monotone" dataKey="v" stroke={c.color} strokeWidth={2} fill={`url(#g-${c.key})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfraStatus() {
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live infrastructure status</h3>
        <span className="text-xs text-muted-foreground">Top to bottom flow</span>
      </div>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:overflow-x-auto">
        {infraNodes.map((n, i) => (
          <div key={n.id} className="flex items-center md:flex-col md:gap-2">
            <motion.div
              whileHover={{ scale: 1.04 }}
              className={`group relative flex min-w-[140px] flex-1 items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 md:flex-col md:items-center md:text-center`}
            >
              <span className={`status-dot ${statusColor[n.status]}`} />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{n.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {Object.entries(n.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </div>
              </div>
            </motion.div>
            {i < infraNodes.length - 1 && (
              <ChevronRight className="mx-2 h-4 w-4 shrink-0 rotate-90 text-muted-foreground md:rotate-0" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ServicesPreview() {
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Services</h3>
        <button className="text-xs text-primary hover:underline">View all</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <motion.div
            key={s.name}
            whileHover={{ y: -2 }}
            className="relative overflow-hidden rounded-lg border border-border bg-background/40 p-4"
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 ${s.status === "healthy" ? "bg-success" : s.status === "warning" ? "bg-warning" : "bg-destructive"}`} />
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                  <span className={`status-dot ${statusColor[s.status]}`} />
                  <span className="capitalize text-muted-foreground">{s.status === "healthy" ? "Running" : s.status}</span>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                <input type="checkbox" defaultChecked={s.autoHeal} className="peer sr-only" />
                <span className="relative h-4 w-7 rounded-full bg-muted transition-colors peer-checked:bg-primary">
                  <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-foreground transition-transform peer-checked:translate-x-3" />
                </span>
                Auto
              </label>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div><div className="text-foreground tabular-nums">{s.cpu}%</div>CPU</div>
              <div><div className="text-foreground tabular-nums">{s.ram}</div>RAM</div>
              <div><div className="text-foreground tabular-nums">{s.uptime}</div>Uptime</div>
            </div>
            <div className="mt-3 flex gap-1.5">
              <button className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent">
                <RotateCw className="h-3 w-3" /> Restart
              </button>
              <button className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent">
                <FileText className="h-3 w-3" /> Logs
              </button>
              <button className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent">
                <BarChart3 className="h-3 w-3" /> Metrics
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function EventFeed() {
  return (
    <aside className="surface-card flex max-h-[760px] flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live event feed</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="status-dot text-success" />
          Streaming
        </span>
      </div>
      <ol className="relative ml-2 flex-1 space-y-3 overflow-y-auto pr-1">
        {liveEvents.map((e, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative pl-5"
          >
            <span className={`absolute left-0 top-1.5 status-dot ${statusColor[e.status]}`} />
            <div className="text-xs tabular-nums text-muted-foreground">{e.time}</div>
            <div className="text-sm">{e.text}</div>
          </motion.li>
        ))}
      </ol>
    </aside>
  );
}
