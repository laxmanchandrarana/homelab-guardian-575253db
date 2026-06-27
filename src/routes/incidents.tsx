import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  TimerReset,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/AppShell";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useIncidents,
  useIncidentDetail,
  useMetrics,
  useNotifications,
  useRestartService,
} from "@/hooks/useGuardianData";
import { useGuardianSocket } from "@/hooks/useGuardianSocket";
import type { RangeKey } from "@/lib/api";

export const Route = createFileRoute("/incidents")({
  head: () => ({ meta: [{ title: "Incident Center — Homelab Guardian" }] }),
  component: IncidentsPage,
});

type Severity = "critical" | "warning" | "resolved" | "info";
type StatusKey = "open" | "investigating" | "resolved";

type TimelineRow = {
  id?: string | number;
  rawId?: string | number;
  time: string;
  service: string;
  text: string;
  status: string;
  detail?: string;
  action?: string;
  severity?: string;
};

type NotifRow = {
  time: string;
  text: string;
  status: string;
  channel?: string;
  deliveryStatus?: string;
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  resolved: "Resolved",
  info: "Info",
};

const SEVERITY_STYLES: Record<Severity, { dot: string; chip: string; ring: string; bar: string }> = {
  critical: {
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
    ring: "ring-destructive/30",
    bar: "bg-destructive",
  },
  warning: {
    dot: "bg-warning",
    chip: "bg-warning/15 text-warning ring-1 ring-warning/30",
    ring: "ring-warning/30",
    bar: "bg-warning",
  },
  resolved: {
    dot: "bg-success",
    chip: "bg-success/15 text-success ring-1 ring-success/30",
    ring: "ring-success/30",
    bar: "bg-success",
  },
  info: {
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground ring-1 ring-border",
    ring: "ring-border",
    bar: "bg-muted-foreground",
  },
};

function severityFromStatus(s: string | undefined, fallback?: Severity): Severity {
  const v = (s ?? "").toLowerCase();
  if (["critical", "danger", "down", "error"].includes(v)) return "critical";
  if (["warning", "warn", "degraded"].includes(v)) return "warning";
  if (["resolved", "healthy", "recovered", "ok"].includes(v)) return "resolved";
  return fallback ?? "info";
}

function statusKeyFor(s: string | undefined): StatusKey {
  const v = (s ?? "").toLowerCase();
  if (["resolved", "healthy", "recovered", "ok", "closed"].includes(v)) return "resolved";
  if (["investigating", "restarting", "pending"].includes(v)) return "investigating";
  return "open";
}

