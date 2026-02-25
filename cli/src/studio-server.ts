/**
 * Read-only HTTP server for Cognetivy Studio: serves SPA static assets and JSON API over workspace.
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CollectionItem } from "./models.js";
import {
  getWorkspacePaths,
  workspaceExists,
  readWorkflowIndex,
  listWorkflows,
  readWorkflowRecord,
  listWorkflowVersionIds,
  readWorkflowVersionRecord,
  readRunFile,
  updateRunFile,
  runExists,
  readCollectionSchema,
  listCollectionKindsForRun,
  readCollections,
  listNodeResults,
} from "./workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3742;
const STUDIO_STATIC_DIR = path.join(__dirname, "studio");

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function handleApiWorkspace(cwd: string): Promise<{ path: string; exists: boolean }> {
  const p = getWorkspacePaths(cwd);
  const exists = await workspaceExists(cwd);
  return { path: p.root, exists };
}

async function handleApiWorkflows(cwd: string): Promise<unknown[]> {
  const index = await readWorkflowIndex(cwd);
  const workflows = await listWorkflows(cwd);
  return workflows.map((w) => ({ ...w, current: w.workflow_id === index.current_workflow_id }));
}

async function handleApiWorkflowRecord(cwd: string, workflowId: string): Promise<unknown> {
  return readWorkflowRecord(workflowId, cwd);
}

async function handleApiWorkflowVersions(cwd: string, workflowId: string): Promise<Array<{ version_id: string }>> {
  const ids = await listWorkflowVersionIds(workflowId, cwd);
  return ids.map((version_id) => ({ version_id }));
}

async function handleApiWorkflowVersion(
  cwd: string,
  workflowId: string,
  versionId: string
): Promise<unknown> {
  return readWorkflowVersionRecord(workflowId, versionId, cwd);
}

async function handleApiRuns(cwd: string): Promise<unknown[]> {
  const p = getWorkspacePaths(cwd);
  const entries = await fs.readdir(p.runsDir, { withFileTypes: true }).catch(() => []);
  const runs: unknown[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    const runId = e.name.replace(/\.json$/, "");
    try {
      const record = await readRunFile(runId, cwd);
      runs.push(record);
    } catch {
      // skip invalid
    }
  }
  runs.sort((a, b) => {
    const aTs = (a as { created_at?: string }).created_at ?? "";
    const bTs = (b as { created_at?: string }).created_at ?? "";
    return bTs.localeCompare(aTs);
  });
  return runs;
}

async function handleApiRun(cwd: string, runId: string): Promise<unknown> {
  return readRunFile(runId, cwd);
}

async function handleApiRunEvents(cwd: string, runId: string): Promise<unknown[]> {
  const p = getWorkspacePaths(cwd);
  const eventsPath = path.join(p.eventsDir, `${runId}.ndjson`);
  const raw = await fs.readFile(eventsPath, "utf-8").catch(() => "");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function handleApiWorkflowCollectionsSchema(cwd: string, workflowId: string): Promise<unknown> {
  return readCollectionSchema(workflowId, cwd);
}

async function handleApiRunNodeResults(cwd: string, runId: string): Promise<unknown> {
  return listNodeResults(runId, cwd);
}

async function handleApiCollectionsKinds(cwd: string, runId: string): Promise<string[]> {
  return listCollectionKindsForRun(runId, cwd);
}

async function handleApiCollectionsKind(cwd: string, runId: string, kind: string): Promise<unknown> {
  return readCollections(runId, kind, cwd);
}

async function handleApi(
  cwd: string,
  method: string,
  pathname: string,
  res: http.ServerResponse,
  body?: string,
  searchParams?: URLSearchParams
): Promise<boolean> {
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (method !== "GET" && method !== "PATCH") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const apiMatch = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    // PATCH /api/runs/:id - update run name
    if (method === "PATCH" && apiMatch[0] === "runs" && apiMatch.length === 2) {
      const runId = apiMatch[1];
      if (!(await runExists(runId, cwd))) {
        sendJson(res, 404, { error: `Run "${runId}" not found` });
        return true;
      }
      let payload: { name?: string; final_answer?: string };
      try {
        payload = body ? (JSON.parse(body) as { name?: string; final_answer?: string }) : {};
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return true;
      }
      const updates: { name?: string; final_answer?: string } = {};
      if (typeof payload.name === "string") updates.name = payload.name;
      if (typeof payload.final_answer === "string" || payload.final_answer === null) {
        updates.final_answer = payload.final_answer ?? undefined;
      }
      if (Object.keys(updates).length === 0) {
        sendJson(res, 400, { error: "Body must have { name?: string, final_answer?: string | null }" });
        return true;
      }
      await updateRunFile(runId, updates, cwd);
      const updated = await readRunFile(runId, cwd);
      sendJson(res, 200, updated);
      return true;
    }
    // GET /api/workspace
    if (apiMatch[0] === "workspace" && apiMatch.length === 1) {
      const data = await handleApiWorkspace(cwd);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/workflows
    if (apiMatch[0] === "workflows" && apiMatch.length === 1) {
      const data = await handleApiWorkflows(cwd);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/workflows/:workflowId
    if (apiMatch[0] === "workflows" && apiMatch.length === 2) {
      const data = await handleApiWorkflowRecord(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/workflows/:workflowId/versions
    if (apiMatch[0] === "workflows" && apiMatch[2] === "versions" && apiMatch.length === 3) {
      const data = await handleApiWorkflowVersions(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/workflows/:workflowId/versions/:versionId
    if (apiMatch[0] === "workflows" && apiMatch[2] === "versions" && apiMatch.length === 4) {
      const data = await handleApiWorkflowVersion(cwd, apiMatch[1], apiMatch[3]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/workflows/:workflowId/collections/schema
    if (
      apiMatch[0] === "workflows" &&
      apiMatch[2] === "collections" &&
      apiMatch[3] === "schema" &&
      apiMatch.length === 4
    ) {
      const data = await handleApiWorkflowCollectionsSchema(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/runs
    if (apiMatch[0] === "runs" && apiMatch.length === 1) {
      const data = await handleApiRuns(cwd);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/runs/:id/events (must be before /api/runs/:id)
    if (apiMatch[0] === "runs" && apiMatch.length === 3 && apiMatch[2] === "events") {
      const data = await handleApiRunEvents(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/runs/:id/node-results (before /api/runs/:id)
    if (apiMatch[0] === "runs" && apiMatch.length === 3 && apiMatch[2] === "node-results") {
      const data = await handleApiRunNodeResults(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/runs/:id
    if (apiMatch[0] === "runs" && apiMatch.length === 2) {
      const data = await handleApiRun(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/entities/:kind (entity data aggregated across runs; filter by run_id and workflow_id)
    if (apiMatch[0] === "entities" && apiMatch.length === 2) {
      const kind = apiMatch[1];
      const runId = searchParams?.get("run_id") ?? undefined;
      const workflowIdParam = searchParams?.get("workflow_id") ?? undefined;
      const workflowId = workflowIdParam ?? (await readWorkflowIndex(cwd)).current_workflow_id;
      const schema = await readCollectionSchema(workflowId, cwd);
      if (!schema.kinds[kind]) {
        sendJson(res, 404, { error: `Unknown entity kind "${kind}" in workflow "${workflowId}"` });
        return true;
      }

      const runs = await handleApiRuns(cwd);
      const allItems: CollectionItem[] = [];
      for (const run of runs) {
        try {
          const r = run as { run_id: string; workflow_id?: string };
          if (workflowId && r.workflow_id && r.workflow_id !== workflowId) continue;
          if (runId && r.run_id !== runId) continue;
          const store = await readCollections(r.run_id, kind, cwd);
          for (const item of store.items) allItems.push(item);
        } catch {
          // skip
        }
      }
      sendJson(res, 200, allItems);
      return true;
    }
    // GET /api/collections/:runId
    if (apiMatch[0] === "collections" && apiMatch.length === 2) {
      const data = await handleApiCollectionsKinds(cwd, apiMatch[1]);
      sendJson(res, 200, data);
      return true;
    }
    // GET /api/collections/:runId/:kind
    if (apiMatch[0] === "collections" && apiMatch.length === 3) {
      const data = await handleApiCollectionsKind(cwd, apiMatch[1], apiMatch[2]);
      sendJson(res, 200, data);
      return true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    sendJson(res, status, { error: message });
    return true;
  }
}

async function serveStatic(
  res: http.ServerResponse,
  pathname: string,
  staticDir: string
): Promise<boolean> {
  let filePath = path.join(staticDir, pathname === "/" ? "index.html" : pathname);
  if (!pathname || pathname === "/") {
    filePath = path.join(staticDir, "index.html");
  }
  // Security: no escape outside static dir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(staticDir))) {
    return false;
  }
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      filePath = path.join(resolved, "index.html");
    }
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".ico": "image/x-icon",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
    };
    res.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream" });
    res.end(content);
    return true;
  } catch {
    // SPA fallback: serve index.html for any non-file path
    try {
      const indexPath = path.join(staticDir, "index.html");
      const content = await fs.readFile(indexPath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }
}

export interface StudioServerOptions {
  /** If true, only serve /api; do not serve static assets (for dev with Vite proxy). */
  apiOnly?: boolean;
}

