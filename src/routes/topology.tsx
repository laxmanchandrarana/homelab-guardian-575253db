import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Brain,
  Cloud,
  Cpu,
  Database,
  HardDrive,
  Network as NetworkIcon,
  Bell,
  RotateCw,
  Search,
  Server,
  ShieldAlert,
  X,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  API_CONFIGURED,
  endpoints,
  type TopologyDTO,
  type TopologyNode,
  type TopoNodeType,
  type TopoStatus,
} from "@/lib/api";
import { deriveWsUrl } from "@/config/api";

export const Route = createFileRoute("/topology")({
  head: () => ({ meta: [{ title: "Topology — Homelab Guardian" }] }),
  component: TopologyPage,
});

// ---------- Visual config ----------

const TYPE_META: Record<TopoNodeType, { icon: typeof Server; color: string; glow: string; label: string }> = {
  monitoring: { icon: Activity, color: "from-sky-500/80 to-sky-700/40", glow: "shadow-sky-500/30", label: "Monitoring" },
  application: { icon: Boxes, color: "from-violet-500/80 to-violet-700/40", glow: "shadow-violet-500/30", label: "Application" },
  database: { icon: Database, color: "from-emerald-500/80 to-emerald-700/40", glow: "shadow-emerald-500/30", label: "Database" },
  proxy: { icon: Cloud, color: "from-orange-500/80 to-orange-700/40", glow: "shadow-orange-500/30", label: "Proxy" },
  storage: { icon: HardDrive, color: "from-amber-500/80 to-amber-700/40", glow: "shadow-amber-500/30", label: "Storage" },
  network: { icon: NetworkIcon, color: "from-cyan-500/80 to-cyan-700/40", glow: "shadow-cyan-500/30", label: "Network" },
  ai: { icon: Brain, color: "from-fuchsia-500/80 to-fuchsia-700/40", glow: "shadow-fuchsia-500/30", label: "AI" },
  notification: { icon: Bell, color: "from-rose-500/80 to-rose-700/40", glow: "shadow-rose-500/30", label: "Notification" },
  container: { icon: Boxes, color: "from-indigo-500/80 to-indigo-700/40", glow: "shadow-indigo-500/30", label: "Container" },
  infrastructure: { icon: Server, color: "from-slate-400/80 to-slate-600/40", glow: "shadow-slate-400/30", label: "Infrastructure" },
  unknown: { icon: Server, color: "from-zinc-500/80 to-zinc-700/40", glow: "shadow-zinc-500/30", label: "Unknown" },
};

const STATUS_RING: Record<TopoStatus, string> = {
  healthy: "ring-emerald-400/60",
  warning: "ring-amber-400/70 animate-pulse",
  critical: "ring-rose-500/80 animate-pulse",
  offline: "ring-zinc-500/60",
};

const STATUS_DOT: Record<TopoStatus, string> = {
  healthy: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
  warning: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]",
  critical: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]",
  offline: "bg-zinc-500",
};

// ---------- Layout (layered) ----------

function layoutNodes(topo: TopologyDTO): Node<TopoNodeData>[] {
  // BFS layering from any source-only nodes; falls back to type-based row.
  const inDegree = new Map<string, number>();
  topo.nodes.forEach((n) => inDegree.set(n.id, 0));
  topo.edges.forEach((e) => inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1));

  const layer = new Map<string, number>();
  const queue: string[] = [];
  topo.nodes.forEach((n) => {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      layer.set(n.id, 0);
      queue.push(n.id);
    }
  });

  const adj = new Map<string, string[]>();
  topo.edges.forEach((e) => {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  });

  while (queue.length) {
    const id = queue.shift()!;
    const l = layer.get(id) ?? 0;
    for (const t of adj.get(id) ?? []) {
      const cur = layer.get(t);
      const nl = l + 1;
      if (cur === undefined || nl > cur) {
        layer.set(t, nl);
        queue.push(t);
      }
    }
  }

  // Any unplaced nodes (cycles, disconnected) → next layer.
  let maxLayer = 0;
  layer.forEach((v) => (maxLayer = Math.max(maxLayer, v)));
  topo.nodes.forEach((n) => {
    if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1);
  });

  const byLayer = new Map<number, TopologyNode[]>();
  topo.nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    const arr = byLayer.get(l) ?? [];
    arr.push(n);
    byLayer.set(l, arr);
  });

  const ROW_H = 160;
  const COL_W = 220;
  const out: Node<TopoNodeData>[] = [];
  const layers = Array.from(byLayer.keys()).sort((a, b) => a - b);
  for (const l of layers) {
    const row = byLayer.get(l)!;
    row.sort((a, b) => a.label.localeCompare(b.label));
    const total = row.length;
    row.forEach((n, idx) => {
      out.push({
        id: n.id,
        type: "topo",
        position: { x: idx * COL_W - (total * COL_W) / 2, y: l * ROW_H },
        data: { node: n },
      });
    });
  }
  return out;
}

