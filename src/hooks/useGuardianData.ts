import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  endpoints,
  API_CONFIGURED,
  type ServiceDTO,
  type IncidentDTO,
  type NotificationDTO,
  type AlertDTO,
  type MetricsDTO,
  type MetricPoint,
  type RangeKey,
} from "@/lib/api";
import {
  topMetrics as mockTopMetrics,
  services as mockServices,
  liveEvents as mockEvents,
  incidentTimeline as mockTimeline,
  genSeries,
  type Status,
} from "@/lib/mock-data";


function normalizeStatus(s: string | undefined): Status {
  const v = (s ?? "").toLowerCase();
  if (["healthy", "running", "ok", "up", "resolved", "delivered", "success"].includes(v)) return "healthy";
  if (["warning", "warn", "degraded", "restarting", "pending"].includes(v)) return "warning";
  return "danger";
}

function fmtRam(v: number | string | undefined): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (v > 1024) return `${(v / 1024).toFixed(1)}GB`;
  return `${Math.round(v)}MB`;
}

// ---------- Monitoring → top KPI cards ----------
export function useMonitoring() {
  const q = useQuery({
    queryKey: ["monitoring"],
    queryFn: endpoints.monitoring,
    enabled: API_CONFIGURED,
    refetchInterval: 5000,
    retry: 1,
  });

  const live = q.data;
  const metrics = live
    ? mockTopMetrics.map((m) => {
        if (m.id === "cpu") return { ...m, value: Math.round(live.cpu ?? m.value) };
        if (m.id === "ram") return { ...m, value: Math.round(live.memory ?? m.value) };
        if (m.id === "storage") return { ...m, value: Math.round(live.disk ?? m.value) };
        if (m.id === "network")
          return {
            ...m,
            display: typeof live.network === "string" ? live.network : undefined,
            value: typeof live.network === "number" ? live.network : m.value,
          };
        if (m.id === "containers" && typeof live.containers_total === "number")
          return { ...m, value: live.containers_total, display: `${live.containers_total} Running` };
        if (m.id === "incidents" && typeof live.down_services === "number")
          return { ...m, value: live.down_services, display: String(live.down_services) };
        return m;
      })
    : mockTopMetrics;

  return {
    metrics,
    raw: live,
    healthScore: typeof live?.health_score === "number" ? live.health_score : undefined,
    healthyServices: live?.healthy_services,
    downServices: live?.down_services,
    isLoading: q.isLoading,
    isLive: !!live,
    error: q.error,
    refetch: q.refetch,
  };
}

// ---------- Dashboard summary (optional /dashboard) ----------
export function useDashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: endpoints.dashboard,
    enabled: API_CONFIGURED,
    refetchInterval: 10000,
    retry: 0,
  });
  return { data: q.data, isLive: !!q.data, isLoading: q.isLoading };
}

// ---------- Services ----------
export function useServices() {
  const q = useQuery({
    queryKey: ["services"],
    queryFn: endpoints.services,
    enabled: API_CONFIGURED,
    refetchInterval: 10000,
    retry: 1,
  });

  const data = q.data
    ? q.data.map((s: ServiceDTO) => ({
        name: s.name,
        status: normalizeStatus(s.status),
        cpu: typeof s.cpu === "number" ? s.cpu : 0,
        ram: fmtRam(s.memory),
        uptime: s.uptime ?? "—",
        autoHeal: s.autoHeal ?? s.autoheal ?? false,
        lastRestart: s.lastRestart ?? s.last_restart,
        restartCount: s.restart_count,
        health: s.health,
      }))
    : mockServices;

  return { services: data, isLoading: q.isLoading, isLive: !!q.data, error: q.error, refetch: q.refetch };
}

