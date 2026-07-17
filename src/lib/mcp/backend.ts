// Server-side fetch helper for the Guardian FastAPI backend. Used by MCP tools.
// Read env at call time — never at module top-level (Worker cold-start / manifest extract).

const PRODUCTION_API = "https://api-guardian.atmakriti.com";

function baseUrl(): string {
  const override = (process.env.GUARDIAN_API_URL ?? "").trim();
  return (override || PRODUCTION_API).replace(/\/$/, "");
}

export async function backendGet<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Guardian API ${res.status} ${path}: ${text.slice(0, 300) || res.statusText}`);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function textResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}