// ---------- Custom node ----------

type TopoNodeData = { node: TopologyNode; highlight?: boolean; dimmed?: boolean };

function TopoFlowNode({ data }: NodeProps<TopoNodeData>) {
  const { node, highlight, dimmed } = data;
  const meta = TYPE_META[node.type] ?? TYPE_META.unknown;
  const Icon = meta.icon;
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "group relative w-[180px] cursor-pointer transition-all duration-300",
            dimmed && "opacity-25",
            highlight && "scale-110 z-10",
          )}
        >
          <Handle type="target" position={Position.Top} className="!bg-white/30 !border-0 !w-2 !h-2" />
          <div
            className={cn(
              "rounded-2xl border border-white/10 bg-gradient-to-br backdrop-blur-xl p-3",
              "shadow-lg ring-1 hover:scale-105 transition-transform",
              meta.color,
              meta.glow,
              STATUS_RING[node.status],
            )}
          >
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-black/30 backdrop-blur-sm">
                <Icon className="size-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{node.label}</div>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70">
                  <span className={cn("size-1.5 rounded-full", STATUS_DOT[node.status])} />
                  {node.status}
                </div>
              </div>
            </div>
            {(node.cpu != null || node.memory != null) && (
              <div className="mt-2 flex gap-1.5">
                {node.cpu != null && (
                  <div className="flex-1 rounded-md bg-black/30 px-1.5 py-1 text-[10px] text-white/80">
                    <Cpu className="mr-1 inline size-2.5" />
                    {Math.round(node.cpu)}%
                  </div>
                )}
                {node.memory != null && (
                  <div className="flex-1 rounded-md bg-black/30 px-1.5 py-1 text-[10px] text-white/80">
                    RAM {Math.round(node.memory as number)}%
                  </div>
                )}
              </div>
            )}
          </div>
          <Handle type="source" position={Position.Bottom} className="!bg-white/30 !border-0 !w-2 !h-2" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 border-white/10 bg-zinc-950/95 backdrop-blur-xl">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{node.label}</div>
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
          </div>
          <Row k="Status"><span className={cn("inline-flex items-center gap-1.5")}><span className={cn("size-1.5 rounded-full", STATUS_DOT[node.status])} />{node.status}</span></Row>
          {node.cpu != null && <Row k="CPU">{Math.round(node.cpu)}%</Row>}
          {node.memory != null && <Row k="Memory">{Math.round(node.memory as number)}%</Row>}
          {node.uptime && <Row k="Uptime">{node.uptime}</Row>}
          {node.image && <Row k="Image"><span className="font-mono text-[11px]">{node.image}</span></Row>}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

const nodeTypes = { topo: TopoFlowNode };

// ---------- Hooks ----------

function useTopology() {
  return useQuery({
    queryKey: ["topology"],
    queryFn: endpoints.topology,
    enabled: API_CONFIGURED,
    refetchInterval: 15_000,
    retry: 1,
  });
}

