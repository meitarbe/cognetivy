#!/usr/bin/env node

import { program } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureMinimalWorkspace,
  ensureWorkspace,
  isWorkspaceMinimal,
  requireWorkspace,
  workspaceExists,
  readWorkflowIndex,
  readWorkflowIndexOptional,
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
import { getNextStep, formatNextStepLine, type NextStep } from "./run-engine.js";
import { mergeKindTemplate } from "./kind-templates.js";
import { listWorkflowTemplates, listWorkflowTemplatesForPicker, materializeWorkflowTemplate } from "./workflow-templates.js";
import { applyWorkflowTemplateToWorkspace, applyWorkflowTemplateToCloud } from "./workflow-template-apply.js";
import type { RunRecord, EventPayload, CollectionSchemaConfig, WorkflowNode, WorkflowIndexRecord } from "./models.js";
import { NodeResultStatus, type NodeResultRecord, type WorkflowRecord } from "./models.js";
import { runMcpServer } from "./mcp.js";
import { startStudioServer, STUDIO_DEFAULT_PORT } from "./studio-server.js";
import {
  cloudCreateRun,
  cloudGetRun,
  cloudGetNext,
  cloudStartNode,
  cloudCompleteNode,
  cloudAppendEvents,
  mapCloudActionToLocal,
  isCloudMode,
  isCloudAuthenticated,
  getCloudApiUrl,
  cloudGetCurrentUser,
  resolveCloudOrganizationId,
  cloudListWorkflows,
  cloudCreateWorkflow,
  cloudCreateWorkflowFull,
  cloudCreateWorkflowVersion,
  cloudGetWorkflow,
  cloudGetWorkflowVersions,
  cloudGetWorkflowVersion,
  cloudListCollectionKinds,
  cloudGetCollectionItems,
} from "./cloud-client.js";
import { writeStoredApiKey, removeStoredApiKey, getApiKeyPath } from "./credentials.js";
import { runLoginFlow } from "./auth-login-server.js";
import open from "open";

/** When COGNETIVY_SKIP_OPEN is set (e.g. in tests), log URL instead of opening browser. */
async function openUrl(url: string): Promise<void> {
  if (process.env.COGNETIVY_SKIP_OPEN === "1" || process.env.COGNETIVY_SKIP_OPEN === "true") {
    console.log(`[SKIP_OPEN] ${url}`);
    return;
  }
  await open(url);
}

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
import {
  getCurrentVersionSync,
  readInstalledSkillsVersion,
  writeInstalledSkillsVersion,
  isNewerVersion,
} from "./skills-version.js";
import updateNotifier from "update-notifier";
import * as p from "@clack/prompts";
import { openCliDocsInBrowser } from "./cli-docs.js";
import { getCloudAppUrl, buildCloudOnboardingUrl } from "./onboarding-url.js";
import { parsePayload, formatFromFilePath, stringifyPayload, type PayloadFormat } from "./payload-parse.js";
import type { Command } from "commander";

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

/** Resolve default workflow ID for cloud: opts.workflow ?? env ?? index.cloud_current_workflow_id. */
async function resolveCloudWorkflowId(cwd: string, optsWorkflow: string | undefined): Promise<string | null> {
  if (optsWorkflow) return optsWorkflow;
  if (process.env.COGNETIVY_WORKFLOW_ID) return process.env.COGNETIVY_WORKFLOW_ID;
  const index = await readWorkflowIndexOptional(cwd);
  return index?.cloud_current_workflow_id ?? null;
}

/** Resolve whether to use cloud API: --local → false, --cloud → true, else preferred_mode or isCloudMode(). */
async function resolveUseCloud(
  cwd: string,
  opts: { cloud?: boolean; local?: boolean }
): Promise<boolean> {
  if (opts.local) return false;
  if (opts.cloud !== undefined && opts.cloud !== null) return opts.cloud;
  const index = await readWorkflowIndexOptional(cwd);
  if (index?.preferred_mode === "local") return false;
  return isCloudMode();
}

/** Extract all unique collection names from nodes (input_collections + output_collections). */
function getCollectionNamesFromNodes(nodes: unknown[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    if (n != null && typeof n === "object") {
      const node = n as { input_collections?: string[]; output_collections?: string[] };
      for (const c of node.input_collections ?? []) {
        if (typeof c === "string" && c) set.add(c);
      }
      for (const c of node.output_collections ?? []) {
        if (typeof c === "string" && c) set.add(c);
      }
    }
  }
  return Array.from(set);
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

/** Launch local Studio server and open in browser (for local .cognetivy workspace). Optionally deep-link to a workflow. */
async function launchLocalStudio(
  workspacePath: string,
  port: number = STUDIO_DEFAULT_PORT,
  workflowId?: string | null
): Promise<void> {
  await requireWorkspace(workspacePath);
  const { port: actualPort } = await startStudioServer(workspacePath, port, { apiOnly: false });
  const base = `http://127.0.0.1:${actualPort}`;
  const url = workflowId ? `${base}/workflow?workflow_id=${encodeURIComponent(workflowId)}` : base;
  await openUrl(url);
  console.log(`Local Studio at ${base} (workspace: ${workspacePath}). Press Ctrl+C to stop.`);
}

program
  .name("cognetivy")
  .description(
    "Cognetivy – workflows, runs, and collections. Default: open the app in your browser. Use `cognetivy auth status` to check API key; `cognetivy auth login` to sign in and get an API key."
  )
  .version(getCurrentVersionSync())
  .option("--interface", "Open CLI reference in browser (same as `cognetivy docs`)")
  .addHelpText(
    "after",
    `
Environment (cloud):
  COGNETIVY_API_KEY    API key for cloud run/event (create at app → Settings). When set, run/event use cloud by default.
  COGNETIVY_APP_URL    URL opened by default command (default: https://app.cognetivy.com).
  COGNETIVY_API_URL    Cloud API base URL (default: http://localhost:3000). Use for local backend or custom deployment.

Use \`cognetivy auth status\` to see current auth and URLs. Use \`--local\` on run/event to force local workspace when API key is set.
`
  );

const authCmd = program
  .command("auth")
  .description("Authentication and API key. Run with no subcommand to see: status, login, logout, whoami.");

authCmd
  .command("status")
  .description("Show whether cloud API key is set and which app/API URLs are used. Run with no options for human-readable output; use --json for machine-readable.")
  .option("--json", "Output machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    const apiKeySet = isCloudMode();
    const appUrl = getCloudAppUrl();
    const apiUrl = getCloudApiUrl();
    if (opts.json) {
      console.log(
        JSON.stringify({
          apiKeySet,
          appUrl,
          apiUrl,
        })
      );
      return;
    }
    console.log("Cognetivy auth status");
    console.log("─────────────────────");
    console.log(`  Cloud API key:  ${apiKeySet ? "set" : "not set"}`);
    console.log(`  App URL:        ${appUrl}`);
    console.log(`  Cloud API URL:  ${apiUrl}`);
    if (!apiKeySet) {
      console.log("");
      console.log("To use cloud run/event: run `cognetivy auth login` to sign in in the browser and save an API key.");
    } else {
      console.log("");
      console.log("To use in Cursor (skills + MCP): run `cognetivy install cursor` in your project.");
    }
  });

