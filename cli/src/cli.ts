#!/usr/bin/env node

import { program } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import {
  ensureMinimalWorkspace,
  workspaceExists,
  readWorkflowIndex,
  readWorkflowIndexOptional,
  writeWorkflowIndex,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { formatNextStepLine, type NextStep } from "./run-engine.js";
import { mergeKindTemplate } from "./kind-templates.js";
import { listWorkflowTemplates, listWorkflowTemplatesForPicker, materializeWorkflowTemplate } from "./workflow-templates.js";
import { applyWorkflowTemplateToCloud } from "./workflow-template-apply.js";
import type { CollectionSchemaConfig, WorkflowIndexRecord, EventPayload } from "./models.js";
import { runMcpServer } from "./mcp.js";
import {
  cloudCreateRun,
  cloudGetRun,
  cloudGetNext,
  cloudStartNode,
  cloudCompleteNode,
  cloudAppendEvents,
  mapCloudActionToCliAction,
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
  cloudSetCollectionSchema,
  cloudGetCollectionSchema,
  type CloudCompleteNodeBody,
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

const ansi = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  reset: "\x1b[0m",
};

function isColorfulTerminal(): boolean {
  return Boolean(process.stdout.isTTY && process.env.TERM && process.env.TERM !== "dumb");
}

/** Print engaging "opened URL" message with optional workflow CTA. */
function printOpenedUrlMessage(url: string, options: { workflow?: boolean } = {}): void {
  const { workflow = false } = options;
  const color = isColorfulTerminal();
  const b = color ? ansi.bold : "";
  const d = color ? ansi.dim : "";
  const c = color ? ansi.cyan : "";
  const g = color ? ansi.green : "";
  const r = color ? ansi.reset : "";

  if (workflow) {
    console.log("");
    console.log(`${g}\u2713${r} ${b}Opened your workflow in the browser${r}`);
    console.log(`  ${c}${url}${r}`);
    console.log("");
    console.log(`${d}Next:${r} ${b}Ask your agent to run this workflow${r} - e.g. in Cursor, say 'run my Competitor analysis workflow' or use the Cognetivy MCP.`);
    console.log("");
  } else {
    console.log("");
    console.log(`${g}\u2713${r} ${b}Opened Cognetivy${r}`);
    console.log(`  ${c}${url}${r}`);
    console.log("");
    console.log(`${d}Tip:${r} ${b}Ask your agent to run workflows${r} from Cognetivy (e.g. via Cursor + Cognetivy MCP).`);
    console.log("");
  }
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
  getCognetivySkillInstallPaths,
  updateSkill,
  updateAllSkills,
  type SkillInstallTarget,
  type SkillSource,
} from "./skills.js";
import {
  getCurrentVersionSync,
  readInstalledSkillsVersion,
  isNewerVersion,
} from "./skills-version.js";
import updateNotifier from "update-notifier";
import * as p from "@clack/prompts";
import { openCliDocsInBrowser } from "./cli-docs.js";
import { getCloudAppUrl, buildCloudOnboardingUrl } from "./onboarding-url.js";
import { runLocalStudioForeground, resolveLocalStudioBrowserBase } from "./local-studio-entry.js";
import { createLocalStudioServer, type LocalStudioServerHandle } from "./local-server/local-studio-server.js";
import { resolveLocalStudioStaticRoot, localStudioBundleHasCliAuth } from "./local-server/static-root.js";
import { parsePayload, formatFromFilePath, stringifyPayload, type PayloadFormat } from "./payload-parse.js";
import type { Command } from "commander";

const DEFAULT_BY = "cli";

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

async function requireCloudApiKey(): Promise<void> {
  if (!isCloudMode()) {
    console.error("Error: Cloud API key required. Run `cognetivy auth login` or set COGNETIVY_API_KEY.");
    process.exit(1);
  }
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

const DEV_API_URL = "http://localhost:3000";
/** Local cloud-studio dev server; used for auth/login when --dev. */
const DEV_APP_URL = "http://localhost:5174";

program
  .name("cognetivy")
  .description(
    "Cognetivy – workflows, runs, and collections. Default: start the local studio backend (browser + executor). Use `cognetivy auth status` to check API key; `cognetivy auth login` to sign in and get an API key."
  )
  .version(getCurrentVersionSync())
  .option("--interface", "Open CLI reference in browser (same as `cognetivy docs`)")
  .option(
    "--dev",
    "Point at local backend: API http://localhost:3000 and app http://localhost:5174. Opens the Vite dev studio (same port) with ?session=…; run `npm run dev` in cloud-studio first. Proxy /ws and /api/local to the CLI (see cloud-studio vite.config). Set COGNETIVY_USE_BUNDLED_STUDIO=1 to open the bundled UI on port 3848 instead."
  )
  .option(
    "--api-url <url>",
    "Backend API base for this run only (overrides COGNETIVY_API_URL). Local studio CLI auth uses this URL. Example: --api-url http://localhost:3000"
  )
  .addHelpText(
    "after",
    `
Environment (cloud):
  COGNETIVY_API_KEY    API key for cloud run/event (create at app → Settings). When set, run/event use cloud by default.
  COGNETIVY_APP_URL    URL opened by default command (default: https://alpha.cognetivy.com).
  COGNETIVY_API_URL    Backend API base (default: https://bm.cognetivy.com, or http://localhost:3000 when NODE_ENV=development / COGNETIVY_DEV=1). Local studio injects this into the page so /auth/cli/authorize matches the CLI token exchange.

Local studio (default command):
  COGNETIVY_LOCAL_PORT   Bind port for local HTTP + WebSocket (default: 3848).
  COGNETIVY_LOCAL_STUDIO_URL  Open this origin with ?session=… (e.g. http://localhost:5174 for Vite HMR). Vite proxies /ws and /api/local to the CLI. With cognetivy --dev, defaults to http://localhost:5174 unless set; COGNETIVY_USE_BUNDLED_STUDIO=1 opens the bundled UI on COGNETIVY_LOCAL_PORT instead.
  COGNETIVY_OPEN_APP     Set to 0 or false to skip opening the browser.
  COGNETIVY_EXECUTOR_LOG       Set to 0 or false to hide executor status lines on stderr (run phases, nodes, HITL; not agent tool output).
  COGNETIVY_WORKFLOW_GENERATE_DEBUG  Set to 1 — stderr diagnostics for “Generate workflow” (marker counts, combinedLog, parse/validation, cloud create timing).
  COGNETIVY_WORKFLOW_GENERATE_HEARTBEAT_SEC  Interval (seconds) for “agent still running …” lines while Generate workflow waits on the child (default 20; min 5).
  COGNETIVY_CLAUDE_STREAM_JSON_IDLE_END_MS  Claude stream-json: ms of stdout silence after a COGNETIVY_* payload marker before closing stdin (default 6000) if the CLI never sends a terminal result line.
  COGNETIVY_AGENT_COMBINED_LOG_MAX_CHARS  Max characters of merged agent stdout kept for marker parsing (default 1500000); when trimming, prefers retaining text from the last COGNETIVY_COLLECTION_JSON= / COGNETIVY_WORKFLOW_FILE_JSON=.
  COGNETIVY_PARALLEL_ISOLATION copy (default) or none — per parallel PROMPT node, copy workspace into .cognetivy/exec-islands/<run>/<node>/ (skips node_modules, .git, dist, …) or share the parent cwd.

Examples: \`cognetivy --dev\` (local API), \`cognetivy --api-url http://127.0.0.1:3000\`. Use \`cognetivy auth status\` to see resolved URLs.
`
  );

program.hook("preAction", () => {
  const opts = program.opts() as { dev?: boolean; apiUrl?: string };
  const trimmedApi = typeof opts.apiUrl === "string" ? opts.apiUrl.trim() : "";
  if (trimmedApi) {
    process.env.COGNETIVY_API_URL = trimmedApi.replace(/\/$/, "");
  } else if (opts.dev) {
    process.env.COGNETIVY_API_URL = DEV_API_URL;
    process.env.COGNETIVY_APP_URL = DEV_APP_URL;
    const useBundledStudio =
      process.env.COGNETIVY_USE_BUNDLED_STUDIO === "1" ||
      process.env.COGNETIVY_USE_BUNDLED_STUDIO === "true";
    const existingStudioUrl = (process.env.COGNETIVY_LOCAL_STUDIO_URL ?? "").trim();
    if (!useBundledStudio && !existingStudioUrl) {
      process.env.COGNETIVY_LOCAL_STUDIO_URL = DEV_APP_URL;
    }
  }
});

const authCmd = program
  .command("auth")
  .description("Authentication and API key. Run with no subcommand to see: status, login, logout, whoami.")
  .addHelpText(
    "after",
    `
For a local Nest API, put global options first:  cognetivy --dev auth login
or:  cognetivy --api-url http://localhost:3000 auth login
`
  );

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
  .description(
    "Open the app (or local studio) to sign in and authorize the CLI. Saves API key locally. Use cognetivy --dev auth login to use http://localhost:3000."
  )
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
  .option("--force", "Passed to skill install when using the interactive installer (overwrite existing skills)")
  .option("--workspace-only", "Only create .cognetivy workspace; do not prompt for skill installation")
  .action(async (opts: { gitignore?: boolean; force?: boolean; workspaceOnly?: boolean }) => {
    const cwd = process.cwd();
    const noGitignore = opts.gitignore === false;
    if (opts.workspaceOnly) {
      await ensureMinimalWorkspace(cwd, { noGitignore });
      console.log("Initialized cognetivy workspace at .cognetivy/");
      return;
    }
    const { runInstallTUI } = await import("./install-tui.js");
    await runInstallTUI({ cwd, force: opts.force, init: true, noGitignore });
    const appUrl = getCloudAppUrl();
    await openUrl(appUrl);
    printOpenedUrlMessage(appUrl, { workflow: false });
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
  .description("List workflows (id, name, description only) from cloud. Add --q to filter by name/description.")
  .option("--q <query>", "Filter by name or description (search)")
  .action(async (opts: { q?: string }) => {
    await requireCloudApiKey();
    const orgId = await resolveCloudOrganizationId();
    const list = await cloudListWorkflows(orgId, opts.q);
    const out = list.map((w) => ({ id: w.id, name: w.name, description: w.description ?? undefined }));
    console.log(JSON.stringify(out, null, 2));
  });

workflowCmd
  .command("search")
  .description("Search workflows by name or description (id, name, description only). Use only when the user asks to list or search workflows.")
  .option("--q <query>", "Search term (optional; omit to list all)")
  .action(async (opts: { q?: string }) => {
    await requireCloudApiKey();
    const orgId = await resolveCloudOrganizationId();
    const list = await cloudListWorkflows(orgId, opts.q);
    const out = list.map((w) => ({ id: w.id, name: w.name, description: w.description ?? undefined }));
    console.log(JSON.stringify(out, null, 2));
  });

workflowCmd
  .command("create")
  .description("Create a new workflow in cloud. Use --name for an empty workflow; --file <path> or stdin for one-call create with name/description/nodes/kinds.")
  .option("--name <string>", "Workflow name (required if no --file and not reading from stdin; overrides file/stdin name if both)")
  .option("--file <path>", "Path to JSON with name, description?, nodes?, kinds?; omit to read from stdin when --name not set)")
  .option("--description <string>", "Workflow description (overrides file/stdin if both)")
  .action(async (opts: { name?: string; file?: string; description?: string }) => {
    await requireCloudApiKey();
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
      await ensureMinimalWorkspace(cwd);
      const index = await readWorkflowIndex(cwd);
      await writeWorkflowIndex({ ...index, cloud_current_workflow_id: result.id }, cwd);
      return;
    }

    const name = opts.name;
    if (!name) {
      console.error("Error: --name <string> is required when not using --file or stdin.");
      process.exit(1);
    }
    const orgId = await resolveCloudOrganizationId();
    const workflow = await cloudCreateWorkflow({
      organizationId: orgId,
      name,
      description: opts.description,
    });
    await cloudCreateWorkflowVersion(workflow.id, []);
    console.log(workflow.id);
  });

workflowCmd
  .command("select")
  .description("Set default cloud workflow id in .cognetivy/workflows/index.json. Workflow must exist on the server.")
  .requiredOption("--workflow <workflow_id>", "Workflow ID")
  .action(async (opts: { workflow: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    try {
      await cloudGetWorkflow(opts.workflow);
    } catch {
      console.error(`Error: workflow "${opts.workflow}" not found on server.`);
      process.exit(1);
    }
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndex(cwd);
    await writeWorkflowIndex({ ...index, cloud_current_workflow_id: opts.workflow }, cwd);
    console.log(opts.workflow);
  });

workflowCmd
  .command("get")
  .description("Print a workflow version (nodes, etc.). Default: --workflow/--version omitted uses current workflow and latest version. Use --output-format yaml for fewer tokens.")
  .option("--workflow <workflow_id>", "Workflow ID (default: cloud_current_workflow_id or COGNETIVY_WORKFLOW_ID)")
  .option("--version <version_id>", "Version ID (default: latest)")
  .option("--output-format <format>", "Output format: json or yaml", "json")
  .action(async (opts: { workflow?: string; version?: string; outputFormat?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
    if (!workflowId) {
      console.error("Error: --workflow <id>, COGNETIVY_WORKFLOW_ID, or `cognetivy workflow select --workflow <id>` is required.");
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
  });

workflowCmd
  .command("versions")
  .description("List versions for a workflow. Default: --workflow omitted uses current workflow (index or COGNETIVY_WORKFLOW_ID).")
  .option("--workflow <workflow_id>", "Workflow ID (default: current or COGNETIVY_WORKFLOW_ID)")
  .action(async (opts: { workflow?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
    if (!workflowId) {
      console.error("Error: --workflow <id>, COGNETIVY_WORKFLOW_ID, or `cognetivy workflow select --workflow <id>` is required.");
      process.exit(1);
    }
    const versions = await cloudGetWorkflowVersions(workflowId);
    console.log(JSON.stringify(versions, null, 2));
  });

workflowCmd
  .command("templates")
  .description("List or pick workflow templates. With TTY: interactive picker then create workflow in cloud. Use --list to print templates as JSON (no picker).")
  .option("--list", "Print templates JSON instead of interactive picker")
  .action(async (opts: { list?: boolean }) => {
    const cwd = process.cwd();
    await ensureMinimalWorkspace(cwd);

    if (opts.list || !process.stdin.isTTY) {
      console.log(JSON.stringify(listWorkflowTemplates(), null, 2));
      return;
    }

    await requireCloudApiKey();
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
    const orgId = await resolveCloudOrganizationId();
    const result = await applyWorkflowTemplateToCloud({ organizationId: orgId, templateId, cwd });
    p.note(`Created workflow "${result.template.name}" (${result.workflowId}) in cloud.`, "Template applied");
    console.log(
      JSON.stringify(
        {
          template_id: result.template.id,
          workflow_id: result.workflowId,
          cloud_current_workflow_id: result.workflowId,
          version_id: result.versionId,
        },
        null,
        2
      )
    );
    const appUrl = getCloudAppUrl();
    await openUrl(appUrl);
    printOpenedUrlMessage(appUrl, { workflow: true });
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
  .description("Create a workflow in cloud from a built-in template. Use --id to skip picker; omit for interactive template choice.")
  .option("--id <template_id>", "Template ID (omit for interactive picker)")
  .option("--name <string>", "Optional workflow name override")
  .option("--description <string>", "Optional workflow description override")
  .action(async (opts: { id?: string; name?: string; description?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    await ensureMinimalWorkspace(cwd);

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
      const orgId = await resolveCloudOrganizationId();
      const result = await applyWorkflowTemplateToCloud({
        organizationId: orgId,
        templateId,
        cwd,
        workflowName: opts.name,
        workflowDescription: opts.description,
      });
      console.log(
        JSON.stringify(
          {
            template_id: result.template.id,
            workflow_id: result.workflowId,
            cloud_current_workflow_id: result.workflowId,
            version_id: result.versionId,
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
  .description("Set workflow version from file or stdin (creates new version in cloud). Use --file <path> or omit to read from stdin.")
  .option("--file <path>", "Path to workflow JSON file (must contain 'nodes' array); omit to read from stdin")
  .option("--workflow <workflow_id>", "Workflow ID (default: current or COGNETIVY_WORKFLOW_ID)")
  .action(async (opts: { file?: string; workflow?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    const raw = opts.file
      ? await fs.readFile(path.resolve(cwd, opts.file), "utf-8")
      : await readPayloadFromFileOrStdin(undefined, cwd);
    const format: PayloadFormat = opts.file ? formatFromFilePath(opts.file) : "auto";
    const data = parsePayload(raw, format) as { nodes?: unknown[] };

    const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
    if (!workflowId) {
      console.error("Error: --workflow <id>, COGNETIVY_WORKFLOW_ID, or `cognetivy workflow select --workflow <id>` is required.");
      process.exit(1);
    }
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const version = await cloudCreateWorkflowVersion(workflowId, nodes);
    console.log(version.id);
  });

const runCmd = program
  .command("run")
  .description("Run lifecycle: start, status, step, complete. Run with no subcommand to see all. Every response includes COGNETIVY_NEXT_STEP when a node is in progress.");
runCmd
  .command("start")
  .description("Start a new run (cloud). Requires --input <path>, --input -, or --input-inline <json>; and --name. Prints run_id and COGNETIVY_NEXT_STEP.")
  .option("--input <path>", "Path to JSON file with run input, or '-' to read from stdin")
  .option("--input-inline <json>", "Run input as JSON string (alternative to --input; no file or stdin needed)")
  .option("--name <string>", "Human-readable name for the run (e.g. 'Q1 ideas exploration')")
  .option("--by <string>", "Actor (e.g. agent:cursor); defaults to config or 'cli'")
  .option("--workflow <workflow_id>", "Workflow ID (default: cloud_current_workflow_id or COGNETIVY_WORKFLOW_ID)")
  .option("--version <version_id>", "Workflow version ID (default: latest on server)")
  .action(async (opts: { input?: string; inputInline?: string; name?: string; by?: string; workflow?: string; version?: string }) => {
    await requireCloudApiKey();
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
    const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
    if (!workflowId) {
      console.error("Error: --workflow <id>, COGNETIVY_WORKFLOW_ID, or `cognetivy workflow select --workflow <id>` is required.");
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
      const action = mapCloudActionToCliAction(next.action);
      console.log(formatNextStepLine(result.run_id, "RUNNING", { ...next, action } as NextStep, result.current_node_id, result.current_node_ids));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
runCmd
  .command("complete")
  .description("Mark a run as completed (appends run_completed and persists status). Requires --run <id>. Run this after all nodes are done.")
  .requiredOption("--run <run_id>", "Run ID to mark complete")
  .action(async (opts: { run: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
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
  });
runCmd
  .command("status")
  .description("Show run metadata and next_step from cloud. Requires --run <id>. Use --json for machine-readable output.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { run: string; json?: boolean }) => {
    await requireCloudApiKey();
    try {
      const [run, nextData] = await Promise.all([cloudGetRun(opts.run), cloudGetNext(opts.run)]);
      const next = nextData.next_step;
      const action = mapCloudActionToCliAction(next.action);
      const next_step = { ...next, action };
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              run: { id: run.id, status: run.status, workflowId: run.workflowId },
              next_step,
              current_node_id: nextData.current_node_id,
              current_node_ids: nextData.current_node_ids,
            },
            null,
            2
          )
        );
        return;
      }
      console.log("Run:", run.id, run.status, `(${run.workflowId})`);
      if (nextData.current_node_ids?.length) {
        console.log("Current nodes (in progress):", nextData.current_node_ids.join(", "));
      } else if (nextData.current_node_id) {
        console.log("Current node (in progress):", nextData.current_node_id);
      }
      console.log(formatNextStepLine(run.id, run.status, next_step as NextStep, nextData.current_node_id, nextData.current_node_ids));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
runCmd
  .command("step")
  .description("Advance run (cloud): run with only --run <id> to start the next node; add --node <id> and --collection-kind with --collection-file <path> (or stdin) to complete a node.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--node <node_id>", "Node ID (required when completing a node with payload)")
  .option("--collection-kind <kind>", "Collection kind when completing node (payload from --collection-file or stdin)")
  .option("--collection-file <path>", "Path to JSON/YAML payload file (omit to read from stdin)")
  .action(async (opts: { run: string; node?: string; collectionKind?: string; collectionFile?: string }) => {
    await requireCloudApiKey();
    try {
      if (opts.node !== undefined) {
        const body: { output?: string; collectionKind?: string; collectionPayload?: unknown } = {};
        if (opts.collectionKind) {
          const raw = await readPayloadFromFileOrStdin(opts.collectionFile, process.cwd());
          body.collectionKind = opts.collectionKind;
          body.collectionPayload = parsePayload(raw, "auto") as unknown;
        }
        const result = await cloudCompleteNode(opts.run, opts.node, body);
        const next = result.next_step;
        const action = mapCloudActionToCliAction(next.action);
        console.log(formatNextStepLine(opts.run, "running", { ...next, action } as NextStep, result.current_node_id, result.current_node_ids));
      } else {
        const nextData = await cloudGetNext(opts.run);
        const next = nextData.next_step;
        const action = mapCloudActionToCliAction(next.action);
        if (action === "run_node" && next.node_id) {
          const result = await cloudStartNode(opts.run, next.node_id);
          const rNext = result.next_step;
          const rAction = mapCloudActionToCliAction(rNext.action);
          console.log(formatNextStepLine(opts.run, "running", { ...rNext, action: rAction } as NextStep, result.current_node_id, result.current_node_ids));
        } else if (action === "run_nodes_parallel" && next.runnable_node_ids?.length) {
          for (const nodeId of next.runnable_node_ids) {
            await cloudStartNode(opts.run, nodeId);
          }
          const after = await cloudGetNext(opts.run);
          const afterAction = mapCloudActionToCliAction(after.next_step.action);
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
  });

const eventCmd = program
  .command("event")
  .description("Event log operations (low-level). Run with no subcommand to see: append. Prefer run complete for ending runs.");
eventCmd
  .command("append")
  .description("Append one event to run's log (cloud). Omit --file to read JSON from stdin. For run_completed, prefer 'cognetivy run complete --run <id>'.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--file <path>", "Path to JSON file (omit to read event from stdin)")
  .option("--by <string>", "Actor; defaults to config or 'cli'")
  .action(async (opts: { run: string; file?: string; by?: string }) => {
    await requireCloudApiKey();
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
    try {
      const result = await cloudAppendEvents(opts.run, {
        events: [{ type: event.type, by: event.by, data: event.data }],
      });
      console.log(`Appended ${result.appended} event(s).`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const collectionSchemaCmd = program
  .command("collection-schema")
  .description("Collection schema (workflow-scoped; kinds and item_schema). Used when creating/editing workflows; run get/set with --workflow.");
collectionSchemaCmd
  .command("get")
  .description("Print collection schema JSON for a workflow (cloud). Use --run to resolve workflow from a run; --kind to print only one kind.")
  .option("--workflow <workflow_id>", "Workflow ID (default: cloud_current_workflow_id or COGNETIVY_WORKFLOW_ID)")
  .option("--run <run_id>", "Run ID (resolve workflow from this run; overrides --workflow)")
  .option("--kind <kind>", "Print only this collection kind's schema")
  .action(async (opts: { workflow?: string; run?: string; kind?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    let workflowId: string;
    if (opts.run) {
      const run = await cloudGetRun(opts.run);
      workflowId = run.workflowId;
    } else {
      const resolved = await resolveCloudWorkflowId(cwd, opts.workflow);
      workflowId = resolved ?? "";
    }
    if (!workflowId) {
      console.error("Error: specify --workflow <id>, --run <run_id>, or set default with workflow select.");
      process.exit(1);
    }
    const schema = await cloudGetCollectionSchema(workflowId);
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
  .description("Set collection schema from JSON file (cloud). Requires --file <path>.")
  .requiredOption("--file <path>", "Path to collection-schema JSON file")
  .option("--workflow <workflow_id>", "Workflow ID (default: current cloud workflow)")
  .action(async (opts: { file: string; workflow?: string }) => {
    await requireCloudApiKey();
    const cwd = process.cwd();
    const raw = await fs.readFile(path.resolve(cwd, opts.file), "utf-8");
    const schema = parsePayload(raw, formatFromFilePath(opts.file)) as CollectionSchemaConfig;
    if (!schema.kinds || typeof schema.kinds !== "object") {
      console.error("Error: schema must have a 'kinds' object.");
      process.exit(1);
    }
    const workflowId = await resolveCloudWorkflowId(cwd, opts.workflow);
    if (!workflowId) {
      console.error("Error: --workflow <id>, COGNETIVY_WORKFLOW_ID, or `cognetivy workflow select --workflow <id>` is required.");
      process.exit(1);
    }
    const kinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }> = {};
    for (const [k, v] of Object.entries(schema.kinds)) {
      const merged = mergeKindTemplate(k, v);
      kinds[k] = { name: merged.name, description: merged.description, item_schema: merged.item_schema };
    }
    await cloudSetCollectionSchema(workflowId, kinds);
    console.log("Collection schema updated.");
  });

const collectionCmd = program
  .command("collection")
  .description("Structured collections per run (cloud). Subcommands: list, get.");
collectionCmd
  .command("list")
  .description("List collection kinds that have data for a run. Requires --run <id>.")
  .requiredOption("--run <run_id>", "Run ID")
  .action(async (opts: { run: string }) => {
    await requireCloudApiKey();
    try {
      const result = await cloudListCollectionKinds(opts.run);
      console.log(JSON.stringify(result.kinds, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
collectionCmd
  .command("get")
  .description("Get all items of a collection kind for a run. Requires --run <id> and --kind or --collection.")
  .requiredOption("--run <run_id>", "Run ID")
  .option("--kind <kind>", "Collection kind (e.g. sources, run_input)")
  .option("--collection <kind>", "Collection kind (alias for --kind)")
  .action(async (opts: { run: string; kind?: string; collection?: string }) => {
    await requireCloudApiKey();
    const kind = opts.kind ?? opts.collection;
    if (!kind) {
      console.error("Error: required option --kind <kind> or --collection <kind> not specified.");
      process.exit(1);
    }
    try {
      const result = await cloudGetCollectionItems(opts.run, kind);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const nodeCmd = program
  .command("node")
  .description("Node lifecycle (cloud): start a node or complete it with optional collection payload. Prefer `cognetivy run step` when available.");

nodeCmd
  .command("start")
  .description("Mark a node as started on the server. Requires COGNETIVY_API_KEY, --run, and --node.")
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Workflow node ID")
  .action(async function nodeStartAction(opts: { run: string; node: string }) {
    await requireCloudApiKey();
    try {
      await cloudStartNode(opts.run, opts.node);
      console.log(`Node "${opts.node}" started.`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

nodeCmd
  .command("complete")
  .description(
    "Complete a node via the cloud API (--status completed only). Optional --output/--output-file, --collection-kind + payload (file or stdin), or --writes-file for multi-output nodes."
  )
  .requiredOption("--run <run_id>", "Run ID")
  .requiredOption("--node <node_id>", "Workflow node ID")
  .requiredOption("--status <status>", "Must be: completed (cloud API completes successfully)")
  .option("--output <string>", "Inline output text for the node result")
  .option("--output-file <path>", "Path to file for node result output")
  .option("--collection-kind <kind>", "Collection kind (payload from --collection-file or stdin)")
  .option("--collection-file <path>", "Path to JSON payload (omit to read from stdin when --collection-kind is set)")
  .option("--collection-mode <mode>", "set (array) or append (single object); default: infer from payload", "infer")
  .option("--writes-file <path>", "JSON file: writes [{ kind, item_ids }] for nodes with multiple output kinds")
  .action(
    async function nodeCompleteAction(opts: {
      run: string;
      node: string;
      status: string;
      output?: string;
      outputFile?: string;
      collectionKind?: string;
      collectionFile?: string;
      collectionMode?: string;
      writesFile?: string;
    }) {
      await requireCloudApiKey();
      if (opts.status !== "completed") {
        console.error(
          'Error: cloud `node complete` only supports --status completed. For failed or needs_human, use the Cognetivy app or API.'
        );
        process.exit(1);
      }
      const cwd = process.cwd();
      if (opts.writesFile && opts.collectionKind) {
        console.error("Error: use either --writes-file or --collection-kind, not both.");
        process.exit(1);
      }
      let output: string | undefined = opts.output;
      if (opts.outputFile) {
        output = await fs.readFile(path.resolve(cwd, opts.outputFile), "utf-8");
      }
      const body: CloudCompleteNodeBody = {};
      if (output !== undefined) {
        body.output = output;
      }
      if (opts.writesFile) {
        const raw = await fs.readFile(path.resolve(cwd, opts.writesFile), "utf-8");
        body.writes = parsePayload(raw, formatFromFilePath(opts.writesFile)) as CloudCompleteNodeBody["writes"];
      } else if (opts.collectionKind) {
        const raw = await readPayloadFromFileOrStdin(opts.collectionFile, cwd);
        const payload = parsePayload(raw, opts.collectionFile ? formatFromFilePath(opts.collectionFile) : "auto") as unknown;
        const mode =
          opts.collectionMode === "set" || opts.collectionMode === "append"
            ? opts.collectionMode
            : Array.isArray(payload)
              ? "set"
              : "append";
        body.collectionKind = opts.collectionKind;
        if (mode === "set") {
          if (!Array.isArray(payload)) {
            console.error("Error: collection payload must be a JSON array when using set.");
            process.exit(1);
          }
          body.collectionPayload = payload;
        } else {
          if (Array.isArray(payload)) {
            console.error("Error: collection payload must be a single JSON object when using append.");
            process.exit(1);
          }
          body.collectionPayload = payload as Record<string, unknown>;
        }
      }
      try {
        await cloudCompleteNode(opts.run, opts.node, body);
        console.log(`Node "${opts.node}" completed.`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  );

program
  .command("templates")
  .description("List workflow templates (--list for JSON) or interactively pick one to create in cloud and set as current (requires COGNETIVY_API_KEY).")
  .option("--list", "Print templates as JSON (no picker)")
  .action(async function templatesCommandAction(opts: { list?: boolean }) {
    const cwd = process.cwd();
    if (opts.list || !process.stdin.isTTY) {
      console.log(JSON.stringify(listWorkflowTemplates(), null, 2));
      return;
    }
    await requireCloudApiKey();
    const templates = listWorkflowTemplatesForPicker();
    const picked = await p.select({
      message: "Pick a workflow template to create in your cloud org",
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
      const orgId = await resolveCloudOrganizationId();
      const result = await applyWorkflowTemplateToCloud({ organizationId: orgId, templateId, cwd });
      p.note(`Created workflow "${result.template.name}" (${result.workflowId}) in cloud.`, "Template applied");
      console.log(
        JSON.stringify(
          {
            template_id: result.template.id,
            workflow_id: result.workflowId,
            cloud_current_workflow_id: result.workflowId,
            version_id: result.versionId,
          },
          null,
          2
        )
      );
      const appUrl = getCloudAppUrl();
      const url = buildCloudOnboardingUrl(appUrl, result.workflowId);
      await openUrl(url);
      printOpenedUrlMessage(url, { workflow: true });
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
      await ensureMinimalWorkspace(cwd);
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
    let targetsToInstall: SkillInstallTarget[] =
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
  .description("Validate SKILL.md (path = skill dir; omit to check cognetivy skill per install target)")
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
    const installPaths = await getCognetivySkillInstallPaths(cwd, skillsConfig);
    let hasInvalid = false;
    let checkedCount = 0;
    for (const { target, path: skillPath } of installPaths) {
      try {
        await fs.access(path.join(skillPath, "SKILL.md"));
      } catch {
        continue;
      }
      checkedCount++;
      const { valid, errors } = await validateSkill(skillPath);
      if (!valid) {
        hasInvalid = true;
        console.error(`${target}:`);
        errors.forEach((e) => console.error("  -", e));
      } else {
        console.log(`${target}: valid`);
      }
    }
    if (hasInvalid) process.exit(1);
    if (checkedCount === 0) {
      console.log("No cognetivy skill folders found. Run `cognetivy install <target>` first.");
    } else {
      console.log(`All ${checkedCount} cognetivy skill folder(s) valid.`);
    }
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

const DEFAULT_BEHAVIOR_DESCRIPTION =
  "Guided onboarding: sign in if needed, install or update platform skills (Cursor, Claude Code, etc.), ensure at least one cloud workflow (template picker if needed), then start the local studio (browser + WebSocket executor).";

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

/** Guided onboarding when user runs `cognetivy` with no args: auth, skills, cloud workflow, then open app. */
async function runDefaultOnboardingFlow(cwd: string): Promise<void> {
  runUpdateNotifier();

  const authenticated = await isCloudAuthenticated();

  let loginServerHandle: LocalStudioServerHandle | undefined;
  if (!authenticated) {
    const signInApiBase = getCloudApiUrl();
    const apiLooksLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(signInApiBase);
    p.note(
      `Sign in once; your API key is stored locally.\nBackend API for this run: ${signInApiBase}${
        apiLooksLocal ? "" : "\nTip: for a local Nest server use --dev or --api-url http://localhost:3000."
      }`,
      "Cognetivy"
    );
    const staticRoot = resolveLocalStudioStaticRoot();
    const canAuthViaLocalStudio = localStudioBundleHasCliAuth(staticRoot);
    if (canAuthViaLocalStudio) {
      loginServerHandle = await createLocalStudioServer({ workspaceCwd: cwd });
    } else {
      console.log(
        "Tip: Run `npm run build:local-studio` in this package so sign-in opens local studio instead of the hosted app."
      );
    }
    const authAppUrl = loginServerHandle ? resolveLocalStudioBrowserBase(loginServerHandle) : getCloudAppUrl();
    console.log(loginServerHandle ? "Opening browser to sign in (local studio)…" : "Opening browser to sign in…");
    const result = await runLoginFlow({ appUrl: authAppUrl });
    if (result.error) {
      if (loginServerHandle) {
        await loginServerHandle.close();
      }
      console.error(result.error);
      process.exit(1);
    }
    if (!result.code) {
      if (loginServerHandle) {
        await loginServerHandle.close();
      }
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
      if (loginServerHandle) {
        await loginServerHandle.close();
      }
      console.error(text || res.statusText);
      process.exit(1);
    }
    const data = (await res.json()) as { api_key?: string };
    const apiKey = data?.api_key ?? "";
    if (!apiKey) {
      if (loginServerHandle) {
        await loginServerHandle.close();
      }
      console.error("No API key in response.");
      process.exit(1);
    }
    writeStoredApiKey(apiKey);
    console.log("Logged in. API key saved.");
  }

  const { runInstallTUI } = await import("./install-tui.js");
  const installedVersion = await readInstalledSkillsVersion(cwd);
  const currentVersion = getCurrentVersionSync();

  if (installedVersion == null) {
    await runInstallTUI({ cwd, init: true, skipTemplate: true });
  } else if (isNewerVersion(currentVersion, installedVersion)) {
    const shouldUpdate = await p.confirm({
      message: `Skills were installed with v${installedVersion}; you're on v${currentVersion}. Update skill files? (Your .cognetivy skills folder is not removed.)`,
      initialValue: true,
    });
    if (p.isCancel(shouldUpdate)) {
      p.cancel("Skipped skill update.");
    } else if (shouldUpdate) {
      await runInstallTUI({ cwd, force: true, init: false });
    }
  }

  await ensureMinimalWorkspace(cwd);
  const index = await readWorkflowIndexOptional(cwd);

  let hasWorkflow = false;
  let cloudWorkflowList: { id: string }[] = [];
  try {
    const orgId = await resolveCloudOrganizationId();
    const list = await cloudListWorkflows(orgId);
    cloudWorkflowList = list;
    hasWorkflow = list.length >= 1 || (index?.cloud_current_workflow_id != null);
  } catch {
    hasWorkflow = false;
  }

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
        const orgId = await resolveCloudOrganizationId();
        const result = await applyWorkflowTemplateToCloud({ organizationId: orgId, templateId, cwd });
        cloudCurrentWorkflowId = result.workflowId;
        p.note(`Created workflow "${result.template.name}" (${result.workflowId}) in cloud.`, "Template applied");
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  } else if (cloudCurrentWorkflowId == null) {
    cloudCurrentWorkflowId = index?.cloud_current_workflow_id ?? cloudWorkflowList[0]?.id ?? null;
  }

  await runLocalStudioForeground(cwd, { existingHandle: loginServerHandle });
}

program.action(async () => {
  const opts = program.opts() as { interface?: boolean };
  if (opts.interface) {
    await openCliDocsInBrowser(program, { defaultBehavior: DEFAULT_BEHAVIOR_DESCRIPTION });
    return;
  }
  const cwd = process.cwd();
  if (!process.stdin.isTTY) {
    await runLocalStudioForeground(cwd);
    return;
  }
  await runDefaultOnboardingFlow(cwd);
});

program.parse();