function useTopologySocket() {
  const qc = useQueryClient();
  useEffect(() => {
    const url = deriveWsUrl("/ws/topology");
    if (!url) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const connect = () => {
      try {
        socket = new WebSocket(url);
        socket.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as { event?: string; service?: string; status?: string };
            if (msg.event === "status_changed" && msg.service) {
              qc.setQueryData<TopologyDTO | undefined>(["topology"], (prev) => {
                if (!prev) return prev;
                const id = msg.service!.toLowerCase();
                return {
                  ...prev,
                  nodes: prev.nodes.map((n) =>
                    n.id === id ? { ...n, status: normalizeStatus(msg.status ?? n.status) } : n,
                  ),
                };
              });
            }
          } catch {
            // ignore
          }
        };
        socket.onclose = () => {
          if (alive) timer = setTimeout(connect, 4000);
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (alive) timer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [qc]);
}

function normalizeStatus(s: string): TopoStatus {
  const v = s.toLowerCase();
  if (["healthy", "running", "ok", "up"].includes(v)) return "healthy";
  if (["warning", "warn", "degraded"].includes(v)) return "warning";
  if (["critical", "error", "failed", "down"].includes(v)) return "critical";
  if (["offline", "stopped", "exited"].includes(v)) return "offline";
  return "healthy";
}

// ---------- Page ----------

const ALL_TYPES: TopoNodeType[] = [
  "monitoring",
  "application",
  "database",
  "proxy",
  "storage",
  "network",
  "ai",
  "notification",
  "infrastructure",
];

function TopologyPage() {
  return (
    <AppShell>
      <ReactFlowProvider>
        <TopologyInner />
      </ReactFlowProvider>
    </AppShell>
  );
}

function TopologyInner() {
  const { data, isLoading, error, refetch, isFetching } = useTopology();
  useTopologySocket();
  const navigate = useNavigate();
  const flow = useReactFlow();
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<TopoNodeType[]>([]);
  const [statusFilter, setStatusFilter] = useState<TopoStatus | "all">("all");
  const [selected, setSelected] = useState<TopologyNode | null>(null);
  const fitDone = useRef(false);

  const filtered = useMemo<TopologyDTO | null>(() => {
    if (!data) return null;
    return data;
  }, [data]);

  const matchSet = useMemo(() => {
    if (!filtered) return new Set<string>();
    const q = search.trim().toLowerCase();
    return new Set(
      filtered.nodes
        .filter((n) => {
          if (typeFilters.length && !typeFilters.includes(n.type)) return false;
          if (statusFilter !== "all" && n.status !== statusFilter) return false;
          if (q && !n.label.toLowerCase().includes(q) && !n.id.includes(q)) return false;
          return true;
        })
        .map((n) => n.id),
    );
  }, [filtered, search, typeFilters, statusFilter]);

  const nodes = useMemo<Node<TopoNodeData>[]>(() => {
    if (!filtered) return [];
    const laid = layoutNodes(filtered);
    return laid.map((n) => {
      const isMatch = matchSet.has(n.id);
      const hasFilter = !!search.trim() || typeFilters.length > 0 || statusFilter !== "all";
      return {
        ...n,
        data: {
          ...n.data,
          highlight: hasFilter && isMatch,
          dimmed: hasFilter && !isMatch,
        },
      };
    });
  }, [filtered, matchSet, search, typeFilters, statusFilter]);

  const edges = useMemo<Edge[]>(() => {
    if (!filtered) return [];
    return filtered.edges.map((e) => {
      const src = filtered.nodes.find((n) => n.id === e.source);
      const dst = filtered.nodes.find((n) => n.id === e.target);
      const unhealthy = src?.status === "critical" || dst?.status === "critical";
      const warn = src?.status === "warning" || dst?.status === "warning";
      const color = unhealthy ? "#f43f5e" : warn ? "#fbbf24" : "#64748b";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });
  }, [filtered]);

  // Auto-fit when data first loads, and center on first match when searching.
  useEffect(() => {
    if (!fitDone.current && nodes.length) {
      requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 600 }));
      fitDone.current = true;
    }
  }, [nodes, flow]);

  useEffect(() => {
    if (!search.trim() || !matchSet.size || !nodes.length) return;
    const first = nodes.find((n) => matchSet.has(n.id));
    if (first) flow.setCenter(first.position.x + 90, first.position.y + 50, { duration: 600, zoom: 1.2 });
  }, [search, matchSet, nodes, flow]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node<TopoNodeData>) => {
      setSelected(node.data.node);
    },
    [],
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-[1600px] flex-col gap-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <NetworkIcon className="size-5 text-primary" />
            Infrastructure Topology
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live graph of your homelab — {data?.nodes.length ?? 0} nodes · {data?.edges.length ?? 0} links
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RotateCw className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2 backdrop-blur-xl">
        <span className="px-1 text-xs uppercase tracking-wider text-muted-foreground">Types</span>
        <ToggleGroup
          type="multiple"
          value={typeFilters}
          onValueChange={(v) => setTypeFilters(v as TopoNodeType[])}
          className="flex flex-wrap gap-1"
        >
          {ALL_TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t} className="h-7 px-2 text-xs capitalize">
              {TYPE_META[t].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="ml-2 px-1 text-xs uppercase tracking-wider text-muted-foreground">Status</span>
        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v || "all") as TopoStatus | "all")}
          className="flex gap-1"
        >
          <ToggleGroupItem value="all" className="h-7 px-2 text-xs">All</ToggleGroupItem>
          <ToggleGroupItem value="critical" className="h-7 px-2 text-xs">
            <ShieldAlert className="size-3 text-rose-400" /> Critical
          </ToggleGroupItem>
          <ToggleGroupItem value="warning" className="h-7 px-2 text-xs">
            <AlertTriangle className="size-3 text-amber-400" /> Warning
          </ToggleGroupItem>
          <ToggleGroupItem value="offline" className="h-7 px-2 text-xs">Offline</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950/60 to-zinc-900/40 backdrop-blur-xl">
        {isLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/40 backdrop-blur-sm">
            <div className="space-y-3 text-center">
              <Skeleton className="mx-auto h-8 w-48" />
              <div className="text-sm text-muted-foreground">Mapping your infrastructure…</div>
            </div>
          </div>
        )}
        {error && !data && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
              <AlertTriangle className="mx-auto mb-2 size-6 text-rose-400" />
              <div className="font-medium">Topology unavailable</div>
              <div className="mt-1 text-xs text-muted-foreground">The backend could not be reached.</div>
              <Button size="sm" className="mt-3" onClick={() => refetch()}>
                <RotateCw className="size-3.5" /> Retry
              </Button>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
        >
          <Background gap={28} size={1} color="rgba(255,255,255,0.06)" />
          <Controls className="!bg-zinc-900/80 !border-white/10 !rounded-lg backdrop-blur [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button]:!text-white" />
          <MiniMap
            className="!bg-zinc-900/80 !border !border-white/10 !rounded-lg backdrop-blur"
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) => {
              const d = (n.data as TopoNodeData | undefined)?.node;
              if (!d) return "#64748b";
              if (d.status === "critical") return "#f43f5e";
              if (d.status === "warning") return "#fbbf24";
              if (d.status === "offline") return "#71717a";
              return "#34d399";
            }}
          />
        </ReactFlow>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = TYPE_META[selected.type].icon;
                    return <Icon className="size-4" />;
                  })()}
                  {selected.label}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="capitalize">{TYPE_META[selected.type].label}</Badge>
                  <Badge
                    className={cn(
                      "capitalize",
                      selected.status === "healthy" && "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                      selected.status === "warning" && "bg-amber-500/15 text-amber-300 border-amber-500/30",
                      selected.status === "critical" && "bg-rose-500/15 text-rose-300 border-rose-500/30",
                      selected.status === "offline" && "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
                    )}
                  >
                    {selected.status}
                  </Badge>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-2">
                  {selected.image && <Row k="Image"><span className="font-mono text-[11px]">{selected.image}</span></Row>}
                  {selected.uptime && <Row k="Uptime">{selected.uptime}</Row>}
                  {selected.cpu != null && <Row k="CPU">{Math.round(selected.cpu)}%</Row>}
                  {selected.memory != null && <Row k="Memory">{Math.round(selected.memory as number)}%</Row>}
                  <Row k="Node ID"><span className="font-mono text-[11px]">{selected.id}</span></Row>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate({ to: "/services/$service", params: { service: selected.label } })}
                  >
                    <ExternalLink className="size-3.5" /> Open Service
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
