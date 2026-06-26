import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Boxes,
  Activity,
  AlertTriangle,
  Network,
  Bell,
  Sparkles,
  Settings,
  Shield,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/services", label: "Services", icon: Boxes },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
  { to: "/incidents", label: "Incidents", icon: AlertTriangle },
  { to: "/topology", label: "Topology", icon: Network },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 248 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col"
    >
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
          <Shield className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Homelab Guardian</div>
            <div className="truncate text-[11px] text-muted-foreground">v1.0.0</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {nav.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary"
                />
              )}
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span className="status-dot text-success" title="API Connected" />
            <span className="status-dot text-success" title="WebSocket Connected" />
          </div>
        ) : (
          <div className="space-y-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Version</span>
              <span className="text-foreground/80">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span>API</span>
              <span className="flex items-center gap-1.5 text-foreground/80">
                <span className="status-dot text-success" /> Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>WebSocket</span>
              <span className="flex items-center gap-1.5 text-foreground/80">
                <span className="status-dot text-success" /> Connected
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
