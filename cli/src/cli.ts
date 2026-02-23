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
  appendEventLine,
  runExists,
  readMutationFile,
  updateMutationFile,
  writeMutationFile,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { validateWorkflow } from "./validate.js";
import { applyMutationToWorkspace } from "./mutation.js";
import type { RunRecord, EventPayload, MutationRecord, MutationTarget, JsonPatchOperation } from "./models.js";
import { runMcpServer } from "./mcp.js";

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
  .description("Reasoning orchestration state — workflow, runs, events, mutations (no LLMs)")
  .version("0.1.0");

program
  .command("init")
  .description("Create .cognetivy workspace (and optional .gitignore snippet)")
  .option("--no-gitignore", "Do not add .gitignore snippet for runs/events/mutations")
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
  .option("--by <string>", "Actor (e.g. agent:cursor); defaults to config or 'cli'")
  .action(async (opts: { input: string; by?: string }) => {
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

const eventCmd = program
  .command("event")
  .description("Event log operations");
eventCmd
  .command("append")
  .description("Append one event (from JSON file) to run's NDJSON log")
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
    console.log("Appended event.");
  });

const mutateCmd = program
  .command("mutate")
  .description("Workflow mutation operations");
mutateCmd
  .command("propose")
  .description("Propose a workflow mutation (JSON Patch); prints mutation_id")
  .requiredOption("--patch <path>", "Path to JSON Patch file (array of operations)")
  .requiredOption("--reason <text>", "Reason for the mutation")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (opts: { patch: string; reason: string; by?: string }) => {
    const cwd = process.cwd();
    const pointer = await readWorkflowPointer(cwd);
    const patchRaw = await fs.readFile(path.resolve(cwd, opts.patch), "utf-8");
    const patch = JSON.parse(patchRaw) as JsonPatchOperation[];
    const by = opts.by ?? (await resolveBy(cwd));
    const mutationId = generateId("mut");
    const target: MutationTarget = {
      type: "workflow",
      workflow_id: pointer.workflow_id,
      from_version: pointer.current_version,
    };
    const record: MutationRecord = {
      mutation_id: mutationId,
      target,
      patch,
      reason: opts.reason,
      status: "proposed",
      created_by: by,
      created_at: new Date().toISOString(),
    };
    await writeMutationFile(record, cwd);
    console.log(mutationId);
  });

mutateCmd
  .command("apply <mutation_id>")
  .description("Apply a proposed mutation (creates new workflow version, updates pointer)")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (mutationId: string, opts: { by?: string }) => {
    const cwd = process.cwd();
    const mutation = await readMutationFile(mutationId, cwd);
    if (mutation.status !== "proposed") {
      console.error(`Error: Mutation "${mutationId}" is not in proposed state (status: ${mutation.status}).`);
      process.exit(1);
    }
    const newVersion = await applyMutationToWorkspace(
      mutation.target.from_version,
      mutation.patch,
      mutation.target.workflow_id,
      cwd
    );
    await writeWorkflowPointer(
      {
        workflow_id: mutation.target.workflow_id,
        current_version: newVersion,
      },
      cwd
    );
    await updateMutationFile(
      mutationId,
      { status: "applied", applied_to_version: newVersion },
      cwd
    );
    console.log(newVersion);
  });

program
  .command("mcp")
  .description("Start MCP server over stdio (for Cursor/agents)")
  .option("--workspace <path>", "Workspace directory (default: cwd)")
  .action(async (opts: { workspace?: string }) => {
    const workspacePath = opts.workspace ? path.resolve(process.cwd(), opts.workspace) : process.cwd();
    await runMcpServer(workspacePath);
  });

program.parse();
