#!/usr/bin/env node

import { program } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureWorkspace,
  requireWorkspace,
  workspaceExists,
  readWorkflowIndex,
  writeWorkflowIndex,
  listWorkflows,
  readWorkflowRecord,
  writeWorkflowRecord,
  listWorkflowVersionIds,
  readWorkflowVersionRecord,
  writeWorkflowVersionRecord,
  writeRunFile,
  readRunFile,
  updateRunFile,
  appendEventLine,
  runExists,
  readCollectionSchema,
  writeCollectionSchema,
  listCollectionKindsForRun,
  readCollections,
  writeCollections,
  appendCollection,
  listNodeResults,
  readNodeResult,
  writeNodeResult,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { validateWorkflowVersion } from "./validate.js";
import { mergeKindTemplate } from "./kind-templates.js";
import type { RunRecord, EventPayload, CollectionSchemaConfig } from "./models.js";
import { NodeResultStatus, type NodeResultRecord, type WorkflowRecord } from "./models.js";
import { runMcpServer } from "./mcp.js";
import { startStudioServer, STUDIO_DEFAULT_PORT } from "./studio-server.js";
import open from "open";
import {
  listSkills,
  getSkillByName,
  validateSkill,
  getSkillDirectories,
  getInstallPath,
  installSkill,
  installSkillsFromDirectory,
  installCognetivySkill,
  updateSkill,
  updateAllSkills,
  type SkillInstallTarget,
  type SkillSource,
} from "./skills.js";

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

/** Read JSON payload from file or stdin. If filePath is omitted, reads from stdin. */
async function readPayloadFromFileOrStdin(filePath: string | undefined, cwd: string): Promise<string> {
  if (filePath) {
    return fs.readFile(path.resolve(cwd, filePath), "utf-8");
  }
  if (process.stdin.isTTY) {
    console.error("Error: No input. Provide --file <path> or pipe JSON (e.g. cognetivy event append --run <id> < event.json).");
    process.exit(1);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    console.error("Error: No payload from stdin. Pipe JSON or use --file.");
    process.exit(1);
  }
  return raw;
}

/** Launch Studio server and open in browser. Reused by default command and after init. Tries port, then port+1, ... if in use. */
async function launchStudio(workspacePath: string, port: number = STUDIO_DEFAULT_PORT): Promise<void> {
  await requireWorkspace(workspacePath);
  const { port: actualPort } = await startStudioServer(workspacePath, port, { apiOnly: false });
  const url = `http://127.0.0.1:${actualPort}`;
  await open(url);
  console.log(`Studio at ${url} (workspace: ${workspacePath}). Press Ctrl+C to stop.`);
}

program
  .name("cognetivy")
  .description(
    "Reasoning orchestration state — workflow, runs, events, collections (no LLMs). Run with no command: init workspace if missing, then open Studio."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Initialize workspace and install skills (interactive, same as `cognetivy install`)")
  .option("--no-gitignore", "Do not add .gitignore snippet for runs/events/collections")
  .option("--force", "Re-init: overwrite workflow pointer and default version if present")
  .option("--workspace-only", "Only create .cognetivy workspace; do not prompt for skill installation")
  .action(async (opts: { gitignore?: boolean; force?: boolean; workspaceOnly?: boolean }) => {
    const cwd = process.cwd();
    const noGitignore = opts.gitignore === false;
    if (opts.workspaceOnly) {
      await ensureWorkspace(cwd, { force: opts.force, noGitignore });
      console.log("Initialized cognetivy workspace at .cognetivy/");
    } else {
      const { runInstallTUI } = await import("./install-tui.js");
      await runInstallTUI({ cwd, force: opts.force, init: true, noGitignore });
    }
    await launchStudio(cwd);
  });

const workflowCmd = program
  .command("workflow")
  .description("Workflow operations (multiple workflows + versions)");

workflowCmd
  .command("list")
  .description("List workflows")
  .action(async () => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflows = await listWorkflows(cwd);
    const out = workflows.map((w) => ({ ...w, current: w.workflow_id === index.current_workflow_id }));
    console.log(JSON.stringify(out, null, 2));
  });

