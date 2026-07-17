import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "get_service",
  title: "Get service details",
  description:
    "Return detailed information for a single service by name (container inspect, resource usage, health).",
  inputSchema: {
    name: z.string().min(1).describe("Service / container name as shown in Guardian."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ name }) => {
    const encoded = encodeURIComponent(name);
    const [detail, prediction] = await Promise.all([
      backendGet(`/services/${encoded}`).catch((e) => ({ error: String(e) })),
      backendGet(`/ai/prediction/${encoded}`).catch(() => null),
    ]);
    return textResult({ detail, prediction });
  },
});