// ---------- Incidents → timeline ----------
export function useIncidents() {
  const q = useQuery({
    queryKey: ["incidents"],
    queryFn: endpoints.incidents,
    enabled: API_CONFIGURED,
    refetchInterval: 10000,
    retry: 1,
  });

  const timeline = q.data
    ? q.data.slice(0, 10).map((i: IncidentDTO) => {
        const status = normalizeStatus(i.status);
        const severity =
          i.severity ??
          (status === "danger" ? "critical" : status === "warning" ? "warning" : "resolved");
        return {
          id: i.id,
          time: i.time,
          service: i.service,
          text: `${i.service} ${i.status}`,
          status,
          detail: i.detail ?? "",
          action: i.action,
          severity,
        };
      })
    : mockTimeline.map((t) => ({ ...t, severity: t.status === "danger" ? "critical" : t.status === "warning" ? "warning" : "resolved" }));

  return { timeline, isLoading: q.isLoading, isLive: !!q.data, error: q.error, refetch: q.refetch };
}

// ---------- Notifications → event feed ----------
export function useNotifications() {
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: endpoints.notifications,
    enabled: API_CONFIGURED,
    refetchInterval: 8000,
    retry: 1,
  });

  const events = q.data
    ? q.data.slice(0, 12).map((n: NotificationDTO) => ({
        time: n.time,
        text: n.text,
        status: normalizeStatus(n.status ?? n.level),
        channel: n.channel,
        deliveryStatus: n.status,
      }))
    : mockEvents;

  return { events, isLoading: q.isLoading, isLive: !!q.data, error: q.error, refetch: q.refetch };
}

// ---------- Alerts ----------
export function useAlerts() {
  const q = useQuery({
    queryKey: ["alerts"],
    queryFn: endpoints.alerts,
    enabled: API_CONFIGURED,
    refetchInterval: 8000,
    retry: 1,
  });
  const alerts: AlertDTO[] = q.data ?? [];
  return { alerts, isLoading: q.isLoading, isLive: !!q.data, error: q.error, refetch: q.refetch };
}

// ---------- Metrics → live charts ----------
function toSeries(points: MetricPoint[] | undefined, fallback: { t: number; v: number }[]) {
  if (!points || points.length === 0) return fallback;
  return points.slice(-96).map((p, i) => ({ t: i, v: Math.max(0, Math.min(100, Number(p.v) || 0)) }));
}

const RANGE_POINTS: Record<RangeKey, number> = { "15m": 15, "1h": 48, "6h": 72, "24h": 96, "7d": 168 };

export function useMetrics(range: RangeKey = "1h") {
  const q = useQuery<MetricsDTO>({
    queryKey: ["metrics", range],
    queryFn: () => endpoints.metrics(range),
    enabled: API_CONFIGURED,
    refetchInterval: 5000,
    retry: 1,
  });

  const n = RANGE_POINTS[range] ?? 48;
  const d = q.data;
  const series = {
    cpu: toSeries(d?.cpu, genSeries(n, 21, 12)),
    ram: toSeries(d?.memory, genSeries(n, 53, 8)),
    disk: toSeries(d?.disk, genSeries(n, 34, 22)),
    net: toSeries(d?.network, genSeries(n, 40, 26)),
  };

  return { series, isLoading: q.isLoading, isLive: !!d, error: q.error, refetch: q.refetch };
}

