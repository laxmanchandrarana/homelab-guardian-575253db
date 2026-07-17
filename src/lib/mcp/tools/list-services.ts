import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "list_services",
  title: "List services",
  description:
    "List every container/service tracked by Homelab Guardian with its current status, CPU, memory, and uptime.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => textResult(await backendGet("/services")),
});
