import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Search,
  Star,
  StarOff,
  RefreshCw,
  Download,
  Share2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Boxes,
  Server,
  Radio,
  Database,
  Sparkles,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMetrics, useServices, useIncidents } from "@/hooks/useGuardianData";
import { useGuardianSocket } from "@/hooks/useGuardianSocket";
import type { RangeKey } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring Explorer — Homelab Guardian" }] }),
  component: MonitoringExplorer,
});

// ---------- Metric Catalog ----------
type MetricDef = {
  name: string;
  description: string;
  series: keyof ReturnType<typeof useMetrics>["series"];
  unit?: string;
};
type MetricGroup = { id: string; label: string; icon: any; metrics: MetricDef[] };

const CATALOG: MetricGroup[] = [
  {
    id: "cpu",
    label: "CPU",
    icon: Cpu,
    metrics: [
      { name: "container_cpu_usage_seconds_total", description: "Cumulative CPU usage per container.", series: "cpu", unit: "%" },
      { name: "node_load1", description: "1-minute system load average.", series: "cpu" },
      { name: "process_cpu_seconds_total", description: "Per-process CPU consumption.", series: "cpu", unit: "%" },
    ],
  },
  {
    id: "memory",
    label: "Memory",
    icon: MemoryStick,
    metrics: [
      { name: "container_memory_usage_bytes", description: "Container resident memory.", series: "ram", unit: "%" },
      { name: "node_memory_MemAvailable_bytes", description: "Memory available to userspace.", series: "ram", unit: "%" },
    ],
  },
  {
    id: "disk",
    label: "Disk",
    icon: HardDrive,
    metrics: [
      { name: "node_filesystem_avail_bytes", description: "Filesystem space available.", series: "disk", unit: "%" },
      { name: "node_disk_io_time_seconds_total", description: "I/O time per device.", series: "disk" },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: Wifi,
    metrics: [
      { name: "node_network_receive_bytes_total", description: "Bytes received per interface.", series: "net", unit: "Mb/s" },
      { name: "node_network_transmit_bytes_total", description: "Bytes transmitted per interface.", series: "net", unit: "Mb/s" },
    ],
  },
  {
    id: "docker",
    label: "Docker",
    icon: Boxes,
    metrics: [{ name: "container_last_seen", description: "Last time a container was seen by cAdvisor.", series: "cpu" }],
  },
  {
    id: "node",
    label: "Node Exporter",
    icon: Server,
    metrics: [{ name: "node_uname_info", description: "Kernel and host metadata.", series: "cpu" }],
  },
  {
    id: "blackbox",
    label: "Blackbox",
    icon: Radio,
    metrics: [{ name: "probe_success", description: "1 if last probe succeeded, 0 otherwise.", series: "net" }],
  },
  {
    id: "prom",
    label: "Prometheus",
    icon: Database,
    metrics: [{ name: "up", description: "Target health (1=up, 0=down).", series: "cpu" }],
  },
];

const ALL_METRICS: MetricDef[] = CATALOG.flatMap((g) => g.metrics);

// ---------- Toolbar config ----------
const RANGES: { value: RangeKey; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
];

const REFRESH_OPTIONS = [
  { v: 0, l: "Off" },
  { v: 5, l: "5s" },
  { v: 10, l: "10s" },
  { v: 30, l: "30s" },
  { v: 60, l: "1m" },
  { v: 300, l: "5m" },
];

// ---------- Local storage helpers ----------
function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV] as const;
}

