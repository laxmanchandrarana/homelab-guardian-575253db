import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Terminal,
  ExternalLink,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Container,
  Heart,
  Clock,
  Copy,
  Download,
  Pause,
  PlayCircle,
  Search,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Activity,
  Eye,
  EyeOff,
  Shield,
  History,
  X,
  Trash2,

} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { AnimatedNumber } from "@/components/AnimatedNumber";

import { cn } from "@/lib/utils";
import {
  useServices,
  useServiceDetail,
  useServiceLogs,
  useStartService,
  useStopService,
  useRestartServiceDirect,
  usePauseService,
  useResumeService,
  useDeleteService,
  useServicePrediction,
  useMetrics,
  useIncidents,
} from "@/hooks/useGuardianData";
import { useGuardianSocket } from "@/hooks/useGuardianSocket";
import { useServiceLiveStats } from "@/hooks/useServiceLiveStats";
import type { RangeKey } from "@/lib/api";
import { Sparkles, PauseCircle } from "lucide-react";


export const Route = createFileRoute("/services/$service")({
  head: () => ({ meta: [{ title: "Service — Homelab Guardian" }] }),
  component: ServiceDetailPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm">
        {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm">
        Service not found.
      </div>
    </AppShell>
  ),
});

// ────────────────────────────── helpers ──────────────────────────────

function statusTone(status: string | undefined) {
  const s = (status ?? "").toLowerCase();
  if (["healthy", "running", "ok", "up"].includes(s))
    return { dot: "bg-emerald-400", text: "text-emerald-300", glow: "shadow-[0_0_24px_rgba(16,185,129,0.35)]", label: "Running" };
  if (["warning", "degraded", "restarting", "starting", "stopping"].includes(s))
    return { dot: "bg-amber-400", text: "text-amber-300", glow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]", label: s.charAt(0).toUpperCase() + s.slice(1) };
  return { dot: "bg-rose-400", text: "text-rose-300", glow: "shadow-[0_0_24px_rgba(244,63,94,0.35)]", label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "Down" };
}

const SENSITIVE_KEY_RE = /(pass|secret|token|key|api|auth|credential|private)/i;

function isSensitiveKey(k: string) {
  return SENSITIVE_KEY_RE.test(k);
}

function normalizeEnv(env: any): { key: string; value: string }[] {
  if (!env) return [];
  if (Array.isArray(env)) {
    return env.map((row) => {
      const s = String(row);
      const idx = s.indexOf("=");
      return idx === -1 ? { key: s, value: "" } : { key: s.slice(0, idx), value: s.slice(idx + 1) };
    });
  }
  if (typeof env === "object") return Object.entries(env).map(([key, v]) => ({ key, value: String(v ?? "") }));
  return [];
}

function normalizePorts(ports: any): { host: string; container: string; protocol?: string }[] {
  if (!ports) return [];
  if (!Array.isArray(ports)) return [];
  return ports.map((p) => {
    if (typeof p === "string") {
      const [host, container] = p.split("->").map((x) => x.trim());
      return { host: host ?? "", container: container ?? host ?? "" };
    }
    return {
      host: String(p.host ?? p.published ?? ""),
      container: String(p.container ?? p.target ?? ""),
      protocol: p.protocol,
    };
  });
}

function normalizeVolumes(vols: any): { source: string; target: string; mode?: string }[] {
  if (!vols || !Array.isArray(vols)) return [];
  return vols.map((v) => {
    if (typeof v === "string") {
      const [source, target, mode] = v.split(":");
      return { source: source ?? "", target: target ?? "", mode };
    }
    return { source: String(v.source ?? ""), target: String(v.target ?? ""), mode: v.mode };
  });
}

