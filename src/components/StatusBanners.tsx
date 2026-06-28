import { useBackendStatus } from "@/hooks/useBackendStatus";
import { WifiOff, ServerCrash, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky banner shown when the browser is offline OR the backend is unreachable.
 * Never breaks layout — renders nothing when everything is healthy.
 */
export function StatusBanners() {
  const { browserOnline, backendOnline, isChecking, refresh } = useBackendStatus();

  if (!browserOnline) {
    return (
      <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
        <WifiOff className="h-3.5 w-3.5" />
        <span>You're offline. We'll refresh data when the connection comes back.</span>
      </div>
    );
  }

  if (!backendOnline) {
    return (
      <div className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
        <ServerCrash className="h-3.5 w-3.5" />
        <span>Backend offline — retrying every 15s.</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-red-100 hover:bg-red-500/20"
          onClick={() => refresh()}
          disabled={isChecking}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${isChecking ? "animate-spin" : ""}`} />
          Retry now
        </Button>
      </div>
    );
  }

  return null;
}
