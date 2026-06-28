import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
 * Returns `online: false` when the backend cannot be reached.
 */
export function useBackendStatus() {
  const browserOnline = useOnline();
  const q = useQuery({
    queryKey: ["backend-health"],
    queryFn: () => endpoints.health(),
    enabled: API_CONFIGURED && browserOnline,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 0,
    staleTime: 10_000,
  });

  return {
    browserOnline,
    backendOnline: !!q.data && !q.isError,
    isChecking: q.isFetching,
    lastChecked: q.dataUpdatedAt,
    refresh: q.refetch,
  };
}
