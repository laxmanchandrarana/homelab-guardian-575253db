import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Boxes, AlertTriangle, Sparkles, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/services", label: "Services", icon: Boxes },
  { to: "/incidents", label: "Alerts", icon: AlertTriangle },
  { to: "/ai", label: "AI", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/90 backdrop-blur-md md:hidden">
      {items.map((i) => {
        const active = i.to === "/" ? pathname === "/" : pathname.startsWith(i.to);
        const Icon = i.icon;
        return (
          <Link key={i.to} to={i.to} className={cn("flex flex-col items-center gap-1 py-2 text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
