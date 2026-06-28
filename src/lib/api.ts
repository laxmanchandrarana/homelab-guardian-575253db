// Central API client for the Guardian FastAPI backend.
//
// This module is the ONLY place that talks to HTTP. Components and hooks
// must use the typed `endpoints.*` helpers below. The shapes returned here
// are normalized DTOs — backend response drift is contained in this file.

import {
  API_BASE_URL,
  API_CONFIGURED,
  IS_DEV,
  deriveWsUrl,
} from "@/config/api";

export const API_URL = API_BASE_URL;
export { API_CONFIGURED };

// ---------- Errors ----------

export class ApiError extends Error {
  status: number;
  body: string;
  url: string;
  constructor(status: number, body: string, url = "") {
    super(`API ${status} ${url}: ${body || "request failed"}`);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

// ---------- Core request helper (retry + logging) ----------

type RequestOptions = RequestInit & {
  /** Disable retry even for idempotent GET. */
  noRetry?: boolean;
  /** Override retry count for this request (default 3 for GET, 0 for others). */
  retries?: number;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT = 15_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function backoff(attempt: number): number {
  // 250ms, 500ms, 1s, 2s … capped at 4s with small jitter.
  const base = Math.min(250 * 2 ** attempt, 4000);
  return base + Math.floor(Math.random() * 150);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function safeRedact(input: unknown): unknown {
  if (!input) return input;
  if (typeof input === "string") {
    // Strip anything that looks like a bearer/token/key.
    return input.replace(/(Bearer\s+[A-Za-z0-9._-]+)/gi, "Bearer ***");
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/token|secret|password|api[-_]?key|authorization/i.test(k)) out[k] = "***";
      else out[k] = v;
    }
    return out;
  }
  return input;
}

function logRequest(url: string, init: RequestInit, status: number, ms: number, errored: boolean) {
  if (!IS_DEV) return;
  const method = (init.method ?? "GET").toUpperCase();
  const tag = errored ? "%c[api]%c ✖" : "%c[api]%c ✓";
  // eslint-disable-next-line no-console
  console.debug(
    `${tag} ${method} ${url} → ${status} in ${ms}ms`,
    "color:#7dd3fc;font-weight:600",
    "color:inherit",
  );
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_CONFIGURED) throw new ApiError(0, "API base URL is not configured");

  const url = `${API_URL}${path}`;
  const method = (options.method ?? "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";
  const maxAttempts = options.noRetry
    ? 1
    : Math.max(1, options.retries ?? (isIdempotent ? 3 : 1));

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal ?? controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
      });
      const ms = Math.round(performance.now() - t0);
      logRequest(url, options, res.status, ms, !res.ok);

      if (!res.ok) {
        if (isIdempotent && RETRYABLE_STATUS.has(res.status) && attempt + 1 < maxAttempts) {
          await sleep(backoff(attempt));
          continue;
        }
        const body = await res.text().catch(() => "");
        throw new ApiError(res.status, body, url);
      }
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        // Some endpoints (logs) return raw text.
        return text as unknown as T;
      }
    } catch (err) {
      lastErr = err;
      const ms = Math.round(performance.now() - t0);
      logRequest(url, options, 0, ms, true);
      const isAbort = (err as { name?: string })?.name === "AbortError";
      const retryable = isIdempotent && !(err instanceof ApiError);
      if (retryable && attempt + 1 < maxAttempts && !isAbort) {
        await sleep(backoff(attempt));
        continue;
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, (err as Error)?.message ?? "Network error", url);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError(0, "Request failed", url);
}

// ---------- WS URL helper (kept for back-compat) ----------

export function wsUrl(path = "/ws"): string | null {
  return deriveWsUrl(path);
}

// ---------- Public DTO types consumed by hooks/components ----------

export type RangeKey = "15m" | "1h" | "6h" | "24h" | "7d";

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

