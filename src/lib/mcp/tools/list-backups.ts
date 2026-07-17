import { defineTool } from "@lovable.dev/mcp-js";
import { backendGet, textResult } from "../backend";

export default defineTool({
  name: "list_backups",
  title: "List backups",
  description: "List available Guardian backups with size, status, and timestamp.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const [files, latest] = await Promise.all([
      backendGet("/restore/backups").catch((e) => ({ error: String(e) })),
      backendGet("/backup/latest").catch(() => null),
    ]);
    return textResult({ files, latest });
  },
});
