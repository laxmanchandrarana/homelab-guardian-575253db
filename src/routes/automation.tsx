import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  Play,
  Pause,
  RotateCw,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Search,
  Activity,
  Loader2,
  Terminal,
  ChevronRight,
  ServerCrash,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  endpoints,
  API_CONFIGURED,
  wsUrl,
  type AutomationRule,
  type AutomationJob,
  type AutomationLogEntry,
  type AutomationRuleDetail,
  type AutomationMetrics,
  type AutomationTrigger,
  type AutomationAction,
} from "@/lib/api";
import { useServices } from "@/hooks/useGuardianData";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation — Homelab Guardian" },
      {
        name: "description",
        content:
          "Self-healing automation center — manage recovery rules, watch live jobs, and review AI recommendations.",
      },
    ],
  }),
  component: AutomationPage,
});

// ---------------- Trigger / Action catalogs ----------------

const TRIGGERS: { id: AutomationTrigger; label: string }[] = [
  { id: "container_down", label: "Container Down" },
  { id: "high_cpu", label: "High CPU" },
  { id: "high_memory", label: "High Memory" },
  { id: "disk_full", label: "Disk Full" },
  { id: "website_down", label: "Website Down" },
  { id: "backup_failed", label: "Backup Failed" },
  { id: "ssl_expiring", label: "SSL Expiring" },
  { id: "custom_alert", label: "Custom Alert" },
];

const ACTIONS: { id: AutomationAction; label: string; dangerous?: boolean }[] = [
  { id: "restart_container", label: "Restart Container" },
  { id: "restart_compose_stack", label: "Restart Compose Stack" },
  { id: "restart_docker_service", label: "Restart Docker Service" },
  { id: "run_shell_script", label: "Run Shell Script", dangerous: true },
  { id: "execute_python", label: "Execute Python", dangerous: true },
  { id: "run_ansible", label: "Run Ansible", dangerous: true },
  { id: "webhook", label: "Webhook" },
  { id: "send_notification", label: "Send Notification" },
  { id: "run_ai_diagnosis", label: "Run AI Diagnosis" },
];

const labelFor = (id: string, opts: { id: string; label: string }[]) =>
  opts.find((o) => o.id === id)?.label ?? id;

// ---------------- Page ----------------

