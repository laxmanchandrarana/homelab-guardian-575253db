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
  health_score?: number;
  healthy_services?: number;
  down_services?: number;
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
};

export type IncidentDTO = {
  service: string;
  status: string;
  time: string;
  detail?: string;
  severity?: "critical" | "warning" | "resolved" | "info";
};

export type NotificationDTO = {
  id?: string | number;
  time: string;
  text: string;
  level?: "info" | "warning" | "danger" | "healthy";
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
  healthy_services?: number;
  recovered_today?: number;
  incidents_open?: number;
};

export const endpoints = {
  monitoring: () => api<MonitoringDTO>("/monitoring"),
  dashboard: () => api<DashboardDTO>("/dashboard"),
  services: () => api<ServiceDTO[]>("/services"),
  incidents: () => api<IncidentDTO[]>("/incidents"),
  metrics: () => api<MetricsDTO>("/metrics"),
  notifications: () => api<NotificationDTO[]>("/notifications"),
  aiSummary: () => api<AiSummaryDTO>("/ai/summary"),
  health: () => api<{ status: string }>("/health"),
  restartService: (service: string) =>
    api<{ ok: boolean }>(`/incidents/${encodeURIComponent(service)}`, { method: "POST" }),
};