// ---------- Main Component ----------
function MonitoringExplorer() {
  const [range, setRange] = useState<RangeKey>("1h");
  const [refreshSec, setRefreshSec] = useState(10);
  const [selected, setSelected] = useState<MetricDef[]>([ALL_METRICS[0], ALL_METRICS[3]]);
  const [activeMetric, setActiveMetric] = useState<MetricDef>(ALL_METRICS[0]);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useLocal<string[]>("mon.favs", []);
  const [recents, setRecents] = useLocal<string[]>("mon.recents", []);
  const [compareServices, setCompareServices] = useState<string[]>([]);
  const [crosshair, setCrosshair] = useState<{ t: number; vals: Record<string, number> } | null>(null);

  const { series, isLoading, isLive, refetch } = useMetrics(range);
  const { services } = useServices();
  const { timeline } = useIncidents();
  const socket = useGuardianSocket();

  // Auto-refresh
  useEffect(() => {
    if (!refreshSec) return;
    const id = setInterval(() => refetch(), refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, refetch]);

  // Merge series for selected metrics into chart data
  const chartData = useMemo(() => {
    const len = Math.max(...selected.map((m) => series[m.series]?.length ?? 0), 0);
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, number> = { t: i };
      selected.forEach((m) => {
        row[m.name] = series[m.series]?.[i]?.v ?? 0;
      });
      return row;
    });
  }, [series, selected]);

  // Stats for the active metric
  const activeStats = useMemo(() => {
    const s = series[activeMetric.series] ?? [];
    if (!s.length) return { current: 0, min: 0, max: 0, avg: 0 };
    const vs = s.map((p) => p.v);
    return {
      current: vs[vs.length - 1],
      min: Math.min(...vs),
      max: Math.max(...vs),
      avg: vs.reduce((a, b) => a + b, 0) / vs.length,
    };
  }, [series, activeMetric]);

  // Incident markers on chart
  const incidentMarkers = useMemo(() => {
    return timeline.slice(0, 6).map((inc, i) => ({
      ...inc,
      x: Math.floor((chartData.length / 6) * (i + 0.5)),
      y: chartData[Math.floor((chartData.length / 6) * (i + 0.5))]?.[activeMetric.name] ?? 50,
    }));
  }, [timeline, chartData, activeMetric.name]);

  const filteredCatalog = useMemo(() => {
    if (!search) return CATALOG;
    const q = search.toLowerCase();
    return CATALOG.map((g) => ({
      ...g,
      metrics: g.metrics.filter((m) => m.name.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)),
    })).filter((g) => g.metrics.length);
  }, [search]);

  const addMetric = (m: MetricDef) => {
    setActiveMetric(m);
    setRecents((r) => [m.name, ...r.filter((x) => x !== m.name)].slice(0, 6));
    if (!selected.some((s) => s.name === m.name)) {
      setSelected((s) => [...s, m]);
    }
  };

  const removeMetric = (name: string) =>
    setSelected((s) => (s.length > 1 ? s.filter((x) => x.name !== name) : s));

  const toggleFav = (name: string) =>
    setFavorites((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name]));

  const exportCSV = () => {
    const headers = ["t", ...selected.map((m) => m.name)].join(",");
    const rows = chartData.map((r) => [r.t, ...selected.map((m) => r[m.name])].join(","));
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `metrics-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ range, metrics: selected.map((m) => m.name), data: chartData }, null, 2)],
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `metrics-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exported");
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
  // Fallback to direct OKLCH colors if --chart vars not set
  const palette = ["#22d3ee", "#a78bfa", "#34d399", "#f59e0b", "#f472b6"];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1800px] space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Monitoring Explorer</h1>
              <p className="text-sm text-muted-foreground">
                Inspect metrics, compare services, and investigate incidents.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("status-dot", isLive ? "text-success" : "text-warning")} />
            <span className="text-muted-foreground">{isLive ? "Live data" : "Demo mode"}</span>
            <span className="mx-2 text-border">·</span>
            <span className="text-muted-foreground">WS: {socket.label}</span>
          </div>
        </div>

        {/* Toolbar */}
        <Card className="surface-card">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={cn(
                    "h-7 rounded px-2.5 text-xs font-medium transition-colors",
                    range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <Select value={String(refreshSec)} onValueChange={(v) => setRefreshSec(Number(v))}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder="Refresh" />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={String(o.v)}>Auto: {o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportJSON}>
                <Download className="h-3.5 w-3.5" /> JSON
              </Button>
              <Button variant="outline" size="sm" onClick={share}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main 3-column grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
          {/* LEFT — Metric Browser */}
          <Card className="surface-card h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Metric Browser</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search metrics…"
                  className="h-8 pl-7 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {favorites.length > 0 && (
                <Section title="Favorites" defaultOpen>
                  {favorites.map((n) => {
                    const m = ALL_METRICS.find((x) => x.name === n);
                    if (!m) return null;
                    return <MetricRow key={n} metric={m} onClick={() => addMetric(m)} fav onFav={() => toggleFav(n)} />;
                  })}
                </Section>
              )}

              {recents.length > 0 && (
                <Section title="Recent" defaultOpen>
                  {recents.map((n) => {
                    const m = ALL_METRICS.find((x) => x.name === n);
                    if (!m) return null;
                    return (
                      <MetricRow
                        key={n}
                        metric={m}
                        onClick={() => addMetric(m)}
                        fav={favorites.includes(n)}
                        onFav={() => toggleFav(n)}
                      />
                    );
                  })}
                </Section>
              )}

              <div className="space-y-1.5">
                {filteredCatalog.map((g) => (
                  <Section key={g.id} title={g.label} icon={g.icon} defaultOpen={!!search}>
                    {g.metrics.map((m) => (
                      <MetricRow
                        key={m.name}
                        metric={m}
                        onClick={() => addMetric(m)}
                        fav={favorites.includes(m.name)}
                        onFav={() => toggleFav(m.name)}
                      />
                    ))}
                  </Section>
                ))}
                {filteredCatalog.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">No metrics match “{search}”.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* CENTER — Chart + Query Builder + Compare */}
          <div className="space-y-4">
            <Card className="surface-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-mono text-sm">{activeMetric.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{activeMetric.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selected.map((m, i) => (
                    <Badge key={m.name} variant="outline" className="h-6 gap-1.5 pr-1 font-mono text-[10px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
                      {m.name.length > 28 ? `${m.name.slice(0, 26)}…` : m.name}
                      {selected.length > 1 && (
                        <button
                          onClick={() => removeMetric(m.name)}
                          className="ml-1 rounded hover:bg-muted"
                          aria-label={`Remove ${m.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[380px] w-full" />
                ) : chartData.length === 0 ? (
                  <EmptyChart onRetry={refetch} />
                ) : (
                  <div className="h-[380px] w-full">
                    <ResponsiveContainer>
                      <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                        onMouseMove={(s: any) => {
                          if (s?.activeLabel != null && s?.activePayload) {
                            const vals: Record<string, number> = {};
                            s.activePayload.forEach((p: any) => (vals[p.dataKey] = p.value));
                            setCrosshair({ t: s.activeLabel, vals });
                          }
                        }}
                        onMouseLeave={() => setCrosshair(null)}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {selected.map((m, i) => (
                          <Line
                            key={m.name}
                            type="monotone"
                            dataKey={m.name}
                            stroke={palette[i % palette.length]}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive
                            animationDuration={400}
                          />
                        ))}
                        {incidentMarkers.map((inc, i) => (
                          <ReferenceDot
                            key={i}
                            x={inc.x}
                            y={inc.y}
                            r={5}
                            fill={inc.status === "danger" ? "hsl(var(--destructive))" : inc.status === "warning" ? "hsl(var(--warning))" : "hsl(var(--success))"}
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                            ifOverflow="extendDomain"
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {crosshair && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>t={crosshair.t}</span>
                    {Object.entries(crosshair.vals).map(([k, v]) => (
                      <span key={k} className="font-mono">{k.split("_").pop()}: {v.toFixed(1)}</span>
                    ))}
                  </div>
                )}
                {incidentMarkers.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 text-warning" /> Incident overlay:
                    {incidentMarkers.slice(0, 3).map((inc, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {inc.time} · {inc.text}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Query Builder */}
            <QueryBuilder />

            {/* Service Comparison */}
            <Card className="surface-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Boxes className="h-4 w-4" /> Service Comparison
                </CardTitle>
                <p className="text-xs text-muted-foreground">Pick services to compare CPU, RAM, and uptime.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {services.slice(0, 12).map((s) => {
                    const on = compareServices.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        onClick={() =>
                          setCompareServices((c) => (on ? c.filter((x) => x !== s.name) : [...c, s.name]))
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          on
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>

                {compareServices.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Select services above to compare metrics.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1.5 pr-2 font-medium">Service</th>
                          <th className="py-1.5 pr-2 font-medium">Status</th>
                          <th className="py-1.5 pr-2 font-medium">CPU</th>
                          <th className="py-1.5 pr-2 font-medium">RAM</th>
                          <th className="py-1.5 pr-2 font-medium">Uptime</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareServices.map((name) => {
                          const s = services.find((x) => x.name === name);
                          if (!s) return null;
                          return (
                            <tr key={name} className="border-t border-border/50">
                              <td className="py-2 pr-2 font-medium">{s.name}</td>
                              <td className="py-2 pr-2">
                                <span className={cn("status-dot mr-1.5",
                                  s.status === "healthy" ? "text-success" : s.status === "warning" ? "text-warning" : "text-destructive")} />
                                {s.status}
                              </td>
                              <td className="py-2 pr-2 font-mono">{s.cpu}%</td>
                              <td className="py-2 pr-2 font-mono">{s.ram}</td>
                              <td className="py-2 pr-2">{s.uptime}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — Metric Details */}
          <Card className="surface-card h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Metric Details</span>
                <button onClick={() => toggleFav(activeMetric.name)} className="text-muted-foreground hover:text-warning">
                  {favorites.includes(activeMetric.name) ? <Star className="h-4 w-4 fill-warning text-warning" /> : <StarOff className="h-4 w-4" />}
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="break-all font-mono text-xs text-primary">{activeMetric.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{activeMetric.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat label="Current" value={activeStats.current.toFixed(1)} unit={activeMetric.unit} accent="primary" />
                <Stat label="Average" value={activeStats.avg.toFixed(1)} unit={activeMetric.unit} />
                <Stat label="Min" value={activeStats.min.toFixed(1)} unit={activeMetric.unit} accent="success" />
                <Stat label="Max" value={activeStats.max.toFixed(1)} unit={activeMetric.unit} accent="warning" />
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Associated Services</div>
                <div className="flex flex-wrap gap-1">
                  {services.slice(0, 4).map((s) => (
                    <Badge key={s.name} variant="outline" className="text-[10px]">{s.name}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Alert Rules</div>
                <div className="space-y-1.5">
                  <AlertRule name="HighCPU" expr={`${activeMetric.name} > 80`} severity="critical" />
                  <AlertRule name="ElevatedUsage" expr={`${activeMetric.name} > 60`} severity="warning" />
                </div>
              </div>

              <div className="border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                Last updated <span className="text-foreground/80">just now</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- Subcomponents ----------
function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: any;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5 pl-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function MetricRow({
  metric,
  onClick,
  fav,
  onFav,
}: {
  metric: MetricDef;
  onClick: () => void;
  fav?: boolean;
  onFav: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent">
      <button onClick={onClick} className="flex-1 truncate text-left font-mono text-[11px] text-foreground/90">
        {metric.name}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onFav(); }}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Favorite"
      >
        {fav ? <Star className="h-3 w-3 fill-warning text-warning" /> : <StarOff className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: "primary" | "success" | "warning";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-lg font-semibold",
          accent === "primary" && "text-primary",
          accent === "success" && "text-success",
          accent === "warning" && "text-warning",
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function AlertRule({ name, expr, severity }: { name: string; expr: string; severity: "critical" | "warning" }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{name}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            severity === "critical" ? "border-destructive/60 text-destructive" : "border-warning/60 text-warning",
          )}
        >
          {severity}
        </Badge>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{expr}</div>
    </div>
  );
}

function EmptyChart({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid h-[380px] place-items-center rounded-md border border-dashed border-border">
      <div className="text-center">
        <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">No data for the selected range.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </div>
  );
}

// ---------- Query Builder ----------
const AGGREGATIONS = ["sum", "avg", "max", "min", "count"] as const;
const FUNCTIONS = ["none", "rate", "increase"] as const;

function QueryBuilder() {
  const [metric, setMetric] = useState(ALL_METRICS[0].name);
  const [func, setFunc] = useState<(typeof FUNCTIONS)[number]>("rate");
  const [agg, setAgg] = useState<(typeof AGGREGATIONS)[number]>("sum");
  const [groupBy, setGroupBy] = useState("name");
  const [filter, setFilter] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState("");

  const built = useMemo(() => {
    const filt = filter ? `{${filter}}` : "";
    const inner = func === "none" ? `${metric}${filt}` : `${func}(${metric}${filt}[5m])`;
    const by = groupBy ? ` by (${groupBy})` : "";
    return `${agg}(${inner})${by}`;
  }, [metric, func, agg, groupBy, filter]);

  const query = advanced ? raw : built;

  return (
    <Card className="surface-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Prometheus Query Builder
          </span>
          <button
            onClick={() => { setAdvanced((a) => !a); if (!advanced) setRaw(built); }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {advanced ? "Visual mode" : "Advanced (PromQL)"}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {advanced ? (
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="sum(rate(metric[5m])) by (label)"
            className="min-h-[80px] font-mono text-xs"
          />
        ) : (
          <Tabs defaultValue="build" className="w-full">
            <TabsList className="h-8">
              <TabsTrigger value="build" className="text-xs">Build</TabsTrigger>
              <TabsTrigger value="filters" className="text-xs">Filters</TabsTrigger>
            </TabsList>
            <TabsContent value="build" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Field label="Metric">
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_METRICS.map((m) => (
                      <SelectItem key={m.name} value={m.name} className="text-xs">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Function">
                <Select value={func} onValueChange={(v) => setFunc(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUNCTIONS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Aggregation">
                <Select value={agg} onValueChange={(v) => setAgg(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGGREGATIONS.map((a) => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Group By">
                <Input value={groupBy} onChange={(e) => setGroupBy(e.target.value)} placeholder="name" className="h-8 text-xs" />
              </Field>
            </TabsContent>
            <TabsContent value="filters" className="mt-3">
              <Field label='Label filter (e.g. job="docker",instance=~".*")'>
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder='job="docker"' className="h-8 font-mono text-xs" />
              </Field>
            </TabsContent>
          </Tabs>
        )}

        <div className="rounded-md border border-border bg-background/60 p-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Generated PromQL</div>
          <code className="block break-all font-mono text-xs text-primary">{query}</code>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(query); toast.success("Query copied"); }}>
            Copy
          </Button>
          <Button size="sm" onClick={() => toast.info("Run query (wire to /monitoring/prometheus/query)")}>
            Run query
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
