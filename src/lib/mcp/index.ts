import { defineMcp } from "@lovable.dev/mcp-js";
import listServices from "./tools/list-services";
import getService from "./tools/get-service";
import getServiceLogs from "./tools/get-service-logs";
import getMonitoring from "./tools/get-monitoring";
import listIncidents from "./tools/list-incidents";
import listAlerts from "./tools/list-alerts";
import listBackups from "./tools/list-backups";
import aiSummary from "./tools/ai-summary";

export default defineMcp({
  name: "homelab-guardian-mcp",
  title: "Homelab Guardian",
  version: "0.1.0",
  instructions:
    "Read-only tools that expose the Homelab Guardian backend: list services, inspect a service and its logs, read the current monitoring snapshot, list incidents and firing alerts, list backups, and fetch the AI health summary.",
  tools: [
    listServices,
    getService,
    getServiceLogs,
    getMonitoring,
    listIncidents,
    listAlerts,
    listBackups,
    aiSummary,
  ],
});