workflowCmd
  .command("create")
  .description("Create a new workflow (creates workflow record + v1 version + empty schema)")
  .requiredOption("--name <string>", "Workflow name")
  .option("--id <string>", "Workflow id (default: generated)")
  .option("--description <string>", "Workflow description")
  .action(async (opts: { id?: string; name: string; description?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const id = opts.id ?? generateId("wf");
    const now = new Date().toISOString();

    const wf: WorkflowRecord = {
      workflow_id: id,
      name: opts.name,
      description: opts.description,
      current_version_id: "v1",
      created_at: now,
    };

    await writeWorkflowRecord(wf, cwd);
    await writeWorkflowVersionRecord(
      {
        workflow_id: id,
        version_id: "v1",
        name: "v1",
        created_at: now,
        nodes: [],
      },
      cwd
    );

    const { createDefaultCollectionSchema } = await import("./default-collection-schema.js");
    await writeCollectionSchema(id, createDefaultCollectionSchema(id), cwd);

    const index = await readWorkflowIndex(cwd);
    const next = {
      ...index,
      workflows: [...(index.workflows ?? []), { workflow_id: id, name: wf.name, description: wf.description, current_version_id: wf.current_version_id }],
    };
    await writeWorkflowIndex(next, cwd);
    console.log(id);
  });

workflowCmd
  .command("select")
  .description("Select current workflow (updates workflows/index.json)")
  .requiredOption("--workflow <workflow_id>", "Workflow ID")
  .action(async (opts: { workflow: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    if (!(index.workflows ?? []).some((w) => w.workflow_id === opts.workflow)) {
      console.error(`Error: workflow "${opts.workflow}" not found.`);
      process.exit(1);
    }
    await writeWorkflowIndex({ ...index, current_workflow_id: opts.workflow }, cwd);
    console.log(opts.workflow);
  });

workflowCmd
  .command("get")
  .description("Print a workflow version JSON to stdout")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--version <version_id>", "Version ID (default: workflow.current_version_id)")
  .action(async (opts: { workflow?: string; version?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const wf = await readWorkflowRecord(workflowId, cwd);
    const versionId = opts.version ?? wf.current_version_id;
    const version = await readWorkflowVersionRecord(workflowId, versionId, cwd);
    console.log(JSON.stringify(version, null, 2));
  });

workflowCmd
  .command("versions")
  .description("List versions for a workflow")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .action(async (opts: { workflow?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const ids = await listWorkflowVersionIds(workflowId, cwd);
    console.log(JSON.stringify(ids, null, 2));
  });

workflowCmd
  .command("set")
  .description("Set workflow version from file (creates new version and sets it current)")
  .requiredOption("--file <path>", "Path to workflow JSON file")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--name <string>", "Optional version name")
  .action(async (opts: { file: string; workflow?: string; name?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const data = JSON.parse(raw) as unknown;
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const wf = await readWorkflowRecord(workflowId, cwd);
    const existing = await listWorkflowVersionIds(workflowId, cwd);
    const nums = existing.map((v) => parseInt(v.replace(/^v/, ""), 10)).filter((n) => !Number.isNaN(n));
    const nextNum = Math.max(0, ...nums) + 1;
    const newVersionId = `v${nextNum}`;

    const version = {
      ...(data as Record<string, unknown>),
      workflow_id: workflowId,
      version_id: newVersionId,
      name: opts.name,
      created_at: new Date().toISOString(),
    };
    validateWorkflowVersion(version);

    await writeWorkflowVersionRecord(version, cwd);
    await writeWorkflowRecord({ ...wf, current_version_id: newVersionId }, cwd);

    const workflows = (index.workflows ?? []).map((w) =>
      w.workflow_id === workflowId ? { ...w, current_version_id: newVersionId } : w
    );
    await writeWorkflowIndex({ ...index, workflows }, cwd);
    console.log(newVersionId);
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
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--version <version_id>", "Workflow version ID (default: workflow.current_version_id)")
  .action(async (opts: { input: string; name?: string; by?: string; workflow?: string; version?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const wf = await readWorkflowRecord(workflowId, cwd);
    const versionId = opts.version ?? wf.current_version_id;
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
      workflow_id: workflowId,
      workflow_version_id: versionId,
      status: "running",
      input,
      created_at: now,
    };
    await writeRunFile(runRecord, cwd);
    const event: EventPayload = {
      ts: now,
      type: "run_started",
      by,
      data: { workflow_id: workflowId, workflow_version_id: versionId, input },
    };
    await appendEventLine(runId, event, cwd);

    // Seed run_input collection item for collection→node flow.
    const systemNodeId = "__system__";
    const systemNodeResultId = generateId("node_result");
    const nodeResult: NodeResultRecord = {
      node_result_id: systemNodeResultId,
      run_id: runId,
      workflow_id: workflowId,
      workflow_version_id: versionId,
      node_id: systemNodeId,
      status: NodeResultStatus.Completed,
      started_at: now,
      completed_at: now,
      output: JSON.stringify(input, null, 2),
      writes: [{ kind: "run_input", item_ids: ["run_input"] }],
    };
    await writeNodeResult(runId, systemNodeId, nodeResult, cwd);
    await appendCollection(
      runId,
      "run_input",
      input,
      { id: "run_input", created_by_node_id: systemNodeId, created_by_node_result_id: systemNodeResultId },
      cwd
    );
    console.log(runId);
    console.log(`COGNETIVY_RUN_ID=${runId}`);
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
  .command("status")
  .description("Show run metadata, each node's completion status, and item count per collection")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { run: string; json?: boolean }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found.`);
      process.exit(1);
    }
    const run = await readRunFile(opts.run, cwd);
    let version: Awaited<ReturnType<typeof readWorkflowVersionRecord>> | null = null;
    try {
      version = await readWorkflowVersionRecord(run.workflow_id, run.workflow_version_id, cwd);
    } catch {
      // workflow version missing
    }
    const nodeResults = await listNodeResults(opts.run, cwd);
    const nodeResultByNodeId = new Map(nodeResults.map((r) => [r.node_id, r]));
    const kinds = await listCollectionKindsForRun(opts.run, cwd);
    const collections: { kind: string; item_count: number }[] = [];
    for (const kind of kinds) {
      const store = await readCollections(opts.run, kind, cwd);
      collections.push({ kind, item_count: store.items.length });
    }
    const nodesList: { node_id: string; status: string; completed_at?: string }[] = [];
    if (version?.nodes) {
      for (const node of version.nodes) {
        const nr = nodeResultByNodeId.get(node.id);
        nodesList.push({
          node_id: node.id,
          status: nr?.status ?? "—",
          completed_at: nr?.completed_at,
        });
      }
    }
    // Include __system__ if we have a result for it but it's not in workflow nodes
    if (nodeResultByNodeId.has("__system__") && version?.nodes && !version.nodes.some((n) => n.id === "__system__")) {
      const nr = nodeResultByNodeId.get("__system__")!;
      nodesList.unshift({ node_id: "__system__", status: nr.status, completed_at: nr.completed_at });
    }
    const runSummary = {
      run_id: run.run_id,
      status: run.status,
      name: run.name,
      workflow_id: run.workflow_id,
      workflow_version_id: run.workflow_version_id,
    };
    if (opts.json) {
      console.log(JSON.stringify({ run: runSummary, nodes: nodesList, collections }, null, 2));
      return;
    }
    console.log("Run:", run.run_id, run.status, run.name ? `"${run.name}"` : "", `(${run.workflow_id} @ ${run.workflow_version_id})`);
    if (nodesList.length > 0) {
      console.log("Nodes:");
      for (const n of nodesList) {
        const at = n.completed_at ? ` @ ${n.completed_at}` : "";
        console.log(`  ${n.node_id}: ${n.status}${at}`);
      }
    } else if (!version) {
      console.log("Nodes: (workflow version unavailable)");
    }
    if (collections.length > 0) {
      console.log("Collections:");
      for (const c of collections) {
        console.log(`  ${c.kind}: ${c.item_count} item(s)`);
      }
    }
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
  .description("Append one event (from JSON file or stdin) to run's NDJSON log. If appending run_completed, also run 'cognetivy run complete --run <id>' to ensure status is persisted.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--file <path>", "Path to JSON file (omit to read event from stdin)")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (opts: { run: string; file?: string; by?: string }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found. Run \`cognetivy run start\` first.`);
      process.exit(1);
    }
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
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
  .description("Collection schema (workflow-scoped; strict JSON Schema per kind)");
collectionSchemaCmd
  .command("get")
  .description("Print current collection schema JSON to stdout")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .action(async (opts: { workflow?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const schema = await readCollectionSchema(workflowId, cwd);
    console.log(JSON.stringify(schema, null, 2));
  });
collectionSchemaCmd
  .command("set")
  .description("Set collection schema from JSON file")
  .requiredOption("--file <path>", "Path to collection-schema JSON file")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .action(async (opts: { file: string; workflow?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const schema = JSON.parse(raw) as CollectionSchemaConfig;
    if (!schema.kinds || typeof schema.kinds !== "object") {
      console.error("Error: schema must have a 'kinds' object.");
      process.exit(1);
    }
    const merged: CollectionSchemaConfig = { workflow_id: workflowId, kinds: {} };
    for (const [k, v] of Object.entries(schema.kinds)) {
      merged.kinds[k] = mergeKindTemplate(k, v);
    }
    await writeCollectionSchema(workflowId, merged, cwd);
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
  .description("Replace all collections of a kind for a run (from JSON file or stdin)")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .option("--file <path>", "Path to JSON file (omit to read array from stdin)")
  .requiredOption("--node <node_id>", "Node id that created these items")
  .requiredOption("--node-result <node_result_id>", "Node result id that created these items")
  .action(async (opts: { run: string; kind: string; file?: string; node: string; nodeResult: string }) => {
    const cwd = process.cwd();
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
    const payloads = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(payloads)) {
      console.error("Error: file must contain a JSON array of collection items.");
      process.exit(1);
    }
    await writeCollections(
      opts.run,
      opts.kind,
      payloads,
      { created_by_node_id: opts.node, created_by_node_result_id: opts.nodeResult },
      cwd
    );
    console.log(`Set ${payloads.length} collection(s) for kind "${opts.kind}".`);
  });
collectionCmd
  .command("append")
  .description("Append one collection item (from JSON file or stdin) to a run's kind")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .option("--file <path>", "Path to JSON file (omit to read payload from stdin)")
  .requiredOption("--node <node_id>", "Node id that created this item")
  .requiredOption("--node-result <node_result_id>", "Node result id that created this item")
  .option("--id <string>", "Optional collection id")
  .action(async (opts: { run: string; kind: string; file?: string; id?: string; node: string; nodeResult: string }) => {
    const cwd = process.cwd();
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const item = await appendCollection(
      opts.run,
      opts.kind,
      payload,
      { id: opts.id, created_by_node_id: opts.node, created_by_node_result_id: opts.nodeResult },
      cwd
    );
    console.log(JSON.stringify(item, null, 2));
  });

const nodeResultCmd = program
  .command("node-result")
  .description("Node results per run (stored snapshots of node outputs and writes)");

nodeResultCmd
  .command("list")
  .description("List node results for a run")
  .requiredOption("--run <run_id>", "Run ID")
  .action(async (opts: { run: string }) => {
    const cwd = process.cwd();
    const results = await listNodeResults(opts.run, cwd);
    console.log(JSON.stringify(results, null, 2));
  });

nodeResultCmd
  .command("get")
  .description("Get node result for a node in a run")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Node ID")
  .action(async (opts: { run: string; node: string }) => {
    const cwd = process.cwd();
    const result = await readNodeResult(opts.run, opts.node, cwd);
    if (!result) {
      console.error("Not found.");
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  });

nodeResultCmd
  .command("set")
  .description("Create or replace a node result for a node in a run")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Node ID")
  .requiredOption("--status <status>", "Status: started|completed|failed|needs_human")
  .option("--id <node_result_id>", "Node result id (default: generated)")
  .option("--output-file <path>", "Path to a text/markdown file for output")
  .option("--output <string>", "Inline output text")
  .action(
    async (opts: { run: string; node: string; status: string; id?: string; outputFile?: string; output?: string }) => {
      const cwd = process.cwd();
      const run = await readRunFile(opts.run, cwd);
      const now = new Date().toISOString();
      const status = opts.status as NodeResultRecord["status"];
      const validStatuses = Object.values(NodeResultStatus) as string[];
      if (!validStatuses.includes(status)) {
        console.error(`Error: status must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      let output: string | undefined = opts.output;
      if (opts.outputFile) {
        output = await fs.readFile(path.resolve(cwd, opts.outputFile), "utf-8");
      }
      const id = opts.id ?? generateId("node_result");
      const completed_at =
        status === NodeResultStatus.Completed || status === NodeResultStatus.Failed || status === NodeResultStatus.NeedsHuman
          ? now
          : undefined;
      const result: NodeResultRecord = {
        node_result_id: id,
        run_id: opts.run,
        workflow_id: run.workflow_id,
        workflow_version_id: run.workflow_version_id,
        node_id: opts.node,
        status,
        started_at: now,
        completed_at,
        ...(output ? { output } : {}),
      };
      await writeNodeResult(opts.run, opts.node, result, cwd);
      console.log(`COGNETIVY_NODE_RESULT_ID=${id}`);
      console.log(JSON.stringify(result, null, 2));
    }
  );

const nodeCmd = program
  .command("node")
  .description("Node lifecycle: start (step_started + id) and complete (node result + optional collection + step_completed)");

nodeCmd
  .command("start")
  .description("Append step_started and create a started node result; prints COGNETIVY_NODE_RESULT_ID for use in workflows")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Workflow node ID")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (opts: { run: string; node: string; by?: string }) => {
    const cwd = process.cwd();
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found.`);
      process.exit(1);
    }
    const run = await readRunFile(opts.run, cwd);
    const by = opts.by ?? (await resolveBy(cwd));
    const now = new Date().toISOString();
    const nodeResultId = generateId("node_result");
    const event: EventPayload = {
      ts: now,
      type: "step_started",
      by,
      data: { step: opts.node, step_id: opts.node },
    };
    await appendEventLine(opts.run, event, cwd);
    const result: NodeResultRecord = {
      node_result_id: nodeResultId,
      run_id: opts.run,
      workflow_id: run.workflow_id,
      workflow_version_id: run.workflow_version_id,
      node_id: opts.node,
      status: NodeResultStatus.Started,
      started_at: now,
    };
    await writeNodeResult(opts.run, opts.node, result, cwd);
    console.log(`COGNETIVY_NODE_RESULT_ID=${nodeResultId}`);
  });

nodeCmd
  .command("complete")
  .description("Create node result, optionally write collection payload, append step_completed (single call for agent efficiency)")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Workflow node ID")
  .requiredOption("--status <status>", "Status: completed|failed|needs_human")
  .option("--output <string>", "Inline output text for the node result")
  .option("--output-file <path>", "Path to file for node result output")
  .option("--collection-kind <kind>", "Collection kind to set or append (payload from --collection-file or stdin)")
  .option("--collection-file <path>", "Path to JSON payload (omit to read from stdin when --collection-kind is set)")
  .option("--collection-mode <mode>", "set (array) or append (single object); default: infer from payload", "infer")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(
    async (opts: {
      run: string;
      node: string;
      status: string;
      output?: string;
      outputFile?: string;
      collectionKind?: string;
      collectionFile?: string;
      collectionMode?: string;
      by?: string;
    }) => {
      const cwd = process.cwd();
      const exists = await runExists(opts.run, cwd);
      if (!exists) {
        console.error(`Error: Run "${opts.run}" not found.`);
        process.exit(1);
      }
      const run = await readRunFile(opts.run, cwd);
      const validStatuses = ["completed", "failed", "needs_human"] as const;
      if (!validStatuses.includes(opts.status as (typeof validStatuses)[number])) {
        console.error(`Error: status must be one of: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      const status = opts.status as NodeResultRecord["status"];
      const by = opts.by ?? (await resolveBy(cwd));
      const now = new Date().toISOString();
      let output: string | undefined = opts.output;
      if (opts.outputFile) {
        output = await fs.readFile(path.resolve(cwd, opts.outputFile), "utf-8");
      }
      const nodeResultId = generateId("node_result");
      const writes: { kind: string; item_ids: string[] }[] = [];

      if (opts.collectionKind) {
        const raw = await readPayloadFromFileOrStdin(opts.collectionFile, cwd);
        const payload = JSON.parse(raw) as unknown;
        const mode = opts.collectionMode === "set" || opts.collectionMode === "append" ? opts.collectionMode : Array.isArray(payload) ? "set" : "append";
        if (mode === "set") {
          const payloads = payload as Array<Record<string, unknown>>;
          if (!Array.isArray(payloads)) {
            console.error("Error: collection payload must be a JSON array when using set.");
            process.exit(1);
          }
          const payloadsWithIds = payloads.map((p, i) => ({
            ...p,
            id: (p as { id?: string }).id ?? `${opts.collectionKind}_${i}`,
          }));
          const itemIds = payloadsWithIds.map((p) => (p as { id: string }).id);
          await writeCollections(
            opts.run,
            opts.collectionKind,
            payloadsWithIds,
            { created_by_node_id: opts.node, created_by_node_result_id: nodeResultId },
            cwd
          );
          writes.push({ kind: opts.collectionKind, item_ids: itemIds });
        } else {
          const single = payload as Record<string, unknown>;
          const item = await appendCollection(
            opts.run,
            opts.collectionKind,
            single,
            { created_by_node_id: opts.node, created_by_node_result_id: nodeResultId },
            cwd
          );
          writes.push({ kind: opts.collectionKind, item_ids: [item.id] });
        }
      }

      const result: NodeResultRecord = {
        node_result_id: nodeResultId,
        run_id: opts.run,
        workflow_id: run.workflow_id,
        workflow_version_id: run.workflow_version_id,
        node_id: opts.node,
        status,
        started_at: now,
        completed_at: now,
        ...(output ? { output } : {}),
        ...(writes.length > 0 ? { writes } : {}),
      };
      await writeNodeResult(opts.run, opts.node, result, cwd);

      const stepCompletedEvent: EventPayload = {
        ts: now,
        type: "step_completed",
        by,
        data: { step: opts.node, step_id: opts.node },
      };
      await appendEventLine(opts.run, stepCompletedEvent, cwd);

      console.log(`COGNETIVY_NODE_RESULT_ID=${nodeResultId}`);
    }
  );

program
  .command("install [target]")
  .description(
    "Set up cognetivy in this project (if needed) and install skills. Target: claude | cursor | openclaw | workspace | all (default: all). Use with no target or --interactive for TUI."
  )
  .option("--force", "Overwrite if skill already exists")
  .option("--no-init", "Skip cognetivy workspace init; only install skills")
  .option("--interactive", "Show interactive prompt to choose tool(s) and install accordingly")
  .action(async (target: string | undefined, opts: { force?: boolean; init?: boolean; interactive?: boolean }) => {
    const cwd = process.cwd();
    const useTUI = opts.interactive === true || target === undefined;
    if (useTUI) {
      const { runInstallTUI } = await import("./install-tui.js");
      await runInstallTUI({ cwd, force: opts.force, init: opts.init !== false });
      return;
    }
    if (opts.init !== false) {
      await ensureWorkspace(cwd);
    }
    const normalized = target.toLowerCase();
    const targetMap: Record<string, SkillInstallTarget | "all"> = {
      claude: "agent",
      cursor: "cursor",
      openclaw: "openclaw",
      workspace: "workspace",
      all: "all",
    };
    const resolved = targetMap[normalized];
    if (!resolved) {
      console.error("Target must be: claude, cursor, openclaw, workspace, or all.");
      process.exit(1);
    }
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const targetsToInstall: SkillInstallTarget[] =
      resolved === "all"
        ? (["agent", "cursor", "openclaw", "workspace"] as SkillInstallTarget[])
        : [resolved];
    const optsCommon = { force: opts.force, cwd, config: skillsConfig };
    try {
      for (const internalTarget of targetsToInstall) {
        const { results } = await installSkillsFromDirectory(cwd, internalTarget, optsCommon);
        const label =
          internalTarget === "agent"
            ? "claude"
            : internalTarget === "cursor"
              ? "cursor"
            : internalTarget === "openclaw"
              ? "openclaw"
              : "workspace";
        for (const r of results) {
          console.log(`[${label}] Installed to ${r.path}`);
        }
      }
      for (const internalTarget of targetsToInstall) {
        const cognetivyPath = await installCognetivySkill(internalTarget, cwd, skillsConfig);
        const label =
          internalTarget === "agent"
            ? "claude"
            : internalTarget === "cursor"
              ? "cursor"
            : internalTarget === "openclaw"
              ? "openclaw"
              : "workspace";
        console.log(`[${label}] Cognetivy skill at ${cognetivyPath}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function getSkillsConfigFromMerged(
  config: Awaited<ReturnType<typeof getMergedConfig>>
): { sources?: SkillSource[]; extraDirs?: string[]; default_install_target?: SkillInstallTarget } {
  const skills = config.skills as
    | { sources?: SkillSource[]; extraDirs?: string[]; default_install_target?: SkillInstallTarget }
    | undefined;
  return skills ?? {};
}

const skillsCmd = program
  .command("skills")
  .description("Agent skills and OpenClaw skills (SKILL.md): list, install, update");
skillsCmd
  .command("list")
  .description("List skills from configured sources")
  .option("--source <source>", "Filter by source: agent, openclaw, workspace")
  .option("--eligible", "Only list skills that pass validation")
  .action(async (opts: { source?: string; eligible?: boolean }) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const sources = opts.source
      ? ([opts.source] as SkillSource[])
      : skillsConfig.sources ?? (["agent", "openclaw", "workspace"] as SkillSource[]);
    let skills = await listSkills(cwd, { sources, extraDirs: skillsConfig.extraDirs }, skillsConfig);
    if (opts.eligible) {
      const valid: typeof skills = [];
      for (const s of skills) {
        const { valid: ok } = await validateSkill(s.path);
        if (ok) valid.push(s);
      }
      skills = valid;
    }
    const out = skills.map((s) => ({
      name: s.metadata.name,
      description: s.metadata.description,
      path: s.path,
      source: s.source,
    }));
    console.log(JSON.stringify(out, null, 2));
  });
skillsCmd
  .command("info <name>")
  .description("Show one skill by name (path, frontmatter, body preview)")
  .action(async (name: string) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const skill = await getSkillByName(name, cwd, undefined, skillsConfig);
    if (!skill) {
      console.error(`Skill "${name}" not found.`);
      process.exit(1);
    }
    const preview = skill.body.slice(0, 400) + (skill.body.length > 400 ? "..." : "");
    console.log(JSON.stringify(
      {
        path: skill.path,
        source: skill.source,
        metadata: skill.metadata,
        bodyPreview: preview,
      },
      null,
      2
    ));
  });
skillsCmd
  .command("check [path]")
  .description("Validate SKILL.md (path = skill dir; omit to check all listed skills)")
  .action(async (dirPath?: string) => {
    const cwd = process.cwd();
    if (dirPath) {
      const resolved = path.resolve(cwd, dirPath);
      const { valid, errors } = await validateSkill(resolved);
      if (valid) {
        console.log("Valid.");
      } else {
        console.error("Validation failed:");
        errors.forEach((e) => console.error("  -", e));
        process.exit(1);
      }
      return;
    }
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const skills = await listSkills(cwd, undefined, skillsConfig);
    let hasInvalid = false;
    for (const s of skills) {
      const { valid, errors } = await validateSkill(s.path);
      if (!valid) {
        hasInvalid = true;
        console.error(`${s.metadata.name}:`);
        errors.forEach((e) => console.error("  -", e));
      }
    }
    if (hasInvalid) process.exit(1);
    console.log(`All ${skills.length} skill(s) valid.`);
  });
skillsCmd
  .command("paths")
  .description("Print discovery and install target paths")
  .action(async () => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const sources: SkillSource[] = skillsConfig.sources ?? ["agent", "openclaw", "workspace"];
    const out: Record<string, string[]> = {};
    for (const source of sources) {
      out[source] = await getSkillDirectories(source, cwd, skillsConfig);
    }
    console.log(JSON.stringify(out, null, 2));
  });
skillsCmd
  .command("install [source]")
  .description("Install a skill from current directory (or path/URL) into project or target (default: workspace = .cognetivy/skills)")
  .option("--target <target>", "Install target: agent, cursor, openclaw, workspace (default: workspace)")
  .option("--force", "Overwrite if skill already exists")
  .action(async (source: string | undefined, opts: { target?: string; force?: boolean }) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const target = (opts.target ?? skillsConfig.default_install_target ?? "workspace") as SkillInstallTarget;
    if (!["agent", "cursor", "openclaw", "workspace"].includes(target)) {
      console.error("--target must be agent, cursor, openclaw, or workspace.");
      process.exit(1);
    }
    const installSource = (source?.trim() || ".") as string;
    try {
      const isCurrentDir =
        installSource === "." || path.resolve(cwd, installSource) === path.resolve(cwd);
      if (isCurrentDir) {
        const { results } = await installSkillsFromDirectory(cwd, target, {
          force: opts.force,
          cwd,
          config: skillsConfig,
        });
        for (const r of results) {
          console.log(`Installed to ${r.path}`);
        }
      } else {
        const result = await installSkill(installSource, target, {
          force: opts.force,
          cwd,
          config: skillsConfig,
        });
        console.log(`Installed to ${result.path}`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
skillsCmd
  .command("update [name]")
  .description("Update skill(s) from recorded origin; use --all to update all for target")
  .option("--target <target>", "Target: agent, cursor, openclaw, workspace")
  .option("--all", "Update all skills for the target")
  .option("--dry-run", "Do not write changes")
  .action(async (name: string | undefined, opts: { target?: string; all?: boolean; dryRun?: boolean }) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const target = (opts.target ?? skillsConfig.default_install_target) as SkillInstallTarget | undefined;
    if (!target) {
      console.error("Specify --target or set skills.default_install_target in config.");
      process.exit(1);
    }
    if (opts.all) {
      const { updated, skipped } = await updateAllSkills(target, {
        cwd,
        config: skillsConfig,
        dryRun: opts.dryRun,
      });
      console.log(`Updated: ${updated.join(", ") || "none"}`);
      if (skipped.length) console.log(`Skipped: ${skipped.join(", ")}`);
      return;
    }
    if (!name) {
      console.error("Provide skill name or use --all.");
      process.exit(1);
    }
    try {
      await updateSkill(name, target, { cwd, config: skillsConfig, dryRun: opts.dryRun });
      console.log(`Updated ${name}.`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
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
    const requestedPort = opts.port ?? STUDIO_DEFAULT_PORT;
    const { port: actualPort } = await startStudioServer(workspacePath, requestedPort, { apiOnly: opts.apiOnly });
    if (!opts.apiOnly) {
      const url = `http://127.0.0.1:${actualPort}`;
      await open(url);
      console.log(`Studio at ${url} (workspace: ${workspacePath}). Press Ctrl+C to stop.`);
    } else {
      console.log(`Studio API at http://127.0.0.1:${actualPort} (workspace: ${workspacePath}).`);
      console.log(`Run the app in dev: cd studio && npm run dev, then open http://localhost:5173`);
      console.log("Press Ctrl+C to stop.");
    }
  });

program.action(async () => {
  const cwd = process.cwd();
  if (!(await workspaceExists(cwd))) {
    const { runInstallTUI } = await import("./install-tui.js");
    await runInstallTUI({ cwd, init: true });
  }
  await launchStudio(cwd);
});

program.parse();