// ---------- AI summary ----------
export function useAiSummary() {
  const q = useQuery({
    queryKey: ["ai-summary"],
    queryFn: endpoints.aiSummary,
    enabled: API_CONFIGURED,
    refetchInterval: 60_000,
    retry: 1,
  });
  const d = q.data;
  const risks = Array.isArray(d?.risks) ? d?.risks : d?.risks ? [d.risks] : [];
  return {
    summary: d?.summary,
    recommendation: d?.recommendation,
    risks,
    prediction: d?.prediction,
    aiStatus: d?.status,
    healthyServices: d?.healthy_services,
    recoveredToday: d?.recovered_today,
    incidentsOpen: d?.incidents_open,
    isLive: !!d,
    isLoading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

// ---------- Mutations ----------
export function useRestartService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => endpoints.restartService(name),
    onMutate: async (name: string) => {
      await qc.cancelQueries({ queryKey: ["services"] });
      const prev = qc.getQueryData<any[]>(["services"]);
      if (prev) {
        qc.setQueryData<any[]>(["services"], prev.map((s) => s.name === name ? { ...s, status: "restarting" } : s));
      }
      return { prev };
    },
    onError: (_e, _n, ctx) => { if (ctx?.prev) qc.setQueryData(["services"], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
}

function makeServiceActionHook(
  action: (name: string) => Promise<{ ok: boolean }>,
  optimisticStatus: string,
) {
  return function useAction() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => action(name),
      onMutate: async (name: string) => {
        await qc.cancelQueries({ queryKey: ["services"] });
        const prev = qc.getQueryData<any[]>(["services"]);
        if (prev) {
          qc.setQueryData<any[]>(["services"], prev.map((s) =>
            s.name === name ? { ...s, status: optimisticStatus } : s));
        }
        return { prev };
      },
      onError: (_e, _n, ctx) => { if (ctx?.prev) qc.setQueryData(["services"], ctx.prev); },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: ["services"] });
        qc.invalidateQueries({ queryKey: ["incidents"] });
      },
    });
  };
}

export const useStartService = makeServiceActionHook(endpoints.startService, "starting");
export const useStopService = makeServiceActionHook(endpoints.stopService, "stopping");
export const useRestartServiceDirect = makeServiceActionHook(endpoints.restartServiceDirect, "restarting");
export const usePauseService = makeServiceActionHook(endpoints.pauseService, "pausing");
export const useResumeService = makeServiceActionHook(endpoints.resumeService, "resuming");

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => endpoints.deleteService(name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["service-detail"] });
    },
  });
}


export function useServicePrediction(name: string | null) {
  return useQuery({
    queryKey: ["service-prediction", name],
    queryFn: () => endpoints.servicePrediction(name as string),
    enabled: API_CONFIGURED && !!name,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useServiceDetail(name: string | null) {
  return useQuery({
    queryKey: ["service-detail", name],
    queryFn: () => endpoints.serviceDetail(name as string),
    enabled: API_CONFIGURED && !!name,
    refetchInterval: 10000,
    retry: 1,
  });
}

export function useIncidentDetail(id: string | number | null) {
  return useQuery({
    queryKey: ["incident-detail", id],
    queryFn: () => endpoints.incidentDetail(id as string | number),
    enabled: API_CONFIGURED && id != null,
    refetchInterval: 15000,
    retry: 1,
  });
}

export function useServiceLogs(name: string | null, paused = false) {
  return useQuery({
    queryKey: ["service-logs", name],
    queryFn: () => endpoints.serviceLogs(name as string),
    enabled: API_CONFIGURED && !!name && !paused,
    refetchInterval: paused ? false : 4000,
    retry: 1,
  });
}

export function useRunScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: endpoints.runScan,
    onSettled: () => qc.invalidateQueries({ queryKey: ["monitoring"] }),
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: endpoints.createBackup,
    onSettled: () => qc.invalidateQueries({ queryKey: ["backup-summary"] }),
  });
}

export function useBackupSummary() {
  const q = useQuery({
    queryKey: ["backup-summary"],
    queryFn: async () => {
      const [files, latest] = await Promise.all([
        endpoints.backupFiles().catch(() => [] as any[]),
        endpoints.backupLatest().catch(() => null),
      ]);
      const totalBytes = (files as any[]).reduce((s, f: any) => s + (Number(f.size) || 0), 0);
      const success = (files as any[]).filter(
        (f: any) => String(f.status).toUpperCase() === "SUCCESS",
      ).length;
      return {
        count: files.length,
        latest,
        totalBytes,
        successRate: files.length ? Math.round((success / files.length) * 100) : null,
      };
    },
    enabled: API_CONFIGURED,
    refetchInterval: 60_000,
    retry: 1,
  });
  return {
    count: q.data?.count ?? 0,
    latest: q.data?.latest ?? null,
    totalBytes: q.data?.totalBytes ?? 0,
    successRate: q.data?.successRate ?? null,
    isLoading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}


