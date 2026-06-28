// Centralized API configuration for the Guardian frontend.
// All HTTP/WebSocket clients must resolve their base URL from here.
//
// Resolution order:
//   1. VITE_API_URL (build-time env override)
//   2. Production fallback when running on a non-local hostname
//   3. Development fallback for localhost / Vite dev server
//
// Never hardcode these URLs in components or hooks.

const PRODUCTION_API = "https://api-guardian.atmakriti.com";
const DEVELOPMENT_API = "http://100.93.15.3:8008";

function detectEnvironmentBaseUrl(): string {
  if (typeof window === "undefined") return PRODUCTION_API;
  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local");
  return isLocal ? DEVELOPMENT_API : PRODUCTION_API;
}

const ENV_OVERRIDE = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE_URL: string = (ENV_OVERRIDE || detectEnvironmentBaseUrl()).replace(/\/$/, "");
export const API_CONFIGURED: boolean = API_BASE_URL.length > 0;
export const IS_DEV: boolean = !!import.meta.env.DEV;

/** Derive a websocket URL from the API base (http → ws, https → wss). */
export function deriveWsUrl(path = "/ws"): string | null {
  if (!API_CONFIGURED) return null;
  try {
    const u = new URL(API_BASE_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = (u.pathname.replace(/\/$/, "") + path) || path;
    return u.toString();
  } catch {
    return null;
  }
}

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  productionUrl: PRODUCTION_API,
  developmentUrl: DEVELOPMENT_API,
  isOverridden: !!ENV_OVERRIDE,
  isDev: IS_DEV,
} as const;
