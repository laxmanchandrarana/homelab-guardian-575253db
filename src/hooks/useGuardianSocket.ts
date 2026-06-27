import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wsUrl, API_CONFIGURED } from "@/lib/api";

export type GuardianEvent = {
  type: string;
  service?: string;
  level?: "info" | "warning" | "danger" | "healthy";
  text?: string;
  time?: string;
  payload?: unknown;
};

export type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error" | "reconnecting";

export type SocketState = {
  status: SocketStatus;
  /** Short, user-friendly label e.g. "Connected", "Reconnecting in 4s…" */
  label: string;
  /** Longer human-readable description of what's happening */
  message: string;
  /** Seconds remaining until next reconnect attempt (0 when not waiting) */
  retryIn: number;
  /** How many reconnect attempts have been made */
  attempt: number;
  lastEvent: GuardianEvent | null;
  /** Manually trigger a reconnect now */
  reconnect: () => void;
};

const FRIENDLY: Record<SocketStatus, { label: string; message: string }> = {
  idle: { label: "Idle", message: "Live updates haven't started yet." },
  connecting: { label: "Connecting…", message: "Opening live connection to Guardian." },
  open: { label: "Live", message: "Connected — receiving real-time updates." },
  reconnecting: { label: "Reconnecting…", message: "Connection dropped. Trying to reach Guardian again." },
  closed: { label: "Disconnected", message: "Live updates are paused. We'll keep retrying." },
  error: { label: "Connection error", message: "Couldn't reach Guardian. Check that the API is online." },
};

export function useGuardianSocket(): SocketState {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const [retryIn, setRetryIn] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [lastEvent, setLastEvent] = useState<GuardianEvent | null>(null);

  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof window === "undefined" || !API_CONFIGURED) return;
    const url = wsUrl("/ws");
    if (!url) return;

    const clearTimers = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      reconnectTimerRef.current = null;
      countdownTimerRef.current = null;
    };

    const scheduleReconnect = () => {
      const a = retryRef.current++;
      setAttempt(a + 1);
      const delaySec = Math.min(2 ** Math.min(a, 5), 30); // 1,2,4,8,16,32→30
      setRetryIn(delaySec);
      setStatus("reconnecting");

      countdownTimerRef.current = setInterval(() => {
        setRetryIn((s) => (s > 0 ? s - 1 : 0));
      }, 1000);

      reconnectTimerRef.current = setTimeout(() => {
        clearTimers();
        setRetryIn(0);
        connectRef.current();
      }, delaySec * 1000);
    };

    const connect = () => {
      clearTimers();
      setRetryIn(0);
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
        setAttempt(0);
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
        const payload = data.payload as any;
        switch (data.type) {
          case "incident":
            if (payload && Array.isArray(payload)) {
              qc.setQueryData(["incidents"], payload);
            } else if (payload) {
              qc.setQueryData<any[]>(["incidents"], (prev) =>
                prev ? [payload, ...prev].slice(0, 50) : [payload]
              );
            } else {
              qc.invalidateQueries({ queryKey: ["incidents"] });
            }
            qc.invalidateQueries({ queryKey: ["services"] });
            break;
          case "service":
            if (payload?.name) {
              qc.setQueryData<any[]>(["services"], (prev) =>
                prev ? prev.map((s) => (s.name === payload.name ? { ...s, ...payload } : s)) : prev
              );
            } else {
              qc.invalidateQueries({ queryKey: ["services"] });
            }
            break;
          case "metric":
            if (payload && typeof payload === "object") {
              qc.setQueryData(["monitoring"], (prev: any) => ({ ...(prev ?? {}), ...payload }));
            } else {
              qc.invalidateQueries({ queryKey: ["monitoring"] });
            }
            qc.invalidateQueries({ queryKey: ["metrics"] });
            break;
          case "notification":
            if (payload) {
              qc.setQueryData<any[]>(["notifications"], (prev) =>
                prev ? [payload, ...prev].slice(0, 50) : [payload]
              );
            } else {
              qc.invalidateQueries({ queryKey: ["notifications"] });
            }
            break;
          case "ai":
          case "ai_summary":
            if (payload) qc.setQueryData(["ai-summary"], payload);
            else qc.invalidateQueries({ queryKey: ["ai-summary"] });
            break;
          default:
            break;
        }
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        if (stoppedRef.current) return;
        setStatus("closed");
        scheduleReconnect();
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      stoppedRef.current = true;
      clearTimers();
      wsRef.current?.close();
    };
  }, [qc]);

  const base = FRIENDLY[status];
  const label =
    status === "reconnecting" && retryIn > 0 ? `Reconnecting in ${retryIn}s…` : base.label;
  const message =
    status === "reconnecting" && retryIn > 0
      ? `Lost connection to Guardian. Retrying in ${retryIn}s (attempt ${attempt}).`
      : base.message;

  const reconnect = () => {
    retryRef.current = 0;
    setAttempt(0);
    connectRef.current?.();
  };

  return { status, label, message, retryIn, attempt, lastEvent, reconnect };
}
