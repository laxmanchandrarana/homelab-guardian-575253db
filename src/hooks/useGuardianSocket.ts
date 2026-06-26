import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsUrl, API_CONFIGURED } from "@/lib/api";

export type GuardianEvent = {
  type: string; // "incident" | "metric" | "notification" | "service" | ...
  service?: string;
  level?: "info" | "warning" | "danger" | "healthy";
  text?: string;
  time?: string;
  payload?: unknown;
};

type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

/**
 * Connects to the Guardian backend WebSocket and invalidates React Query
 * caches when relevant events arrive. Auto-reconnects with backoff.
 * Returns the latest event and connection status.
 */
export function useGuardianSocket() {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const [lastEvent, setLastEvent] = useState<GuardianEvent | null>(null);
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !API_CONFIGURED) return;
    const url = wsUrl("/ws");
    if (!url) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        setStatus("error");
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        let data: GuardianEvent;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        setLastEvent(data);
        // Invalidate the relevant queries so they refetch
        switch (data.type) {
          case "incident":
            qc.invalidateQueries({ queryKey: ["incidents"] });
            qc.invalidateQueries({ queryKey: ["services"] });
            break;
          case "service":
            qc.invalidateQueries({ queryKey: ["services"] });
            break;
          case "metric":
            qc.invalidateQueries({ queryKey: ["monitoring"] });
            qc.invalidateQueries({ queryKey: ["metrics"] });
            break;
          case "notification":
            qc.invalidateQueries({ queryKey: ["notifications"] });
            break;
          default:
            break;
        }
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (!stoppedRef.current) scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      const attempt = Math.min(retryRef.current++, 6);
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [qc]);

  return { status, lastEvent };
}