export function createStudioServer(workspacePath: string, options: StudioServerOptions = {}): http.Server {
  const cwd = path.resolve(workspacePath);
  const { apiOnly = false } = options;

  return http.createServer(async (req, res) => {
    setCors(res);
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api")) {
      let body: string | undefined;
      if (req.method === "PATCH" && req.headers["content-type"]?.includes("application/json")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks).toString("utf-8");
      }
      const handled = await handleApi(cwd, req.method ?? "GET", pathname, res, body, url.searchParams);
      if (handled) return;
    }

    if (apiOnly) {
      sendJson(res, 404, { error: "Not found (API-only mode; use Vite dev server for the app)" });
      return;
    }

    const served = await serveStatic(res, pathname, STUDIO_STATIC_DIR);
    if (!served) {
      sendJson(res, 404, { error: "Not found" });
    }
  });
}

export const STUDIO_DEFAULT_PORT = DEFAULT_PORT;

const STUDIO_PORT_RETRIES = 10;

export async function startStudioServer(
  workspacePath: string,
  port: number = DEFAULT_PORT,
  options: { apiOnly?: boolean } = {}
): Promise<{ server: http.Server; port: number }> {
  let lastError: Error | null = null;
  for (let offset = 0; offset < STUDIO_PORT_RETRIES; offset++) {
    const tryPort = port + offset;
    const server = createStudioServer(workspacePath, options);
    try {
      await new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        server.listen(tryPort, "127.0.0.1", () => resolve());
      });
      return { server, port: tryPort };
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (nodeErr?.code === "EADDRINUSE") {
        server.close();
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`No available port in range ${port}-${port + STUDIO_PORT_RETRIES - 1}`);
}
