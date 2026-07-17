import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "get_service_logs",
  title: "Get service logs",
  description: "Fetch the most recent log output for a given service/container.",
  inputSchema: {
    name: z.string().min(1).describe("Service / container name."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ name }) => {
    const logs = await backendGet<string>(`/logs/${encodeURIComponent(name)}`);
    return textResult(typeof logs === "string" ? logs : JSON.stringify(logs));
  },
});