function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} to clipboard`),
    () => toast.error("Copy failed"),
  );
}

// ────────────────────────────── small UI bits ──────────────────────────────

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, action }: { icon: any; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" />
        <span>{title}</span>
      </div>
      {action}
    </div>
  );
}

function Gauge({ label, value, suffix = "%", icon: Icon, accent = "primary" }: {
  label: string; value: number; suffix?: string; icon: any; accent?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const v = Math.max(0, Math.min(100, value));
  const tone = {
    primary: "stroke-primary",
    success: "stroke-emerald-400",
    warning: "stroke-amber-400",
    danger: "stroke-rose-400",
    info: "stroke-sky-400",
  }[accent];
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  return (
    <Card className="flex flex-col items-center justify-center py-5">
      <div className="relative size-24">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} className="stroke-border/40 fill-none" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
            className={cn(tone, "transition-all duration-700")}
            strokeDasharray={c} strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold tabular-nums">
            <AnimatedNumber value={Math.round(v)} />
            <span className="text-xs text-muted-foreground">{suffix}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
    </Card>
  );
}

function InfoRow({ label, value, mono, copy }: { label: string; value: React.ReactNode; mono?: boolean; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn("text-xs text-right break-all", mono && "font-mono")}>{value || "—"}</span>
        {copy && (
          <button onClick={() => copyText(copy)} className="text-muted-foreground hover:text-foreground shrink-0">
            <Copy className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, mono, tone }: { label: string; value: React.ReactNode; sub?: string; mono?: boolean; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold truncate", mono && "font-mono", tone)}>{value || "—"}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </Card>
  );
}


// ────────────────────────────── page ──────────────────────────────

function ServiceDetailPage() {
  const { service } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  useGuardianSocket();
  const { connected: liveStatsConnected } = useServiceLiveStats(service);

  const detailQ = useServiceDetail(service);
  const { services } = useServices();
  const { timeline } = useIncidents();
  const start = useStartService();
  const stop = useStopService();
  const restart = useRestartServiceDirect();
  const pause = usePauseService();
  const resume = useResumeService();
  const del = useDeleteService();
  const predictionQ = useServicePrediction(service);


  // fallback to list-derived row if detail endpoint doesn't exist
  const fallback = services.find((s) => s.name === service);
  const d: any = detailQ.data ?? fallback ?? {};
  const isLoading = detailQ.isLoading && !fallback;

  const tone = statusTone(d.status ?? d.health);
  const cpu = Number(d.cpu ?? 0);
  const mem = typeof d.memory === "number" ? d.memory : Number(String(d.ram ?? "0").replace(/[^\d.]/g, "")) || 0;
  const disk = Number(d.disk ?? 0);
  const netRx = Number(d.net_rx ?? d.network_rx ?? 0);
  const netTx = Number(d.net_tx ?? d.network_tx ?? 0);

  const env = useMemo(() => normalizeEnv(d.env ?? d.environment), [d.env, d.environment]);
  const ports = useMemo(() => normalizePorts(d.ports), [d.ports]);
  const volumes = useMemo(() => normalizeVolumes(d.volumes), [d.volumes]);
  const networks: string[] = Array.isArray(d.networks) ? d.networks : [];

  const relatedIncidents = useMemo(
    () => timeline.filter((t: any) => (t.service ?? "").toLowerCase() === service.toLowerCase()).slice(0, 8),
    [timeline, service],
  );

  // performance score
  const score = useMemo(() => {
    const cpuScore = Math.max(0, 100 - cpu);
    const memScore = Math.max(0, 100 - mem);
    const restartScore = Math.max(0, 100 - Math.min(100, (Number(d.restart_count ?? d.restarts ?? 0)) * 10));
    const healthScore = ["healthy", "running", "ok", "up"].includes(String(d.status ?? "").toLowerCase()) ? 100 : 40;
    return Math.round((cpuScore + memScore + restartScore + healthScore) / 4);
  }, [cpu, mem, d.status, d.restart_count, d.restarts]);

  const scoreLabel = score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Poor";

  const [logsOpen, setLogsOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "stop" | "restart" | "delete">(null);

  const doAction = async (
    fn: { mutateAsync: (n: string) => Promise<unknown> },
    verb: string,
  ) => {
    try {
      await fn.mutateAsync(service);
      toast.success(`${verb} ${service}`);
    } catch (e: any) {
      toast.error(`${verb} failed: ${e?.message ?? "error"}`);
    }
  };

  const doDelete = async () => {
    try {
      await del.mutateAsync(service);
      toast.success(`Deleted ${service}`);
      navigate({ to: "/services" });
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? "error"}`);
    }
  };

  const openExternal = () => {
    const url = d.url ?? d.external_url ?? d.web_url;
    if (typeof url === "string" && url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.message("No external URL exposed for this service");
    }
  };

  const onConfirm = () => {
    const c = confirm;
    setConfirm(null);
    if (c === "stop") doAction(stop, "Stopped");
    else if (c === "restart") doAction(restart, "Restarted");
    else if (c === "delete") doDelete();
  };


  return (
    <AppShell>
      <div className="space-y-5">
        {/* Back */}
        <button
          onClick={() => router.history.back()}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>

        {/* Header */}
        <Card className={cn("relative overflow-hidden", tone.glow)}>
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(600px circle at 0% 0%, hsl(var(--primary) / 0.15), transparent 40%)",
            }}
          />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div className={cn("size-14 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20", tone.glow)}>
                <Container className="size-7 text-primary" />
              </div>
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-7 w-48" />
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-semibold truncate">{d.name ?? service}</h1>
                    <Badge variant="outline" className={cn("gap-1.5 border-border/60", tone.text)}>
                      <span className={cn("size-1.5 rounded-full", tone.dot, "animate-pulse")} />
                      {tone.label}
                    </Badge>
                    {d.health && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Heart className="size-3" /> {String(d.health)}
                      </Badge>
                    )}
                    {(d.autoHeal ?? d.autoheal) && (
                      <Badge variant="outline" className="gap-1 text-xs border-emerald-500/40 text-emerald-300">
                        <Shield className="size-3" /> Auto-Heal
                      </Badge>
                    )}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3" /> Uptime {d.uptime ?? "—"}</span>
                  {d.image && <span className="font-mono truncate max-w-[200px]">{d.image}</span>}
                  {(d.container_id || d.id) && (
                    <span className="font-mono truncate max-w-[140px]">
                      {String(d.container_id ?? d.id).slice(0, 12)}
                    </span>
                  )}
                  {(d.lastRestart || d.last_restart) && (
                    <span>Last restart {String(d.lastRestart ?? d.last_restart)}</span>
                  )}
                  {liveStatsConnected && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/40 text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE STATS
                    </Badge>
                  )}
                </div>

              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button size="sm" variant="outline" onClick={() => doAction(start, "Started")} disabled={start.isPending}>
                <Play className="size-3.5" /> Start
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirm("stop")} disabled={stop.isPending}>
                <Square className="size-3.5" /> Stop
              </Button>
              <Button size="sm" variant="outline" onClick={() => doAction(pause, "Paused")} disabled={pause.isPending}>
                <PauseCircle className="size-3.5" /> Pause
              </Button>
              <Button size="sm" variant="outline" onClick={() => doAction(resume, "Resumed")} disabled={resume.isPending}>
                <PlayCircle className="size-3.5" /> Resume
              </Button>
              <Button size="sm" onClick={() => setConfirm("restart")} disabled={restart.isPending}>
                <RotateCw className={cn("size-3.5", restart.isPending && "animate-spin")} /> Restart
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setLogsOpen(true)}>
                <Terminal className="size-3.5" /> Logs
              </Button>
              <Button size="sm" variant="ghost" onClick={openExternal}>
                <ExternalLink className="size-3.5" /> Open
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirm("delete")}
                disabled={del.isPending}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
              {(d.container_id || d.id) && (
                <Button size="sm" variant="ghost" onClick={() => copyText(String(d.container_id ?? d.id), "Container ID")}>
                  <Copy className="size-3.5" /> ID
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyText(`docker restart ${d.container_name ?? service}`, "Docker command")}
              >
                <Copy className="size-3.5" /> docker
              </Button>
              {d.portainer_url && (
                <a href={d.portainer_url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost">
                    <ExternalLink className="size-3.5" /> Portainer
                  </Button>
                </a>
              )}
            </div>

          </div>
        </Card>

        {/* Health Summary KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <KpiCard label="Status" value={tone.label} tone={tone.text} />
          <KpiCard label="CPU" value={`${Math.round(cpu)}%`} />
          <KpiCard label="Memory" value={`${Math.round(mem)}%`} sub={d.memory_limit ? `of ${d.memory_limit}` : undefined} />
          <KpiCard label="Disk" value={`${Math.round(disk)}%`} />
          <KpiCard label="Net RX" value={`${netRx.toFixed(1)} MB/s`} />
          <KpiCard label="Net TX" value={`${netTx.toFixed(1)} MB/s`} />
          <KpiCard label="Uptime" value={d.uptime ?? "—"} />
          <KpiCard label="Restarts" value={String(d.restart_count ?? d.restarts ?? 0)} />
          <KpiCard label="Image" value={d.image?.split(":")[0] ?? "—"} mono />
          <KpiCard label="Tag" value={d.image_tag ?? d.image?.split(":")[1] ?? "latest"} mono />
          <KpiCard label="Container" value={String(d.container_id ?? d.id ?? "—").slice(0, 12)} mono />
          <KpiCard label="Updated" value={d.last_update ?? d.last_check ?? "—"} />
        </div>

        {/* Gauges */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Gauge label="CPU" value={cpu} icon={Cpu} accent={cpu > 80 ? "danger" : cpu > 60 ? "warning" : "success"} />
          <Gauge label="Memory" value={mem} icon={MemoryStick} accent={mem > 80 ? "danger" : mem > 60 ? "warning" : "primary"} />
          <Gauge label="Disk" value={disk} icon={HardDrive} accent="info" />
          <Gauge label="Net RX" value={Math.min(100, netRx)} suffix=" MB/s" icon={Network} accent="info" />
          <Gauge label="Net TX" value={Math.min(100, netTx)} suffix=" MB/s" icon={Network} accent="info" />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: charts + info */}
          <div className="lg:col-span-2 space-y-5">
            <HistoryCharts />

            <Card>
              <SectionHeader icon={Container} title="Container Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                <InfoRow label="Image" value={d.image ?? "—"} mono copy={d.image} />
                <InfoRow label="Image Tag" value={d.image_tag ?? (d.image?.split(":")[1] ?? "latest")} mono />
                <InfoRow label="Container ID" value={String(d.container_id ?? d.id ?? "—").slice(0, 12)} mono copy={String(d.container_id ?? d.id ?? "")} />
                <InfoRow label="Created" value={d.created ?? d.created_at} />
                <InfoRow label="Running Since" value={d.started_at ?? d.uptime} />
                <InfoRow label="Restart Count" value={d.restart_count ?? d.restarts ?? 0} />
                <InfoRow label="Exit Code" value={d.exit_code ?? "—"} />
                <InfoRow label="Health" value={d.health ?? "—"} />
                <InfoRow label="Compose Project" value={d.compose_project ?? "—"} />
                <InfoRow label="Compose Service" value={d.compose_service ?? d.name} />
                <InfoRow label="Hostname" value={d.hostname ?? "—"} mono />
                <InfoRow label="Status" value={d.status ?? "—"} />
              </div>
            </Card>

            <Card>
              <SectionHeader icon={Network} title="Network" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Ports</div>
                  {ports.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No exposed ports</div>
                  ) : (
                    <div className="space-y-1.5">
                      {ports.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <Badge variant="outline" className="font-mono">{p.host || "—"}</Badge>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="outline" className="font-mono">{p.container || "—"}</Badge>
                          {p.protocol && <span className="text-muted-foreground text-[10px]">{p.protocol}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <InfoRow label="Networks" value={networks.join(", ") || "—"} />
                  <InfoRow label="IP Address" value={d.ip_address ?? d.ip} mono />
                  <InfoRow label="Gateway" value={d.gateway} mono />
                  <InfoRow label="DNS" value={Array.isArray(d.dns) ? d.dns.join(", ") : d.dns} mono />
                  <InfoRow label="MAC" value={d.mac_address ?? d.mac} mono />
                </div>
              </div>
            </Card>

            <Card>
              <SectionHeader icon={HardDrive} title="Volumes" />
              {volumes.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No volumes mounted</div>
              ) : (
                <div className="space-y-2">
                  {volumes.map((v, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs p-2 rounded-lg bg-background/40 border border-border/40">
                      <span className="font-mono truncate flex-1">{v.source}</span>
                      <span className="text-muted-foreground">↓</span>
                      <span className="font-mono truncate flex-1">{v.target}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {v.mode === "ro" ? "Read Only" : "Writable"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <EnvironmentCard env={env} />

            <RestartTimeline incidents={relatedIncidents} created={d.created ?? d.created_at} />
          </div>

          {/* Right: side panels */}
          <div className="space-y-5">
            <PerformanceScore score={score} label={scoreLabel} />
            <PredictionCard data={predictionQ.data} isLoading={predictionQ.isLoading} />

            <Card>
              <SectionHeader icon={Heart} title="Health Checks" />
              <div className="flex items-center gap-3 mb-3">
                <span className={cn("size-3 rounded-full animate-pulse", tone.dot)} />
                <span className="text-sm font-medium">{d.health ?? tone.label}</span>
              </div>
              <InfoRow label="Last Check" value={d.last_check ?? "—"} />
              <InfoRow label="Next Check" value={d.next_check ?? "—"} />
              <InfoRow label="Failures" value={d.health_failures ?? 0} />
              <InfoRow label="State" value={d.health_state ?? d.status ?? "—"} />
            </Card>

            <AutoHealCard d={d} />

            <Card>
              <SectionHeader icon={AlertTriangle} title="Related Incidents" />
              {relatedIncidents.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No recent incidents</div>
              ) : (
                <div className="space-y-2">
                  {relatedIncidents.map((i: any, idx: number) => {
                    const sev = i.severity ?? (i.status === "danger" ? "critical" : i.status === "warning" ? "warning" : "resolved");
                    const sevColor =
                      sev === "critical" ? "text-rose-300 border-rose-500/40" :
                      sev === "warning" ? "text-amber-300 border-amber-500/40" :
                      "text-emerald-300 border-emerald-500/40";
                    return (
                      <button
                        key={idx}
                        onClick={() => navigate({ to: "/incidents" })}
                        className="w-full text-left p-2.5 rounded-lg bg-background/40 border border-border/40 hover:border-primary/40 hover:bg-background/60 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <Badge variant="outline" className={cn("text-[10px]", sevColor)}>{sev}</Badge>
                          <span className="text-[10px] text-muted-foreground">{i.time}</span>
                        </div>
                        <div className="text-xs truncate">{i.text ?? i.detail ?? "Incident"}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <LogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} service={service} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? `Delete ${service}?`
                : confirm === "stop"
                  ? `Stop ${service}?`
                  : `Restart ${service}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "This permanently removes the container. Volumes may persist depending on your Docker config. This action cannot be undone."
                : confirm === "stop"
                  ? "This will stop the container. Dependent services may break until it's started again."
                  : "The container will briefly be unavailable while it restarts."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {confirm === "delete" ? "Delete" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppShell>
  );
}

// ────────────────────────────── subcomponents ──────────────────────────────

function HistoryCharts() {
  const [tab, setTab] = useState<"cpu" | "ram" | "disk" | "net">("cpu");
  const [range, setRange] = useState<RangeKey>("1h");
  const { series, isLive } = useMetrics(range);
  const data = series[tab];
  const color = {
    cpu: "hsl(var(--primary))",
    ram: "rgb(168,85,247)",
    disk: "rgb(56,189,248)",
    net: "rgb(34,197,94)",
  }[tab];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-primary" />
          Historical Metrics
          {isLive && (
            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          {(["15m", "1h", "6h", "24h", "7d"] as RangeKey[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-3">
          <TabsTrigger value="cpu">CPU</TabsTrigger>
          <TabsTrigger value="ram">Memory</TabsTrigger>
          <TabsTrigger value="disk">Disk</TabsTrigger>
          <TabsTrigger value="net">Network</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-0">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`g-${tab}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={() => ""}
                  formatter={(v: any) => [`${Math.round(Number(v))}%`, tab.toUpperCase()]}
                />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#g-${tab})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function EnvironmentCard({ env }: { env: { key: string; value: string }[] }) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <SectionHeader icon={Shield} title="Environment Variables" />
      {env.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No environment variables</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
          {env.map(({ key, value }) => {
            const sensitive = isSensitiveKey(key);
            const shown = !sensitive || reveal[key];
            return (
              <div key={key} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-background/40 border border-border/30">
                <span className="font-mono shrink-0 text-muted-foreground min-w-[140px] truncate">{key}</span>
                <span className="font-mono flex-1 truncate">
                  {shown ? value : "•".repeat(Math.min(16, Math.max(8, value.length)))}
                </span>
                {sensitive && (
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setReveal((r) => ({ ...r, [key]: !r[key] }))}
                  >
                    {shown ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                )}
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => copyText(value, key)}
                >
                  <Copy className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RestartTimeline({ incidents, created }: { incidents: any[]; created?: string }) {
  const events = [
    { type: "Created", time: created ?? "—", trigger: "Compose", by: "system" },
    ...incidents.map((i: any) => ({
      type: (i.action ?? i.status ?? "Event").toString(),
      time: i.time,
      trigger: i.detail ?? "—",
      by: i.action ? "Guardian" : "system",
    })),
  ];
  return (
    <Card>
      <SectionHeader icon={History} title="Restart Timeline" />
      <div className="relative pl-5 space-y-3">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border/60" />
        {events.map((e, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[18px] top-1 size-3 rounded-full bg-primary shadow-[0_0_10px_rgba(99,102,241,0.6)]" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium">{e.type}</span>
              <span className="text-[10px] text-muted-foreground">{e.time}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {e.trigger} · by {e.by}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AutoHealCard({ d }: { d: any }) {
  const [enabled, setEnabled] = useState<boolean>(!!(d.autoHeal ?? d.autoheal));
  useEffect(() => setEnabled(!!(d.autoHeal ?? d.autoheal)), [d.autoHeal, d.autoheal]);
  return (
    <Card>
      <SectionHeader icon={Shield} title="Auto-Healing" />
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">Status</span>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            toast.success(`Auto-heal ${v ? "enabled" : "disabled"}`);
          }}
        />
      </div>
      <InfoRow label="Policy" value={d.autoheal_policy ?? "on-failure"} />
      <InfoRow label="Cooldown" value={d.autoheal_cooldown ?? "60s"} />
      <InfoRow label="Retry Count" value={d.autoheal_retries ?? 3} />
      <InfoRow label="Last Recovery" value={d.last_recovery ?? d.lastRestart ?? "—"} />
    </Card>
  );
}

function PerformanceScore({ score, label }: { score: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color =
    score >= 90 ? "stroke-emerald-400" :
    score >= 70 ? "stroke-primary" :
    score >= 50 ? "stroke-amber-400" :
    "stroke-rose-400";
  return (
    <Card className="flex flex-col items-center py-6">
      <div className="text-xs text-muted-foreground mb-3">Performance Score</div>
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} className="stroke-border/40 fill-none" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
            className={cn(color, "transition-all duration-700 drop-shadow-[0_0_8px_currentColor]")}
            strokeDasharray={c} strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-semibold tabular-nums">
            <AnimatedNumber value={score} />
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </Card>
  );
}

function PredictionCard({ data, isLoading }: { data: any; isLoading: boolean }) {
  const risk = String(data?.risk ?? "").toLowerCase();
  const riskTone =
    risk === "high" || risk === "critical" ? "text-rose-300 border-rose-500/40" :
    risk === "medium" || risk === "warning" ? "text-amber-300 border-amber-500/40" :
    risk ? "text-emerald-300 border-emerald-500/40" : "text-muted-foreground";
  return (
    <Card>
      <SectionHeader icon={Sparkles} title="Guardian AI Prediction" />
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !data ? (
        <div className="text-xs text-muted-foreground italic">No prediction available yet.</div>
      ) : (
        <div className="space-y-2">
          {data.risk && (
            <Badge variant="outline" className={cn("gap-1 text-[10px]", riskTone)}>
              Risk: {data.risk}
              {typeof data.confidence === "number" && <span className="opacity-70">· {Math.round(data.confidence * 100)}%</span>}
            </Badge>
          )}
          {data.summary && <p className="text-xs leading-relaxed">{data.summary}</p>}
          {data.next_event && <InfoRow label="Next Event" value={data.next_event} />}
          {data.recommendation && (
            <div className="text-xs p-2 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-primary font-medium">Recommended: </span>{data.recommendation}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}



// ────────────────────────────── Logs Drawer ──────────────────────────────

function LogsDrawer({ open, onClose, service }: { open: boolean; onClose: () => void; service: string }) {
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logsQ = useServiceLogs(open ? service : null, paused);

  const lines = useMemo(() => {
    const raw = logsQ.data;
    if (!raw) return [] as string[];
    if (typeof raw === "string") return raw.split("\n");
    if (Array.isArray((raw as any).lines)) return (raw as any).lines as string[];
    if (typeof (raw as any).logs === "string") return ((raw as any).logs as string).split("\n");
    return [];
  }, [logsQ.data]);

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      if (filter === "error" && !/error|fatal|fail/i.test(l)) return false;
      if (filter === "warn" && !/warn/i.test(l)) return false;
      if (search && !l.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [lines, search, filter]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  const downloadLogs = () => {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${service}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <Terminal className="size-4" /> {service} · logs
          </SheetTitle>
        </SheetHeader>
        <div className="p-3 border-b border-border/60 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search logs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? <PlayCircle className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? "Resume" : "Pause"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "error", "warn"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "error" ? "Errors" : "Warnings"}
              </Button>
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => copyText(lines.join("\n"), "Logs")}>
              <Copy className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadLogs}>
              <Download className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant={autoScroll ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setAutoScroll((s) => !s)}
            >
              Auto-scroll
            </Button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-black/60 font-mono text-[11px] leading-relaxed p-3"
        >
          {logsQ.isLoading && lines.length === 0 ? (
            <div className="text-muted-foreground">Loading logs…</div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground italic">No matching log lines</div>
          ) : (
            filtered.map((l, i) => {
              const isErr = /error|fatal|fail/i.test(l);
              const isWarn = /warn/i.test(l);
              return (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    isErr && "text-rose-300",
                    !isErr && isWarn && "text-amber-300",
                    !isErr && !isWarn && "text-foreground/80",
                  )}
                >
                  {l}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Unused-import guard for tree-shaken icons
void Eye; void EyeOff; void CircleDot; void Progress; void Link; void X; void CheckCircle2;
