import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Play,
  Square,
  RotateCw,
  Search,
  RefreshCw,
  Heart,
  Activity,
  Cpu,
  MemoryStick,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  X,
  Copy,
  Download,
  Pause,
  PlayCircle,
  Container,
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  useServices,
  useServiceDetail,
  useServiceLogs,
  useStartService,
  useStopService,
  useRestartServiceDirect,
  useMetrics,
} from "@/hooks/useGuardianData";
import { useGuardianSocket } from "@/hooks/useGuardianSocket";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — Homelab Guardian" }] }),
  component: ServicesPage,
});

type Action = "start" | "stop" | "restart";

type SvcRow = {
  name: string;
  raw: any;
  status: string;
  health: string;
  cpu: number;
  memory: number;
  memoryDisplay: string;
  uptime: string;
  restarts: number;
  image: string;
  container: string;
};

function normalizeService(s: any): SvcRow {
  const memNum =
    typeof s.memory === "number"
      ? s.memory
      : typeof s.memory === "string"
        ? parseFloat(s.memory) || 0
        : 0;
  const memDisplay =
    typeof s.memory === "string"
      ? s.memory
      : memNum > 1024
        ? `${(memNum / 1024).toFixed(1)} GB`
        : `${Math.round(memNum)} MB`;
  return {
    name: s.name ?? "unknown",
    raw: s,
    status: String(s.status ?? "unknown").toLowerCase(),
    health: String(s.health ?? "unknown").toLowerCase(),
    cpu: typeof s.cpu === "number" ? s.cpu : 0,
    memory: memNum,
    memoryDisplay: memDisplay,
    uptime: s.uptime ?? "—",
    restarts: s.restarts ?? s.restart_count ?? 0,
    image: s.image ?? "",
    container: s.container_name ?? s.name ?? "",
  };
}

function statusColor(status: string) {
  if (["running", "healthy", "ok", "up"].includes(status)) return "text-emerald-400";
  if (["restarting", "starting", "stopping", "pending"].includes(status)) return "text-amber-400";
  if (["stopped", "exited"].includes(status)) return "text-zinc-400";
  return "text-rose-400";
}
function statusDot(status: string) {
  if (["running", "healthy", "ok", "up"].includes(status)) return "bg-emerald-500";
  if (["restarting", "starting", "stopping", "pending"].includes(status)) return "bg-amber-500 animate-pulse";
  if (["stopped", "exited"].includes(status)) return "bg-zinc-500";
  return "bg-rose-500 animate-pulse";
}
function healthBadge(health: string) {
  if (["healthy", "ok"].includes(health))
    return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Healthy</Badge>;
  if (["warning", "warn", "degraded"].includes(health))
    return <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">Warning</Badge>;
  if (["critical", "danger", "unhealthy", "down"].includes(health))
    return <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/30">Critical</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Unknown</Badge>;
}

