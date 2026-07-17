import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "get_ai_summary",
  title: "Get AI health summary",
  description:
    "Return Guardian's AI-generated summary of overall homelab health, risks, and recommendations.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => textResult(await backendGet("/ai/summary")),
});