function parseTime(t: string | number | undefined): number {
  if (!t) return 0;
  if (typeof t === "number") return t;
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeTime(t: string | number | undefined): string {
  const ms = parseTime(t);
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60_000);
  if (m < 1) return diff >= 0 ? "just now" : "in <1m";
  if (m < 60) return diff >= 0 ? `${m}m ago` : `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return diff >= 0 ? `${h}h ago` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return diff >= 0 ? `${d}d ago` : `in ${d}d`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function IncidentsPage() {
  useGuardianSocket();
  const { timeline, isLoading, isLive, error, refetch } = useIncidents();
  const { events: notifications } = useNotifications();

  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [status, setStatus] = useState<"all" | StatusKey>("all");
  const [service, setService] = useState<"all" | string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "critical">("newest");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const rows: TimelineRow[] = useMemo(
    () => timeline.map((t, i) => ({ ...t, rawId: t.id ?? `${t.service}-${i}` })),
    [timeline],
  );

  const services = useMemo(
    () => Array.from(new Set(rows.map((r) => r.service))).filter(Boolean).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const sev = severityFromStatus(r.status, r.severity as Severity);
      const st = statusKeyFor(r.status);
      if (severity !== "all" && sev !== severity) return false;
      if (status !== "all" && st !== status) return false;
      if (service !== "all" && r.service !== service) return false;
      if (q) {
        const hay = `${r.service} ${r.text} ${r.detail ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sortBy === "newest") sorted.sort((a, b) => parseTime(b.time) - parseTime(a.time));
    if (sortBy === "oldest") sorted.sort((a, b) => parseTime(a.time) - parseTime(b.time));
    if (sortBy === "critical") {
      const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2, resolved: 3 };
      sorted.sort((a, b) => {
        const ra = rank[severityFromStatus(a.status, a.severity as Severity)];
        const rb = rank[severityFromStatus(b.status, b.severity as Severity)];
        if (ra !== rb) return ra - rb;
        return parseTime(b.time) - parseTime(a.time);
      });
    }
    return sorted;
  }, [rows, query, severity, status, service, sortBy]);

  const summary = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let active = 0;
    let resolvedToday = 0;
    let critical = 0;
    let warnings = 0;
    let totalRecovery = 0;
    let recoveryCount = 0;
    for (const r of rows) {
      const sev = severityFromStatus(r.status, r.severity as Severity);
      const st = statusKeyFor(r.status);
      if (sev === "critical" && st !== "resolved") critical++;
      if (sev === "warning" && st !== "resolved") warnings++;
      if (st !== "resolved") active++;
      if (st === "resolved" && parseTime(r.time) >= todayStart.getTime()) resolvedToday++;
      const anyR = r as unknown as { duration_ms?: number; recovery_ms?: number };
      const dur = anyR.recovery_ms ?? anyR.duration_ms;
      if (typeof dur === "number") {
        totalRecovery += dur;
        recoveryCount++;
      }
    }
    const avgRecovery = recoveryCount > 0 ? totalRecovery / recoveryCount : 0;
    return { active, resolvedToday, critical, warnings, avgRecovery };
  }, [rows]);

  const selected = useMemo(
    () => rows.find((r) => String(r.rawId) === String(selectedId)) ?? null,
    [rows, selectedId],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Incident Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Investigate alerts, outages and auto-healing actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("gap-1.5", isLive ? "text-success" : "text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-success animate-pulse" : "bg-muted-foreground")} />
              {isLive ? "Live" : "Demo"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </header>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="Active" value={summary.active} icon={AlertOctagon} tone="critical" />
          <SummaryCard label="Resolved Today" value={summary.resolvedToday} icon={CheckCircle2} tone="success" />
          <SummaryCard label="Critical" value={summary.critical} icon={AlertTriangle} tone="critical" />
          <SummaryCard label="Warnings" value={summary.warnings} icon={AlertTriangle} tone="warning" />
          <SummaryCard
            label="Avg Recovery"
            value={summary.avgRecovery}
            icon={TimerReset}
            tone="info"
            formatter={(v) => formatDuration(v)}
          />
        </div>

        {/* Filters */}
        <Card className="surface-card">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search service, title, detail…"
                className="pl-8"
              />
            </div>
            <FilterSelect
              value={severity}
              onChange={(v) => setSeverity(v as Severity | "all")}
              placeholder="Severity"
              options={[
                { value: "all", label: "All severities" },
                { value: "critical", label: "Critical" },
                { value: "warning", label: "Warning" },
                { value: "resolved", label: "Resolved" },
                { value: "info", label: "Info" },
              ]}
            />
            <FilterSelect
              value={status}
              onChange={(v) => setStatus(v as StatusKey | "all")}
              placeholder="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "open", label: "Open" },
                { value: "investigating", label: "Investigating" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
            <FilterSelect
              value={service}
              onChange={setService}
              placeholder="Service"
              options={[
                { value: "all", label: "All services" },
                ...services.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              value={sortBy}
              onChange={(v) => setSortBy(v as typeof sortBy)}
              placeholder="Sort by"
              options={[
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "critical", label: "Critical first" },
              ]}
            />
            {(query || severity !== "all" || status !== "all" || service !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setSeverity("all");
                  setStatus("all");
                  setService("all");
                }}
              >
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              <Filter className="mr-1 inline h-3.5 w-3.5" />
              {filtered.length} of {rows.length}
            </span>
          </CardContent>
        </Card>

        {/* Timeline + side */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="surface-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Incident Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TimelineSkeleton />
              ) : error ? (
                <ErrorBlock onRetry={() => refetch()} />
              ) : filtered.length === 0 ? (
                <EmptyBlock />
              ) : (
                <ol className="relative space-y-3 pl-6">
                  <span className="pointer-events-none absolute left-2 top-2 bottom-2 w-px bg-border" />
                  <AnimatePresence initial={false}>
                    {filtered.map((row, i) => {
                      const sev = severityFromStatus(row.status, row.severity as Severity);
                      const st = statusKeyFor(row.status);
                      const styles = SEVERITY_STYLES[sev];
                      return (
                        <motion.li
                          key={String(row.rawId ?? i)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2) }}
                          className="relative"
                        >
                          <span
                            className={cn(
                              "absolute -left-[18px] top-3 grid h-3 w-3 place-items-center rounded-full ring-4 ring-background",
                              styles.dot,
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedId(row.rawId ?? null)}
                            className={cn(
                              "group w-full rounded-lg border border-border bg-card/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-md",
                              "ring-1 ring-transparent",
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles.chip)}>
                                {SEVERITY_LABEL[sev]}
                              </span>
                              <span className="text-sm font-medium">{row.service}</span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="truncate text-sm text-muted-foreground">{row.text}</span>
                              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {relativeTime(row.time)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Activity className="h-3 w-3" /> Status: <span className="text-foreground/80">{st}</span>
                              </span>
                              {row.action && (
                                <span className="inline-flex items-center gap-1">
                                  <RotateCw className="h-3 w-3" /> {row.action}
                                </span>
                              )}
                            </div>
                            {row.detail && (
                              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.detail}</p>
                            )}
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
              )}
            </CardContent>
          </Card>

          <Card className="surface-card h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.slice(0, 8).map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-xs">
                  <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground/90">{n.text}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {n.channel && <Badge variant="outline" className="h-4 px-1 text-[10px]">{n.channel}</Badge>}
                      <span>{relativeTime(n.time)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-xs text-muted-foreground">No notifications yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DetailDrawer
        incident={selected}
        onClose={() => setSelectedId(null)}
      />
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  formatter,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "critical" | "warning" | "success" | "info";
  formatter?: (v: number) => string;
}) {
  const toneClass = {
    critical: "text-destructive",
    warning: "text-warning",
    success: "text-success",
    info: "text-primary",
  }[tone];
  return (
    <Card className="surface-card transition-transform hover:-translate-y-0.5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={cn("h-4 w-4", toneClass)} />
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {formatter ? formatter(value) : <AnimatedNumber value={value} />}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid place-items-center gap-3 py-12 text-center">
      <AlertOctagon className="h-8 w-8 text-destructive" />
      <div>
        <div className="text-sm font-medium">Couldn't load incidents</div>
        <div className="text-xs text-muted-foreground">Check the API connection and try again.</div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success ring-1 ring-success/30">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <div>
        <div className="text-sm font-medium">No incidents found</div>
        <div className="text-xs text-muted-foreground">Everything looks healthy — adjust filters to see more.</div>
      </div>
    </div>
  );
}

function DetailDrawer({
  incident,
  onClose,
}: {
  incident: TimelineRow | null;
  onClose: () => void;
}) {
  const open = !!incident;
  const id = incident?.rawId ?? null;
  const { data: detail, isLoading: detailLoading } = useIncidentDetail(open ? id : null);
  const restart = useRestartService();
  const [range, setRange] = useState<RangeKey>("1h");
  const { series, isLoading: metricsLoading } = useMetrics(range);
  const { events: notifications } = useNotifications();

  if (!incident) {
    return (
      <Sheet open={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const sev = severityFromStatus(incident.status, incident.severity as Severity);
  const st = statusKeyFor(incident.status);
  const styles = SEVERITY_STYLES[sev];

  const d = (detail ?? {}) as Record<string, unknown>;
  const started = (d.started as string) ?? (d.created_at as string) ?? incident.time;
  const ended = (d.ended as string) ?? (d.resolved_at as string);
  const recoveryMs =
    typeof d.recovery_ms === "number"
      ? (d.recovery_ms as number)
      : ended
      ? parseTime(ended) - parseTime(started)
      : 0;
  const rootCause = (d.root_cause as string) ?? (d.cause as string);
  const autoHealActions = Array.isArray(d.auto_heal_actions) ? (d.auto_heal_actions as string[]) : [];
  const events = Array.isArray(d.timeline)
    ? (d.timeline as { time: string; text: string; icon?: string }[])
    : Array.isArray(d.events)
    ? (d.events as { time: string; text: string }[])
    : [];

  const relatedNotifs = notifications.filter((n) =>
    incident.service ? (n.text ?? "").toLowerCase().includes(incident.service.toLowerCase()) : true,
  );

  const handleRestart = () => {
    if (!incident.service) return;
    toast.promise(restart.mutateAsync(incident.service), {
      loading: `Restarting ${incident.service}…`,
      success: `${incident.service} restart requested`,
      error: "Restart failed",
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ id, ...incident, detail: detail ?? null }, null, 2),
      );
      toast.success("Incident copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-xl"
      >
        <div className={cn("border-b border-border p-5", "bg-gradient-to-b from-card to-background")}>
          <SheetHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles.chip)}>
                {SEVERITY_LABEL[sev]}
              </span>
              <Badge variant="outline" className="text-[10px] uppercase">{st}</Badge>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {relativeTime(started)}
              </span>
            </div>
            <SheetTitle className="text-lg">{incident.text || incident.service}</SheetTitle>
            <SheetDescription>
              {incident.service}
              {rootCause ? ` · ${rootCause}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Started" value={started ? new Date(parseTime(started)).toLocaleTimeString() : "—"} />
            <Stat label="Ended" value={ended ? new Date(parseTime(ended)).toLocaleTimeString() : "—"} />
            <Stat label="Recovery" value={formatDuration(recoveryMs)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleRestart} disabled={restart.isPending}>
              {restart.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              Restart Service
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/services?focus=${encodeURIComponent(incident.service)}`}>
                <ExternalLink className="h-4 w-4" /> View Service
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="p-5">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="notifs">Notifs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {detailLoading && <Skeleton className="h-24 w-full" />}
            {incident.detail && (
              <Section title="Detail">
                <p className="text-sm text-foreground/90">{incident.detail}</p>
              </Section>
            )}
            {rootCause && (
              <Section title="Root Cause">
                <p className="text-sm">{rootCause}</p>
              </Section>
            )}
            <Section title="Auto Heal Actions">
              {autoHealActions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No auto-heal actions recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {autoHealActions.map((a, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <RotateCw className="h-3.5 w-3.5 text-primary" /> {a}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="AI Insights">
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                No AI analysis available. Coming in Phase 4.
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No event log available for this incident.</p>
            ) : (
              <ol className="relative space-y-3 pl-5">
                <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className={cn("absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background", styles.bar)} />
                    <div className="text-xs text-muted-foreground">
                      {new Date(parseTime(e.time)).toLocaleTimeString()}
                    </div>
                    <div className="text-sm">{e.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Range</span>
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["15m", "1h", "6h", "24h"] as RangeKey[]).map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniChart title="CPU" data={series.cpu} loading={metricsLoading} />
              <MiniChart title="Memory" data={series.ram} loading={metricsLoading} />
              <MiniChart title="Network" data={series.net} loading={metricsLoading} />
              <MiniChart title="Disk" data={series.disk} loading={metricsLoading} />
            </div>
          </TabsContent>

          <TabsContent value="notifs" className="mt-4 space-y-2">
            {relatedNotifs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notifications matched this service.</p>
            ) : (
              relatedNotifs.map((n, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-md border border-border/60 p-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Bell className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <div className="text-foreground/90">{n.text}</div>
                      <div className="text-[10px] text-muted-foreground">{relativeTime(n.time)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {n.channel && <Badge variant="outline" className="h-5 text-[10px]">{n.channel}</Badge>}
                    {n.deliveryStatus && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 text-[10px]",
                          n.deliveryStatus === "delivered" && "text-success",
                          n.deliveryStatus === "failed" && "text-destructive",
                        )}
                      >
                        {n.deliveryStatus}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function MiniChart({
  title,
  data,
  loading,
}: {
  title: string;
  data: { t: number; v: number }[];
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-24 w-full" />;
  const current = data.at(-1)?.v ?? 0;
  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{title}</span>
        <span className="tabular-nums text-foreground/80">{Math.round(current)}%</span>
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`g-${title}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
              labelFormatter={() => ""}
              formatter={(v: number) => [`${Math.round(v)}%`, title]}
            />
            <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" fill={`url(#g-${title})`} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