authCmd
  .command("login")
  .description("Open the app in browser to sign in and authorize the CLI. Saves API key locally; no other options required.")
  .action(async () => {
    const appUrl = getCloudAppUrl();
    console.log("Opening browser to sign in and authorize the CLI…");
    const result = await runLoginFlow({ appUrl });
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    if (!result.code) {
      console.error("No authorization code received.");
      process.exit(1);
    }
    const apiUrl = getCloudApiUrl();
    let apiKey: string;
    try {
      const res = await fetch(`${apiUrl}/auth/cli/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: result.code }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = (await res.json()) as { api_key?: string };
      apiKey = data?.api_key ?? "";
      if (!apiKey) throw new Error("No API key in response");
    } catch (err) {
      console.error("Failed to exchange code for API key:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
    writeStoredApiKey(apiKey);
    const keyPath = getApiKeyPath();
    console.log("");
    console.log("Logged in successfully. API key saved to:");
    console.log(`  ${keyPath}`);
    console.log("");
    console.log("Next:");
    console.log("  • Run `cognetivy auth whoami` to see your user.");
    console.log("  • Run `cognetivy` to open the app, or use `run start` / `run status` with cloud.");
    console.log("  • To use Cognetivy in Cursor (skills + MCP): run `cognetivy install cursor` in your project.");
  });

authCmd
  .command("logout")
  .description("Clear cloud authentication: remove stored API key. Run with no options; use --json for machine-readable result.")
  .option("--json", "Output machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    const removed = removeStoredApiKey();
    if (opts.json) {
      console.log(JSON.stringify({ storedKeyRemoved: removed, message: removed ? "Stored API key removed." : "No stored key found. Unset COGNETIVY_API_KEY in your shell if set." }));
      return;
    }
    if (removed) {
      console.log("Stored API key removed.");
    } else {
      console.log("No stored API key found.");
    }
    console.log("");
    console.log("If you set COGNETIVY_API_KEY in your shell or .env, unset it there too:");
    console.log("  unset COGNETIVY_API_KEY    # bash/zsh");
    console.log("");
    console.log("Run `cognetivy auth status` to confirm.");
  });

authCmd
  .command("whoami")
  .description("Show current cloud user and organizations. Requires COGNETIVY_API_KEY. Run with no options for human-readable; --json for machine-readable.")
  .option("--json", "Output machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    if (!isCloudMode()) {
      if (opts.json) {
        console.log(JSON.stringify({ authenticated: false, error: "COGNETIVY_API_KEY is not set" }));
      } else {
        console.error("Not authenticated. Set COGNETIVY_API_KEY or run `cognetivy auth login`.");
      }
      process.exit(1);
    }
    try {
      const user = await cloudGetCurrentUser();
      if (opts.json) {
        console.log(JSON.stringify({ authenticated: true, ...user }));
        return;
      }
      console.log("Current user");
      console.log("────────────");
      console.log(`  ID:    ${user.id}`);
      if (user.email) console.log(`  Email: ${user.email}`);
      if (user.displayName) console.log(`  Name:  ${user.displayName}`);
      if (user.organizations?.length) {
        console.log("  Organizations:");
        for (const item of user.organizations) {
          const org = item.organization ?? item;
          const id = org.id ?? (item as { id?: string }).id ?? "—";
          const name = org.name ?? (item as { name?: string }).name ?? id;
          console.log(`    - ${name} (${id})`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        console.log(JSON.stringify({ authenticated: false, error: message }));
      } else {
        console.error("Not authenticated or API key invalid:", message);
      }
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize .cognetivy workspace and run interactive skill installer (same as cognetivy install). Use --workspace-only to only create the workspace.")
  .option("--no-gitignore", "Do not add .gitignore snippet for runs/events/collections")
  .option("--force", "Re-init: overwrite workflow pointer and default version if present")
  .option("--workspace-only", "Only create .cognetivy workspace; do not prompt for skill installation")
  .action(async (opts: { gitignore?: boolean; force?: boolean; workspaceOnly?: boolean }) => {
    const cwd = process.cwd();
    const noGitignore = opts.gitignore === false;
    if (opts.workspaceOnly) {
      await ensureWorkspace(cwd, { force: opts.force, noGitignore });
      console.log("Initialized cognetivy workspace at .cognetivy/");
      return;
    }
    const { runInstallTUI } = await import("./install-tui.js");
    await runInstallTUI({ cwd, force: opts.force, init: true, noGitignore });
    await launchLocalStudio(cwd);
  });

program
  .command("mode")
  .description("Set or show default mode: Cloud (app + API) or Local (this machine only). Use with no options to switch interactively; --show for current state; --select for non-interactive.")
  .option("--show", "Show current mode and workspace type (no prompt)")
  .option("--json", "Output machine-readable JSON")
  .option("--select <mode>", "Set mode without prompt (cloud | local). For scripts and tests.")
  .action(async (opts: { show?: boolean; json?: boolean; select?: string }) => {
    const cwd = process.cwd();
    const showOnly = opts.show === true || opts.json === true;
    const selectMode = opts.select === "cloud" || opts.select === "local" ? opts.select : null;

    if (!(await workspaceExists(cwd))) {
      if (showOnly) {
        if (opts.json) {
          console.log(JSON.stringify({ preferred_mode: null, workspace: "none", cloud_authenticated: await isCloudAuthenticated() }));
        } else {
          console.log("No workspace. Run `cognetivy init` or `cognetivy mode` to create one and set mode.");
        }
        return;
      }
      await ensureMinimalWorkspace(cwd);
    }

    const index = await readWorkflowIndexOptional(cwd);
    const preferredMode = index?.preferred_mode ?? null;
    const cloudAuthenticated = await isCloudAuthenticated();
    const minimal = await isWorkspaceMinimal(cwd);

    if (showOnly) {
      if (opts.json) {
        console.log(
          JSON.stringify({
            preferred_mode: preferredMode,
            workspace: minimal ? "minimal" : "full",
            cloud_authenticated: cloudAuthenticated,
          })
        );
      } else {
        const modeLabel =
          preferredMode === "local" ? "Local" : preferredMode === "cloud" ? "Cloud" : isCloudMode() ? "Cloud (API key set)" : "Local (no API key)";
        console.log(`Preferred mode: ${preferredMode ?? "not set"}`);
        console.log(`Workspace: ${minimal ? "minimal (cloud-only)" : "full"}`);
        console.log(`Cloud authenticated: ${cloudAuthenticated ? "yes" : "no"}`);
        console.log(`Effective default: ${modeLabel}`);
      }
      return;
    }

    if (selectMode) {
      const base: WorkflowIndexRecord = index ?? { current_workflow_id: "wf_default", workflows: [] };
      await writeWorkflowIndex({ ...base, preferred_mode: selectMode }, cwd);
      if (selectMode === "local" && minimal) {
        await ensureWorkspace(cwd, { force: false });
      }
      console.log(`Default mode set to ${selectMode === "cloud" ? "Cloud" : "Local"}.`);
      return;
    }

    if (!process.stdin.isTTY) {
      console.error("Interactive terminal required. Use `cognetivy mode --show`, `cognetivy mode --json`, or `cognetivy mode --select <local|cloud>`.");
      process.exit(1);
    }

    const currentLabel =
      preferredMode === "local"
        ? "Local"
        : preferredMode === "cloud"
          ? cloudAuthenticated
            ? "Cloud (signed in)"
            : "Cloud (preferred, not signed in)"
          : isCloudMode()
            ? "Cloud (API key set)"
            : "Local";
    p.intro("cognetivy mode");
    p.note(`Current: ${currentLabel}. Workspace: ${minimal ? "minimal" : "full"}.`, "Current state");

    const choice = await p.select({
      message: "Use Cloud or Local?",
      options: [
        { value: "cloud" as const, label: "Cloud", hint: "Sign in and sync with app.cognetivy.com" },
        { value: "local" as const, label: "Local", hint: "Workflows and runs on this machine only" },
      ],
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const selected = choice as "cloud" | "local";
    const base: WorkflowIndexRecord = index ?? { current_workflow_id: "wf_default", workflows: [] };
    await writeWorkflowIndex({ ...base, preferred_mode: selected }, cwd);

    if (selected === "local" && minimal) {
      await ensureWorkspace(cwd, { force: false });
      p.note("Full local workspace created (default workflow added).", "Local mode");
    }
    if (selected === "cloud" && !cloudAuthenticated) {
      p.note("Run `cognetivy auth login` to sign in to the cloud.", "Tip");
    }

    p.outro(`Default mode set to ${selected === "cloud" ? "Cloud" : "Local"}.`);
  });

const workflowCmd = program
  .command("workflow")
  .description("Workflow operations: search, create, get, set, versions, templates. Run with no subcommand to see all.");

function filterWorkflowsByQuery<T extends { name?: string; description?: string }>(
  items: T[],
  q: string
): T[] {
  const term = q.trim().toLowerCase();
  if (!term) return items;
  return items.filter((w) => {
    const name = (w.name ?? "").toLowerCase();
    const desc = (w.description ?? "").toLowerCase();
    return name.includes(term) || desc.includes(term);
  });
}

workflowCmd
  .command("list")
  .description("List workflows (id, name, description only). From cloud when authenticated, else local .cognetivy. Add --q to filter by name/description.")
  .option("--q <query>", "Filter by name or description (search)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { q?: string; cloud?: boolean; local?: boolean }) => {
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const orgId = await resolveCloudOrganizationId();
      const list = await cloudListWorkflows(orgId, opts.q);
      const out = list.map((w) => ({ id: w.id, name: w.name, description: w.description ?? undefined }));
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const workflows = await listWorkflows(cwd);
    let out = workflows.map((w) => ({ id: w.workflow_id, name: w.name, description: w.description }));
    if (opts.q) out = filterWorkflowsByQuery(out, opts.q);
    console.log(JSON.stringify(out, null, 2));
  });

workflowCmd
  .command("search")
  .description("Search workflows by name or description (id, name, description only). Use only when the user asks to list or search workflows.")
  .option("--q <query>", "Search term (optional; omit to list all)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { q?: string; cloud?: boolean; local?: boolean }) => {
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const orgId = await resolveCloudOrganizationId();
      const list = await cloudListWorkflows(orgId, opts.q);
      const out = list.map((w) => ({ id: w.id, name: w.name, description: w.description ?? undefined }));
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const workflows = await listWorkflows(cwd);
    let out = workflows.map((w) => ({ id: w.workflow_id, name: w.name, description: w.description }));
    if (opts.q) out = filterWorkflowsByQuery(out, opts.q);
    console.log(JSON.stringify(out, null, 2));
  });

workflowCmd
  .command("create")
  .description("Create a new workflow. Use --name for an empty workflow; --file <path> or stdin (omit both --name and --file, pipe payload) for one-call create with name/description/nodes/kinds.")
  .option("--name <string>", "Workflow name (required if no --file and not reading from stdin; overrides file/stdin name if both)")
  .option("--file <path>", "Path to JSON with name, description?, nodes?, kinds?; omit to read from stdin when --name not set)")
  .option("--id <string>", "Workflow id (local only; default: generated)")
  .option("--description <string>", "Workflow description (overrides file/stdin if both)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(
    async (opts: {
      name?: string;
      file?: string;
      id?: string;
      description?: string;
      cloud?: boolean;
      local?: boolean;
    }) => {
      const useCloud = await resolveUseCloud(process.cwd(), opts);
      const cwd = process.cwd();

      let raw: string | undefined;
      if (opts.file) {
        raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
      } else if (!opts.name) {
        raw = await readPayloadFromFileOrStdin(undefined, cwd);
      }
      if (raw !== undefined) {
        const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
        const data = parsePayload(raw, format) as {
          name?: string;
          description?: string;
          nodes?: unknown[];
          kinds?: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }>;
        };
        const name = opts.name ?? data.name;
        if (!name || typeof name !== "string") {
          console.error("Error: Workflow name is required. Provide --name or include 'name' in the --file JSON.");
          process.exit(1);
        }
        const description = opts.description ?? data.description;
        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        const kinds = data.kinds && typeof data.kinds === "object" ? data.kinds : undefined;

        const collectionNames = getCollectionNamesFromNodes(nodes);
        if (collectionNames.length > 0) {
          const missing = collectionNames.filter((name) => !kinds || !(name in kinds) || kinds[name] == null);
          if (missing.length > 0) {
            console.error(
              `Error: Collection schema (kinds) is required for all collections referenced in nodes. Missing kinds for: ${missing.join(", ")}. Add a "kinds" object to the JSON with an entry for each (name, description, item_schema).`
            );
            process.exit(1);
          }
        }

        if (useCloud) {
          const orgId = await resolveCloudOrganizationId();
          const result = await cloudCreateWorkflowFull({
            organizationId: orgId,
            name,
            description,
            nodes: nodes.length > 0 ? nodes : undefined,
            kinds,
          });
          console.log(result.id);
          if (result.versionId) {
            console.error(`Version: ${result.versionId}`);
          }
          await ensureWorkspace(cwd);
          const index = await readWorkflowIndex(cwd);
          await writeWorkflowIndex({ ...index, cloud_current_workflow_id: result.id }, cwd);
          return;
        }

        await requireWorkspace(cwd);
        const id = opts.id ?? generateId("wf");
        const now = new Date().toISOString();
        const wf: WorkflowRecord = {
          workflow_id: id,
          name,
          description,
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
            nodes: nodes as WorkflowNode[],
          },
          cwd
        );
        if (kinds && Object.keys(kinds).length > 0) {
          const merged: CollectionSchemaConfig = { workflow_id: id, kinds: {} };
          for (const [k, v] of Object.entries(kinds)) {
            merged.kinds[k] = mergeKindTemplate(k, v);
          }
          await writeCollectionSchema(id, merged, cwd);
        } else {
          const { createDefaultCollectionSchema } = await import("./default-collection-schema.js");
          await writeCollectionSchema(id, createDefaultCollectionSchema(id), cwd);
        }
        const index = await readWorkflowIndex(cwd);
        const next = {
          ...index,
          workflows: [...(index.workflows ?? []), { workflow_id: id, name: wf.name, description: wf.description, current_version_id: wf.current_version_id }],
        };
        await writeWorkflowIndex(next, cwd);
        console.log(id);
        return;
      }

      const name = opts.name;
      if (!name) {
        console.error("Error: --name <string> is required when not using --file or stdin.");
        process.exit(1);
      }
      if (useCloud) {
        const orgId = await resolveCloudOrganizationId();
        const workflow = await cloudCreateWorkflow({
          organizationId: orgId,
          name,
          description: opts.description,
        });
        await cloudCreateWorkflowVersion(workflow.id, []);
        console.log(workflow.id);
        return;
      }
      await requireWorkspace(cwd);
      const id = opts.id ?? generateId("wf");
      const now = new Date().toISOString();
      const wf: WorkflowRecord = {
        workflow_id: id,
        name,
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
    }
  );

workflowCmd
  .command("select")
  .description("Select current workflow (updates workflows/index.json). Use --workflow <id>; add --cloud to set default for cloud. For agents, prefer passing --workflow explicitly on each command.")
  .requiredOption("--workflow <workflow_id>", "Workflow ID")
  .option("--cloud", "Set as default workflow for cloud (persisted in index; workflow must exist on server)")
  .option("--local", "Select from local workspace only (default if neither --cloud nor --local)")
  .action(async (opts: { workflow: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const useCloud = opts.cloud === true;
    if (useCloud) {
      try {
        await cloudGetWorkflow(opts.workflow);
      } catch {
        console.error(`Error: workflow "${opts.workflow}" not found on server.`);
        process.exit(1);
      }
      await ensureWorkspace(cwd);
      const index = await readWorkflowIndex(cwd);
      await writeWorkflowIndex({ ...index, cloud_current_workflow_id: opts.workflow }, cwd);
      console.log(opts.workflow);
      return;
    }
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
  .description("Print a workflow version (nodes, etc.). Default: --workflow/--version omitted uses current workflow and latest version. Use --output-format yaml for fewer tokens.")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--version <version_id>", "Version ID (default: latest; cloud uses version uuid)")
  .option("--output-format <format>", "Output format: json or yaml", "json")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { workflow?: string; version?: string; outputFormat?: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
      if (!workflowId) {
        console.error("Error: In cloud mode --workflow <id>, COGNETIVY_WORKFLOW_ID, or run `cognetivy workflow select --workflow <id> --cloud` is required.");
        process.exit(1);
      }
      let versionId = opts.version;
      if (!versionId) {
        const versions = await cloudGetWorkflowVersions(workflowId);
        versionId = versions[0]?.id;
        if (!versionId) {
          console.error("No versions found for workflow.");
          process.exit(1);
        }
      }
      const version = await cloudGetWorkflowVersion(workflowId, versionId);
      const outFormat = opts.outputFormat === "yaml" ? "yaml" : "json";
      console.log(stringifyPayload(version, outFormat));
      return;
    }
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const wf = await readWorkflowRecord(workflowId, cwd);
    const versionId = opts.version ?? wf.current_version_id;
    const version = await readWorkflowVersionRecord(workflowId, versionId, cwd);
    const outFormat = opts.outputFormat === "yaml" ? "yaml" : "json";
    console.log(stringifyPayload(version, outFormat));
  });

workflowCmd
  .command("versions")
  .description("List versions for a workflow. Default: --workflow omitted uses current workflow (index or COGNETIVY_WORKFLOW_ID). Output: version ids (and metadata in cloud).")
  .option("--workflow <workflow_id>", "Workflow ID (default: current or COGNETIVY_WORKFLOW_ID)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { workflow?: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
      if (!workflowId) {
        console.error("Error: In cloud mode --workflow <id>, COGNETIVY_WORKFLOW_ID, or run `cognetivy workflow select --workflow <id> --cloud` is required.");
        process.exit(1);
      }
      const versions = await cloudGetWorkflowVersions(workflowId);
      console.log(JSON.stringify(versions, null, 2));
      return;
    }
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const ids = await listWorkflowVersionIds(workflowId, cwd);
    console.log(JSON.stringify(ids, null, 2));
  });

workflowCmd
  .command("templates")
  .description("List or pick workflow templates. With TTY: interactive picker then apply. Use --list to print templates as JSON (no picker).")
  .option("--list", "Print templates JSON instead of interactive picker")
  .action(async (opts: { list?: boolean }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);

    if (opts.list || !process.stdin.isTTY) {
      console.log(JSON.stringify(listWorkflowTemplates(), null, 2));
      return;
    }

    const templates = listWorkflowTemplatesForPicker();
    const picked = await p.select({
      message: "Pick a workflow template",
      options: templates.map((t) => ({
        value: t.id,
        label: t.name,
        hint: `${t.category} · ${t.node_count} nodes`,
      })),
    });

    if (p.isCancel(picked)) {
      p.cancel("Template selection cancelled.");
      process.exit(0);
    }

    const templateId = picked as string;
    const result = await applyWorkflowTemplateToWorkspace({ cwd, templateId });
    p.note(
      `Applied template \"${result.template.name}\"\nWorkflow: ${result.workflow.workflow_id}\nNow current: ${result.workflow.workflow_id}`,
      "Template applied"
    );
    console.log(
      JSON.stringify(
        {
          template_id: result.template.id,
          workflow_id: result.workflow.workflow_id,
          current_workflow_id: result.workflow.workflow_id,
          version_id: result.version.version_id,
        },
        null,
        2
      )
    );
    const studioUrl = `http://127.0.0.1:${STUDIO_DEFAULT_PORT}`;
    openUrl(studioUrl).catch(() => {});
  });

workflowCmd
  .command("template")
  .description("Print a built-in workflow template JSON by id. Requires --id <template_id>; run workflow templates --list to see IDs.")
  .requiredOption("--id <template_id>", "Template ID (see `cognetivy workflow templates`)")
  .action(async (opts: { id: string }) => {
    const template = materializeWorkflowTemplate(opts.id);
    if (!template) {
      console.error(`Error: Unknown template \"${opts.id}\". Run \`cognetivy workflow templates\` to list IDs.`);
      process.exit(1);
    }
    console.log(JSON.stringify(template, null, 2));
  });

workflowCmd
  .command("apply-template")
  .description("Apply a built-in template: creates a new workflow and sets it current. Use --id to skip picker; omit for interactive template choice.")
  .option("--id <template_id>", "Template ID (omit for interactive picker)")
  .option("--workflow <workflow_id>", "Workflow ID to create (default: wf_<template_id>)")
  .option("--name <string>", "Optional workflow name override")
  .option("--description <string>", "Optional workflow description override")
  .action(async (opts: { id?: string; workflow?: string; name?: string; description?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);

    let templateId = opts.id;
    if (!templateId) {
      if (!process.stdin.isTTY) {
        console.error("Error: --id is required in non-interactive mode.");
        process.exit(1);
      }
      const templates = listWorkflowTemplatesForPicker();
      const picked = await p.select({
        message: "Pick a workflow template",
        options: templates.map((t) => ({
          value: t.id,
          label: t.name,
          hint: `${t.category} · ${t.node_count} nodes`,
        })),
      });
      if (p.isCancel(picked)) {
        p.cancel("Template apply cancelled.");
        process.exit(0);
      }
      templateId = picked as string;
    }

    try {
      const result = await applyWorkflowTemplateToWorkspace({
        cwd,
        templateId,
        workflowId: opts.workflow,
        workflowName: opts.name,
        workflowDescription: opts.description,
      });
      console.log(
        JSON.stringify(
          {
            template_id: result.template.id,
            workflow_id: result.workflow.workflow_id,
            current_workflow_id: result.workflow.workflow_id,
            version_id: result.version.version_id,
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error(err instanceof Error ? `Error: ${err.message}` : String(err));
      process.exit(1);
    }
  });

workflowCmd
  .command("set")
  .description("Set workflow version from file or stdin (creates new version). Use --file <path> or omit to read from stdin. Default --workflow uses current. Cloud when authenticated.")
  .option("--file <path>", "Path to workflow JSON file (must contain 'nodes' array); omit to read from stdin")
  .option("--workflow <workflow_id>", "Workflow ID (default: current or COGNETIVY_WORKFLOW_ID)")
  .option("--name <string>", "Optional version name (local only)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { file?: string; workflow?: string; name?: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const raw = opts.file
      ? await fs.readFile(path.resolve(cwd, opts.file), "utf-8")
      : await readPayloadFromFileOrStdin(undefined, cwd);
    const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
    const data = parsePayload(raw, format) as { nodes?: unknown[] };

    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
      if (!workflowId) {
        console.error("Error: In cloud mode --workflow <id>, COGNETIVY_WORKFLOW_ID, or run `cognetivy workflow select --workflow <id> --cloud` is required.");
        process.exit(1);
      }
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const version = await cloudCreateWorkflowVersion(workflowId, nodes);
      console.log(version.id);
      return;
    }

    await requireWorkspace(cwd);
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
  .description("Run lifecycle: start, status, step, complete. Run with no subcommand to see all. Every response includes COGNETIVY_NEXT_STEP when a node is in progress.");
runCmd
  .command("start")
  .description("Start a new run. Requires --input <path>, --input -, or --input-inline <json>; and --name. Prints run_id and COGNETIVY_NEXT_STEP. Default --workflow/--version use current.")
  .option("--input <path>", "Path to JSON file with run input, or '-' to read from stdin")
  .option("--input-inline <json>", "Run input as JSON string (alternative to --input; no file or stdin needed)")
  .option("--name <string>", "Human-readable name for the run (e.g. 'Q1 ideas exploration')")
  .option("--by <string>", "Actor (e.g. agent:cursor); defaults to config or 'cli'")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--version <version_id>", "Workflow version ID (default: workflow.current_version_id)")
  .option("--cloud", "Use Cognetivy cloud API (default when COGNETIVY_API_KEY is set; see `cognetivy auth status`)")
  .option("--local", "Use local .cognetivy workspace (overrides API key)")
  .action(async (opts: { input?: string; inputInline?: string; name?: string; by?: string; workflow?: string; version?: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    if (!opts.input && !opts.inputInline) {
      console.error("Error: Provide --input <path>, --input -, or --input-inline <json> for run input.");
      process.exit(1);
    }
    let inputRaw: string;
    if (opts.inputInline) {
      inputRaw = opts.inputInline;
    } else if (opts.input === "-" || opts.input === "/dev/stdin") {
      inputRaw = await readPayloadFromFileOrStdin(undefined, cwd);
    } else {
      try {
        inputRaw = await fs.readFile(path.resolve(cwd, opts.input!), "utf-8");
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : "";
        if (code === "ENOENT") {
          console.error(`Error: Input file not found: ${path.resolve(cwd, opts.input!)}`);
          process.exit(1);
        }
        throw err;
      }
    }
    const input = parsePayload(inputRaw, "auto") as Record<string, unknown>;
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
      if (!workflowId) {
        console.error("Error: In cloud mode --workflow <id>, COGNETIVY_WORKFLOW_ID, or run `cognetivy workflow select --workflow <id> --cloud` is required.");
        process.exit(1);
      }
      try {
        const result = await cloudCreateRun({
          workflowId,
          workflowVersionId: opts.version,
          name: opts.name,
          input,
        });
        console.log(result.run_id);
        console.log(`COGNETIVY_RUN_ID=${result.run_id}`);
        const next = result.next_step;
        const action = mapCloudActionToLocal(next.action);
        console.log(formatNextStepLine(result.run_id, "RUNNING", { ...next, action } as NextStep, result.current_node_id, result.current_node_ids));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const wf = await readWorkflowRecord(workflowId, cwd);
    const versionId = opts.version ?? wf.current_version_id;
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
    const runInputPayload =
      typeof (input as Record<string, unknown>).name === "string" && (input as Record<string, unknown>).name !== ""
        ? input
        : { name: "Run input", ...input };
    await appendCollection(
      runId,
      "run_input",
      runInputPayload as Record<string, unknown>,
      { id: "run_input", created_by_node_id: systemNodeId, created_by_node_result_id: systemNodeResultId },
      cwd
    );
    console.log(runId);
    console.log(`COGNETIVY_RUN_ID=${runId}`);
    let { next_step, current_node_id, current_node_ids } = await getNextStep(runId, cwd);
    if (next_step.action === "run_node" && next_step.node_id) {
      await appendEventLine(runId, { ts: now, type: "step_started", by, data: { step: next_step.node_id, step_id: next_step.node_id } }, cwd);
      await writeNodeResult(runId, next_step.node_id, {
        node_result_id: generateId("node_result"),
        run_id: runId,
        workflow_id: workflowId,
        workflow_version_id: versionId,
        node_id: next_step.node_id,
        status: NodeResultStatus.Started,
        started_at: now,
      }, cwd);
      const after = await getNextStep(runId, cwd);
      next_step = after.next_step;
      current_node_id = after.current_node_id;
      current_node_ids = after.current_node_ids;
    }
    console.log(formatNextStepLine(runId, "running", next_step, current_node_id, current_node_ids));
  });
runCmd
  .command("complete")
  .description("Mark a run as completed (appends run_completed and persists status). Requires --run <id>. Run this after all nodes are done.")
  .requiredOption("--run <run_id>", "Run ID to mark complete")
  .action(async (opts: { run: string }) => {
    const cwd = process.cwd();
    const useCloud = isCloudMode();
    if (useCloud) {
      try {
        await cloudAppendEvents(opts.run, {
          events: [{ type: "run_completed", by: await resolveBy(cwd), data: {} }],
        });
        const run = await cloudGetRun(opts.run);
        console.log(`Run "${opts.run}" marked as completed.`);
        console.log(formatNextStepLine(opts.run, run.status as "completed", { action: "done", hint: "Run finished." }));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found.`);
      process.exit(1);
    }
    const by = await resolveBy(cwd);
    const now = new Date().toISOString();
    await appendEventLine(
      opts.run,
      { ts: now, type: "run_completed", by, data: {} },
      cwd
    );
    await updateRunFile(opts.run, { status: "completed" }, cwd);
    console.log(`Run "${opts.run}" marked as completed.`);
    console.log(formatNextStepLine(opts.run, "completed", { action: "done", hint: "Run finished." }));
  });
runCmd
  .command("status")
  .description("Show run metadata, node completion status, and collection counts. Requires --run <id>. Use --json for machine-readable output including next_step.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--json", "Output as JSON")
  .option("--cloud", "Use Cognetivy cloud API (default when COGNETIVY_API_KEY is set; see `cognetivy auth status`)")
  .option("--local", "Use local .cognetivy workspace (overrides API key)")
  .action(async (opts: { run: string; json?: boolean; cloud?: boolean; local?: boolean }) => {
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      try {
        const [run, nextData] = await Promise.all([cloudGetRun(opts.run), cloudGetNext(opts.run)]);
        const next = nextData.next_step;
        const action = mapCloudActionToLocal(next.action);
        const next_step = { ...next, action };
        if (opts.json) {
          console.log(JSON.stringify({ run: { id: run.id, status: run.status, workflowId: run.workflowId }, next_step, current_node_id: nextData.current_node_id, current_node_ids: nextData.current_node_ids }, null, 2));
          return;
        }
        console.log("Run:", run.id, run.status, `(${run.workflowId})`);
        if (nextData.current_node_ids?.length) console.log("Current nodes (in progress):", nextData.current_node_ids.join(", "));
        else if (nextData.current_node_id) console.log("Current node (in progress):", nextData.current_node_id);
        console.log(formatNextStepLine(run.id, run.status, next_step as NextStep, nextData.current_node_id, nextData.current_node_ids));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
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
          status: nr?.status ?? "-",
          completed_at: nr?.completed_at,
        });
      }
    }
    // Include __system__ if we have a result for it but it's not in workflow nodes
    if (nodeResultByNodeId.has("__system__") && version?.nodes && !version.nodes.some((n) => n.id === "__system__")) {
      const nr = nodeResultByNodeId.get("__system__")!;
      nodesList.unshift({ node_id: "__system__", status: nr.status, completed_at: nr.completed_at });
    }
    const { next_step, current_node_id, current_node_ids } = await getNextStep(opts.run, cwd);
    const runSummary = {
      run_id: run.run_id,
      status: run.status,
      name: run.name,
      workflow_id: run.workflow_id,
      workflow_version_id: run.workflow_version_id,
      ...(current_node_id !== undefined && { current_node_id, current_node_status: "in_progress" }),
      ...(current_node_ids !== undefined && current_node_ids.length > 0 && { current_node_ids }),
    };
    if (opts.json) {
      console.log(JSON.stringify({ run: runSummary, nodes: nodesList, collections, next_step, ...(current_node_id !== undefined && { current_node_id }), ...(current_node_ids !== undefined && current_node_ids.length > 0 && { current_node_ids }) }, null, 2));
      return;
    }
    console.log("Run:", run.run_id, run.status, run.name ? `"${run.name}"` : "", `(${run.workflow_id} @ ${run.workflow_version_id})`);
    if (current_node_ids !== undefined && current_node_ids.length > 0) {
      console.log("Current nodes (in progress):", current_node_ids.join(", "));
    } else if (current_node_id !== undefined) {
      console.log("Current node (in progress):", current_node_id);
    }
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
    console.log(formatNextStepLine(run.run_id, run.status, next_step, current_node_id, current_node_ids));
  });
runCmd
  .command("step")
  .description("Advance run: run with only --run <id> to start the next node; add --node <id> and --collection-kind with --collection-file <path> (or stdin) to complete a node. Prefer --collection-file to avoid shell prompts in agents. Prints COGNETIVY_NEXT_STEP.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--node <node_id>", "Node ID (required when completing a node with payload)")
  .option("--collection-kind <kind>", "Collection kind when completing node (payload from --collection-file or stdin)")
  .option("--collection-file <path>", "Path to JSON/YAML payload file (omit to read from stdin; prefer this in agents to avoid heredocs)")
  .option("--collection-mode <mode>", "set (array) or append (single object); default: infer", "infer")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .option("--cloud", "Use Cognetivy cloud API (default when COGNETIVY_API_KEY is set; see `cognetivy auth status`)")
  .option("--local", "Use local .cognetivy workspace (overrides API key)")
  .action(
    async (opts: {
      run: string;
      node?: string;
      collectionKind?: string;
      collectionFile?: string;
      collectionMode?: string;
      by?: string;
      cloud?: boolean;
      local?: boolean;
    }) => {
      const useCloud = await resolveUseCloud(process.cwd(), opts);
      if (useCloud) {
        try {
          if (opts.node !== undefined) {
            const body: { output?: string; collectionKind?: string; collectionPayload?: unknown; writes?: Array<{ kind: string; item_ids: string[] }> } = {};
            if (opts.collectionKind) {
              const raw = await readPayloadFromFileOrStdin(opts.collectionFile, process.cwd());
              body.collectionKind = opts.collectionKind;
              body.collectionPayload = parsePayload(raw, "auto") as unknown;
            }
            const result = await cloudCompleteNode(opts.run, opts.node, body);
            const next = result.next_step;
            const action = mapCloudActionToLocal(next.action);
            console.log(formatNextStepLine(opts.run, "running", { ...next, action } as NextStep, result.current_node_id, result.current_node_ids));
          } else {
            const nextData = await cloudGetNext(opts.run);
            const next = nextData.next_step;
            const action = mapCloudActionToLocal(next.action);
            if (action === "run_node" && next.node_id) {
              const result = await cloudStartNode(opts.run, next.node_id);
              const rNext = result.next_step;
              const rAction = mapCloudActionToLocal(rNext.action);
              console.log(formatNextStepLine(opts.run, "running", { ...rNext, action: rAction } as NextStep, result.current_node_id, result.current_node_ids));
            } else if (action === "run_nodes_parallel" && next.runnable_node_ids?.length) {
              for (const nodeId of next.runnable_node_ids) {
                await cloudStartNode(opts.run, nodeId);
              }
              const after = await cloudGetNext(opts.run);
              const afterAction = mapCloudActionToLocal(after.next_step.action);
              console.log(
                formatNextStepLine(opts.run, "running", { ...after.next_step, action: afterAction } as NextStep, after.current_node_id, after.current_node_ids)
              );
            } else {
              console.log(formatNextStepLine(opts.run, "running", { ...next, action } as NextStep, nextData.current_node_id, nextData.current_node_ids));
            }
          }
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
        return;
      }
      const cwd = process.cwd();
      const exists = await runExists(opts.run, cwd);
      if (!exists) {
        console.error(`Error: Run "${opts.run}" not found.`);
        process.exit(1);
      }
      const run = await readRunFile(opts.run, cwd);
      if (run.status !== "running") {
        console.error(`Error: Run is not running (status: ${run.status}).`);
        process.exit(1);
      }
      const by = opts.by ?? (await resolveBy(cwd));
      const now = new Date().toISOString();

      if (opts.node !== undefined) {
        const nodeId = opts.node;
        const existingResult = await readNodeResult(opts.run, nodeId, cwd);
        if (!opts.collectionKind && !existingResult) {
          await appendEventLine(opts.run, { ts: now, type: "step_started", by, data: { step: nodeId, step_id: nodeId } }, cwd);
          await writeNodeResult(opts.run, nodeId, {
            node_result_id: generateId("node_result"),
            run_id: opts.run,
            workflow_id: run.workflow_id,
            workflow_version_id: run.workflow_version_id,
            node_id: nodeId,
            status: NodeResultStatus.Started,
            started_at: now,
          }, cwd);
          const { next_step: afterStep, current_node_id: afterCurrent, current_node_ids: afterIds } = await getNextStep(opts.run, cwd);
          const runAfter = await readRunFile(opts.run, cwd);
          console.log(formatNextStepLine(runAfter.run_id, runAfter.status, afterStep, afterCurrent, afterIds));
          return;
        }
        if (!existingResult || existingResult.status !== "started") {
          const startedAt = new Date().toISOString();
          await appendEventLine(opts.run, { ts: startedAt, type: "step_started", by, data: { step: nodeId, step_id: nodeId } }, cwd);
          await writeNodeResult(opts.run, nodeId, {
            node_result_id: generateId("node_result"),
            run_id: opts.run,
            workflow_id: run.workflow_id,
            workflow_version_id: run.workflow_version_id,
            node_id: nodeId,
            status: NodeResultStatus.Started,
            started_at: startedAt,
          }, cwd);
        }
        const nodeResultId = generateId("node_result");
        if (opts.collectionKind) {
          const raw = await readPayloadFromFileOrStdin(opts.collectionFile, cwd);
          const payload = parsePayload(raw, "auto") as unknown;
          const mode = opts.collectionMode === "set" || opts.collectionMode === "append" ? opts.collectionMode : Array.isArray(payload) ? "set" : "append";
          const writes: { kind: string; item_ids: string[] }[] = [];
          if (mode === "set") {
            const payloads = (payload as Array<Record<string, unknown>>).map((p, i) => ({
              ...p,
              id: (p as { id?: string }).id ?? `${opts.collectionKind}_${i}`,
            }));
            await writeCollections(opts.run, opts.collectionKind, payloads, { created_by_node_id: nodeId, created_by_node_result_id: nodeResultId }, cwd);
            writes.push({ kind: opts.collectionKind, item_ids: payloads.map((p) => (p as { id: string }).id) });
          } else {
            const item = await appendCollection(opts.run, opts.collectionKind, payload as Record<string, unknown>, { created_by_node_id: nodeId, created_by_node_result_id: nodeResultId }, cwd);
            writes.push({ kind: opts.collectionKind, item_ids: [item.id] });
          }
          const result: NodeResultRecord = {
            node_result_id: nodeResultId,
            run_id: opts.run,
            workflow_id: run.workflow_id,
            workflow_version_id: run.workflow_version_id,
            node_id: nodeId,
            status: NodeResultStatus.Completed,
            started_at: now,
            completed_at: now,
            writes,
          };
          await writeNodeResult(opts.run, nodeId, result, cwd);
          await appendEventLine(opts.run, { ts: now, type: "step_completed", by, data: { step: nodeId, step_id: nodeId } }, cwd);
        } else {
          await writeNodeResult(opts.run, nodeId, {
            node_result_id: nodeResultId,
            run_id: opts.run,
            workflow_id: run.workflow_id,
            workflow_version_id: run.workflow_version_id,
            node_id: nodeId,
            status: NodeResultStatus.Completed,
            started_at: now,
            completed_at: now,
          }, cwd);
          await appendEventLine(opts.run, { ts: now, type: "step_completed", by, data: { step: nodeId, step_id: nodeId } }, cwd);
        }
      } else {
        const { next_step: ns } = await getNextStep(opts.run, cwd);

        if (ns.action === "run_nodes_parallel" && ns.runnable_node_ids?.length) {
          for (const nodeId of ns.runnable_node_ids) {
            const existing = await readNodeResult(opts.run, nodeId, cwd);
            if (!existing || existing.status !== NodeResultStatus.Started) {
              await appendEventLine(opts.run, { ts: now, type: "step_started", by, data: { step: nodeId, step_id: nodeId } }, cwd);
              await writeNodeResult(opts.run, nodeId, {
                node_result_id: generateId("node_result"),
                run_id: opts.run,
                workflow_id: run.workflow_id,
                workflow_version_id: run.workflow_version_id,
                node_id: nodeId,
                status: NodeResultStatus.Started,
                started_at: now,
              }, cwd);
            }
          }
          const runAfter = await readRunFile(opts.run, cwd);
          console.log(formatNextStepLine(runAfter.run_id, runAfter.status, ns, undefined, ns.runnable_node_ids));
          return;
        }

        if (ns.action === "run_node" && ns.node_id) {
          const nodeResultId = generateId("node_result");
          await appendEventLine(opts.run, { ts: now, type: "step_started", by, data: { step: ns.node_id, step_id: ns.node_id } }, cwd);
          await writeNodeResult(opts.run, ns.node_id, {
            node_result_id: nodeResultId,
            run_id: opts.run,
            workflow_id: run.workflow_id,
            workflow_version_id: run.workflow_version_id,
            node_id: ns.node_id,
            status: NodeResultStatus.Started,
            started_at: now,
          }, cwd);
        }
      }
      let { next_step, current_node_id, current_node_ids } = await getNextStep(opts.run, cwd);
      if (next_step.action === "run_node" && next_step.node_id) {
        await appendEventLine(opts.run, { ts: now, type: "step_started", by, data: { step: next_step.node_id, step_id: next_step.node_id } }, cwd);
        await writeNodeResult(opts.run, next_step.node_id, {
          node_result_id: generateId("node_result"),
          run_id: opts.run,
          workflow_id: run.workflow_id,
          workflow_version_id: run.workflow_version_id,
          node_id: next_step.node_id,
          status: NodeResultStatus.Started,
          started_at: now,
        }, cwd);
        const after = await getNextStep(opts.run, cwd);
        next_step = after.next_step;
        current_node_id = after.current_node_id;
        current_node_ids = after.current_node_ids;
      }
      const runAfter = await readRunFile(opts.run, cwd);
      console.log(formatNextStepLine(runAfter.run_id, runAfter.status, next_step, current_node_id, current_node_ids));
    }
  );
runCmd
  .command("set-name")
  .description("Set or update the human-readable name for an existing run. Requires --run <id> and --name <string>.")
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
  .description("Event log operations (low-level). Run with no subcommand to see: append. Prefer run complete for ending runs.");
eventCmd
  .command("append")
  .description("Append one event to run's log. Omit --file to read JSON from stdin. For run_completed, prefer 'cognetivy run complete --run <id>' which does both.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--file <path>", "Path to JSON file (omit to read event from stdin)")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .option("--cloud", "Use Cognetivy cloud API (default when COGNETIVY_API_KEY is set; see `cognetivy auth status`)")
  .option("--local", "Use local .cognetivy workspace (overrides API key)")
  .action(async (opts: { run: string; file?: string; by?: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
    const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
    const data = parsePayload(raw, format) as Record<string, unknown>;
    const by = opts.by ?? (await resolveBy(cwd));
    const now = new Date().toISOString();
    const event: EventPayload = {
      ts: (data.ts as string) ?? now,
      type: (data.type as EventPayload["type"]) ?? "artifact",
      by: (data.by as string) ?? by,
      data: (data.data as Record<string, unknown>) ?? (data as Record<string, unknown>),
    };
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      try {
        const result = await cloudAppendEvents(opts.run, {
          events: [{ type: event.type, by: event.by, data: event.data }],
        });
        console.log(`Appended ${result.appended} event(s).`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
    const exists = await runExists(opts.run, cwd);
    if (!exists) {
      console.error(`Error: Run "${opts.run}" not found. Run \`cognetivy run start\` first.`);
      process.exit(1);
    }
    await appendEventLine(opts.run, event, cwd);
    if (event.type === "run_completed") {
      await updateRunFile(opts.run, { status: "completed" }, cwd);
    }
    console.log("Appended event.");
  });

const collectionSchemaCmd = program
  .command("collection-schema")
  .description("Collection schema (workflow-scoped; kinds and item_schema). Used when creating/editing workflows; run get/set with --workflow.");
collectionSchemaCmd
  .command("get")
  .description("Print collection schema JSON for a workflow. Use --run to resolve workflow from a run; --kind to print only one kind.")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .option("--run <run_id>", "Run ID (resolve workflow from this run; overrides --workflow)")
  .option("--kind <kind>", "Print only this collection kind's schema")
  .action(async (opts: { workflow?: string; run?: string; kind?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    let workflowId: string;
    if (opts.run) {
      const run = await readRunFile(opts.run, cwd);
      workflowId = run.workflow_id;
    } else {
      const index = await readWorkflowIndex(cwd);
      workflowId = opts.workflow ?? index.current_workflow_id ?? "";
    }
    if (!workflowId) {
      console.error("Error: specify --workflow <id>, --run <run_id>, or set current workflow (workflows/index.json).");
      process.exit(1);
    }
    const schema = await readCollectionSchema(workflowId, cwd);
    if (opts.kind) {
      const kindSchema = schema.kinds?.[opts.kind];
      if (kindSchema == null) {
        console.error(`Error: kind "${opts.kind}" not found in schema.`);
        process.exit(1);
      }
      console.log(JSON.stringify(kindSchema, null, 2));
    } else {
      console.log(JSON.stringify(schema, null, 2));
    }
  });
collectionSchemaCmd
  .command("set")
  .description("Set collection schema from JSON file. Requires --file <path>. Default --workflow uses current.")
  .requiredOption("--file <path>", "Path to collection-schema JSON file")
  .option("--workflow <workflow_id>", "Workflow ID (default: current from workflows/index.json)")
  .action(async (opts: { file: string; workflow?: string }) => {
    const cwd = process.cwd();
    await requireWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    const workflowId = opts.workflow ?? index.current_workflow_id;
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const schema = parsePayload(raw, formatFromFilePath(opts.file)) as CollectionSchemaConfig;
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
  .description("Structured collections per run (schema-backed). Run with no subcommand to see: list, get, set, append. Used by run step when completing nodes.");
collectionCmd
  .command("list")
  .description("List collection kinds that have data for a run. Requires --run <id>. Cloud when authenticated.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { run: string; cloud?: boolean; local?: boolean }) => {
    const cwd = process.cwd();
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      try {
        const result = await cloudListCollectionKinds(opts.run);
        console.log(JSON.stringify(result.kinds, null, 2));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
    const kinds = await listCollectionKindsForRun(opts.run, cwd);
    console.log(JSON.stringify(kinds, null, 2));
  });
collectionCmd
  .command("get")
  .description("Get all items of a collection kind for a run. Requires --run <id> and --kind or --collection (e.g. run_input, sources).")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--kind <kind>", "Collection kind (e.g. sources, ideas, run_input)")
  .option("--collection <kind>", "Collection kind (alias for --kind)")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { run: string; kind?: string; collection?: string; cloud?: boolean; local?: boolean }) => {
    const kind = opts.kind ?? opts.collection;
    if (!kind) {
      console.error("Error: required option --kind <kind> or --collection <kind> not specified.");
      process.exit(1);
    }
    const cwd = process.cwd();
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      try {
        const result = await cloudGetCollectionItems(opts.run, kind);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
    const store = await readCollections(opts.run, kind, cwd);
    console.log(JSON.stringify(store, null, 2));
  });
collectionCmd
  .command("set")
  .description("Replace all items of a kind for a run. Requires --run, --kind, --node, --node-result. Omit --file to read from stdin.")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .option("--file <path>", "Path to JSON file (omit to read array from stdin)")
  .requiredOption("--node <node_id>", "Node id that created these items")
  .requiredOption("--node-result <node_result_id>", "Node result id that created these items")
  .action(async (opts: { run: string; kind: string; file?: string; node: string; nodeResult: string }) => {
    const cwd = process.cwd();
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
    const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
    const payloads = parsePayload(raw, format) as Array<Record<string, unknown>>;
    if (!Array.isArray(payloads)) {
      console.error("Error: file must contain a JSON or YAML array of collection items.");
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
  .description("Append one collection item to a run's kind. Requires --run, --kind, --node, --node-result. Omit --file to read from stdin.")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--kind <kind>", "Collection kind")
  .option("--file <path>", "Path to JSON file (omit to read payload from stdin)")
  .requiredOption("--node <node_id>", "Node id that created this item")
  .requiredOption("--node-result <node_result_id>", "Node result id that created this item")
  .option("--id <string>", "Optional collection id")
  .action(async (opts: { run: string; kind: string; file?: string; id?: string; node: string; nodeResult: string }) => {
    const cwd = process.cwd();
    const raw = await readPayloadFromFileOrStdin(opts.file, cwd);
    const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
    const payload = parsePayload(raw, format) as Record<string, unknown>;
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
  .description("Node results per run (stored snapshots of node outputs). Low-level; prefer run step / node complete for agent flow.");

nodeResultCmd
  .command("list")
  .description("List node results for a run. Requires --run <id>.")
  .requiredOption("--run <run_id>", "Run ID")
  .action(async (opts: { run: string }) => {
    const cwd = process.cwd();
    const results = await listNodeResults(opts.run, cwd);
    console.log(JSON.stringify(results, null, 2));
  });

nodeResultCmd
  .command("get")
  .description("Get node result for a node in a run. Requires --run <id> and --node <node_id>.")
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
  .description("Create or replace a node result for a node in a run. Requires --run, --node, --status; optional --output/--output-file.")
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
  .description("Node lifecycle: start (step_started + node result id) and complete (result + optional collection + step_completed). Prefer run step for advancing runs.");

nodeCmd
  .command("start")
  .description("Mark a node as started (append step_started, create node result). Requires --run and --node. Cloud: use when COGNETIVY_API_KEY is set.")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Workflow node ID")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .option("--cloud", "Use Cognetivy cloud API (default when API key is set)")
  .option("--local", "Use local .cognetivy workspace only")
  .action(async (opts: { run: string; node: string; by?: string; cloud?: boolean; local?: boolean }) => {
    const useCloud = await resolveUseCloud(process.cwd(), opts);
    if (useCloud) {
      try {
        await cloudStartNode(opts.run, opts.node);
        console.log(`Node "${opts.node}" started.`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }
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
  .description("Complete a node: create result, optionally write collection (--collection-kind; omit --collection-file to read from stdin), append step_completed. Requires --run, --node, --status.")
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
        const payload = parsePayload(raw, opts.collectionFile ? formatFromFilePath(opts.collectionFile) : "auto") as unknown;
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
  .command("templates")
  .description("List workflow templates (--list for JSON) or interactively pick one to install and set as current workflow. Run with no options in TTY for picker.")
  .option("--list", "Print templates as JSON (no picker)")
  .action(async (opts: { list?: boolean }) => {
    const cwd = process.cwd();
    if (opts.list || !process.stdin.isTTY) {
      console.log(JSON.stringify(listWorkflowTemplates(), null, 2));
      return;
    }
    await requireWorkspace(cwd);
    const templates = listWorkflowTemplatesForPicker();
    const picked = await p.select({
      message: "Pick a workflow template to install and set as current",
      options: templates.map((t) => ({
        value: t.id,
        label: t.name,
        hint: `${t.category} · ${t.node_count} nodes`,
      })),
    });
    if (p.isCancel(picked)) {
      p.cancel("Template selection cancelled.");
      process.exit(0);
    }
    const templateId = picked as string;
    try {
      const result = await applyWorkflowTemplateToWorkspace({ cwd, templateId });
      p.note(
        `Applied template \"${result.template.name}\"\nWorkflow: ${result.workflow.workflow_id}\nNow current: ${result.workflow.workflow_id}`,
        "Template applied"
      );
      console.log(
        JSON.stringify(
          {
            template_id: result.template.id,
            workflow_id: result.workflow.workflow_id,
            current_workflow_id: result.workflow.workflow_id,
            version_id: result.version.version_id,
          },
          null,
          2
        )
      );
      const studioUrl = `http://127.0.0.1:${STUDIO_DEFAULT_PORT}`;
      openUrl(studioUrl).catch(() => {});
    } catch (err) {
      console.error(err instanceof Error ? `Error: ${err.message}` : String(err));
      process.exit(1);
    }
  });

program
  .command("install [target]")
  .description(
    "Set up cognetivy in this project (if needed) and install skills. Target: claude | cursor | agents | gemini | qwen | factory | opencode | openclaw | workspace | all (default: all). Use with no target or --interactive for TUI."
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
      agents: "agents",
      factory: "factory",
      gemini: "gemini",
      openclaw: "openclaw",
      opencode: "opencode",
      qwen: "qwen",
      workspace: "workspace",
      all: "all",
    };
    const resolved = targetMap[normalized];
    if (!resolved) {
      console.error(
        "Target must be: claude, cursor, agents, gemini, qwen, factory, opencode, openclaw, workspace, or all."
      );
      process.exit(1);
    }
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const targetsToInstall: SkillInstallTarget[] =
      resolved === "all"
        ? (["agent", "agents", "cursor", "factory", "gemini", "openclaw", "opencode", "qwen", "workspace"] as SkillInstallTarget[])
        : [resolved];
    const optsCommon = { force: opts.force, cwd, config: skillsConfig };
    try {
      for (const internalTarget of targetsToInstall) {
        const { results } = await installSkillsFromDirectory(cwd, internalTarget, optsCommon);
        const label = targetToLabel(internalTarget);
        for (const r of results) {
          console.log(`[${label}] Installed to ${r.path}`);
        }
      }
      for (const internalTarget of targetsToInstall) {
        const cognetivyPath = await installCognetivySkill(internalTarget, cwd, skillsConfig);
        const label = targetToLabel(internalTarget);
        console.log(`[${label}] Cognetivy skill at ${cognetivyPath}`);
      }
      await writeInstalledSkillsVersion(cwd, getCurrentVersionSync());
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function targetToLabel(target: SkillInstallTarget): string {
  switch (target) {
    case "agent":
      return "claude";
    case "agents":
      return "agents";
    case "cursor":
      return "cursor";
    case "factory":
      return "factory";
    case "gemini":
      return "gemini";
    case "openclaw":
      return "openclaw";
    case "opencode":
      return "opencode";
    case "qwen":
      return "qwen";
    case "workspace":
      return "workspace";
    default:
      return String(target);
  }
}

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
  .description("Agent skills (SKILL.md): list, install, update. Run with no subcommand to see list, info, check, paths, install, update.");
skillsCmd
  .command("list")
  .description("List skills from configured sources. Optional --source, --eligible. Output: name, description, path, source.")
  .option(
    "--source <source>",
    "Filter by source: agent, agents, cursor, factory, gemini, openclaw, opencode, qwen, workspace"
  )
  .option("--eligible", "Only list skills that pass validation")
  .action(async (opts: { source?: string; eligible?: boolean }) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const defaultListSources: SkillSource[] = [
      "agent",
      "agents",
      "cursor",
      "factory",
      "gemini",
      "openclaw",
      "opencode",
      "qwen",
      "workspace",
    ];
    const sources = opts.source
      ? ([opts.source] as SkillSource[])
      : skillsConfig.sources ?? defaultListSources;
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
    const sources: SkillSource[] = skillsConfig.sources ?? [
      "agent",
      "agents",
      "cursor",
      "factory",
      "gemini",
      "openclaw",
      "opencode",
      "qwen",
      "workspace",
    ];
    const out: Record<string, string[]> = {};
    for (const source of sources) {
      out[source] = await getSkillDirectories(source, cwd, skillsConfig);
    }
    console.log(JSON.stringify(out, null, 2));
  });
skillsCmd
  .command("install [source]")
  .description("Install a skill from current directory (or path/URL) into project or target (default: workspace = .cognetivy/skills)")
  .option(
    "--target <target>",
    "Install target: agent, agents, cursor, factory, gemini, openclaw, opencode, qwen, workspace (default: workspace)"
  )
  .option("--force", "Overwrite if skill already exists")
  .action(async (source: string | undefined, opts: { target?: string; force?: boolean }) => {
    const cwd = process.cwd();
    const config = await getMergedConfig(cwd);
    const skillsConfig = getSkillsConfigFromMerged(config);
    const target = (opts.target ?? skillsConfig.default_install_target ?? "workspace") as SkillInstallTarget;
    const validTargets: SkillInstallTarget[] = [
      "agent",
      "agents",
      "cursor",
      "factory",
      "gemini",
      "openclaw",
      "opencode",
      "qwen",
      "workspace",
    ];
    if (!validTargets.includes(target)) {
      console.error(
        "--target must be agent, agents, cursor, factory, gemini, openclaw, opencode, qwen, or workspace."
      );
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
  .option(
    "--target <target>",
    "Target: agent, agents, cursor, factory, gemini, openclaw, opencode, qwen, workspace"
  )
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
  .description("Start MCP server over stdio for Cursor/agents. Optional --workspace <path>; default is cwd. No subcommands.")
  .option("--workspace <path>", "Workspace directory (default: cwd)")
  .action(async (opts: { workspace?: string }) => {
    const workspacePath = opts.workspace ? path.resolve(process.cwd(), opts.workspace) : process.cwd();
    await runMcpServer(workspacePath);
  });

program
  .command("studio")
  .description("Open read-only Studio (workflow, runs, events, collections) in browser. Optional --workspace, --port, --api-only.")
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
      await openUrl(url);
      console.log(`Studio at ${url} (workspace: ${workspacePath}). Press Ctrl+C to stop.`);
    } else {
      console.log(`Studio API at http://127.0.0.1:${actualPort} (workspace: ${workspacePath}).`);
      console.log(`Run the app in dev: cd studio && npm run dev, then open http://localhost:5173`);
      console.log("Press Ctrl+C to stop.");
    }
  });

const DEFAULT_BEHAVIOR_DESCRIPTION =
  "Guided onboarding: choose cloud or local, sign in if cloud, install or update platform skills (Cursor, Claude Code, etc.), ensure at least one workflow (template picker if needed), then opens the Cognetivy app in your browser.";

program
  .command("docs")
  .description("Open CLI reference (all commands and options) in browser. No arguments.")
  .action(async function (this: Command) {
    const root = this.parent ?? program;
    await openCliDocsInBrowser(root, { defaultBehavior: DEFAULT_BEHAVIOR_DESCRIPTION });
  });

let didRunUpdateNotifierThisProcess = false;

/** Show update-notifier when a newer CLI version exists. Does not prompt for skill reinstall. */
function runUpdateNotifier(): void {
  if (didRunUpdateNotifierThisProcess) return;
  if (!process.stdin.isTTY) return;
  if (process.argv.includes("--version") || process.argv.includes("-V")) return;
  didRunUpdateNotifierThisProcess = true;
  const pkg = { name: "cognetivy", version: getCurrentVersionSync() };
  const notifier = updateNotifier({ pkg });
  try {
    notifier.fetchInfo().then((info) => {
      if (info && isNewerVersion(info.latest, info.current)) {
        notifier.update = info;
        notifier.notify({ defer: false });
      }
    }).catch(() => {});
  } catch {
    // ignore
  }
}

type OnboardingMode = "cloud" | "local";

/** Guided onboarding when user runs `cognetivy` with no args: cloud/local choice, auth, skills, workflow, then open app. */
async function runDefaultOnboardingFlow(cwd: string): Promise<void> {
  runUpdateNotifier();

  const authenticated = await isCloudAuthenticated();
  let mode: OnboardingMode;

  if (!authenticated) {
    const choice = await p.select({
      message: "Use cloud (Cognetivy app + API) or local (this machine only)?",
      options: [
        { value: "cloud" as OnboardingMode, label: "Cloud", hint: "Sign in and sync with app.cognetivy.com" },
        { value: "local" as OnboardingMode, label: "Local", hint: "Workflows and runs on this machine only" },
      ],
    });
    if (p.isCancel(choice)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    mode = choice as OnboardingMode;

    if (mode === "cloud") {
      const appUrl = getCloudAppUrl();
      console.log("Opening browser to sign in…");
      const result = await runLoginFlow({ appUrl });
      if (result.error) {
        console.error(result.error);
        process.exit(1);
      }
      if (!result.code) {
        console.error("No authorization code received.");
        process.exit(1);
      }
      const apiUrl = getCloudApiUrl();
      const res = await fetch(`${apiUrl}/auth/cli/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: result.code }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(text || res.statusText);
        process.exit(1);
      }
      const data = (await res.json()) as { api_key?: string };
      const apiKey = data?.api_key ?? "";
      if (!apiKey) {
        console.error("No API key in response.");
        process.exit(1);
      }
      writeStoredApiKey(apiKey);
      console.log("Logged in. API key saved.");
    }
  } else {
    const index = await readWorkflowIndexOptional(cwd);
    mode = index?.preferred_mode === "local" ? "local" : "cloud";
  }

  const { runInstallTUI } = await import("./install-tui.js");
  const installedVersion = await readInstalledSkillsVersion(cwd);
  const currentVersion = getCurrentVersionSync();

  if (installedVersion == null) {
    await runInstallTUI({ cwd, init: true, onboardingMode: mode });
  } else if (isNewerVersion(currentVersion, installedVersion)) {
    const shouldUpdate = await p.confirm({
      message: `Skills were installed with v${installedVersion}; you're on v${currentVersion}. Update skill files? (Your workflows and runs in .cognetivy are not touched.)`,
      initialValue: true,
    });
    if (p.isCancel(shouldUpdate)) {
      p.cancel("Skipped skill update.");
    } else if (shouldUpdate) {
      await runInstallTUI({ cwd, force: true, init: false });
    }
  }

  if (mode === "cloud") {
    await ensureMinimalWorkspace(cwd);
  } else {
    await ensureWorkspace(cwd, { force: false });
  }
  const index = await readWorkflowIndexOptional(cwd);
  if (index && index.preferred_mode !== mode) {
    await writeWorkflowIndex({ ...index, preferred_mode: mode }, cwd);
  }

  let hasWorkflow = false;
  let cloudWorkflowList: { id: string }[] = [];
  if (mode === "cloud") {
    try {
      const orgId = await resolveCloudOrganizationId();
      const list = await cloudListWorkflows(orgId);
      cloudWorkflowList = list;
      hasWorkflow = list.length >= 1 || (index?.cloud_current_workflow_id != null);
    } catch {
      hasWorkflow = false;
    }
  } else {
    hasWorkflow = (index?.workflows?.length ?? 0) >= 1;
  }

  let localCurrentWorkflowId: string | null = null;
  let cloudCurrentWorkflowId: string | null = null;
  if (!hasWorkflow) {
    const templates = listWorkflowTemplatesForPicker();
    const templateSelection = await p.select({
      message: "Pick a workflow template to get started",
      options: templates.map((t) => ({ value: t.id, label: t.name, hint: `${t.category} · ${t.node_count} nodes` })),
    });
    if (p.isCancel(templateSelection)) {
      p.cancel("Skipped template.");
    } else {
      const templateId = templateSelection as string;
      try {
        if (mode === "cloud") {
          const orgId = await resolveCloudOrganizationId();
          const result = await applyWorkflowTemplateToCloud({ organizationId: orgId, templateId, cwd });
          cloudCurrentWorkflowId = result.workflowId;
          p.note(`Created workflow "${result.template.name}" (${result.workflowId}) in cloud.`, "Template applied");
        } else {
          const result = await applyWorkflowTemplateToWorkspace({ cwd, templateId });
          localCurrentWorkflowId = result.workflow.workflow_id;
          p.note(`Applied template "${result.template.name}". Workflow: ${result.workflow.workflow_id}`, "Template applied");
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  } else if (mode === "cloud" && cloudCurrentWorkflowId == null) {
    cloudCurrentWorkflowId =
      index?.cloud_current_workflow_id ?? cloudWorkflowList[0]?.id ?? null;
  }

  if (mode === "local") {
    const workflowIdToOpen =
      localCurrentWorkflowId ??
      (await readWorkflowIndexOptional(cwd).then((idx) => idx?.current_workflow_id ?? null));
    await launchLocalStudio(cwd, undefined, workflowIdToOpen);
  } else {
    const appUrl = getCloudAppUrl();
    const url = buildCloudOnboardingUrl(appUrl, cloudCurrentWorkflowId);
    await openUrl(url);
    console.log(`Opened ${url}`);
  }
}

program.action(async () => {
  const opts = program.opts() as { interface?: boolean };
  if (opts.interface) {
    await openCliDocsInBrowser(program, { defaultBehavior: DEFAULT_BEHAVIOR_DESCRIPTION });
    return;
  }
  const cwd = process.cwd();
  if (!process.stdin.isTTY) {
    const appUrl = getCloudAppUrl();
    await openUrl(appUrl);
    console.log(`Opened ${appUrl}`);
    return;
  }
  await runDefaultOnboardingFlow(cwd);
});

program.parse();
