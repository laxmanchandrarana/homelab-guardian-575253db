import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Cpu, Brain, RotateCw, FileText, BarChart3, ChevronRight,
  ShieldCheck, Activity, Lightbulb, Clock, CheckCircle2, AlertTriangle, ArrowRight,
  Bell, ExternalLink, ScanLine, Database, Send, MessageCircle, Hash, Mail,
  AlertCircle, RefreshCw, Inbox,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/Sparkline";
import { HealthRing } from "@/components/HealthRing";
import { topMetrics as mockTopMetrics, liveEvents as fallbackEvents, infraNodes, guardianInsights, type Status } from "@/lib/mock-data";
import {
  useMonitoring, useServices, useIncidents, useNotifications, useMetrics, useAiSummary,
  useAlerts, useRestartService, useRunScan, useCreateBackup,
} from "@/hooks/useGuardianData";
import { API_CONFIGURED } from "@/lib/api";
import * as Icons from "lucide-react";
import { useEffect, useState } from "react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Homelab Guardian" },
      { name: "description", content: "Real-time AI operations center for your homelab infrastructure." },
    ],
  }),
  component: Dashboard,
});

const statusColor: Record<Status, string> = {
  healthy: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};
const statusBg: Record<Status, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};
const accentGlow: Record<string, string> = {
  success: "glow-success",
  warning: "glow-warning",
  danger: "glow-danger",
  primary: "glow-primary",
};
const accentText: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  primary: "text-primary",
};

const ranges = ["15m", "1h", "6h", "24h"] as const;

function Dashboard() {
  const [range, setRange] = useState<(typeof ranges)[number]>("1h");

  return (
    <AppShell>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <PageHeader />
        <SystemStatusHeader />
        <GuardianHero />
        <MetricGrid />
        <QuickActions />
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6">
            <ChartsCard range={range} setRange={setRange} />
            <ActiveAlerts />
            <InfraStatus />
            <IncidentTimeline />
            <ServicesPreview />
          </div>
          <div className="flex flex-col gap-6">
            <GuardianInsights />
            <EventFeed />
          </div>
        </div>
        {!API_CONFIGURED && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
            Demo mode — set <code className="rounded bg-background/50 px-1">VITE_API_URL</code> (e.g. <code className="rounded bg-background/50 px-1">http://100.93.15.3:8008</code>) to connect Guardian's FastAPI backend.
          </div>
        )}
      </div>
    </AppShell>
  );
}


function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations Center</h1>
        <p className="text-sm text-muted-foreground">Guardian is watching your homelab in real time.</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative inline-flex h-2 w-2 text-success">
          <span className="status-dot-pulse" />
          <span className="ping-dot" />
        </span>
        All systems operational
      </div>
    </div>
  );
}

