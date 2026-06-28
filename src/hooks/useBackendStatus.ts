import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "@/lib/api";
import { API_CONFIGURED } from "@/config/api";

/** Tracks whether the browser is online (navigator.onLine). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * Pings `/health` every 15s to monitor backend reachability.
 * Also treats the backend as online whenever any other Guardian query
 * has succeeded recently — this avoids false "offline" banners when the
 * `/health` endpoint is blocked by CORS but the rest of the API works.
 */
export function useBackendStatus() {
  const browserOnline = useOnline();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["backend-health"],
    queryFn: () => endpoints.health(),
    enabled: API_CONFIGURED && browserOnline,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 0,
    staleTime: 10_000,
  });

  const healthOk = !!q.data && !q.isError;

  // Re-render every 10s so the "recent success" check stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const recentlySucceeded = (() => {
    const cutoff = Date.now() - 45_000;
    return qc
      .getQueryCache()
      .getAll()
      .some((entry) => {
        const key = entry.queryKey?.[0];
        if (key === "backend-health") return false;
        const s = entry.state;
        return s.status === "success" && s.dataUpdatedAt > cutoff;
      });
  })();

  return {
    browserOnline,
    backendOnline: healthOk || recentlySucceeded,
    isChecking: q.isFetching,
    lastChecked: q.dataUpdatedAt,
    refresh: q.refetch,
  };
}