function ServicesPage() {
  // Subscribe to /ws so live cache patches arrive
  useGuardianSocket();

  const { services, isLoading, isLive, error, refetch } = useServices();
  const rows = useMemo<SvcRow[]>(
    () => (services as any[]).map(normalizeService),
    [services],
  );

  // KPI header
  const totals = useMemo(() => {
    const running = rows.filter((r) => ["running", "healthy", "up"].includes(r.status)).length;
    const stopped = rows.filter((r) => ["stopped", "exited"].includes(r.status)).length;
    const unhealthy = rows.filter(
      (r) => ["critical", "danger", "unhealthy", "down"].includes(r.health),
    ).length;
    const autoheal = rows.filter((r) => r.raw.autoHeal ?? r.raw.autoheal).length;
    return { total: rows.length, running, stopped, unhealthy, autoheal };
  }, [rows]);

  // Search & filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "cpu" | "memory" | "uptime">("name");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (term && !`${r.name} ${r.container} ${r.image}`.toLowerCase().includes(term))
        return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (healthFilter !== "all" && r.health !== healthFilter) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "cpu") return b.cpu - a.cpu;
      if (sort === "memory") return b.memory - a.memory;
      return a.uptime.localeCompare(b.uptime);
    });
    return out;
  }, [rows, q, statusFilter, healthFilter, sort]);

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSelect(name: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  // Mutations
  const startM = useStartService();
  const stopM = useStopService();
  const restartM = useRestartServiceDirect();

  const runAction = async (action: Action, name: string) => {
    const mut = action === "start" ? startM : action === "stop" ? stopM : restartM;
    const label = action[0].toUpperCase() + action.slice(1);
    const id = toast.loading(`${label}ing ${name}…`);
    try {
      await mut.mutateAsync(name);
      toast.success(`${label} requested for ${name}`, { id });
    } catch (e: any) {
      toast.error(`${label} failed: ${e?.message ?? "unknown error"}`, { id });
    }
  };
  const runBulk = async (action: Action) => {
    const names = Array.from(selected);
    if (!names.length) return;
    toast.message(`${action} ${names.length} service${names.length > 1 ? "s" : ""}…`);
    await Promise.allSettled(names.map((n) => runAction(action, n)));
    clearSelection();
  };

  // Confirmation dialog state
  const [confirm, setConfirm] = useState<{ action: Action; target: string | "bulk" } | null>(null);
  const ask = (action: Action, target: string | "bulk") => setConfirm({ action, target });
  const onConfirm = async () => {
    if (!confirm) return;
    const { action, target } = confirm;
    setConfirm(null);
    if (target === "bulk") await runBulk(action);
    else await runAction(action, target);
  };

  // Details drawer
  const [openName, setOpenName] = useState<string | null>(null);

  // Keyboard shortcuts: '/' focus search, 'Esc' close drawer
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setOpenName(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Boxes className="h-6 w-6 text-primary" /> Services
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live Docker service management {isLive ? <span className="text-emerald-400">• live</span> : null}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Total" value={totals.total} icon={Container} accent="text-foreground" />
          <Kpi label="Running" value={totals.running} icon={CheckCircle2} accent="text-emerald-400" />
          <Kpi label="Stopped" value={totals.stopped} icon={Square} accent="text-zinc-300" />
          <Kpi label="Unhealthy" value={totals.unhealthy} icon={AlertTriangle} accent="text-rose-400" />
          <Kpi label="Auto-Heal" value={totals.autoheal} icon={Heart} accent="text-pink-400" />
        </div>

        {/* Toolbar */}
        <div className="surface-card flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search name, container, image…  (press /)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="restarting">Restarting</SelectItem>
              <SelectItem value="unhealthy">Unhealthy</SelectItem>
            </SelectContent>
          </Select>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Health" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Health</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="cpu">CPU</SelectItem>
              <SelectItem value="memory">Memory</SelectItem>
              <SelectItem value="uptime">Uptime</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="surface-card flex flex-wrap items-center gap-3 border border-primary/30 p-3">
            <span className="text-sm">
              <strong>{selected.size}</strong> selected
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => ask("start", "bulk")}>
                <Play className="mr-1 h-3.5 w-3.5" /> Start
              </Button>
              <Button size="sm" variant="outline" onClick={() => ask("restart", "bulk")}>
                <RotateCw className="mr-1 h-3.5 w-3.5" /> Restart
              </Button>
              <Button size="sm" variant="destructive" onClick={() => ask("stop", "bulk")}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Grid */}
        {error ? (
          <ErrorBox onRetry={() => refetch()} />
        ) : isLoading && !rows.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onClear={() => { setQ(""); setStatusFilter("all"); setHealthFilter("all"); }} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => (
              <ServiceCard
                key={s.name}
                s={s}
                selected={selected.has(s.name)}
                onSelect={() => toggleSelect(s.name)}
                onOpen={() => navigate({ to: "/services/$service", params: { service: s.name } })}
                onAction={(a) => ask(a, s.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      <ServiceDrawer
        name={openName}
        onClose={() => setOpenName(null)}
        onAction={(a, n) => ask(a, n)}
      />

      {/* Confirm dialog */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "stop" ? "Stop" : confirm?.action === "start" ? "Start" : "Restart"}{" "}
              {confirm?.target === "bulk" ? `${selected.size} services` : confirm?.target}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "stop"
                ? "This will stop the container. Dependents may break."
                : confirm?.action === "restart"
                  ? "The container will briefly be unavailable while it restarts."
                  : "The container will start up."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Kpi({
  label, value, icon: Icon, accent,
}: { label: string; value: number; icon: any; accent: string }) {
  return (
    <div className="surface-card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("rounded-lg bg-muted/40 p-2", accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("text-2xl font-semibold tabular-nums", accent)}>{value}</div>
      </div>
    </div>
  );
}

function ServiceCard({
  s, selected, onSelect, onOpen, onAction,
}: {
  s: SvcRow;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onAction: (a: Action) => void;
}) {
  const isRunning = ["running", "healthy", "up"].includes(s.status);
  return (
    <div
      className={cn(
        "surface-card group relative flex flex-col gap-3 p-4 transition-all",
        "hover:-translate-y-0.5 hover:shadow-xl",
        selected && "ring-2 ring-primary/60",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${s.name}`}
          className="mt-1"
        />
        <button
          onClick={onOpen}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30"
          aria-label={`Open ${s.name}`}
        >
          <Container className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block w-full truncate text-left font-semibold hover:underline">
            {s.name}
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(s.status))} />
            <span className={statusColor(s.status)}>{s.status}</span>
            <span className="opacity-50">•</span>
            <span className="truncate">{s.image || s.container}</span>
          </div>
        </div>
        {healthBadge(s.health)}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Stat icon={Cpu} label="CPU" value={`${s.cpu.toFixed(1)}%`} />
        <Stat icon={MemoryStick} label="RAM" value={s.memoryDisplay} />
        <Stat icon={RotateCw} label="Restarts" value={String(s.restarts)} />
        <Stat icon={Clock} label="Uptime" value={s.uptime} />
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onOpen}>
          Details
        </Button>
        {isRunning ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onAction("restart")}>
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onAction("stop")}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onAction("start")}>
            <Play className="mr-1 h-3.5 w-3.5" /> Start
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="surface-card grid place-items-center p-16 text-center">
      <CircleDot className="mb-3 h-8 w-8 text-muted-foreground" />
      <div className="text-base font-medium">No services found.</div>
      <p className="mt-1 text-sm text-muted-foreground">Try clearing filters or your search.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>Clear filters</Button>
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="surface-card grid place-items-center gap-3 border border-rose-500/30 p-12 text-center">
      <AlertTriangle className="h-8 w-8 text-rose-400" />
      <div className="text-base font-medium">Couldn't reach the Guardian API.</div>
      <p className="text-sm text-muted-foreground">
        Check your connection and try again — we'll keep retrying in the background.
      </p>
      <Button size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

/* ------------------------- Drawer ------------------------- */

function ServiceDrawer({
  name, onClose, onAction,
}: {
  name: string | null;
  onClose: () => void;
  onAction: (a: Action, name: string) => void;
}) {
  const open = !!name;
  const { data, isLoading, error, refetch } = useServiceDetail(name);
  const { series } = useMetrics("1h");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            <Container className="h-5 w-5 text-primary" />
            {name}
          </SheetTitle>
          <SheetDescription>
            {data?.image ?? (isLoading ? "Loading…" : "")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {error ? (
            <ErrorBox onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", statusDot(String(data.status ?? "")))} />
                <span className={cn("text-sm font-medium", statusColor(String(data.status ?? "")))}>
                  {String(data.status ?? "—")}
                </span>
                {healthBadge(String(data.health ?? ""))}
                <div className="ml-auto flex gap-2">
                  {name && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onAction("start", name)}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Start
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAction("restart", name)}>
                        <RotateCw className="mr-1 h-3.5 w-3.5" /> Restart
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onAction("stop", name)}>
                        <Square className="mr-1 h-3.5 w-3.5" /> Stop
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <KV k="Container" v={data.container_name ?? name ?? "—"} />
                    <KV k="Image" v={data.image ?? "—"} />
                    <KV k="Uptime" v={data.uptime ?? "—"} />
                    <KV k="Restarts" v={String(data.restarts ?? data.restart_count ?? 0)} />
                    <KV k="Created" v={data.created ?? data.created_at ?? "—"} />
                    <KV k="Last restart" v={data.lastRestart ?? data.last_restart ?? "—"} />
                  </div>

                  <Section title="Ports">
                    <ChipList items={(data.ports ?? []).map((p: any) =>
                      typeof p === "string" ? p : `${p.host ?? "?"}:${p.container ?? "?"}/${p.protocol ?? "tcp"}`,
                    )} />
                  </Section>
                  <Section title="Networks">
                    <ChipList items={data.networks ?? []} />
                  </Section>
                  <Section title="Volumes">
                    <ChipList items={(data.volumes ?? []).map((v: any) =>
                      typeof v === "string" ? v : `${v.source ?? "?"} → ${v.target ?? "?"}`,
                    )} />
                  </Section>
                  <Section title="Environment">
                    <EnvList env={data.environment ?? data.env} />
                  </Section>
                </TabsContent>

                <TabsContent value="metrics" className="mt-4 space-y-4">
                  <MiniChart title="CPU %" series={series.cpu} stroke="#10b981" />
                  <MiniChart title="Memory %" series={series.ram} stroke="#6366f1" />
                  <MiniChart title="Network" series={series.net} stroke="#f59e0b" />
                  <MiniChart title="Disk" series={series.disk} stroke="#ec4899" />
                </TabsContent>

                <TabsContent value="logs" className="mt-4">
                  {name && <LogsViewer name={name} />}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate text-sm">{v}</div>
    </div>
  );
}
function ChipList({ items }: { items: string[] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">—</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="rounded-md bg-muted/40 px-2 py-0.5 text-xs">{it}</span>
      ))}
    </div>
  );
}
function maskValue(key: string, v: string) {
  const sensitive = /(pass|secret|token|key|api|auth|jwt|dsn)/i.test(key);
  if (!sensitive) return v;
  if (v.length <= 4) return "••••";
  return v.slice(0, 2) + "••••" + v.slice(-2);
}
function EnvList({ env }: { env: any }) {
  const entries: [string, string][] = Array.isArray(env)
    ? env.map((s) => {
        const i = s.indexOf("=");
        return i >= 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ""];
      })
    : env && typeof env === "object"
      ? Object.entries(env).map(([k, v]) => [k, String(v)])
      : [];
  if (!entries.length) return <div className="text-sm text-muted-foreground">—</div>;
  return (
    <div className="max-h-48 overflow-auto rounded-md bg-muted/30 p-2 text-xs font-mono">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 py-0.5">
          <span className="text-primary">{k}</span>
          <span className="text-muted-foreground">=</span>
          <span className="truncate">{maskValue(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

function MiniChart({ title, series, stroke }: { title: string; series: { t: number | string; v: number }[]; stroke: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{title}</span>
        <span className="tabular-nums text-muted-foreground">
          {series.length ? `${Math.round(series[series.length - 1].v)}` : "—"}
        </span>
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id={`g-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              labelFormatter={() => ""}
            />
            <Area type="monotone" dataKey="v" stroke={stroke} fill={`url(#g-${title})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------- Logs ------------------------- */

function LogsViewer({ name }: { name: string }) {
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const { data, isLoading, error, refetch } = useServiceLogs(name, paused);
  const boxRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const raw =
      typeof data === "string"
        ? data
        : Array.isArray((data as any)?.lines)
          ? (data as any).lines.join("\n")
          : (data as any)?.logs ?? "";
    return String(raw)
      .split("\n")
      .filter((l) => !filter || l.toLowerCase().includes(filter.toLowerCase()));
  }, [data, filter]);

  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  function copyAll() {
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Logs copied");
  }
  function download() {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter logs…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
          {paused ? <PlayCircle className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAutoScroll((a) => !a)}>
          <Activity className="mr-1 h-3.5 w-3.5" /> {autoScroll ? "Auto" : "Manual"}
        </Button>
        <Button size="sm" variant="outline" onClick={copyAll}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-1 h-3.5 w-3.5" /> Download
        </Button>
      </div>

      {error ? (
        <ErrorBox onRetry={() => refetch()} />
      ) : (
        <div
          ref={boxRef}
          className="h-[360px] overflow-auto rounded-md border border-border bg-black/40 p-2 font-mono text-[11px] leading-5"
        >
          {isLoading && !lines.length ? (
            <div className="text-muted-foreground">Loading logs…</div>
          ) : lines.length === 0 ? (
            <div className="text-muted-foreground">No log lines.</div>
          ) : (
            lines.map((l, i) => <LogLine key={i} line={l} />)
          )}
        </div>
      )}
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase();
  let color = "text-zinc-300";
  if (/\b(error|err|fatal|panic)\b/.test(lower)) color = "text-rose-400";
  else if (/\b(warn|warning)\b/.test(lower)) color = "text-amber-300";
  else if (/\b(info)\b/.test(lower)) color = "text-sky-300";
  else if (/\b(debug|trace)\b/.test(lower)) color = "text-zinc-500";
  else if (/\b(success|ok|started|ready)\b/.test(lower)) color = "text-emerald-300";
  return <div className={cn("whitespace-pre-wrap", color)}>{line}</div>;
}
