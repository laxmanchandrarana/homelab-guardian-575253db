import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
} from "recharts";
import {
  Archive,
  CheckCircle2,
  XCircle,
  HardDrive,
  Clock,
  CalendarClock,
  Plus,
  Download,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Eye,
  Sparkles,
  AlertTriangle,
  Loader2,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { endpoints, API_CONFIGURED, type BackupHistoryItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/backups")({
  head: () => ({
    meta: [
      { title: "Backups — Homelab Guardian" },
      { name: "description", content: "Backup & disaster recovery for your homelab." },
    ],
  }),
  component: BackupsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="surface-card p-6 text-sm text-red-300">{error.message}</div>
    </AppShell>
  ),
});

// ---------- Helpers ----------

function fmtBytes(n: number | string | undefined | null): string {
  if (n == null) return "—";
  if (typeof n === "string") return n;
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function parseSize(s: string | number | undefined | null): number {
  if (s == null) return 0;
  if (typeof s === "number") return s;
  const m = /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(s);
  if (!m) return 0;
  const mult: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1);
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function durationBetween(a?: string | null, b?: string | null): string {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function serviceFromFilename(name: string): string {
  const base = name.split("/").pop() ?? name;
  const m = /^([a-z0-9_-]+?)[-_.]/i.exec(base);
  return (m?.[1] ?? base).toLowerCase();
}

function typeFromFilename(name: string): string {
  if (/incremental/i.test(name)) return "incremental";
  if (/config/i.test(name)) return "config";
  return "full";
}

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "SUCCESS"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : s === "FAILED"
        ? "bg-red-500/15 text-red-300 ring-red-500/30"
        : s === "RUNNING"
          ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        cls,
      )}
    >
      {s === "RUNNING" && <Loader2 className="h-3 w-3 animate-spin" />}
      {s}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  glow,
}: {
  icon: typeof Archive;
  label: string;
  value: React.ReactNode;
  hint?: string;
  glow?: "blue" | "green" | "red" | "amber" | "violet";
}) {
  const glowCls = {
    blue: "from-sky-500/10 to-transparent",
    green: "from-emerald-500/10 to-transparent",
    red: "from-red-500/10 to-transparent",
    amber: "from-amber-500/10 to-transparent",
    violet: "from-violet-500/10 to-transparent",
  }[glow ?? "blue"];
  return (
    <motion.div whileHover={{ y: -2 }} className="relative">
      <Card className="relative overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-xl">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", glowCls)} />
        <CardContent className="relative p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------- Page ----------

const PIE_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#f59e0b", "#f87171", "#22d3ee", "#fb7185"];

function BackupsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<BackupHistoryItem | null>(null);
  const [restoreFor, setRestoreFor] = useState<BackupHistoryItem | null>(null);
  const [deleteFor, setDeleteFor] = useState<BackupHistoryItem | null>(null);
  const [activeRestore, setActiveRestore] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["backup-history"],
    queryFn: endpoints.backupHistory,
    enabled: API_CONFIGURED,
    refetchInterval: 15_000,
  });
  const filesQ = useQuery({
    queryKey: ["backup-files"],
    queryFn: endpoints.backupFiles,
    enabled: API_CONFIGURED,
    refetchInterval: 30_000,
  });
  const restoreHistoryQ = useQuery({
    queryKey: ["restore-history"],
    queryFn: endpoints.restoreHistory,
    enabled: API_CONFIGURED,
    refetchInterval: 15_000,
  });
  const restoreHealthQ = useQuery({
    queryKey: ["restore-health"],
    queryFn: endpoints.restoreHealth,
    enabled: API_CONFIGURED,
    refetchInterval: 30_000,
  });
  const aiQ = useQuery({
    queryKey: ["backup-ai"],
    queryFn: endpoints.backupAiAnalysis,
    enabled: API_CONFIGURED,
    refetchInterval: 5 * 60_000,
    retry: 0,
  });
  const restoreJobQ = useQuery({
    queryKey: ["restore-job", activeRestore],
    queryFn: () => endpoints.restoreJob(activeRestore as string),
    enabled: !!activeRestore,
    refetchInterval: 1500,
  });

  const history = historyQ.data ?? [];
  const files = filesQ.data ?? [];
  const filesByName = useMemo(
    () => Object.fromEntries(files.map((f) => [f.name, f])),
    [files],
  );

  const enriched = useMemo(
    () =>
      history.map((b) => {
        const file = filesByName[b.filename];
        return {
          ...b,
          service: serviceFromFilename(b.filename),
          type: typeFromFilename(b.filename),
          bytes: file?.size ?? parseSize(b.size),
          modified: file ? new Date(file.modified * 1000).toISOString() : null,
        };
      }),
    [history, filesByName],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (b) =>
        b.filename.toLowerCase().includes(q) ||
        b.service.includes(q) ||
        b.status.toLowerCase().includes(q),
    );
  }, [enriched, query]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const success = enriched.filter((b) => b.status === "SUCCESS").length;
    const failed = enriched.filter((b) => b.status === "FAILED").length;
    const used = enriched.reduce((s, b) => s + b.bytes, 0);
    const last = enriched
      .filter((b) => b.created)
      .sort((a, b) => (b.created! > a.created! ? 1 : -1))[0];
    return { total, success, failed, used, last };
  }, [enriched]);

  const perService = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of enriched) map.set(b.service, (map.get(b.service) ?? 0) + b.bytes);
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [enriched]);

  const runMut = useMutation({
    mutationFn: endpoints.backupRun,
    onSuccess: () => {
      toast.success("Backup job started");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["backup-history"] });
      qc.invalidateQueries({ queryKey: ["backup-files"] });
    },
    onError: (e: Error) => toast.error(`Backup failed: ${e.message}`),
  });

  const restoreMut = useMutation({
    mutationFn: (filename: string) => endpoints.restoreRun(filename),
    onSuccess: (_d, filename) => {
      toast.success(`Restore started: ${filename}`);
      setActiveRestore(filename);
      setRestoreFor(null);
      qc.invalidateQueries({ queryKey: ["restore-history"] });
    },
    onError: (e: Error) => toast.error(`Restore failed: ${e.message}`),
  });

  const verifyMut = useMutation({
    mutationFn: (name: string) => endpoints.backupVerify(name),
    onSuccess: () => {
      toast.success("Verification complete");
      qc.invalidateQueries({ queryKey: ["backup-history"] });
    },
    onError: (e: Error) => toast.error(`Verify failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (filename: string) => {
      // No backend delete endpoint yet — surface clearly.
      throw new Error(`Delete not supported by backend yet (${filename})`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setDeleteFor(null),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Backup & Disaster Recovery</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create, restore, verify and monitor every backup across your homelab.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["backup-history"] });
                qc.invalidateQueries({ queryKey: ["backup-files"] });
                qc.invalidateQueries({ queryKey: ["restore-history"] });
              }}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create Backup
            </Button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={Archive}
            label="Total Backups"
            value={historyQ.isLoading ? <Skeleton className="h-8 w-12" /> : stats.total}
            glow="blue"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Successful"
            value={historyQ.isLoading ? <Skeleton className="h-8 w-12" /> : stats.success}
            glow="green"
          />
          <KpiCard
            icon={XCircle}
            label="Failed"
            value={historyQ.isLoading ? <Skeleton className="h-8 w-12" /> : stats.failed}
            glow="red"
          />
          <KpiCard
            icon={HardDrive}
            label="Storage Used"
            value={historyQ.isLoading ? <Skeleton className="h-8 w-20" /> : fmtBytes(stats.used)}
            hint={`${perService.length} service${perService.length === 1 ? "" : "s"}`}
            glow="violet"
          />
          <KpiCard
            icon={Clock}
            label="Last Backup"
            value={
              historyQ.isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <span className="text-xl">{fmtRelative(stats.last?.created)}</span>
              )
            }
            hint={stats.last?.filename}
            glow="amber"
          />
          <KpiCard
            icon={CalendarClock}
            label="Next Scheduled"
            value={<span className="text-xl text-muted-foreground">Not scheduled</span>}
            hint="Schedules coming soon"
            glow="blue"
          />
        </div>

        {/* AI Insights + Storage */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden border-white/5 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-sky-500/[0.06] backdrop-blur-xl">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-violet-300/80">
                  Guardian AI · Backup Insights
                </div>
                <div className="mt-1 text-sm">
                  {aiQ.isLoading
                    ? "Analyzing backup patterns…"
                    : (aiQ.data?.recommendation ??
                      aiQ.data?.summary ??
                      (stats.failed > 0
                        ? `You have ${stats.failed} failed backup${stats.failed === 1 ? "" : "s"}. Investigate the most recent failure and rerun.`
                        : stats.total === 0
                          ? "No backups yet. Create your first backup to protect your homelab."
                          : `${stats.total} backups across ${perService.length} service${perService.length === 1 ? "" : "s"} totaling ${fmtBytes(stats.used)}.`))}
                </div>
                {restoreHealthQ.data && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Restore subsystem: {restoreHealthQ.data.healthy ? "healthy" : "degraded"} ·{" "}
                    {restoreHealthQ.data.total} containers tracked
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-xl">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <HardDrive className="h-4 w-4" /> Storage by Service
              </div>
              {perService.length === 0 ? (
                <div className="grid h-32 place-items-center text-xs text-muted-foreground">
                  No data yet.
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-32 w-32">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={perService}
                          dataKey="value"
                          innerRadius={32}
                          outerRadius={56}
                          stroke="none"
                          paddingAngle={2}
                        >
                          {perService.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <ReTooltip
                          contentStyle={{
                            background: "rgba(15,15,20,0.95)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: number) => fmtBytes(v)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                    {perService.slice(0, 5).map((s, i) => (
                      <li key={s.name} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="truncate capitalize">{s.name}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {fmtBytes(s.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active restore progress */}
        <AnimatePresence>
          {activeRestore && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        Restoring {activeRestore}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span>
                          Status: {(restoreJobQ.data as { status?: string })?.status ?? "running"}
                        </span>
                        {(restoreJobQ.data as { eta?: string })?.eta && (
                          <span>ETA: {(restoreJobQ.data as { eta?: string }).eta}</span>
                        )}
                        {(restoreJobQ.data as { speed?: string })?.speed && (
                          <span>{(restoreJobQ.data as { speed?: string }).speed}</span>
                        )}
                        {(restoreJobQ.data as { current?: string })?.current && (
                          <span className="truncate">
                            {(restoreJobQ.data as { current?: string }).current}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveRestore(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                  <Progress
                    className="mt-3"
                    value={(restoreJobQ.data as { progress?: number })?.progress ?? 0}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <Tabs defaultValue="backups">
          <TabsList>
            <TabsTrigger value="backups">Backups</TabsTrigger>
            <TabsTrigger value="history">Restore History</TabsTrigger>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
          </TabsList>

          <TabsContent value="backups" className="mt-4">
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by filename, service or status…"
                    className="max-w-sm"
                  />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {filtered.length} of {enriched.length}
                  </span>
                </div>

                {historyQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : historyQ.error ? (
                  <div className="grid place-items-center p-10 text-sm text-red-300">
                    <AlertTriangle className="mb-2 h-5 w-5" />
                    Failed to load backups: {(historyQ.error as Error).message}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="grid place-items-center p-10 text-sm text-muted-foreground">
                    No backups match your search.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Backup</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Verified</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((b) => (
                        <TableRow key={b.id} className="group">
                          <TableCell className="max-w-[260px]">
                            <div className="truncate font-medium">{b.filename}</div>
                            {b.sha256 && (
                              <div className="truncate font-mono text-[10px] text-muted-foreground">
                                {b.sha256.slice(0, 16)}…
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {b.service}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {b.type}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtBytes(b.bytes) !== "0 B" ? fmtBytes(b.bytes) : b.size}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmtTime(b.created)}
                          </TableCell>
                          <TableCell>
                            {b.verified ? (
                              <ShieldCheck className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={verifyMut.isPending}
                                onClick={() => verifyMut.mutate(b.filename)}
                              >
                                Verify
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={b.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Details"
                                onClick={() => setDetailFor(b)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Download"
                                asChild
                              >
                                <a
                                  href={endpoints.backupDownloadUrl(b.filename)}
                                  download
                                  rel="noopener"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-300 hover:text-amber-200"
                                title="Restore"
                                onClick={() => setRestoreFor(b)}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-300 hover:text-red-200"
                                title="Delete"
                                onClick={() => setDeleteFor(b)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="p-4">
                {restoreHistoryQ.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (restoreHistoryQ.data ?? []).length === 0 ? (
                  <div className="grid place-items-center p-10 text-sm text-muted-foreground">
                    No restore operations yet.
                  </div>
                ) : (
                  <ol className="relative space-y-4 border-l border-white/10 pl-5">
                    {(restoreHistoryQ.data ?? []).map((r) => (
                      <li key={r.id} className="relative">
                        <span
                          className={cn(
                            "absolute -left-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background",
                            r.status === "SUCCESS"
                              ? "bg-emerald-400"
                              : r.status === "FAILED"
                                ? "bg-red-400"
                                : "bg-amber-400",
                          )}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{r.filename}</span>
                          <StatusPill status={r.status} />
                          <span className="ml-auto text-xs text-muted-foreground">
                            {fmtTime(r.started)} · took {durationBetween(r.started, r.completed)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedules" className="mt-4">
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl">
              <CardContent className="grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                <CalendarClock className="h-6 w-6 text-muted-foreground" />
                <div className="font-medium text-foreground">Scheduled backups</div>
                <div>
                  Cron-based schedules will appear here once the backend exposes{" "}
                  <code className="font-mono">/backup/schedules</code>.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Backup Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
            <DialogDescription>
              Trigger a new backup job. The job runs in the background and appears in the list when
              complete.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Service</Label>
              <Select defaultValue="docker">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docker">All Docker services</SelectItem>
                  {Array.from(new Set(enriched.map((b) => b.service))).map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Backup Type</Label>
              <Select defaultValue="full">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="incremental">Incremental</SelectItem>
                  <SelectItem value="config">Configuration Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
              <Label htmlFor="compress" className="text-sm">
                Compression
              </Label>
              <Switch id="compress" defaultChecked />
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
              <Label htmlFor="encrypt" className="text-sm">
                Encryption
              </Label>
              <Switch id="encrypt" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="retention">Retention (days)</Label>
              <Input id="retention" type="number" defaultValue={30} min={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
              {runMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreFor} onOpenChange={(o) => !o && setRestoreFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Current data for{" "}
              <span className="font-mono text-foreground">{restoreFor?.filename}</span> may be
              overwritten. This action cannot be undone — only a rollback can revert it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreFor && restoreMut.mutate(restoreFor.filename)}
            >
              Restore now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete{" "}
              <span className="font-mono text-foreground">{deleteFor?.filename}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => deleteFor && deleteMut.mutate(deleteFor.filename)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details sheet */}
      <BackupDetails
        backup={detailFor}
        onClose={() => setDetailFor(null)}
      />
    </AppShell>
  );
}

function BackupDetails({
  backup,
  onClose,
}: {
  backup: (BackupHistoryItem & { service?: string; type?: string; bytes?: number }) | null;
  onClose: () => void;
}) {
  const planQ = useQuery({
    queryKey: ["backup-plan", backup?.filename],
    queryFn: () => endpoints.backupPlan(backup!.filename),
    enabled: !!backup,
    retry: 0,
  });

  return (
    <Sheet open={!!backup} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="truncate">{backup?.filename}</SheetTitle>
        </SheetHeader>
        {backup && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" value={<StatusPill status={backup.status} />} />
              <Field
                label="Verified"
                value={
                  backup.verified ? (
                    <span className="text-emerald-300">Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )
                }
              />
              <Field label="Service" value={<span className="capitalize">{backup.service ?? "—"}</span>} />
              <Field label="Type" value={<span className="capitalize">{backup.type ?? "—"}</span>} />
              <Field
                label="Size"
                value={backup.bytes ? fmtBytes(backup.bytes) : backup.size}
              />
              <Field label="Created" value={fmtTime(backup.created)} />
            </div>
            {backup.sha256 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  SHA-256
                </div>
                <div className="mt-1 break-all rounded-md bg-white/[0.03] p-2 font-mono text-[11px]">
                  {backup.sha256}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Restore Plan
                </div>
                {planQ.data && (
                  <span className="text-xs text-muted-foreground">
                    {planQ.data.files.toLocaleString()} files · {fmtBytes(planQ.data.size)}
                  </span>
                )}
              </div>
              {planQ.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : planQ.error ? (
                <div className="rounded-md bg-red-500/10 p-3 text-xs text-red-300">
                  Plan unavailable: {(planQ.error as Error).message}
                </div>
              ) : (
                <ul className="max-h-72 overflow-auto rounded-md bg-white/[0.02] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {(planQ.data?.preview ?? []).slice(0, 200).map((p, i) => (
                    <li key={i} className="truncate">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={endpoints.backupDownloadUrl(backup.filename)}
                  download
                  rel="noopener"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
