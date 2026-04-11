/**
 * MCP server over stdio (JSON-RPC 2.0). Tool list is empty until new cloud-backed tools are added.
 */

import * as readline from "node:readline";
import { ensureMinimalWorkspace, workspaceExists } from "./workspace.js";
import { startEnvWatcher } from "./env-watcher.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendResponse(response: JsonRpcResponse): void {
  console.log(JSON.stringify(response));
}

function sendError(id: string | number | null, code: number, message: string, data?: unknown): void {
  sendResponse({ jsonrpc: "2.0", id, error: { code, message, data } });
}

function handleInitialize(): {
  protocolVersion: string;
  capabilities: { tools: object };
  serverInfo: { name: string; version: string };
  instructions?: string;
} {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "cognetivy", version: "0.1.0" },
    instructions:
      "Cognetivy MCP: tool surface is not registered yet. Use the Cognetivy CLI with COGNETIVY_API_KEY or the web app for workflows and runs.",
  };
}

function handleToolsList(): { tools: unknown[] } {
  return { tools: [] };
}

function handleToolsCall(): never {
  throw new Error("No tools are registered yet.");
}

export async function runMcpServer(workspacePath: string): Promise<void> {
  const cwd = workspacePath;

  if (!(await workspaceExists(cwd))) {
    await ensureMinimalWorkspace(cwd);
  }

  const stopWatcher = await startEnvWatcher(cwd, {
    debounceMs: 400,
    onEvent: (event) => {
      process.stderr.write(JSON.stringify({ type: "env_fs", event: event.type, path: event.path }) + "\n");
    },
  });

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("close", () => {
    stopWatcher();
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      sendError(null, -32700, "Parse error");
      continue;
    }
    const id = req.id ?? null;

    try {
      if (req.method === "initialize") {
        sendResponse({ jsonrpc: "2.0", id, result: handleInitialize() });
        continue;
      }
      if (req.method === "notifications/initialized") {
        continue;
      }
      if (req.method === "tools/list") {
        sendResponse({ jsonrpc: "2.0", id, result: handleToolsList() });
        continue;
      }
      if (req.method === "tools/call") {
        handleToolsCall();
        continue;
      }
      sendError(id, -32601, "Method not found: " + String(req.method));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(id, -32603, message);
    }
  }
}
