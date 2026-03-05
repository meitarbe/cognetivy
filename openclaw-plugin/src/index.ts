/**
 * OpenClaw plugin: exposes Cognetivy workflow, runs, and collections as agent tools.
 * Install with: openclaw plugins install <path-to-this-dir>
 * Enable in ~/.openclaw/openclaw.json and add "cognetivy-openclaw-plugin" to agents.list[].tools.allow.
 */

import path from "node:path";
import { COGNETIVY_MCP_TOOLS, invokeCognetivyTool } from "cognetivy";

const PLUGIN_ID = "cognetivy-openclaw-plugin";
const TOOL_PREFIX = "cognetivy_";

function resolveWorkspace(api: { config?: { plugins?: { entries?: Record<string, { config?: { workspace?: string } }> }; agent?: { workspace?: string } } }): string {
  const pluginConfig = api.config?.plugins?.entries?.[PLUGIN_ID]?.config?.workspace;
  if (pluginConfig && typeof pluginConfig === "string") {
    return path.resolve(pluginConfig);
  }
  const agentWorkspace = api.config?.agent?.workspace;
  if (agentWorkspace && typeof agentWorkspace === "string") {
    return path.resolve(agentWorkspace.replace(/^~/, process.env.HOME ?? ""));
  }
  return process.cwd();
}

export default function registerCognetivyPlugin(api: {
  registerTool: (
    tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (id: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
    },
    options?: { optional?: boolean }
  ) => void;
  config?: { plugins?: { entries?: Record<string, { config?: { workspace?: string } }> }; agent?: { workspace?: string } };
}): void {
  for (const tool of COGNETIVY_MCP_TOOLS) {
    const mcpName = tool.name;
    const openclawName = TOOL_PREFIX + mcpName;
    api.registerTool(
      {
        name: openclawName,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
        async execute(_id: string, params: Record<string, unknown>) {
          const cwd = resolveWorkspace(api);
          const text = await invokeCognetivyTool(mcpName, params, cwd);
          return { content: [{ type: "text" as const, text }] };
        },
      },
      { optional: true }
    );
  }
}