function AutomationPage() {
  const qc = useQueryClient();
  const services = useServices();

  // ---- Rules ----
  const rulesQ = useQuery({
    queryKey: ["automation-rules"],
    queryFn: endpoints.automationRules,
    enabled: API_CONFIGURED,
    refetchInterval: 30_000,
    retry: 0,
  });
  const rules: AutomationRule[] = rulesQ.data ?? [];

  // ---- Live jobs (poll + WebSocket) ----
  const jobsQ = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: endpoints.automationJobs,
    enabled: API_CONFIGURED,
    refetchInterval: 5_000,
    retry: 0,
  });
  const [liveJobs, setLiveJobs] = useState<Record<string, AutomationJob>>({});

  useEffect(() => {
    if (!API_CONFIGURED) return;
    const url = wsUrl("/ws/automation");
    if (!url) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      try {
        ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as Partial<AutomationJob> & { job?: string };
            if (!msg?.job) return;
            setLiveJobs((prev) => ({
              ...prev,
              [msg.job!]: { ...(prev[msg.job!] ?? {}), ...(msg as AutomationJob) },
            }));
            if (msg.status === "success" || msg.status === "failed") {
              qc.invalidateQueries({ queryKey: ["automation-jobs"] });
              qc.invalidateQueries({ queryKey: ["automation-metrics"] });
            }
          } catch {
            // ignore
          }
        };
        ws.onclose = () => {
          retry = setTimeout(connect, 4000);
        };
        ws.onerror = () => ws?.close();
      } catch {
        retry = setTimeout(connect, 6000);
      }
    };
    connect();
    return () => {
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [qc]);

  const jobs = useMemo(() => {
    const map = new Map<string, AutomationJob>();
    (jobsQ.data ?? []).forEach((j) => map.set(j.job, j));
    Object.values(liveJobs).forEach((j) => map.set(j.job, j));
    return Array.from(map.values()).sort((a, b) =>
      String(b.started ?? "").localeCompare(String(a.started ?? "")),
    );
  }, [jobsQ.data, liveJobs]);

  // ---- Metrics ----
  const metricsQ = useQuery<AutomationMetrics>({
    queryKey: ["automation-metrics"],
    queryFn: endpoints.automationMetrics,
    enabled: API_CONFIGURED,
    refetchInterval: 30_000,
    retry: 0,
  });

  // ---- Logs ----
  const logsQ = useQuery({
    queryKey: ["automation-logs"],
    queryFn: () => endpoints.automationLogs({ limit: 50 }),
    enabled: API_CONFIGURED,
    refetchInterval: 15_000,
    retry: 0,
  });

  // ---- AI ----
  const aiQ = useQuery({
    queryKey: ["automation-ai"],
    queryFn: endpoints.automationAi,
    enabled: API_CONFIGURED,
    refetchInterval: 120_000,
    retry: 0,
  });

  // ---- Filters / search ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (
        statusFilter === "enabled" && !r.enabled
      ) return false;
      if (statusFilter === "disabled" && r.enabled) return false;
      if (statusFilter === "failed" && r.last_status !== "failed") return false;
      if (statusFilter === "successful" && r.last_status !== "success") return false;
      if (statusFilter === "critical" && r.priority !== "critical") return false;
      if (!q) return true;
      return (
        r.name?.toLowerCase().includes(q) ||
        r.target?.toLowerCase().includes(q) ||
        r.trigger?.toLowerCase().includes(q) ||
        r.action?.toLowerCase().includes(q)
      );
    });
  }, [rules, search, statusFilter]);

  // ---- Mutations ----
  const createRule = useMutation({
    mutationFn: endpoints.automationCreateRule,
    onSuccess: () => {
      toast.success("Rule created");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (e: Error) => toast.error("Failed to create rule", { description: e.message }),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: number | string; enabled: boolean }) =>
      endpoints.automationToggleRule(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (e: Error) => toast.error("Toggle failed", { description: e.message }),
  });
  const runRule = useMutation({
    mutationFn: (id: number | string) => endpoints.automationRunRule(id),
    onSuccess: () => {
      toast.success("Recovery job started");
      qc.invalidateQueries({ queryKey: ["automation-jobs"] });
    },
    onError: (e: Error) => toast.error("Run failed", { description: e.message }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: number | string) => endpoints.automationDeleteRule(id),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  // ---- Detail sheet ----
  const [detailId, setDetailId] = useState<number | string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AutomationRule | null>(null);

  // ---- Summary numbers ----
  const totalRules = rules.length;
  const successful = jobs.filter((j) => j.status === "success").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const pending = jobs.filter((j) => j.status === "pending" || j.status === "running").length;
  const disabled = rules.filter((r) => !r.enabled).length;
  const today = new Date().toDateString();
  const recoveriesToday = jobs.filter(
    (j) => j.started && new Date(j.started).toDateString() === today,
  ).length;

  const backendUnavailable =
    !!rulesQ.error && !!jobsQ.error && !!metricsQ.error;

  return (
    <AppShell>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Zap className="h-6 w-6 text-primary" />
              Automation Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Self-healing rules, live recovery jobs, and AI guidance.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Rule
          </Button>
        </div>

        {backendUnavailable && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-200">
              <ServerCrash className="h-4 w-4 shrink-0" />
              <div>
                Automation endpoints aren't available on the Guardian backend yet
                (<code className="font-mono text-xs">/automation/*</code>). UI is wired and
                will populate as soon as the FastAPI routes ship.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Automation Rules"
            value={totalRules}
            icon={Zap}
            tone="primary"
            loading={rulesQ.isLoading}
          />
          <KpiCard
            label="Successful"
            value={successful}
            icon={CheckCircle2}
            tone="success"
            loading={jobsQ.isLoading}
          />
          <KpiCard
            label="Failed"
            value={failed}
            icon={XCircle}
            tone="danger"
            loading={jobsQ.isLoading}
          />
          <KpiCard
            label="Pending Jobs"
            value={pending}
            icon={Clock}
            tone="warning"
            loading={jobsQ.isLoading}
          />
          <KpiCard
            label="Disabled Rules"
            value={disabled}
            icon={Pause}
            tone="muted"
            loading={rulesQ.isLoading}
          />
          <KpiCard
            label="Today's Recoveries"
            value={recoveriesToday}
            icon={Activity}
            tone="primary"
            loading={jobsQ.isLoading}
          />
        </div>

        {/* Metrics + AI */}
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <MetricsCard metrics={metricsQ.data} loading={metricsQ.isLoading} />
          <AiCard
            recommendation={aiQ.data?.recommendation}
            summary={aiQ.data?.summary}
            suggestions={aiQ.data?.suggestions}
            loading={aiQ.isLoading}
            error={!!aiQ.error}
          />
        </div>

        {/* Rules + Filters */}
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by rule, container, trigger, action…"
                    className="pl-8"
                  />
                </div>
              </div>
              <ToggleGroup
                type="single"
                value={statusFilter}
                onValueChange={(v) => v && setStatusFilter(v)}
                className="justify-start"
              >
                {["all", "enabled", "disabled", "failed", "successful", "critical"].map((s) => (
                  <ToggleGroupItem key={s} value={s} className="px-3 capitalize">
                    {s}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesQ.isLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        {Array.from({ length: 9 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!rulesQ.isLoading && filteredRules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                        {rules.length === 0
                          ? "No automation rules yet. Click 'Create Rule' to add one."
                          : "No rules match the current filters."}
                      </TableCell>
                    </TableRow>
                  )}

                  {filteredRules.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setDetailId(r.id)}
                    >
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {labelFor(String(r.trigger), TRIGGERS)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.target}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {labelFor(String(r.action), ACTIONS)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.cooldown ?? "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={r.enabled}
                          onCheckedChange={(v) =>
                            toggleRule.mutate({ id: r.id, enabled: v })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelative(r.last_run)}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={r.last_status} />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Run now"
                            onClick={() => runRule.mutate(r.id)}
                            disabled={runRule.isPending}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            onClick={() => setConfirmDelete(r)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Details">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Live jobs + logs */}
        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Recovery Jobs</TabsTrigger>
            <TabsTrigger value="logs">Recovery Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs">
            <Card>
              <CardContent className="p-4 md:p-5">
                <JobsTable jobs={jobs} loading={jobsQ.isLoading} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardContent className="p-4 md:p-5">
                <LogsList logs={logsQ.data ?? []} loading={logsQ.isLoading} error={!!logsQ.error} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create rule wizard */}
      <CreateRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        services={services.services.map((s) => s.name)}
        onSubmit={(rule) => createRule.mutateAsync(rule).then(() => setCreateOpen(false))}
        submitting={createRule.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <b>{confirmDelete?.name}</b>. The rule will stop
              triggering recoveries immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) deleteRule.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rule details */}
      <RuleDetailSheet
        ruleId={detailId}
        onClose={() => setDetailId(null)}
        onRun={(id) => runRule.mutate(id)}
        onToggle={(id, enabled) => toggleRule.mutate({ id, enabled })}
        onDelete={(rule) => {
          setDetailId(null);
          setConfirmDelete(rule);
        }}
      />
    </AppShell>
  );
}

// ---------------- KPI Cards ----------------

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "warning" | "danger" | "muted";
  loading?: boolean;
}) {
  const toneClasses: Record<typeof tone, string> = {
    primary: "text-primary bg-primary/10 ring-primary/20",
    success: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    warning: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
    danger: "text-red-400 bg-red-500/10 ring-red-500/20",
    muted: "text-muted-foreground bg-muted/40 ring-border",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("grid h-10 w-10 place-items-center rounded-lg ring-1", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-xl font-semibold">
            {loading ? <Skeleton className="h-6 w-12" /> : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Metrics + AI ----------------

function MetricsCard({
  metrics,
  loading,
}: {
  metrics?: AutomationMetrics;
  loading?: boolean;
}) {
  const gauges = [
    {
      label: "Recovery Success",
      value: metrics?.success_rate,
      suffix: "%",
      tone: "emerald",
    },
    {
      label: "Avg Recovery Time",
      value: metrics?.avg_recovery_seconds,
      suffix: " sec",
      tone: "sky",
    },
    {
      label: "Automation Coverage",
      value: metrics?.coverage,
      suffix: "%",
      tone: "violet",
    },
    {
      label: "Failures Today",
      value: metrics?.failures_today,
      suffix: "",
      tone: "red",
    },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 text-sm font-medium">Success Metrics</div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {gauges.map((g) => (
            <div key={g.label} className="rounded-lg border border-border/60 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : g.value == null ? (
                  "—"
                ) : (
                  `${g.value}${g.suffix}`
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AiCard({
  recommendation,
  summary,
  suggestions,
  loading,
  error,
}: {
  recommendation?: string;
  summary?: string;
  suggestions?: string[];
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-sm font-medium">Guardian AI Suggestions</div>
        </div>
        {loading && <Skeleton className="h-16 w-full" />}
        {!loading && error && (
          <p className="text-sm text-muted-foreground">
            AI guidance unavailable. The <code className="font-mono text-xs">/ai/automation</code>{" "}
            endpoint will surface recommendations here once enabled.
          </p>
        )}
        {!loading && !error && !recommendation && !summary && (!suggestions || suggestions.length === 0) && (
          <p className="text-sm text-muted-foreground">
            No suggestions yet — Guardian will recommend rule changes after enough automated runs.
          </p>
        )}
        {!loading && (recommendation || summary) && (
          <p className="text-sm leading-relaxed text-foreground/90">
            {recommendation ?? summary}
          </p>
        )}
        {!loading && suggestions && suggestions.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Jobs ----------------

function JobsTable({ jobs, loading }: { jobs: AutomationJob[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (jobs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No recovery jobs yet. Jobs will stream here in real time when automations fire.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job ID</TableHead>
            <TableHead>Triggered By</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="min-w-[160px]">Progress</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {jobs.map((j) => (
              <motion.tr
                key={j.job}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="border-b"
              >
                <TableCell className="font-mono text-xs">{j.job}</TableCell>
                <TableCell className="text-muted-foreground">{j.triggered_by ?? j.rule_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{j.service ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {j.action ? labelFor(j.action, ACTIONS) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={Math.max(0, Math.min(100, j.progress ?? 0))} className="h-2" />
                    <span className="w-10 text-right text-xs text-muted-foreground">
                      {Math.round(j.progress ?? 0)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{j.duration ?? "—"}</TableCell>
                <TableCell>
                  <StatusPill status={j.status} />
                </TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------- Logs ----------------

function LogsList({
  logs,
  loading,
  error,
}: {
  logs: AutomationLogEntry[];
  loading?: boolean;
  error?: boolean;
}) {
  const [openId, setOpenId] = useState<string | number | null>(null);
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Logs unavailable — <code className="font-mono text-xs">/automation/logs</code> not yet
        implemented on the backend.
      </div>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">No recovery logs yet.</div>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {logs.map((l, i) => {
        const id = l.id ?? i;
        const open = openId === id;
        const ok = (l.exit_code ?? 0) === 0;
        return (
          <div key={id}>
            <button
              onClick={() => setOpenId(open ? null : id)}
              className="flex w-full items-center gap-3 py-3 text-left text-sm hover:bg-accent/30"
            >
              <Terminal className={cn("h-4 w-4 shrink-0", ok ? "text-emerald-400" : "text-red-400")} />
              <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                {formatRelative(l.timestamp)}
              </span>
              <span className="w-32 shrink-0 truncate font-mono text-xs">{l.container ?? "—"}</span>
              <span className="flex-1 truncate font-mono text-xs">{l.command ?? l.status ?? "—"}</span>
              <Badge variant={ok ? "secondary" : "destructive"} className="text-[10px]">
                exit {l.exit_code ?? 0}
              </Badge>
            </button>
            {open && l.output && (
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-background/60 p-3 text-xs font-mono text-muted-foreground">
                {l.output}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Rule Detail Sheet ----------------

function RuleDetailSheet({
  ruleId,
  onClose,
  onRun,
  onToggle,
  onDelete,
}: {
  ruleId: number | string | null;
  onClose: () => void;
  onRun: (id: number | string) => void;
  onToggle: (id: number | string, enabled: boolean) => void;
  onDelete: (rule: AutomationRule) => void;
}) {
  const detailQ = useQuery<AutomationRuleDetail>({
    queryKey: ["automation-rule", ruleId],
    queryFn: () => endpoints.automationRuleDetail(ruleId as number | string),
    enabled: API_CONFIGURED && ruleId != null,
    refetchInterval: 15_000,
    retry: 0,
  });
  const d = detailQ.data;

  return (
    <Sheet open={ruleId != null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {d?.name ?? "Rule"}
          </SheetTitle>
        </SheetHeader>

        {detailQ.isLoading && <Skeleton className="mt-6 h-40 w-full" />}
        {!detailQ.isLoading && detailQ.error && (
          <p className="mt-6 text-sm text-muted-foreground">
            Rule detail unavailable from backend.
          </p>
        )}

        {d && (
          <div className="mt-5 space-y-5">
            {/* Manual actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onRun(d.id)}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> Run Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggle(d.id, !d.enabled)}
              >
                <Power className="mr-1.5 h-3.5 w-3.5" />
                {d.enabled ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRun(d.id)}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Re-run
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDelete(d)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Executions" value={d.execution_count ?? "—"} />
              <Stat
                label="Avg Duration"
                value={d.avg_duration_seconds != null ? `${d.avg_duration_seconds}s` : "—"}
              />
              <Stat
                label="Success Rate"
                value={d.success_rate != null ? `${d.success_rate}%` : "—"}
              />
            </div>

            {/* Timeline */}
            <section>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recovery Timeline
              </h4>
              {!d.timeline || d.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events yet.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-border/60 pl-4">
                  {d.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
                      <div className="font-mono text-xs text-muted-foreground">{t.time}</div>
                      <div className="text-sm">{t.event}</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* History */}
            <section>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent Runs
              </h4>
              <LogsList logs={d.history ?? []} />
            </section>

            {d.failures && d.failures.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Failures
                </h4>
                <LogsList logs={d.failures} />
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

// ---------------- Create Rule Wizard ----------------

function CreateRuleDialog({
  open,
  onOpenChange,
  services,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: string[];
  onSubmit: (rule: Omit<AutomationRule, "id">) => Promise<unknown> | void;
  submitting?: boolean;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("container_down");
  const [target, setTarget] = useState("");
  const [action, setAction] = useState<AutomationAction>("restart_container");
  const [cooldown, setCooldown] = useState("5m");
  const [retries, setRetries] = useState(3);
  const [timeout, setTimeoutVal] = useState("60s");
  const [priority, setPriority] = useState<AutomationRule["priority"]>("normal");
  const [confirmDanger, setConfirmDanger] = useState(false);

  const dangerous = ACTIONS.find((a) => a.id === action)?.dangerous;
  const canSave = !!name && !!target && (!dangerous || confirmDanger);

  useEffect(() => {
    if (!open) {
      setName("");
      setTarget("");
      setTrigger("container_down");
      setAction("restart_container");
      setCooldown("5m");
      setRetries(3);
      setTimeoutVal("60s");
      setPriority("normal");
      setConfirmDanger(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Automation Rule</DialogTitle>
          <DialogDescription>
            Choose a trigger and the recovery action Guardian should take automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Field label="Rule name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Restart Nextcloud"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trigger">
              <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationTrigger)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Action">
              <Select value={action} onValueChange={(v) => setAction(v as AutomationAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}{a.dangerous ? " ⚠" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Target service">
            {services.length > 0 ? (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Select a container" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="nextcloud"
              />
            )}
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Cooldown">
              <Input value={cooldown} onChange={(e) => setCooldown(e.target.value)} placeholder="5m" />
            </Field>
            <Field label="Retries">
              <Input
                type="number"
                min={0}
                value={retries}
                onChange={(e) => setRetries(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Timeout">
              <Input value={timeout} onChange={(e) => setTimeoutVal(e.target.value)} placeholder="60s" />
            </Field>
          </div>

          <Field label="Priority">
            <Select value={priority ?? "normal"} onValueChange={(v) => setPriority(v as AutomationRule["priority"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {dangerous && (
            <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmDanger}
                onChange={(e) => setConfirmDanger(e.target.checked)}
              />
              <span>
                I understand this action runs arbitrary code on the host and confirm I want to
                enable it.
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSave || submitting}
            onClick={() =>
              onSubmit({
                name,
                trigger,
                target,
                action,
                cooldown,
                retries,
                timeout,
                priority,
                enabled: true,
              })
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------------- helpers ----------------

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase();
  if (s === "success" || s === "succeeded" || s === "ok") {
    return <Badge className="bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">Success</Badge>;
  }
  if (s === "failed" || s === "error") {
    return <Badge className="bg-red-500/15 text-red-300 ring-1 ring-red-500/30">Failed</Badge>;
  }
  if (s === "running") {
    return (
      <Badge className="gap-1 bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" /> Running
      </Badge>
    );
  }
  if (s === "pending") {
    return <Badge className="bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">Pending</Badge>;
  }
  if (s === "cancelled") {
    return <Badge variant="secondary">Cancelled</Badge>;
  }
  return <Badge variant="secondary">—</Badge>;
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return iso;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}
