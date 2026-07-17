import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "get_monitoring",
  title: "Get monitoring snapshot",
  description:
    "Return the current homelab health snapshot: CPU, memory, disk, network, healthy vs down service counts, and health score.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const [monitoring, health] = await Promise.all([
      backendGet("/monitoring").catch((e) => ({ error: String(e) })),
      backendGet("/health").catch(() => null),
    ]);
    return textResult({ monitoring, health });
  },
});
