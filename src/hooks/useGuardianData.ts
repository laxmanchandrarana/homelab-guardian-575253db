import { useQuery } from "@tanstack/react-query";
import {
  endpoints,
  API_CONFIGURED,
  type ServiceDTO,
  type IncidentDTO,
  type MonitoringDTO,
  type NotificationDTO,
  type MetricsDTO,
  type MetricPoint,
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
  if (["healthy", "running", "ok", "up", "resolved"].includes(v)) return "healthy";
  if (["warning", "warn", "degraded", "restarting"].includes(v)) return "warning";
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
        return m;
      })
    : mockTopMetrics;

  return { metrics, isLoading: q.isLoading, isLive: !!live, error: q.error };
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
      }))
    : mockServices;

  return { services: data, isLoading: q.isLoading, isLive: !!q.data, error: q.error };
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
    ? q.data.slice(0, 10).map((i: IncidentDTO) => ({
        time: i.time,
        text: `${i.service} ${i.status}`,
        status: normalizeStatus(i.status),
        detail: i.detail ?? "",
      }))
    : mockTimeline;

  return { timeline, isLoading: q.isLoading, isLive: !!q.data, error: q.error };
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
        status: normalizeStatus(n.level),
      }))
    : mockEvents;

  return { events, isLoading: q.isLoading, isLive: !!q.data, error: q.error };
}

export type { MonitoringDTO };
