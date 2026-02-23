#!/usr/bin/env node

import { program } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureWorkspace,
  requireWorkspace,
  readWorkflowPointer,
  readWorkflowVersion,
  writeWorkflowPointer,
  writeWorkflowVersion,
  listWorkflowVersionFiles,
  versionFromFileName,
  writeRunFile,
  updateRunFile,
  appendEventLine,
  runExists,
  readCollectionSchema,
  writeCollectionSchema,
  listCollectionKindsForRun,
  readCollections,
  writeCollections,
  appendCollection,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { validateWorkflow } from "./validate.js";
import { mergeKindTemplate } from "./kind-templates.js";
import type { RunRecord, EventPayload, CollectionSchemaConfig, CollectionItem } from "./models.js";
import { runMcpServer } from "./mcp.js";
import { startStudioServer, STUDIO_DEFAULT_PORT } from "./studio-server.js";
import open from "open";

const DEFAULT_BY = "cli";

function generateId(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

async function resolveBy(cwd: string): Promise<string> {
  const config = await getMergedConfig(cwd);
  return (config.default_by as string) ?? DEFAULT_BY;
}

program
  .name("cognetivy")
  .description("Reasoning orchestration state — workflow, runs, events, collections (no LLMs)")
  .version("0.1.0");

program
  .command("init")
  .description("Create .cognetivy workspace (and optional .gitignore snippet)")
  .option("--no-gitignore", "Do not add .gitignore snippet for runs/events/collections")
  .option("--force", "Re-init: overwrite workflow pointer and default version if present")
  .action(async (opts: { gitignore?: boolean; force?: boolean }) => {
    const cwd = process.cwd();
    const noGitignore = opts.gitignore === false;
    await ensureWorkspace(cwd, { force: opts.force, noGitignore });
    console.log("Initialized cognetivy workspace at .cognetivy/");
  });

const workflowCmd = program
  .command("workflow")
  .description("Workflow version operations");
workflowCmd
  .command("get")
  .description("Print current workflow version JSON to stdout")
  .action(async () => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const pointer = await readWorkflowPointer(cwd);
    const workflow = await readWorkflowVersion(pointer.current_version, cwd);
    console.log(JSON.stringify(workflow, null, 2));
  });
workflowCmd
  .command("set")
  .description("Set workflow from file (creates new version wf_vN.json and updates pointer)")
  .requiredOption("--file <path>", "Path to workflow JSON file")
  .action(async (opts: { file: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const data = JSON.parse(raw) as unknown;
    validateWorkflow(data);
    const pointer = await readWorkflowPointer(cwd);
    const files = await listWorkflowVersionFiles(cwd);
    const versions = files.map(versionFromFileName);
    const maxNum = Math.max(0, ...versions.map((v) => parseInt(v.replace(/^v/, ""), 10) || 0));
    const newVersion = `v${maxNum + 1}`;
    const workflow = {
      ...data,
      workflow_id: pointer.workflow_id,
      version: newVersion,
    };
    await writeWorkflowVersion(workflow, cwd);
    await writeWorkflowPointer(
      { workflow_id: pointer.workflow_id, current_version: newVersion },
      cwd
    );
    console.log(newVersion);
  });

const runCmd = program
  .command("run")
  .description("Run operations");
runCmd
  .command("start")
  .description("Start a new run; prints run_id")
  .requiredOption("--input <path>", "Path to JSON file with run input")
  .option("--name <string>", "Human-readable name for the run (e.g. 'Q1 ideas exploration')")
  .option("--by <string>", "Actor (e.g. agent:cursor); defaults to config or 'cli'")
  .action(async (opts: { input: string; name?: string; by?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const pointer = await readWorkflowPointer(cwd);
    const inputPath = path.resolve(cwd, opts.input);
    let inputRaw: string;
    try {
      inputRaw = await fs.readFile(inputPath, "utf-8");
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : "";
      if (code === "ENOENT") {
        console.error(`Error: Input file not found: ${inputPath}`);
        console.error("Create a JSON file (e.g. sample_input.json with {\"topic\": \"...\"}) or pass a valid path.");
        process.exit(1);
      }
      throw err;
    }
    const input = JSON.parse(inputRaw) as Record<string, unknown>;
    const runId = generateId("run");
    const by = opts.by ?? (await resolveBy(cwd));
    const now = new Date().toISOString();
    const runRecord: RunRecord = {
      run_id: runId,
      ...(opts.name && { name: opts.name }),
      workflow_id: pointer.workflow_id,
      workflow_version: pointer.current_version,
      status: "running",
      input,
      created_at: now,
    };
    await writeRunFile(runRecord, cwd);
    const event: EventPayload = {
      ts: now,
      type: "run_started",
      by,
      data: { workflow_version: pointer.current_version, input },
    };
    await appendEventLine(runId, event, cwd);
    console.log(runId);
  });
runCmd
  .command("complete")
  .description("Mark a run as completed (ensures status=completed is persisted)")
  .requiredOption("--run <run_id>", "Run ID to mark complete")
  .action(async (opts: { run: string }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found.`);
      process.exit(1);
    }
    await updateRunFile(opts.run, { status: "completed" }, cwd);
    console.log(`Run "${opts.run}" marked as completed.`);
  });
runCmd
  .command("set-name")
  .description("Set or update the human-readable name for an existing run")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--name <string>", "Name for the run")
  .action(async (opts: { run: string; name: string }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found.`);
      process.exit(1);
    }
    await updateRunFile(opts.run, { name: opts.name }, cwd);
    console.log(`Run "${opts.run}" named "${opts.name}".`);
  });

const eventCmd = program
  .command("event")
  .description("Event log operations");
