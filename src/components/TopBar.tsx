import { Bell, Moon, Search, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useGuardianSocket } from "@/hooks/useGuardianSocket";
import { API_CONFIGURED } from "@/lib/api";

export function TopBar() {
  // Initialize as null to avoid SSR/CSR hydration mismatch on the clock.
  const [time, setTime] = useState<Date | null>(null);
  useEffect(() => {
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { status } = useGuardianSocket();
  const connected = status === "open";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <div className="md:hidden flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold">Guardian</span>
      </div>

      <div className="relative ml-auto w-full max-w-md hidden sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search services, incidents, metrics…"
          className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:ml-3 sm:gap-2">
        <div className="hidden md:flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs">
          <span className="status-dot text-success" />
          <span className="text-muted-foreground">Connected</span>
        </div>
        <div className="hidden lg:block text-xs tabular-nums text-muted-foreground">
          {time.toLocaleTimeString()}
        </div>
        <IconBtn label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </IconBtn>
        <IconBtn label="Settings"><Settings className="h-4 w-4" /></IconBtn>
        <IconBtn label="Theme"><Moon className="h-4 w-4" /></IconBtn>
        <div className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-chart-5 text-xs font-semibold">
          HG
        </div>
      </div>
    </header>
  );
}

function IconBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="relative grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