// ---------- Tiny normalizer helpers ----------

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function pickMemoryPercent(mem: unknown): number {
  if (typeof mem === "number") return mem;
  if (mem && typeof mem === "object") {
    const m = mem as Record<string, unknown>;
    if (typeof m.percent === "number") return m.percent;
    const used = num(m.used);
    const total = num(m.total);
    if (total > 0) return (used / total) * 100;
  }
  return 0;
}

function pickDiskPercent(disk: unknown): number {
  if (typeof disk === "number") return disk;
  if (disk && typeof disk === "object") {
    const d = disk as Record<string, unknown>;
    if (typeof d.percent === "number") return d.percent;
    const used = num(d.used);
    const total = num(d.total);
    if (total > 0) return (used / total) * 100;
  }
  return 0;
}

function normalizeContainer(raw: unknown): ServiceDTO {
  const r = (raw ?? {}) as Record<string, unknown>;
  const image = Array.isArray(r.image)
    ? (r.image[0] as string | undefined)
    : (r.image as string | undefined);
  return {
    name: str(r.name, "unknown"),
    status: str(r.status, "unknown"),
    cpu: num(r.cpu, 0),
    memory: typeof r.memory === "number" || typeof r.memory === "string" ? (r.memory as number | string) : 0,
    uptime: str(r.uptime) || undefined,
    autoheal: Boolean(r.autoheal ?? r.autoHeal ?? false),
    autoHeal: Boolean(r.autoheal ?? r.autoHeal ?? false),
    health: str(r.health) || undefined,
    container_name: str(r.container_name ?? r.name) || undefined,
    image,
    restart_count: typeof r.restart_count === "number" ? r.restart_count : undefined,
  };
}

function normalizeIncident(raw: unknown): IncidentDTO {
  const r = (raw ?? {}) as Record<string, unknown>;
  const sev = str(r.severity).toUpperCase();
  const healed = str(r.healed).toUpperCase() === "YES" || str(r.status).toLowerCase() === "resolved";
  const severity: IncidentDTO["severity"] = healed
    ? "resolved"
    : sev === "CRITICAL"
      ? "critical"
      : sev === "WARNING"
        ? "warning"
        : "info";
  return {
    id: (r.id as string | number | undefined) ?? undefined,
    service: str(r.service, "unknown"),
    status: healed ? "resolved" : sev.toLowerCase() || str(r.status, "open"),
    time: str(r.created ?? r.time ?? r.timestamp, new Date().toISOString()),
    detail: str(r.message ?? r.detail) || undefined,
    severity,
  };
}

function normalizePromAlert(raw: unknown): AlertDTO {
  const r = (raw ?? {}) as Record<string, unknown>;
  const labels = (r.labels ?? {}) as Record<string, string>;
  const annotations = (r.annotations ?? {}) as Record<string, string>;
  const sev = (labels.severity ?? "").toLowerCase();
  return {
    id: labels.alertname ?? str(r.fingerprint) ?? undefined,
    severity: sev === "critical" ? "critical" : sev === "warning" ? "warning" : "info",
    service:
      labels.service ??
      labels.container_label_com_docker_compose_service ??
      labels.job ??
      "system",
    message: annotations.description ?? annotations.summary ?? labels.alertname ?? "Alert firing",
    started: str(r.activeAt ?? r.startsAt) || undefined,
  };
}

function normalizeHealth(raw: unknown): MonitoringDTO {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    cpu: num(r.cpu, 0),
    memory: pickMemoryPercent(r.memory),
    disk: pickDiskPercent(r.disk),
    network: "—",
    status: "healthy",
    last_update: new Date().toISOString(),
  };
}

// ---------- Synthesis helpers (when backend lacks an endpoint) ----------

