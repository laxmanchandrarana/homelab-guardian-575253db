import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsUrl, API_CONFIGURED } from "@/lib/api";

/**
 * Subscribes to /ws/stats/{service} for live per-container stats and patches
 * the ["service-detail", name] query cache so gauges/KPIs animate in real time.
 * Silently no-ops when the backend doesn't expose the socket.
 */
export function useServiceLiveStats(name: string | null | undefined) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !API_CONFIGURED || !name) return;
    const url = wsUrl(`/ws/stats/${encodeURIComponent(name)}`);
    if (!url) return;

    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const open = () => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          return;
        }
        qc.setQueryData(["service-detail", name], (prev: Record<string, unknown> | undefined) => ({
          ...(prev ?? { name }),
          ...payload,
        }));
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) schedule();
      };
    };

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(2 ** Math.min(attempt++, 5), 30) * 1000;
      retry = setTimeout(open, delay);
    };

    open();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [name, qc]);

  return { connected };
}
