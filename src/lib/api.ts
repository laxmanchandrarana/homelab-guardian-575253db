// Central API client for the Guardian FastAPI backend.
// Set VITE_API_URL in your environment (e.g. http://100.93.15.3:8008).
// When VITE_API_URL is unset, callers should fall back to mock data.

const DEFAULT_API_URL = "https://api-guardian.atmakriti.com";
export const API_URL: string =
  ((import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "") || DEFAULT_API_URL;

export const API_CONFIGURED = API_URL.length > 0;

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body || "request failed"}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_CONFIGURED) {
    throw new ApiError(0, "VITE_API_URL is not configured");
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => ""));
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : (undefined as unknown)) as T;
}

export type RangeKey = "15m" | "1h" | "6h" | "24h";


// Derive WS URL from API_URL (http -> ws, https -> wss).
export function wsUrl(path = "/ws"): string | null {
  if (!API_CONFIGURED) return null;
  try {
    const u = new URL(API_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = (u.pathname.replace(/\/$/, "") + path) || path;
    return u.toString();
  } catch {
    return null;
  }
}

// ---------- Endpoint helpers (typed against your FastAPI shape) ----------

export type MonitoringDTO = {
  cpu: number;
  memory: number;
  disk: number;
  network: string | number;
  network_up?: number | string;
  network_down?: number | string;
  containers_total?: number;
  health_score?: number;
  healthy_services?: number;
  down_services?: number;
  status?: string;
  last_scan?: string;
  last_update?: string;
  api_status?: string;
};

export type DashboardDTO = MonitoringDTO & {
  health_score: number;
  healthy_services: number;
  down_services: number;
};

export type ServiceDTO = {
  name: string;
  status: string;
  cpu: number;
  memory: number | string;
  uptime?: string;
  autoheal?: boolean;
  autoHeal?: boolean;
  lastRestart?: string;
  last_restart?: string;
  restart_count?: number;
  restarts?: number;
  health?: string;
  container_name?: string;
  image?: string;
};

export type ServiceDetailDTO = ServiceDTO & {
  ports?: (string | { container?: number | string; host?: number | string; protocol?: string })[];
  networks?: string[];
  volumes?: (string | { source?: string; target?: string })[];
  env?: Record<string, string> | string[];
  environment?: Record<string, string> | string[];
  created?: string;
  created_at?: string;
};


export type IncidentDTO = {
  id?: string | number;
  service: string;
  status: string;
  time: string;
  detail?: string;
  action?: string;
  severity?: "critical" | "warning" | "resolved" | "info";
};

export type NotificationDTO = {
  id?: string | number;
  time: string;
  text: string;
  level?: "info" | "warning" | "danger" | "healthy";
  channel?: "telegram" | "discord" | "slack" | "email" | string;
  status?: "delivered" | "pending" | "failed" | string;
};

export type AlertDTO = {
  id?: string | number;
  severity?: "critical" | "warning" | "info";
  service?: string;
  message?: string;
  started?: string;
  duration?: string;
};

export type MetricPoint = { t: number | string; v: number };
export type MetricsDTO = {
  cpu?: MetricPoint[];
  memory?: MetricPoint[];
  disk?: MetricPoint[];
  network?: MetricPoint[];
};

export type AiSummaryDTO = {
  summary: string;
  recommendation?: string;
  risks?: string[] | string;
  prediction?: string;
  status?: string;
  healthy_services?: number;
  recovered_today?: number;
  incidents_open?: number;
};

export const endpoints = {
  monitoring: () => api<MonitoringDTO>("/monitoring"),
  dashboard: () => api<DashboardDTO>("/dashboard"),
  services: () => api<ServiceDTO[]>("/services"),
  serviceDetail: (name: string) => api<ServiceDetailDTO>(`/services/${encodeURIComponent(name)}`),
  serviceLogs: (name: string) => api<string | { logs?: string; lines?: string[] }>(`/services/${encodeURIComponent(name)}/logs`),
  startService: (name: string) => api<{ ok: boolean }>(`/services/${encodeURIComponent(name)}/start`, { method: "POST" }),
  stopService: (name: string) => api<{ ok: boolean }>(`/services/${encodeURIComponent(name)}/stop`, { method: "POST" }),
  restartServiceDirect: (name: string) => api<{ ok: boolean }>(`/services/${encodeURIComponent(name)}/restart`, { method: "POST" }),
  incidents: () => api<IncidentDTO[]>("/incidents"),
  incidentDetail: (id: string | number) => api<IncidentDTO & Record<string, unknown>>(`/incidents/${encodeURIComponent(String(id))}`),
  metrics: (range?: RangeKey) => api<MetricsDTO>(`/metrics${range ? `?range=${range}` : ""}`),
  notifications: () => api<NotificationDTO[]>("/notifications"),
  alerts: () => api<AlertDTO[]>("/alerts"),
  aiSummary: () => api<AiSummaryDTO>("/ai/summary"),
  health: () => api<{ status: string }>("/health"),
  restartService: (service: string) =>
    api<{ ok: boolean }>(`/incidents/${encodeURIComponent(service)}`, { method: "POST" }),
  runScan: () => api<{ ok: boolean }>(`/scan`, { method: "POST" }),
  createBackup: () => api<{ ok: boolean }>(`/backup`, { method: "POST" }),
};