function GuardianHero() {
  const [secondsAgo, setSecondsAgo] = useState(12);
  const { summary, recommendation, healthyServices, recoveredToday, incidentsOpen, isLive } = useAiSummary();
  const { healthScore, healthyServices: monHealthy, downServices } = useMonitoring();
  useEffect(() => {
    const id = setInterval(() => setSecondsAgo((s) => (s >= 59 ? 1 : s + 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const recoText = recommendation ?? "Increase n8n memory limit to 768MB — peaked at 812MB / 1GB twice today.";
  const healthy = healthyServices ?? monHealthy;
  const opens = incidentsOpen ?? downServices;

  const summaryItems: string[] = [];
  if (summary) summaryItems.push(summary);
  if (typeof healthy === "number") summaryItems.push(`${healthy} services healthy`);
  if (typeof recoveredToday === "number") summaryItems.push(`${recoveredToday} incidents auto-recovered today`);
  if (typeof opens === "number") summaryItems.push(opens === 0 ? "No critical alerts" : `${opens} active incident${opens === 1 ? "" : "s"}`);
  if (summaryItems.length === 0) {
    summaryItems.push("42 services healthy", "2 incidents auto-recovered today", "No critical alerts");
  }

  const ringValue = typeof healthScore === "number" ? healthScore : 98;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card glow-primary relative overflow-hidden p-6 md:p-8"
    >
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-chart-5/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />

      <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-col items-center gap-2">
          <HealthRing value={ringValue} />
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last analysis · <span className="tabular-nums">{secondsAgo}s ago</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="shimmer-text text-xl font-semibold tracking-tight">Guardian AI</h2>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success ring-1 ring-success/30">
                  {isLive ? "Live" : "Healthy"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Autonomous SRE · v1.2.0</p>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5 text-sm">
            {summaryItems.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span>{t}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-warning">
              <Lightbulb className="h-3.5 w-3.5" /> Recommendation
            </div>
            <p className="mt-1 text-sm text-foreground/90">{recoText}</p>
          </div>
        </div>

        <div className="flex md:flex-col gap-2">
          <button className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Apply fix <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent">
            View details
          </button>
        </div>
      </div>
    </motion.section>
  );
}


function MetricGrid() {
  const { metrics } = useMonitoring();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {(metrics as typeof mockTopMetrics).map((m, i) => {
        const Icon = (Icons as any)[m.icon] ?? Cpu;
        const aText = accentText[m.accent] ?? "text-primary";
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -3 }}
            className={`surface-card relative overflow-hidden p-4 transition-shadow hover:${accentGlow[m.accent] ?? "glow-primary"}`}
          >
            <div className={`pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-20 blur-2xl ${statusBg[m.status]}`} />
            <div className="relative">
              <div className="flex items-start justify-between">
                <div className={`grid h-8 w-8 place-items-center rounded-md bg-background/60 ring-1 ring-border ${aText}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="relative inline-flex h-2 w-2 text-current">
                  <span className={`status-dot-pulse ${statusColor[m.status]}`} />
                  {m.status !== "healthy" && <span className={`ping-dot ${statusColor[m.status]}`} />}
                </span>
              </div>
              <div className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="mt-0.5 text-3xl font-semibold leading-tight tabular-nums">
                {m.display ?? (<><AnimatedNumber value={m.value} /><span className="text-base text-muted-foreground">{m.suffix}</span></>)}
              </div>
              <div className={`mt-2 ${aText}`}>
                <Sparkline data={m.trend} height={28} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function ChartsCard({ range, setRange }: { range: (typeof ranges)[number]; setRange: (r: (typeof ranges)[number]) => void }) {
  const { series, isLive, isLoading, error, refetch } = useMetrics(range);

  const charts = [
    { key: "cpu", label: "CPU", color: "var(--color-chart-1)", unit: "%", data: series.cpu },
    { key: "ram", label: "RAM", color: "var(--color-chart-2)", unit: "%", data: series.ram },
    { key: "disk", label: "Disk I/O", color: "var(--color-chart-3)", unit: "%", data: series.disk },
    { key: "net", label: "Network", color: "var(--color-chart-5)", unit: "%", data: series.net },
  ];
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Live resource metrics</h3>
          {isLive && <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success ring-1 ring-success/30">LIVE</span>}
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
      {error && !isLive && <div className="mb-3"><ErrorCard message="Couldn't load metrics" onRetry={() => refetch()} /></div>}
      {isLoading && !isLive && <div className="mb-3"><SkeletonRows n={2} /></div>}
      <div className="grid gap-4 sm:grid-cols-2">

        {charts.map((c) => {
          const current = c.data[c.data.length - 1].v;
          const peak = Math.max(...c.data.map((d) => d.v));
          const avg = c.data.reduce((s, d) => s + d.v, 0) / c.data.length;
          return (
            <div key={c.key} className="rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
                  <div className="mt-0.5 text-3xl font-semibold tabular-nums" style={{ color: c.color }}>
                    {Math.round(current)}<span className="text-base text-muted-foreground">{c.unit}</span>
                  </div>
                </div>
                <div className="flex gap-4 text-right text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Peak</div>
                    <div className="tabular-nums font-medium">{Math.round(peak)}{c.unit}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Avg</div>
                    <div className="tabular-nums font-medium">{Math.round(avg)}{c.unit}</div>
                  </div>
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={c.data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.color} stopOpacity={0.55} />
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
                    <Area type="monotone" dataKey="v" stroke={c.color} strokeWidth={2} fill={`url(#g-${c.key})`} isAnimationActive />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InfraStatus() {
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Infrastructure topology</h3>
        <span className="text-xs text-muted-foreground">Click a node for details</span>
      </div>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:overflow-x-auto">
        {infraNodes.map((n, i) => (
          <div key={n.id} className="flex items-center md:flex-col md:gap-2">
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group relative flex min-w-[150px] flex-1 items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-3 text-left md:flex-col md:items-center md:text-center"
            >
              <span className="relative inline-flex h-2 w-2 text-current">
                <span className={`status-dot-pulse ${statusColor[n.status]}`} />
                {n.status !== "healthy" && <span className={`ping-dot ${statusColor[n.status]}`} />}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{n.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {Object.entries(n.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </div>
              </div>
            </motion.button>
            {i < infraNodes.length - 1 && (
              <ChevronRight className="mx-2 h-4 w-4 shrink-0 rotate-90 text-muted-foreground md:rotate-0" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function IncidentTimeline() {
  const { timeline, isLive } = useIncidents();
  const resolved = timeline.length > 0 && timeline[timeline.length - 1].status === "healthy";
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold">{isLive ? "Recent incidents" : "Latest incident"}</h3>
          {resolved && (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success ring-1 ring-success/30">Resolved</span>
          )}
        </div>
        <button className="text-xs text-primary hover:underline">All incidents</button>
      </div>
      {timeline.length === 0 ? (
        <div className="rounded-md border border-border bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">No incidents — Guardian is calm.</div>
      ) : (
        <ol className="relative ml-2">
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          {timeline.map((step: any, i: number) => {
            const sev = step.severity ?? (step.status === "danger" ? "critical" : step.status === "warning" ? "warning" : "resolved");
            const sevClass =
              sev === "critical" ? "bg-destructive/15 text-destructive ring-destructive/30" :
              sev === "warning" ? "bg-warning/15 text-warning ring-warning/30" :
              "bg-success/15 text-success ring-success/30";
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="relative grid grid-cols-[16px_60px_1fr] items-start gap-3 py-2"
              >
                <span className={`mt-1.5 status-dot ${statusColor[step.status as Status]} z-10`} />
                <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">{step.time}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{step.text}</div>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${sevClass}`}>{sev}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{step.detail}</div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ServicesPreview() {
  const navigate = useNavigate();
  const { services, isLoading, error, refetch } = useServices();
  const restart = useRestartService();


  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Services</h3>
        <button onClick={() => navigate({ to: "/services" })} className="text-xs text-primary hover:underline">View all</button>
      </div>
      {isLoading && services.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-background/40" />
          ))}
        </div>
      ) : error && services.length === 0 ? (
        <ErrorCard message="Couldn't load services" onRetry={() => refetch()} />
      ) : services.length === 0 ? (
        <EmptyState label="No services found" />
      ) : (

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <motion.div
            key={s.name}
            whileHover={{ y: -3 }}
            onClick={() => navigate({ to: "/services/$service", params: { service: s.name } })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate({ to: "/services/$service", params: { service: s.name } });
              }
            }}
            className={`relative cursor-pointer overflow-hidden rounded-lg border border-border bg-background/40 p-4 transition-shadow hover:${s.status === "healthy" ? "glow-success" : s.status === "warning" ? "glow-warning" : "glow-danger"}`}
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 ${statusBg[s.status]}`} />

            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                  <span className="relative inline-flex h-2 w-2 text-current">
                    <span className={`status-dot-pulse ${statusColor[s.status]}`} />
                    {s.status !== "healthy" && <span className={`ping-dot ${statusColor[s.status]}`} />}
                  </span>
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
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <div><div className="text-base font-medium text-foreground tabular-nums">{s.cpu}%</div>CPU</div>
              <div><div className="text-base font-medium text-foreground tabular-nums">{s.ram}</div>RAM</div>
              <div><div className="text-base font-medium text-foreground tabular-nums">{s.uptime}</div>Uptime</div>
            </div>
            {(s as any).lastRestart && (
              <div className="mt-2 text-[10px] text-muted-foreground">Last restart · {(s as any).lastRestart}</div>
            )}
            <div className="mt-3 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); API_CONFIGURED && restart.mutate(s.name); }}
                disabled={restart.isPending && restart.variables === s.name}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
              >
                <RotateCw className={`h-3 w-3 ${restart.isPending && restart.variables === s.name ? "animate-spin" : ""}`} /> Restart
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate({ to: "/services/$service", params: { service: s.name } }); }}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
              >
                <FileText className="h-3 w-3" /> Logs
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate({ to: "/services/$service", params: { service: s.name } }); }}
                className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
              >
                <BarChart3 className="h-3 w-3" /> Metrics
              </button>
            </div>

          </motion.div>
        ))}
      </div>
      )}
    </section>
  );
}


function GuardianInsights() {
  return (
    <section className="surface-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
          <Brain className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">Guardian insights</h3>
      </div>
      <ul className="space-y-2">
        {guardianInsights.map((ins, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-start gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
          >
            <span className={`mt-1.5 status-dot ${statusColor[ins.tone]}`} />
            <span className="text-foreground/90">{ins.text}</span>
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs">
        <div className="font-medium text-primary">Recommended action</div>
        <p className="mt-0.5 text-foreground/90">Increase n8n memory limit to 768MB.</p>
      </div>
    </section>
  );
}

type FeedEvent = { time: string; text: string; status: Status; channel?: string; deliveryStatus?: string };

const channelIcon: Record<string, any> = {
  telegram: Send,
  discord: MessageCircle,
  slack: Hash,
  email: Mail,
};

const deliveryClass: Record<string, string> = {
  delivered: "bg-success/15 text-success ring-success/30",
  success: "bg-success/15 text-success ring-success/30",
  pending: "bg-warning/15 text-warning ring-warning/30",
  failed: "bg-destructive/15 text-destructive ring-destructive/30",
};

function EventFeed() {
  const { events: liveData, isLive, isLoading, error, refetch } = useNotifications();
  const [events, setEvents] = useState<FeedEvent[]>(isLive ? (liveData as FeedEvent[]) : (fallbackEvents as FeedEvent[]));

  useEffect(() => {
    if (isLive) setEvents(liveData as FeedEvent[]);
  }, [liveData, isLive]);

  useEffect(() => {
    if (API_CONFIGURED) return;
    const pool: FeedEvent[] = [
      { time: "", text: "Prometheus scrape ok", status: "healthy", channel: "slack", deliveryStatus: "delivered" },
      { time: "", text: "CPU normalized on n8n", status: "healthy", channel: "telegram", deliveryStatus: "delivered" },
      { time: "", text: "Latency spike detected", status: "warning", channel: "discord", deliveryStatus: "delivered" },
    ];
    const id = setInterval(() => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setEvents((prev) => [{ ...pick, time }, ...prev].slice(0, 12));
    }, 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="surface-card flex max-h-[560px] flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative inline-flex h-2 w-2 text-success">
            <span className="status-dot-pulse" />
            <span className="ping-dot" />
          </span>
          {isLive ? "Streaming" : "Demo"}
        </span>
      </div>
      {isLoading && events.length === 0 ? (
        <SkeletonRows n={5} />
      ) : error && events.length === 0 ? (
        <ErrorCard message="Couldn't load notifications" onRetry={() => refetch()} />
      ) : events.length === 0 ? (
        <EmptyState label="No notifications yet" />
      ) : (
        <ol className="relative ml-2 flex-1 space-y-3 overflow-y-auto pr-1">
          {events.map((e, i) => {
            const ChIcon = e.channel ? channelIcon[e.channel] : null;
            const delivery = e.deliveryStatus?.toLowerCase();
            return (
              <motion.li
                key={`${e.time}-${i}-${e.text}`}
                initial={{ opacity: 0, x: 8, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                transition={{ duration: 0.3 }}
                className="relative pl-5"
              >
                <span className={`absolute left-0 top-1.5 status-dot ${statusColor[e.status]}`} />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs tabular-nums text-muted-foreground">{e.time}</div>
                  {delivery && deliveryClass[delivery] && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1 ${deliveryClass[delivery]}`}>
                      {delivery}
                    </span>
                  )}
                </div>
                <div className="flex items-start gap-1.5 text-sm">
                  {ChIcon && <ChIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span>{e.text}</span>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

// ============= System status header =============

function StatusBadge({ status }: { status?: string }) {
  const v = (status ?? "healthy").toLowerCase();
  const cls =
    v.includes("crit") || v.includes("down") || v.includes("error")
      ? "bg-destructive/15 text-destructive ring-destructive/30"
      : v.includes("warn") || v.includes("degrad")
      ? "bg-warning/15 text-warning ring-warning/30"
      : "bg-success/15 text-success ring-success/30";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${cls}`}>
      {status ?? "Healthy"}
    </span>
  );
}

function fmtRelative(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SystemStatusHeader() {
  const { raw, healthScore, isLive } = useMonitoring();
  const score = healthScore ?? 98;
  return (
    <section className="surface-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overall health</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-2xl font-semibold tabular-nums"><AnimatedNumber value={score} />%</span>
          <StatusBadge status={raw?.status ?? (score >= 90 ? "Healthy" : score >= 70 ? "Warning" : "Critical")} />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Guardian</div>
        <div className="mt-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <StatusBadge status={isLive ? "Online" : "Demo"} />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">API</div>
        <div className="mt-1 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <StatusBadge status={raw?.api_status ?? (isLive ? "Reachable" : "Unreachable")} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last scan / update</div>
        <div className="text-sm tabular-nums">{fmtRelative(raw?.last_scan)}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">updated {fmtRelative(raw?.last_update)}</div>
      </div>
    </section>
  );
}

// ============= Quick actions =============

function QuickActions() {
  const navigate = useNavigate();
  const scan = useRunScan();
  const backup = useCreateBackup();
  const actions: { label: string; icon: any; onClick?: () => void; href?: string; loading?: boolean }[] = [
    { label: "Restart service", icon: RotateCw, onClick: () => navigate({ to: "/services" }) },
    { label: "Run scan", icon: ScanLine, onClick: () => API_CONFIGURED && scan.mutate(), loading: scan.isPending },
    { label: "Create backup", icon: Database, onClick: () => API_CONFIGURED && backup.mutate(), loading: backup.isPending },
    { label: "Prometheus", icon: ExternalLink, href: "http://prometheus.local" },
    { label: "Grafana", icon: ExternalLink, href: "http://grafana.local" },
    { label: "Portainer", icon: ExternalLink, href: "http://portainer.local" },
  ];

  return (
    <section className="surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Quick actions</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((a) => {
          const Icon = a.icon;
          const cls = "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background/40 px-3 py-2 text-xs hover:bg-accent transition-colors disabled:opacity-50";
          if (a.href) {
            return (
              <a key={a.label} href={a.href} target="_blank" rel="noreferrer" className={cls}>
                <Icon className="h-3.5 w-3.5" /> {a.label}
              </a>
            );
          }
          return (
            <button key={a.label} onClick={a.onClick} disabled={a.loading} className={cls}>
              <Icon className={`h-3.5 w-3.5 ${a.loading ? "animate-spin" : ""}`} /> {a.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ============= Active alerts =============

function ActiveAlerts() {
  const navigate = useNavigate();
  const { alerts, isLoading, error, refetch } = useAlerts();
  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold">Active alerts</h3>
          {alerts.length > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning ring-1 ring-warning/30">
              {alerts.length} firing
            </span>
          )}
        </div>
      </div>
      {isLoading && alerts.length === 0 ? (
        <SkeletonRows n={3} />
      ) : error ? (
        <ErrorCard message="Couldn't load alerts" onRetry={() => refetch()} />
      ) : alerts.length === 0 ? (
        <EmptyState label="No active alerts — Guardian is calm." />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a, i) => {
            const sev = a.severity ?? "warning";
            const sevClass =
              sev === "critical" ? "bg-destructive/15 text-destructive ring-destructive/30" :
              sev === "warning" ? "bg-warning/15 text-warning ring-warning/30" :
              "bg-primary/15 text-primary ring-primary/30";
            return (
              <li key={a.id ?? i} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${sevClass}`}>{sev}</span>
                    <span className="text-sm font-medium truncate">{a.service ?? "—"}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">{a.message}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {a.started ? `Started ${fmtRelative(a.started)}` : ""}{a.duration ? ` · ${a.duration}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => navigate({ to: "/incidents" })}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
                >
                  View incident <ArrowRight className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ============= Shared state UI =============

function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md border border-border bg-background/40" />
      ))}
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-background/40 px-2 py-1 hover:bg-accent">
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-background/40 px-3 py-8 text-center text-xs text-muted-foreground">
      <Inbox className="h-6 w-6 opacity-60" />
      {label}
    </div>
  );
}


