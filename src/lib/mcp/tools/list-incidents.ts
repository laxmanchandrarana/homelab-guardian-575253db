import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "list_incidents",
  title: "List incidents",
  description: "List recent incidents tracked by Guardian (service, severity, time, detail).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => textResult(await backendGet("/incidents")),
});