async function synthesizeMonitoring(): Promise<MonitoringDTO> {
  const [health, containers, incidents] = await Promise.allSettled([
    api<unknown>("/health"),
    api<unknown[]>("/containers"),
    api<unknown[]>("/incidents"),
  ]);
  const base: MonitoringDTO =
    health.status === "fulfilled" ? normalizeHealth(health.value) : { cpu: 0, memory: 0, disk: 0, network: "—" };
  const services = containers.status === "fulfilled" ? arr<unknown>(containers.value).map(normalizeContainer) : [];
  const incs = incidents.status === "fulfilled" ? arr<unknown>(incidents.value).map(normalizeIncident) : [];
  const healthy = services.filter((s) => s.status.toLowerCase() === "running").length;
  const down = services.length - healthy;
  const open = incs.filter((i) => i.severity !== "resolved").length;
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 - (down * 8 + open * 4 + base.cpu * 0.2 + base.memory * 0.2))),
  );
  return {
    ...base,
    containers_total: services.length,
    healthy_services: healthy,
    down_services: down,
    health_score: score,
  };
}

function synthesizeNotificationsFromIncidents(incidents: IncidentDTO[]): NotificationDTO[] {
  return incidents.slice(0, 20).map((i) => ({
    id: i.id,
    time: i.time,
    text: `${i.service}: ${i.detail ?? i.status}`,
    level:
      i.severity === "critical"
        ? "danger"
        : i.severity === "warning"
          ? "warning"
          : i.severity === "resolved"
            ? "healthy"
            : "info",
    channel: "system",
    status: "delivered",
  }));
}

async function synthesizeAiSummary(): Promise<AiSummaryDTO> {
  const mon = await synthesizeMonitoring().catch(
    () => ({ healthy_services: 0, down_services: 0, health_score: 0 }) as MonitoringDTO,
  );
  const incidents =
    (await api<unknown[]>("/incidents").catch(() => [])) ?? [];
  const incs = arr<unknown>(incidents).map(normalizeIncident);
  const open = incs.filter((i) => i.severity !== "resolved").length;
  const recovered = incs.filter(
    (i) =>
      i.severity === "resolved" &&
      Date.now() - new Date(i.time).getTime() < 24 * 3600 * 1000,
  ).length;
  const healthy = mon.healthy_services ?? 0;
  const down = mon.down_services ?? 0;
  let summary = `All systems nominal — ${healthy} services healthy.`;
  let recommendation = "No action required.";
  if (down > 0) {
    summary = `${down} service${down === 1 ? "" : "s"} need attention.`;
    recommendation = "Investigate failing containers and review recent incidents.";
  } else if (open > 0) {
    summary = `${open} open incident${open === 1 ? "" : "s"} being tracked.`;
    recommendation = "Review active incidents in the Incident Center.";
  }
  return {
    summary,
    recommendation,
    risks: down > 0 ? ["Service downtime"] : [],
    status: down > 0 ? "degraded" : "healthy",
    healthy_services: healthy,
    recovered_today: recovered,
    incidents_open: open,
  };
}

// ---------- Endpoint helpers ----------

const enc = encodeURIComponent;

