export type Status = "healthy" | "warning" | "danger";

export const topMetrics = [
  { id: "health", label: "Health Score", value: 99, suffix: "%", icon: "ShieldCheck", status: "healthy" as Status, accent: "success", trend: [92, 94, 96, 95, 97, 98, 99, 99] },
  { id: "containers", label: "Containers", value: 42, suffix: " Running", icon: "Boxes", status: "healthy" as Status, accent: "primary", trend: [40, 41, 41, 42, 42, 42, 42, 42] },
  { id: "incidents", label: "Incidents", value: 2, suffix: " Today", icon: "AlertTriangle", status: "warning" as Status, accent: "warning", trend: [0, 1, 1, 0, 1, 2, 2, 2] },
  { id: "autoheal", label: "Auto Heal", value: 1, suffix: "", display: "Enabled", icon: "Sparkles", status: "healthy" as Status, accent: "primary", trend: [1, 1, 1, 1, 1, 1, 1, 1] },
  { id: "cpu", label: "CPU", value: 21, suffix: "%", icon: "Cpu", status: "healthy" as Status, accent: "primary", trend: [18, 22, 19, 25, 21, 20, 22, 21] },
  { id: "ram", label: "RAM", value: 53, suffix: "%", icon: "MemoryStick", status: "healthy" as Status, accent: "success", trend: [48, 50, 52, 51, 53, 54, 53, 53] },
  { id: "storage", label: "Storage", value: 64, suffix: "%", icon: "HardDrive", status: "warning" as Status, accent: "warning", trend: [60, 61, 62, 62, 63, 63, 64, 64] },
  { id: "network", label: "Network", value: 100, suffix: "", display: "Healthy", icon: "Wifi", status: "healthy" as Status, accent: "success", trend: [98, 99, 100, 99, 100, 100, 99, 100] },
];

export const services = [
  { name: "Grafana", status: "healthy" as Status, cpu: 2, ram: "312MB", uptime: "12d", autoHeal: true },
  { name: "Prometheus", status: "healthy" as Status, cpu: 4, ram: "498MB", uptime: "12d", autoHeal: true },
  { name: "Traefik", status: "healthy" as Status, cpu: 1, ram: "92MB", uptime: "30d", autoHeal: true },
  { name: "n8n", status: "warning" as Status, cpu: 11, ram: "812MB", uptime: "3d", autoHeal: true },
  { name: "Postgres", status: "healthy" as Status, cpu: 3, ram: "256MB", uptime: "30d", autoHeal: false },
  { name: "Redis", status: "healthy" as Status, cpu: 1, ram: "48MB", uptime: "30d", autoHeal: true },
];

export const liveEvents = [
  { time: "10:12", text: "Grafana restarted", status: "warning" as Status },
  { time: "10:15", text: "Backup finished", status: "healthy" as Status },
  { time: "10:17", text: "CPU spike on n8n", status: "warning" as Status },
  { time: "10:18", text: "Alert sent via Telegram", status: "healthy" as Status },
  { time: "10:20", text: "Recovery complete", status: "healthy" as Status },
  { time: "10:24", text: "Container scan ok", status: "healthy" as Status },
  { time: "10:31", text: "Disk usage 64%", status: "warning" as Status },
];

export const infraNodes = [
  { id: "internet", label: "Internet", status: "healthy" as Status, meta: { uptime: "100%" } },
  { id: "cloudflare", label: "Cloudflare", status: "healthy" as Status, meta: { uptime: "99.9%" } },
  { id: "traefik", label: "Traefik", status: "healthy" as Status, meta: { uptime: "30d", cpu: "1%", mem: "92MB" } },
  { id: "guardian", label: "Guardian", status: "healthy" as Status, meta: { uptime: "12d" } },
  { id: "docker", label: "Docker", status: "healthy" as Status, meta: { uptime: "30d" } },
  { id: "containers", label: "Containers", status: "warning" as Status, meta: { running: "42", restarts: "1" } },
];

export const incidentTimeline = [
  { time: "11:02", text: "Grafana Down", status: "danger" as Status, detail: "Health probe failed (503)" },
  { time: "11:02", text: "Guardian detected failure", status: "warning" as Status, detail: "Auto-heal engaged" },
  { time: "11:03", text: "Restart initiated", status: "warning" as Status, detail: "docker restart grafana" },
  { time: "11:03", text: "Container healthy", status: "healthy" as Status, detail: "Probe OK in 14s" },
  { time: "11:04", text: "Telegram notification sent", status: "healthy" as Status, detail: "Channel: #ops" },
  { time: "11:04", text: "Incident resolved", status: "healthy" as Status, detail: "MTTR 2m 12s" },
];

export const guardianInsights = [
  { text: "n8n memory has increased 18% this week.", tone: "warning" as Status },
  { text: "Grafana has restarted 3 times today.", tone: "warning" as Status },
  { text: "Prometheus latency is normal.", tone: "healthy" as Status },
  { text: "Disk usage is projected to reach 90% in 12 days.", tone: "warning" as Status },
];

export function genSeries(points = 40, base = 30, spread = 20) {
  // Deterministic (SSR-safe): no Math.random, no Date.now.
  return Array.from({ length: points }, (_, i) => ({
    t: i,
    v: Math.max(
      0,
      Math.min(
        100,
        base + Math.sin(i / 4) * spread + Math.cos(i / 7) * (spread / 3),
      ),
    ),
  }));
}

