import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "list_alerts",
  title: "List active alerts",
  description: "List currently firing Prometheus alerts from Guardian.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => textResult(await backendGet("/alerts")),
});