export const endpoints = {
  // System health → KPI cards
  monitoring: () => synthesizeMonitoring(),
  dashboard: () => synthesizeMonitoring() as Promise<DashboardDTO>,
  health: () => api<{ status?: string } | unknown>("/health"),

  // Containers → service grid
  services: async (): Promise<ServiceDTO[]> => {
    const list = await api<unknown[]>("/containers");
    return arr<unknown>(list).map(normalizeContainer);
  },
  serviceDetail: async (name: string): Promise<ServiceDetailDTO> => {
    const [meta, stats] = await Promise.allSettled([
      api<unknown>(`/containers/${enc(name)}`).catch(() => null),
      api<unknown>(`/inspect/${enc(name)}`),
    ]);
    const base = normalizeContainer(meta.status === "fulfilled" && meta.value ? meta.value : { name });
    const inspect =
      stats.status === "fulfilled" ? (stats.value as Record<string, unknown> | null) : null;
    const detail: ServiceDetailDTO = { ...base };
    if (inspect) {
      const state = (inspect.State ?? {}) as Record<string, unknown>;
      const config = (inspect.Config ?? {}) as Record<string, unknown>;
      const networkSettings = (inspect.NetworkSettings ?? {}) as Record<string, unknown>;
      const networks = (networkSettings.Networks ?? {}) as Record<string, unknown>;
      const mounts = arr<Record<string, unknown>>(inspect.Mounts);
      const ports = networkSettings.Ports as Record<string, unknown> | undefined;
      detail.status = str(state.Status, detail.status);
      detail.health =
        (state.Health as Record<string, string> | undefined)?.Status ?? detail.health;
      detail.created = str(inspect.Created) || undefined;
      detail.image = str((config as Record<string, unknown>).Image) || detail.image;
      detail.networks = Object.keys(networks);
      detail.volumes = mounts.map((m) => ({
        source: str(m.Source),
        target: str(m.Destination),
      }));
      detail.env = arr<string>(config.Env) as string[];
      detail.ports = ports ? Object.keys(ports) : [];
      detail.restart_count = num((inspect as Record<string, unknown>).RestartCount, 0);
    }
    return detail;
  },
  serviceLogs: (name: string) => api<string>(`/logs/${enc(name)}`),
  startService: (name: string) =>
    api<{ ok: boolean }>(`/start/${enc(name)}`, { method: "POST" }).then(() => ({ ok: true })),
  stopService: (name: string) =>
    api<{ ok: boolean }>(`/stop/${enc(name)}`, { method: "POST" }).then(() => ({ ok: true })),
  restartServiceDirect: (name: string) =>
    api<{ ok: boolean }>(`/restart/${enc(name)}`, { method: "POST" }).then(() => ({ ok: true })),
  pauseService: (_name: string) =>
    Promise.reject(new ApiError(501, "Pause not supported by backend")),
  resumeService: (_name: string) =>
    Promise.reject(new ApiError(501, "Resume not supported by backend")),
  deleteService: (name: string) =>
    api<{ ok: boolean }>(`/containers/${enc(name)}`, { method: "DELETE" }).then(() => ({ ok: true })),


  // Per-service: Phase 3.5 wrappers
  monitoringService: (name: string) =>
    api<unknown>(`/stats/${enc(name)}`) as Promise<ServiceDetailDTO & Record<string, unknown>>,
  serviceMetrics: async (name: string, _range: RangeKey = "1h"): Promise<MetricsDTO> => {
    const p = await api<{ history?: Array<{ cpu?: number; memory?: number; disk?: number }> }>(
      `/prediction/${enc(name)}`,
    ).catch(() => ({ history: [] as Array<{ cpu?: number; memory?: number; disk?: number }> }));
    const history = arr<{ cpu?: number; memory?: number; disk?: number }>(p.history);
    return {
      cpu: history.map((h, i) => ({ t: i, v: num(h.cpu) })),
      memory: history.map((h, i) => ({ t: i, v: num(h.memory) })),
      disk: history.map((h, i) => ({ t: i, v: num(h.disk) })),
      network: [],
    };
  },
  servicePrediction: (name: string) =>
    api<{ risk?: string | number; confidence?: number; next_event?: string; recommendation?: string; summary?: string }>(
      `/prediction/${enc(name)}`,
    ),
  serviceLogsScoped: (name: string) => api<string>(`/logs/${enc(name)}`),

  // Incidents
  incidents: async (): Promise<IncidentDTO[]> => {
    const list = await api<unknown[]>("/incidents");
    return arr<unknown>(list).map(normalizeIncident);
  },
  incidentDetail: async (id: string | number) => {
    // Backend has no GET /incidents/{id}; resolve from list.
    const list = await api<unknown[]>("/incidents");
    const found = arr<Record<string, unknown>>(list).find((i) => String(i.id) === String(id));
    return found ? (normalizeIncident(found) as IncidentDTO & Record<string, unknown>) : ({
      id,
      service: "unknown",
      status: "unknown",
      time: new Date().toISOString(),
    } as IncidentDTO & Record<string, unknown>);
  },

  // Metrics (host-level): synthesize from /prediction for now.
  // The backend exposes Prometheus via /monitoring/query — kept available below.
  metrics: async (_range?: RangeKey): Promise<MetricsDTO> => {
    // No host-wide history endpoint; return empty so hooks fall through to mock series.
    return { cpu: [], memory: [], disk: [], network: [] };
  },

  // Notifications: synthesized from incidents until backend exposes them.
  notifications: async (): Promise<NotificationDTO[]> => {
    const incs = await endpoints.incidents().catch(() => [] as IncidentDTO[]);
    return synthesizeNotificationsFromIncidents(incs);
  },

  // Alerts: normalize alertmanager response.
  alerts: async (): Promise<AlertDTO[]> => {
    const raw = await api<{ data?: { alerts?: unknown[] } }>("/monitoring/alerts");
    return arr<unknown>(raw?.data?.alerts).map(normalizePromAlert);
  },

  // AI summary (synthesized — no /ai/summary endpoint upstream)
  aiSummary: () => synthesizeAiSummary(),

  // Manual incident trigger (legacy)
  restartService: (service: string) =>
    api<{ ok: boolean }>(`/incidents/${enc(service)}`, { method: "POST" }).then(() => ({ ok: true })),

  // Maintenance
  runScan: () => api<{ ok: boolean }>(`/health`, { noRetry: true }).then(() => ({ ok: true })),
  createBackup: () =>
    api<{ ok: boolean }>(`/backup/run`, { method: "POST" }).then(() => ({ ok: true })),

  // Monitoring Explorer (Prometheus passthrough)
  promQuery: (q: string) =>
    api<{ data?: { result?: Array<{ metric?: Record<string, string>; value?: [number, string] }> } }>(
      `/monitoring/query?query=${enc(q)}`,
    ),
  promQueryRange: (q: string, _range: RangeKey = "1h", _step = 15) =>
    api<{ data?: { result?: Array<{ metric?: Record<string, string>; values?: Array<[number, string]> }> } }>(
      `/monitoring/query?query=${enc(q)}`,
    ),
  monitoringHistory: async (_metric: string, _range: RangeKey = "1h"): Promise<MetricsDTO> => ({
    cpu: [],
    memory: [],
    disk: [],
    network: [],
  }),

  // Topology — try real endpoint, fall back to synthesis from /containers.
  topology: async (): Promise<TopologyDTO> => {
    try {
      const raw = await api<unknown>("/topology", { noRetry: true });
      const r = (raw ?? {}) as { nodes?: unknown[]; edges?: unknown[] };
      const nodes = arr<Record<string, unknown>>(r.nodes).map((n) => ({
        id: str(n.id ?? n.name, "unknown"),
        label: str(n.label ?? n.name ?? n.id, "unknown"),
        type: classifyNodeType(str(n.type), str(n.label ?? n.name ?? n.id)),
        status: normalizeTopoStatus(str(n.status)),
        cpu: typeof n.cpu === "number" ? (n.cpu as number) : undefined,
        memory: typeof n.memory === "number" ? (n.memory as number) : undefined,
        uptime: str(n.uptime) || undefined,
        image: str(n.image) || undefined,
      }));
      const edges = arr<Record<string, unknown>>(r.edges)
        .map((e, i) => ({
          id: str(e.id, `e-${i}`),
          source: str(e.source ?? e.from, ""),
          target: str(e.target ?? e.to, ""),
          label: str(e.label) || undefined,
        }))
        .filter((e) => e.source && e.target);
      if (nodes.length) return { nodes, edges };
    } catch {
      // fall through to synthesis
    }
    return synthesizeTopology();
  },

  // ---------- Backup & Restore ----------
  backupHistory: async (): Promise<BackupHistoryItem[]> => {
    const list = await api<unknown[]>("/backup/history");
    return arr<Record<string, unknown>>(list).map((r) => ({
      id: num(r.id),
      filename: str(r.filename),
      size: str(r.size, "—"),
      sha256: str(r.sha256) || null,
      created: str(r.created) || null,
      verified: r.verified === true ? true : r.verified === false ? false : null,
      status: (str(r.status).toUpperCase() as BackupHistoryItem["status"]) || "UNKNOWN",
    }));
  },
  backupLatest: () =>
    api<Partial<BackupHistoryItem> & { size?: number | string }>("/backup/latest").catch(
      () => null,
    ),
  backupFiles: async (): Promise<BackupFile[]> => {
    const list = await api<unknown[]>("/restore/backups");
    return arr<Record<string, unknown>>(list).map((r) => ({
      name: str(r.name),
      size: num(r.size),
      modified: num(r.modified),
    }));
  },
  backupRun: () =>
    api<{ ok?: boolean; job_id?: string } | unknown>("/backup/run", { method: "POST" }),
  backupInfo: (name: string) =>
    api<{ name: string; size: number; modified: number }>(`/restore/backup/${enc(name)}`),
  backupVerify: (name: string) =>
    api<{ ok?: boolean; sha256?: string; size?: number; valid?: boolean } | unknown>(
      `/restore/verify/${enc(name)}`,
    ),
  backupPlan: (name: string) =>
    api<{ backup: string; files: number; size: number; preview: string[] }>(
      `/restore/plan/${enc(name)}`,
    ),
  restoreRun: (filename: string) =>
    api<{ ok?: boolean; job_id?: string } | unknown>(`/restore/run/${enc(filename)}`, {
      method: "POST",
    }),
  restoreJob: (filename: string) =>
    api<{
      filename?: string;
      status?: string;
      progress?: number;
      current?: string;
      speed?: string;
      eta?: string;
    } | unknown>(`/restore/job/${enc(filename)}`),
  restoreHistory: async (): Promise<RestoreHistoryItem[]> => {
    const list = await api<unknown[]>("/restore/history");
    return arr<Record<string, unknown>>(list).map((r) => ({
      id: num(r.id),
      filename: str(r.filename),
      started: str(r.started) || null,
      completed: str(r.completed) || null,
      status: (str(r.status).toUpperCase() as RestoreHistoryItem["status"]) || "UNKNOWN",
    }));
  },
  restoreHealth: () =>
    api<{
      healthy: boolean;
      total: number;
      failed: string[];
      containers: { name: string; status: string }[];
    }>("/restore/health"),
  restoreRollback: (filename: string) =>
    api(`/restore/rollback/${enc(filename)}`, { method: "POST" }),
  backupDownloadUrl: (filename: string) => `${API_URL}/restore/backup/${enc(filename)}/download`,
  backupAiAnalysis: () =>
    api<{ recommendation?: string; summary?: string }>("/ai/backup-analysis", {
      noRetry: true,
    }).catch(() => null),

  // ---------- Automation (Phase 4.1) ----------
  // Backend endpoints not yet implemented — calls 404 gracefully and the UI
  // shows clear empty/error states until the FastAPI routes ship.
  automationRules: () => api<AutomationRule[]>("/automation/rules", { noRetry: true }),
  automationCreateRule: (body: Omit<AutomationRule, "id">) =>
    api<AutomationRule>("/automation/rules", {
      method: "POST",
      body: JSON.stringify(body),
      noRetry: true,
    }),
  automationUpdateRule: (id: number | string, body: Partial<AutomationRule>) =>
    api<AutomationRule>(`/automation/rules/${enc(String(id))}`, {
      method: "PUT",
      body: JSON.stringify(body),
      noRetry: true,
    }),
  automationDeleteRule: (id: number | string) =>
    api<{ ok: boolean }>(`/automation/rules/${enc(String(id))}`, {
      method: "DELETE",
      noRetry: true,
    }).then(() => ({ ok: true })),
  automationRunRule: (id: number | string) =>
    api<{ ok: boolean; job?: string }>(`/automation/rules/${enc(String(id))}/run`, {
      method: "POST",
      noRetry: true,
    }),
  automationToggleRule: (id: number | string, enabled: boolean) =>
    api<AutomationRule>(`/automation/rules/${enc(String(id))}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
      noRetry: true,
    }),
  automationJobs: () => api<AutomationJob[]>("/automation/jobs", { noRetry: true }),
  automationRuleDetail: (id: number | string) =>
    api<AutomationRuleDetail>(`/automation/rules/${enc(String(id))}`, { noRetry: true }),
  automationLogs: (params?: { rule?: string | number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.rule != null) qs.set("rule", String(params.rule));
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return api<AutomationLogEntry[]>(`/automation/logs${q ? `?${q}` : ""}`, { noRetry: true });
  },
  automationMetrics: () => api<AutomationMetrics>("/automation/metrics", { noRetry: true }),
  automationAi: () =>
    api<{ recommendation?: string; summary?: string; suggestions?: string[] }>("/ai/automation", {
      noRetry: true,
    }),
};

// ---------- Automation DTOs ----------

export type AutomationTrigger =
  | "container_down"
  | "high_cpu"
  | "high_memory"
  | "disk_full"
  | "website_down"
  | "backup_failed"
  | "ssl_expiring"
  | "custom_alert";

export type AutomationAction =
  | "restart_container"
  | "restart_compose_stack"
  | "restart_docker_service"
  | "run_shell_script"
  | "execute_python"
  | "run_ansible"
  | "webhook"
  | "send_notification"
  | "run_ai_diagnosis";

export type AutomationRule = {
  id: number | string;
  name: string;
  trigger: AutomationTrigger | string;
  target: string;
  action: AutomationAction | string;
  cooldown?: string;
  retries?: number;
  timeout?: string;
  priority?: "low" | "normal" | "high" | "critical";
  enabled: boolean;
  last_run?: string | null;
  last_status?: "success" | "failed" | "running" | "pending" | null;
};

export type AutomationJob = {
  job: string;
  rule_id?: number | string;
  rule_name?: string;
  triggered_by?: string;
  service?: string;
  action?: string;
  progress?: number;
  duration?: string;
  status?: "running" | "success" | "failed" | "pending" | "cancelled";
  started?: string;
  finished?: string | null;
};

export type AutomationLogEntry = {
  id?: number | string;
  timestamp: string;
  container?: string;
  command?: string;
  output?: string;
  exit_code?: number;
  status?: string;
};

export type AutomationMetrics = {
  success_rate?: number;
  avg_recovery_seconds?: number;
  coverage?: number;
  failures_today?: number;
  successes_today?: number;
  pending?: number;
};

export type AutomationRuleDetail = AutomationRule & {
  execution_count?: number;
  avg_duration_seconds?: number;
  success_rate?: number;
  history?: AutomationLogEntry[];
  failures?: AutomationLogEntry[];
  timeline?: { time: string; event: string }[];
};

// ---------- Backup DTOs ----------

export type BackupStatus = "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";

export type BackupHistoryItem = {
  id: number;
  filename: string;
  size: string;
  sha256: string | null;
  created: string | null;
  verified: boolean | null;
  status: BackupStatus;
};

export type BackupFile = {
  name: string;
  size: number;
  modified: number;
};

export type RestoreHistoryItem = {
  id: number;
  filename: string;
  started: string | null;
  completed: string | null;
  status: BackupStatus;
};

// ---------- Topology types & synthesis ----------

export type TopoNodeType =
  | "monitoring"
  | "application"
  | "database"
  | "proxy"
  | "storage"
  | "network"
  | "ai"
  | "notification"
  | "container"
  | "infrastructure"
  | "unknown";

export type TopoStatus = "healthy" | "warning" | "critical" | "offline";

export type TopologyNode = {
  id: string;
  label: string;
  type: TopoNodeType;
  status: TopoStatus;
  cpu?: number;
  memory?: number;
  uptime?: string;
  image?: string;
};

export type TopologyEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type TopologyDTO = { nodes: TopologyNode[]; edges: TopologyEdge[] };

function normalizeTopoStatus(s: string): TopoStatus {
  const v = s.toLowerCase();
  if (["healthy", "running", "ok", "up"].includes(v)) return "healthy";
  if (["warning", "warn", "degraded", "restarting"].includes(v)) return "warning";
  if (["critical", "error", "failed", "down"].includes(v)) return "critical";
  if (["offline", "stopped", "exited", "dead"].includes(v)) return "offline";
  return "healthy";
}

function classifyNodeType(explicit: string, name: string): TopoNodeType {
  const e = explicit.toLowerCase();
  if (
    [
      "monitoring",
      "application",
      "database",
      "proxy",
      "storage",
      "network",
      "ai",
      "notification",
      "container",
      "infrastructure",
    ].includes(e)
  )
    return e as TopoNodeType;
  const n = name.toLowerCase();
  if (/(prometheus|grafana|alertmanager|cadvisor|exporter|loki|uptime|kuma|netdata)/.test(n)) return "monitoring";
  if (/(traefik|nginx|caddy|haproxy|tunnel|cloudflared)/.test(n)) return "proxy";
  if (/(postgres|mysql|maria|mongo|redis|sqlite|influx|clickhouse|cockroach)/.test(n)) return "database";
  if (/(minio|s3|nfs|samba|seafile|nextcloud)/.test(n)) return "storage";
  if (/(ollama|guardian|openai|whisper|llama|stable|comfy)/.test(n)) return "ai";
  if (/(telegram|discord|gotify|ntfy|smtp|mail)/.test(n)) return "notification";
  if (/(pihole|adguard|wireguard|tailscale|vpn|dns)/.test(n)) return "network";
  if (/(portainer|docker|watchtower)/.test(n)) return "infrastructure";
  return "application";
}

async function synthesizeTopology(): Promise<TopologyDTO> {
  const containers = await api<unknown[]>("/containers").catch(() => [] as unknown[]);
  const services = arr<unknown>(containers).map(normalizeContainer);

  const backbone: TopologyNode[] = [
    { id: "internet", label: "Internet", type: "network", status: "healthy" },
    { id: "cloudflare", label: "Cloudflare Tunnel", type: "proxy", status: "healthy" },
    { id: "traefik", label: "Traefik", type: "proxy", status: "healthy" },
    { id: "docker", label: "Docker Engine", type: "infrastructure", status: "healthy" },
  ];

  const backboneIds = new Set(backbone.map((b) => b.id));
  const seen = new Set<string>(backboneIds);
  const nodes: TopologyNode[] = [...backbone];

  for (const s of services) {
    const id = s.name.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      label: s.name,
      type: classifyNodeType("", s.name),
      status: normalizeTopoStatus(s.status),
      cpu: typeof s.cpu === "number" ? s.cpu : undefined,
      memory: typeof s.memory === "number" ? (s.memory as number) : undefined,
      uptime: s.uptime,
      image: s.image,
    });
  }

  const edges: TopologyEdge[] = [
    { id: "e-internet-cf", source: "internet", target: "cloudflare" },
    { id: "e-cf-traefik", source: "cloudflare", target: "traefik" },
    { id: "e-traefik-docker", source: "traefik", target: "docker" },
  ];

  const webFacing = /^(homepage|portainer|grafana|nextcloud|guardian|n8n|jellyfin|plex|vaultwarden|gitea|wikijs|bookstack)/;
  for (const n of nodes) {
    if (backboneIds.has(n.id)) continue;
    edges.push({ id: `e-docker-${n.id}`, source: "docker", target: n.id });
    if (webFacing.test(n.id)) edges.push({ id: `e-traefik-${n.id}`, source: "traefik", target: n.id });
  }

  const has = (id: string) => seen.has(id);
  if (has("prometheus")) {
    if (has("alertmanager")) edges.push({ id: "e-prom-am", source: "prometheus", target: "alertmanager" });
    if (has("node-exporter")) edges.push({ id: "e-prom-ne", source: "prometheus", target: "node-exporter" });
    if (has("cadvisor")) edges.push({ id: "e-prom-cad", source: "prometheus", target: "cadvisor" });
    if (has("guardian")) edges.push({ id: "e-guardian-prom", source: "guardian", target: "prometheus" });
  }

  return { nodes, edges };
}