eventCmd
  .command("append")
  .description("Append one event (from JSON file) to run's NDJSON log. If appending run_completed, also run 'cognetivy run complete --run <id>' to ensure status is persisted.")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--file <path>", "Path to JSON file (event payload or full event)")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (opts: { run: string; file: string; by?: string }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found. Run \`cognetivy run start\` first.`);
      process.exit(1);
    }
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const by = opts.by ?? (await resolveBy(cwd));
    const now = new Date().toISOString();
    const event: EventPayload = {
      ts: (data.ts as string) ?? now,
      type: (data.type as EventPayload["type"]) ?? "artifact",
      by: (data.by as string) ?? by,
      data: (data.data as Record<string, unknown>) ?? (data as Record<string, unknown>),
    };
    await appendEventLine(opts.run, event, cwd);
    if (event.type === "run_completed") {
      await updateRunFile(opts.run, { status: "completed" }, cwd);
    }
    console.log("Appended event.");
  });

const collectionSchemaCmd = program
  .command("collection-schema")
  .description("Collection schema (defines kinds and required fields for structured collections)");
collectionSchemaCmd
  .command("get")
  .description("Print current collection schema JSON to stdout")
  .action(async () => {
    const cwd = process.cwd();
    const schema = await readCollectionSchema(cwd);
    console.log(JSON.stringify(schema, null, 2));
  });
collectionSchemaCmd
  .command("set")
  .description("Set collection schema from JSON file")
  .requiredOption("--file <path>", "Path to collection-schema JSON file")
  .action(async (opts: { file: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const schema = JSON.parse(raw) as CollectionSchemaConfig;
    if (!schema.kinds || typeof schema.kinds !== "object") {
      console.error("Error: schema must have a 'kinds' object.");
      process.exit(1);
    }
    const merged: CollectionSchemaConfig = { kinds: {} };
    for (const [k, v] of Object.entries(schema.kinds)) {
      merged.kinds[k] = mergeKindTemplate(k, v);
    }
    await writeCollectionSchema(merged, cwd);
    console.log("Collection schema updated.");
  });

const collectionCmd = program
  .command("collection")
  .description("Structured collections per run (sources, ideas — schema-backed)");
collectionCmd
  .command("list")
  .description("List collection kinds that have data for a run")
  .requiredOption("--run <run_id>", "Run ID")
  .action(async (opts: { run: string }) => {
    const cwd = process.cwd();
    const kinds = await listCollectionKindsForRun(opts.run, cwd);
    console.log(JSON.stringify(kinds, null, 2));
  });
collectionCmd
  .command("get")
  .description("Get all collections of a kind for a run")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind (e.g. sources, ideas)")
  .action(async (opts: { run: string; kind: string }) => {
    const cwd = process.cwd();
    const store = await readCollections(opts.run, opts.kind, cwd);
    console.log(JSON.stringify(store, null, 2));
  });
collectionCmd
  .command("set")
  .description("Replace all collections of a kind for a run (from JSON file)")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .requiredOption("--file <path>", "Path to JSON file (array of collection items)")
  .action(async (opts: { run: string; kind: string; file: string }) => {
    const cwd = process.cwd();
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const items = JSON.parse(raw) as CollectionItem[];
    if (!Array.isArray(items)) {
      console.error("Error: file must contain a JSON array of collection items.");
      process.exit(1);
    }
    await writeCollections(opts.run, opts.kind, items, cwd);
    console.log(`Set ${items.length} collection(s) for kind "${opts.kind}".`);
  });
collectionCmd
  .command("append")
  .description("Append one collection item (from JSON file) to a run's kind")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .requiredOption("--file <path>", "Path to JSON file (single collection payload)")
  .option("--id <string>", "Optional collection id")
  .action(async (opts: { run: string; kind: string; file: string; id?: string }) => {
    const cwd = process.cwd();
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const item = await appendCollection(opts.run, opts.kind, payload, { id: opts.id }, cwd);
    console.log(JSON.stringify(item, null, 2));
  });

program
  .command("mcp")
  .description("Start MCP server over stdio (for Cursor/agents)")
  .option("--workspace <path>", "Workspace directory (default: cwd)")
  .action(async (opts: { workspace?: string }) => {
    const workspacePath = opts.workspace ? path.resolve(process.cwd(), opts.workspace) : process.cwd();
    await runMcpServer(workspacePath);
  });

program
  .command("studio")
  .description("Open read-only Studio (workflow, runs, events, collections) in browser")
  .option("--workspace <path>", "Workspace directory (default: cwd)")
  .option("--port <number>", "Port for Studio server", (v) => parseInt(v, 10), STUDIO_DEFAULT_PORT)
  .option("--api-only", "Only serve API (for use with Vite dev server; see studio/README)")
  .action(async (opts: { workspace?: string; port?: number; apiOnly?: boolean }) => {
    const cwd = process.cwd();
    const workspacePath = opts.workspace ? path.resolve(cwd, opts.workspace) : cwd;
    await requireWorkspace(workspacePath);
    const port = opts.port ?? STUDIO_DEFAULT_PORT;
    const { server } = await startStudioServer(workspacePath, port, { apiOnly: opts.apiOnly });
    if (!opts.apiOnly) {
      const url = `http://127.0.0.1:${port}`;
      await open(url);
      console.log(`Studio at ${url} (workspace: ${workspacePath}). Press Ctrl+C to stop.`);
    } else {
      console.log(`Studio API at http://127.0.0.1:${port} (workspace: ${workspacePath}).`);
      console.log(`Run the app in dev: cd studio && npm run dev, then open http://localhost:5173`);
      console.log("Press Ctrl+C to stop.");
    }
  });

program.parse();
