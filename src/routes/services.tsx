import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — Homelab Guardian" }] }),
  component: () => (
    <AppShell>
      <PlaceholderPage title="Services" description="Container cards with status, resources, restart, logs, metrics." />
    </AppShell>
  ),
});

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="surface-card mt-6 grid place-items-center p-16 text-sm text-muted-foreground">
        Coming next phase.
      </div>
    </div>
  );
}
