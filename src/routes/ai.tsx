import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ai")({
  head: () => ({ meta: [{ title: "AI Assistant — Homelab Guardian" }] }),
  component: () => (
    <AppShell>
      <div className="mx-auto max-w-[1600px]">
        <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask Guardian about your homelab health and get recommendations.</p>
        <div className="surface-card mt-6 grid place-items-center p-16 text-sm text-muted-foreground">Coming next phase.</div>
      </div>
    </AppShell>
  ),
});
