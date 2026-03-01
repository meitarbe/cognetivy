/**
 * Agent skills (SKILL.md) and OpenClaw skills: parse, validate, discover, install, update.
 * One format (agentskills.io); multiple sources (agent dirs, openclaw, workspace).
 */

import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import fm from "front-matter";

type FrontMatterResult = { attributes: Record<string, unknown>; body: string };

function parseFrontMatter(content: string): FrontMatterResult {
  const fn = (fm as unknown) as (s: string) => FrontMatterResult;
  return fn(content);
}

export type SkillInstallTarget = "agent" | "cursor" | "openclaw" | "workspace";
export type SkillSource = "agent" | "openclaw" | "workspace";

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

export interface Skill {
  metadata: SkillMetadata;
  path: string;
  source: SkillSource;
  body: string;
  fullContent: string;
}

export interface SkillsConfig {
  sources?: SkillSource[];
  extraDirs?: string[];
  default_install_target?: SkillInstallTarget;
}

const SKILL_FILENAME = "SKILL.md";

/** Name validation per agentskills.io: 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens */
const NAME_REGEX = /^[a-z0-9]+(?:-?[a-z0-9]+)*$/;

function validateSkillName(name: string): string[] {
  const errors: string[] = [];
  if (!name || name.length > 64) {
    errors.push("name must be 1-64 characters");
  }
  if (!NAME_REGEX.test(name)) {
    errors.push(
      "name must be lowercase letters, numbers, hyphens only; no leading/trailing/consecutive hyphens"
    );
  }
  return errors;
}

export function parseSkillFile(content: string): { attributes: SkillMetadata; body: string } {
  const parsed = parseFrontMatter(content);
  const attrs = parsed.attributes;
  const name = typeof attrs.name === "string" ? attrs.name : "";
  const description = typeof attrs.description === "string" ? attrs.description : "";
  const metadata: SkillMetadata = {
    name,
    description,
  };
  if (typeof attrs.license === "string") metadata.license = attrs.license;
  if (typeof attrs.compatibility === "string") metadata.compatibility = attrs.compatibility;
  if (attrs.metadata && typeof attrs.metadata === "object" && !Array.isArray(attrs.metadata)) {
    metadata.metadata = attrs.metadata as Record<string, string>;
  }
  if (typeof attrs["allowed-tools"] === "string") metadata["allowed-tools"] = attrs["allowed-tools"];
  return { attributes: metadata, body: parsed.body };
}

export async function validateSkill(dirPath: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const skillPath = path.join(dirPath, SKILL_FILENAME);
  let stat;
  try {
    stat = await fs.stat(skillPath);
  } catch {
    errors.push(`${SKILL_FILENAME} not found`);
    return { valid: errors.length === 0, errors };
  }
  if (!stat.isFile()) {
    errors.push(`${SKILL_FILENAME} is not a file`);
    return { valid: false, errors };
  }
  const raw = await fs.readFile(skillPath, "utf-8");
  const { attributes } = parseSkillFile(raw);
  errors.push(...validateSkillName(attributes.name));
  if (!attributes.description || attributes.description.length > 1024) {
    errors.push("description must be 1-1024 characters");
  }
  const dirName = path.basename(path.resolve(dirPath));
  if (attributes.name !== dirName) {
    errors.push(`name "${attributes.name}" must match directory name "${dirName}"`);
  }
  return { valid: errors.length === 0, errors };
}

async function getGlobalConfigDir(): Promise<string> {
  const { default: envPaths } = await import("env-paths");
  const paths = envPaths("cognetivy", { suffix: "" });
  return paths.config;
}

const LOCKFILE_FILENAME = "skills-install.json";

export interface LockfileEntry {
  origin: string;
  installedAt: string;
}

export interface Lockfile {
  [target: string]: { [skillName: string]: LockfileEntry };
}

async function getLockfilePath(): Promise<string> {
  const dir = await getGlobalConfigDir();
  return path.join(dir, LOCKFILE_FILENAME);
}

export async function readLockfile(): Promise<Lockfile> {
  const lockPath = await getLockfilePath();
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    return JSON.parse(raw) as Lockfile;
  } catch {
    return {};
  }
}

export async function writeLockfile(lock: Lockfile): Promise<void> {
  const lockPath = await getLockfilePath();
  const dir = path.dirname(lockPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8");
}

async function readSkillAtDir(
  skillDir: string,
  source: SkillSource
): Promise<Skill | null> {
  const skillPath = path.join(skillDir, SKILL_FILENAME);
  try {
    const fullContent = await fs.readFile(skillPath, "utf-8");
    const { attributes, body } = parseSkillFile(fullContent);
    return {
      metadata: attributes,
      path: skillDir,
      source,
      body,
      fullContent,
    };
  } catch {
    return null;
  }
}

async function scanDirForSkills(dirPath: string, source: SkillSource): Promise<Skill[]> {
  const results: Skill[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillPath = path.join(dirPath, ent.name);
      const skill = await readSkillAtDir(skillPath, source);
      if (skill) results.push(skill);
    }
  } catch {
    // directory missing or not readable
  }
  return results;
}

interface OpenClawConfig {
  skills?: {
    load?: { extraDirs?: string[] };
  };
}

async function getOpenClawExtraDirs(): Promise<string[]> {
  const home = process.env.HOME || os.homedir();
  const configPath = path.join(home, ".openclaw", "openclaw.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as OpenClawConfig;
    const dirs = config.skills?.load?.extraDirs;
    if (!Array.isArray(dirs)) return [];
    return dirs.map((d) => d.replace(/^~/, home));
  } catch {
    return [];
  }
}

/**
 * Resolve skill directories for a source. cwd is used for workspace and relative paths.
 */
export async function getSkillDirectories(
  source: SkillSource,
  cwd: string,
  config?: SkillsConfig
): Promise<string[]> {
  const home = process.env.HOME || os.homedir();
  const dirs: string[] = [];
  switch (source) {
    case "agent": {
      dirs.push(path.join(home, ".cursor", "skills"));
      dirs.push(path.join(home, ".claude", "skills"));
      dirs.push(path.resolve(cwd, ".cursor", "skills"));
      dirs.push(path.resolve(cwd, ".claude", "skills"));
      break;
    }
    case "openclaw": {
      dirs.push(path.join(home, ".openclaw", "workspace", "skills"));
      dirs.push(...(await getOpenClawExtraDirs()));
      break;
    }
    case "workspace": {
      dirs.push(path.resolve(cwd, ".cognetivy", "skills"));
      const { default: envPaths } = await import("env-paths");
      const paths = envPaths("cognetivy", { suffix: "" });
      dirs.push(path.join(paths.config, "skills"));
      break;
    }
  }
  if (source === "openclaw" && config?.extraDirs?.length) {
    dirs.push(...config.extraDirs.map((d) => d.replace(/^~/, home)));
  } else if (config?.extraDirs?.length) {
    dirs.push(...config.extraDirs.map((d) => d.replace(/^~/, home)));
  }
  return dirs;
}

export interface ListSkillsOptions {
  sources?: SkillSource[];
  extraDirs?: string[];
}

/**
 * List all skills from enabled sources. Dedupes by name (first path wins).
 */
export async function listSkills(
  cwd: string,
  options?: ListSkillsOptions,
  config?: SkillsConfig
): Promise<Skill[]> {
  const sources = options?.sources ?? config?.sources ?? (["agent", "openclaw", "workspace"] as SkillSource[]);
  const seen = new Set<string>();
  const results: Skill[] = [];
  for (const source of sources) {
    const dirs = await getSkillDirectories(source, cwd, config);
    for (const dir of dirs) {
      const skills = await scanDirForSkills(dir, source);
      for (const skill of skills) {
        const name = skill.metadata.name;
        if (seen.has(name)) continue;
        seen.add(name);
        results.push(skill);
      }
    }
  }
  if (options?.extraDirs?.length) {
    const home = process.env.HOME || os.homedir();
    for (const d of options.extraDirs) {
      const dir = path.resolve(d.replace(/^~/, home));
      const skills = await scanDirForSkills(dir, "workspace");
      for (const skill of skills) {
        if (seen.has(skill.metadata.name)) continue;
        seen.add(skill.metadata.name);
        results.push(skill);
      }
    }
  }
  return results;
}

export async function getSkillByName(
  name: string,
  cwd: string,
  options?: ListSkillsOptions,
  config?: SkillsConfig
): Promise<Skill | null> {
  const skills = await listSkills(cwd, options, config);
  return skills.find((s) => s.metadata.name === name) ?? null;
}

/**
 * Resolve absolute install path for a skill in the given target.
 * Uses project-local paths (current directory) so install stays in the terminal's cwd.
 */
export async function getInstallPath(
  target: SkillInstallTarget,
  skillName: string,
  cwd: string,
  config?: SkillsConfig
): Promise<string> {
  switch (target) {
    case "agent":
      return path.resolve(cwd, ".claude", "skills", skillName);
    case "cursor":
      return path.resolve(cwd, ".cursor", "skills", skillName);
    case "openclaw":
      return path.resolve(cwd, "skills", skillName);
    case "workspace":
      return path.resolve(cwd, ".cognetivy", "skills", skillName);
    default:
      return path.resolve(cwd, ".claude", "skills", skillName);
  }
}

function isLocalPath(source: string): boolean {
  if (path.isAbsolute(source)) return true;
  if (source.startsWith(".")) return true;
  return !source.startsWith("http://") && !source.startsWith("https://") && !source.startsWith("git@");
}

function isGitUrl(source: string): boolean {
  return (
    source.startsWith("git@") ||
    source.startsWith("https://") ||
    source.startsWith("http://")
  );
}

async function cloneGitRepo(url: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", "--depth", "1", url, destDir], {
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr?.on("data", (ch) => {
      stderr += ch.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone failed: ${stderr || code}`));
    });
    child.on("error", reject);
  });
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Copy only SKILL.md and optional scripts/, references/, assets/ from src to dest.
 */
async function copySkillDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const skillMd = path.join(src, SKILL_FILENAME);
  await fs.copyFile(skillMd, path.join(dest, SKILL_FILENAME));
  for (const sub of ["scripts", "references", "assets"]) {
    const subSrc = path.join(src, sub);
    try {
      const stat = await fs.stat(subSrc);
      if (stat.isDirectory()) {
        await copyDirRecursive(subSrc, path.join(dest, sub));
      }
    } catch {
      // skip
    }
  }
}

export interface InstallSkillOptions {
  force?: boolean;
  cwd?: string;
  config?: SkillsConfig;
}

export interface InstallSkillResult {
  path: string;
  origin?: string;
}

const COGNETIVY_SKILL_NAME = "cognetivy";

/** Built-in skill: Level 1 metadata (always loaded). Description states what it does and when to use it. */
function getCognetivySkillContent(): string {
  return `---
name: ${COGNETIVY_SKILL_NAME}
description: Manage workflows, workflow versions, runs, step events, node results, and strict schema-backed collections in this project. Use when the user asks to start/complete a run, execute workflow nodes, log step_started/step_completed events, persist node results, or read/write structured data in collections. All operations run via the cognetivy CLI from the project root that contains .cognetivy/
---

# Cognetivy

Workflows, runs, node results, and schema-backed collections. Run commands from **project root** (directory with \`.cognetivy/\`). Full CLI reference: [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections", or ".cognetivy/".

---

## Quick start (minimal run)

**Four commands.** Every response includes \`COGNETIVY_NEXT_STEP=...\` (JSON with \`run_id\`, \`status\`, \`next_step\`, and \`current_node_id\` when a node is in progress). **Do what the hint says**; no guessing. The next node is chosen by DAG (topological) order so dependencies run before consumers.

1. **Start:** \`cognetivy run start --input input.json --name "Short name"\`
   - Prints \`run_id\` and \`COGNETIVY_NEXT_STEP=...\`. Parse \`next_step\`; usually \`action: "run_node"\`, \`node_id\`, \`hint\` (do work for that node, then run step with payload).

2. **Status (optional):** \`cognetivy run status --run <run_id> [--json]\`
   - Shows run state, \`current_node_id\` (in progress) when a node is started but not completed, and \`next_step\`.

3. **Step (repeat until done):**
   - **Start next node:** \`cognetivy run step --run <run_id>\` (no \`--node\`). Then do the work for the node in \`next_step.node_id\`.
   - **Complete node with output:** \`cognetivy run step --run <run_id> --node <node_id> --collection-kind <kind>\` with payload on stdin (single object = append, array = set). Or without \`--collection-kind\` to mark node completed with no collection.
   - Each call prints \`COGNETIVY_NEXT_STEP=...\`. When \`action\` is \`complete_run\`, follow the hint (event append run_completed + run complete).

4. **End the run:** When \`next_step.action\` is \`complete_run\`: \`echo '{"type":"run_completed","data":{}}' | cognetivy event append --run <run_id>\`, then \`cognetivy run complete --run <run_id>\`.

---

## Workflow

\`workflow get\` (and \`workflow list\` / \`select\` / \`versions\` / \`set --file <path>\`). Versions have nodes (collection→node→collection).

**Workflow structure (required):**
- **Single connected graph:** Do not create two or more disconnected subgraphs. All nodes must be part of one dataflow (every node reachable via input/output collections from the rest).
- **No cycles:** The dataflow must be acyclic. No node may depend (directly or indirectly) on a collection produced by a node that depends on it. Saving a workflow with a cycle will fail validation.

**Node prompts and output:** Node prompts work best when **long and specific**: include the goal, constraints (e.g. source discipline, output format), and examples if helpful. Prefer detailed prompts over short one-liners. If a node has \`minimum_rows\`, produce at least that many items for its output collection(s).

## Runs (agent surface: 4 commands)

\`run start\`, \`run status --run <id> [--json]\`, \`run step --run <id> [--node N] [--collection-kind K]\`, \`run complete\`. Every response includes \`COGNETIVY_NEXT_STEP\`; use it to decide the next action. Low-level \`node\` / \`event\` / \`collection\` commands exist for scripts; see REFERENCE.md.

## Events

\`event append --run <run_id> [--file <path>]\` - omit \`--file\` to read from stdin. Event JSON: \`type\`, \`data\` (for step events set \`data.step\` = node id). E.g. \`echo '{"type":"step_completed","data":{"step":"synthesize"}}' | cognetivy event append --run <run_id>\`.

## Node results

Usually covered by \`node complete\`. For inspect or when not using it: \`node-result list\`, \`node-result get\`, \`node-result set\` (prints \`COGNETIVY_NODE_RESULT_ID=...\`).

---

## Collections (strict schema-backed)

\`collection-schema get\` / \`set --file\` (kinds + \`item_schema\`). \`collection list --run <id>\`, \`collection get --run <id> --kind <kind>\`. \`collection set\` / \`collection append\` need \`--node\` and \`--node-result\` (or use \`node complete --collection-kind\` which creates the result). Omit \`--file\` to read from stdin.
- **Many items:** Prefer incremental \`collection append\` or \`node complete\` per item instead of one large \`collection set\`. Use Markdown in long text fields for Studio.

**Payload:** Must match \`item_schema\` for the kind; do not include \`created_at\`, \`created_by_node_id\` - cognetivy adds them. For kinds like \`sources\` that have a \`url\` field: only include URLs you have verified (retrieved or opened); do not invent URLs.

---

## Node runner pattern

\`workflow get\` once → for each node: \`collection get\` for that node's inputs only → do work → \`node complete\`. If a node has \`minimum_rows\`, produce at least that many items for its output collection(s). **If you can spawn sub-agents:** run each node in a separate process/agent with only that node's inputs to keep context small and avoid loading all transcripts.

## Important

- **Schema first:** \`collection-schema get\` before writing; add kinds if missing.
- **Step events:** \`data.step\` = workflow node id (for Studio).
- **Provenance:** When using \`collection set\`/ \`append\` directly (not \`node complete\`), create a node result first and pass \`--node\` + \`--node-result\`.
- **Always end runs:** \`event append run_completed\` then \`run complete\`.
- **Version suggestions:** When discussing dependencies, tools, or libraries, proactively check for and suggest newer versions (e.g. via web search or docs) and mention upgrade paths when relevant.

## Source discipline

- **Rely only on real information:** Use (a) run input/collections, or (b) sources you actually retrieve via tools (e.g. web search, MCP, browser). Do not invent or guess URLs, quotes, or facts.
- **When writing to a \`sources\` (or similar) collection:** Only include URLs you have verified (e.g. fetched or opened). Do not fabricate URLs; if a URL is unverified, omit it or mark it clearly as unverified.

## Performance

- **Smaller context:** Per-item extraction (e.g. per-video) over all-at-once when a node maps over a list.
- **Parallel sub-agents:** For data-parallel nodes (e.g. 10 transcripts), spawning one agent per item in parallel can yield ~10x wall-clock speedup - highest-leverage for map-over-list workflows.
- **Structured output:** Future extensions may enforce "output must match this schema" so the agent skips manual schema-checking.
`;
}

/** Level 3 resource: full CLI reference (loaded on demand). */
function getCognetivyReferenceContent(): string {
  return `# Cognetivy CLI reference

Full command reference. Use from project root (directory containing \`.cognetivy/\`).

## workflow
- \`cognetivy workflow list\` - list workflows.
- \`cognetivy workflow create --name <string> [--id <string>] [--description <string>]\` - create a workflow (creates v1 and default schema).
- \`cognetivy workflow select --workflow <workflow_id>\` - select current workflow.
- \`cognetivy workflow versions [--workflow <workflow_id>]\` - list versions for a workflow.
- \`cognetivy workflow get [--workflow <workflow_id>] [--version <version_id>]\` - print a workflow version JSON.
- \`cognetivy workflow set --file <path> [--workflow <workflow_id>] [--name <string>]\` - set workflow version from JSON file (creates new version and sets it current). **Workflow must be one connected graph with no cycles.**

## run
- \`cognetivy run start --input <path> [--name <string>] ...\` - start run; prints run_id and COGNETIVY_NEXT_STEP.
- \`cognetivy run status --run <run_id> [--json]\` - run state, nodes, collections, next_step.
- \`cognetivy run step --run <run_id> [--node <node_id>] [--collection-kind <kind>]\` - start next node (no --node) or complete node (--node, optional payload via stdin); prints next_step.
- \`cognetivy run complete --run <run_id>\`, \`run set-name --run <run_id> --name <string>\`.

## node
- \`cognetivy node start --run <run_id> --node <node_id>\` - step_started + started node result; prints COGNETIVY_NODE_RESULT_ID.
- \`cognetivy node complete --run <run_id> --node <node_id> --status completed [--output ...] [--collection-kind <kind>]\` - node result + optional collection (omit --collection-file to read from stdin) + step_completed.

## event
- \`cognetivy event append --run <run_id> [--file <path>] [--by <string>]\` - append event (omit --file to read from stdin). Step events: data.step = node id.

## collection-schema
- \`cognetivy collection-schema get [--workflow <workflow_id>]\` - print workflow-scoped schema (kinds, item_schema, references).
- \`cognetivy collection-schema set --file <path> [--workflow <workflow_id>]\` - set schema from JSON.

## collection
- \`cognetivy collection list --run <run_id>\` - list kinds that have data for run.
- \`cognetivy collection get --run <run_id> --kind <kind>\` - get all items of kind.
- \`cognetivy collection set --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id>\` - replace items (omit --file for stdin).
- \`cognetivy collection append --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id> [--id <id>]\` - append one item (omit --file for stdin).

## node-result
- \`cognetivy node-result list --run <run_id>\` - list node results for run.
- \`cognetivy node-result get --run <run_id> --node <node_id>\` - get node result.
- \`cognetivy node-result set --run <run_id> --node <node_id> --status <started|completed|failed|needs_human> [--id <node_result_id>] [--output-file <path> | --output <string>]\` - set node result.

## studio
- \`cognetivy studio [--workspace <path>] [--port <port>]\` - open read-only Studio (workflow, runs, events, collections) in browser.
`;
}

const REFERENCE_FILENAME = "REFERENCE.md";

/**
 * Install the built-in cognetivy skill (workflow, runs, events, collections) into the target.
 * Writes SKILL.md (Level 2) and REFERENCE.md (Level 3, on-demand). Idempotent; overwrites.
 */
export async function installCognetivySkill(
  target: SkillInstallTarget,
  cwd: string,
  config?: SkillsConfig
): Promise<string> {
  const targetPath = await getInstallPath(target, COGNETIVY_SKILL_NAME, cwd, config);
  await fs.mkdir(targetPath, { recursive: true });
  await fs.writeFile(path.join(targetPath, SKILL_FILENAME), getCognetivySkillContent(), "utf-8");
  await fs.writeFile(
    path.join(targetPath, REFERENCE_FILENAME),
    getCognetivyReferenceContent(),
    "utf-8"
  );
  return targetPath;
}

/** Derive a valid skill name from a folder name (lowercase, hyphens, no leading/trailing/consecutive hyphens). */
function skillNameFromDirName(dirName: string): string {
  const sanitized = dirName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "skill";
  return sanitized.slice(0, 64);
}

/**
 * Create a default skill under skills/<name>/SKILL.md in rootPath (for multi-target install).
 */
export async function ensureDefaultSkillInDirectory(
  dirPath: string
): Promise<{ created: boolean }> {
  const resolved = path.resolve(dirPath);
  await fs.mkdir(resolved, { recursive: true });
  const dirName = path.basename(resolved);
  const name = skillNameFromDirName(dirName);
  const skillDir = path.join(resolved, "skills", name);
  const skillMdPath = path.join(skillDir, SKILL_FILENAME);
  try {
    await fs.access(skillMdPath);
    return { created: false };
  } catch {
    // create default under skills/<name>/
  }
  await fs.mkdir(skillDir, { recursive: true });
  const content = defaultSkillContent(name);
  await fs.writeFile(skillMdPath, content, "utf-8");
  return { created: true };
}

function defaultSkillContent(name: string): string {
  return `---
name: ${name}
description: Custom skill.
---

# ${name}

Add instructions here.
`;
}

/**
 * Create a default skill directly in the target directory (single-target install only; no skills/ in project).
 */
export async function ensureDefaultSkillInTarget(
  cwd: string,
  target: SkillInstallTarget,
  config?: SkillsConfig
): Promise<{ path: string; created: boolean }> {
  const dirName = path.basename(path.resolve(cwd));
  const name = skillNameFromDirName(dirName);
  const targetSkillPath = await getInstallPath(target, name, cwd, config);
  const skillMdPath = path.join(targetSkillPath, SKILL_FILENAME);
  try {
    await fs.access(skillMdPath);
    return { path: targetSkillPath, created: false };
  } catch {
    // create default in target
  }
  await fs.mkdir(targetSkillPath, { recursive: true });
  const content = defaultSkillContent(name);
  await fs.writeFile(skillMdPath, content, "utf-8");
  return { path: targetSkillPath, created: true };
}

/**
 * Find skill directories in a root path (Claude-style layout).
 * - If root has SKILL.md, returns [root].
 * - Else if root/skills/ has subdirs with SKILL.md, returns those subdir paths.
 * - Otherwise returns [].
 */
export async function findSkillDirsInDirectory(rootPath: string): Promise<string[]> {
  const resolved = path.resolve(rootPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    return [];
  }
  const skillMdHere = path.join(resolved, SKILL_FILENAME);
  try {
    await fs.access(skillMdHere);
    return [resolved];
  } catch {
    // no SKILL.md in root
  }
  const skillsDir = path.join(resolved, "skills");
  try {
    const statSkills = await fs.stat(skillsDir);
    if (!statSkills.isDirectory()) return [];
  } catch {
    return [];
  }
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const dirs: string[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const subPath = path.join(skillsDir, ent.name);
    const skillMd = path.join(subPath, SKILL_FILENAME);
    try {
      await fs.access(skillMd);
      dirs.push(subPath);
    } catch {
      // skip
    }
  }
  return dirs;
}

export interface InstallSkillsFromDirectoryResult {
  results: InstallSkillResult[];
  createdDefault: boolean;
}

/**
 * Install all skills found in a directory (current dir or skills/ pack) into the target.
 * If no skills found, returns empty results (no dummy skill created).
 */
export async function installSkillsFromDirectory(
  rootPath: string,
  target: SkillInstallTarget,
  options?: InstallSkillOptions
): Promise<InstallSkillsFromDirectoryResult> {
  const dirs = await findSkillDirsInDirectory(rootPath);
  if (dirs.length === 0) {
    return { results: [], createdDefault: false };
  }
  const results: InstallSkillResult[] = [];
  for (const dir of dirs) {
    const result = await installSkill(dir, target, options);
    results.push(result);
  }
  return { results, createdDefault: false };
}

/**
 * Install a skill from a local path or git URL into the target directory.
 */
export async function installSkill(
  source: string,
  target: SkillInstallTarget,
  options?: InstallSkillOptions
): Promise<InstallSkillResult> {
  const cwd = options?.cwd ?? process.cwd();
  let workDir: string;
  let origin: string | undefined;
  if (isLocalPath(source)) {
    const resolved = path.resolve(cwd, source);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Source path is not a directory: ${resolved}`);
    }
    const skillPath = path.join(resolved, SKILL_FILENAME);
    await fs.access(skillPath);
    workDir = resolved;
    origin = path.resolve(resolved);
  } else if (isGitUrl(source)) {
    const tmpDir = path.join(os.tmpdir(), `cognetivy-skill-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    try {
      await cloneGitRepo(source, tmpDir);
      const skillPath = path.join(tmpDir, SKILL_FILENAME);
      try {
        await fs.access(skillPath);
        workDir = tmpDir;
      } catch {
        const subdirs = await fs.readdir(tmpDir, { withFileTypes: true });
        const found = subdirs.find((d) => d.isDirectory());
        if (found) {
          const inner = path.join(tmpDir, found.name);
          const innerSkill = path.join(inner, SKILL_FILENAME);
          await fs.access(innerSkill);
          workDir = inner;
        } else {
          throw new Error("No SKILL.md found in repository root or single subdirectory");
        }
      }
      origin = source;
    } finally {
      // leave cleanup for OS; or could fs.rm(tmpDir, { recursive: true }) after copy
    }
  } else {
    throw new Error("Source must be a local path or git URL");
  }

  const { attributes } = parseSkillFile(
    await fs.readFile(path.join(workDir, SKILL_FILENAME), "utf-8")
  );
  const skillName = attributes.name;
  const errors = validateSkillName(skillName);
  if (errors.length > 0) {
    throw new Error(`Invalid skill name: ${errors.join("; ")}`);
  }

  const installPath = await getInstallPath(target, skillName, cwd, options?.config);
  try {
    const stat = await fs.stat(installPath);
    if (stat.isDirectory() && !options?.force) {
      throw new Error(`Skill already exists at ${installPath}. Use --force to overwrite.`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("already exists")) throw err;
    // path missing, ok
  }
  await fs.mkdir(path.dirname(installPath), { recursive: true });
  await copySkillDir(workDir, installPath);

  const lock = await readLockfile();
  const targetKey = target;
  if (!lock[targetKey]) lock[targetKey] = {};
  lock[targetKey][skillName] = {
    origin: origin ?? installPath,
    installedAt: new Date().toISOString(),
  };
  await writeLockfile(lock);

  return { path: installPath, origin };
}

export interface UpdateSkillOptions {
  cwd?: string;
  config?: SkillsConfig;
  dryRun?: boolean;
}

/**
 * Update one skill by name from its recorded origin. Target required if not in lockfile for single key.
 */
export async function updateSkill(
  name: string,
  target: SkillInstallTarget,
  options?: UpdateSkillOptions
): Promise<void> {
  const cwd = options?.cwd ?? process.cwd();
  const lock = await readLockfile();
  const targetEntry = lock[target];
  const entry = targetEntry?.[name];
  if (!entry?.origin) {
    throw new Error(`No install record for skill "${name}" in target "${target}". Install it first.`);
  }
  if (options?.dryRun) {
    return;
  }
  await installSkill(entry.origin, target, { ...options, force: true, cwd, config: options?.config });
}

/**
 * Update all skills for a target that have a recorded origin.
 */
export async function updateAllSkills(
  target: SkillInstallTarget,
  options?: UpdateSkillOptions
): Promise<{ updated: string[]; skipped: string[] }> {
  const lock = await readLockfile();
  const targetEntry = lock[target];
  const names = targetEntry ? Object.keys(targetEntry) : [];
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const name of names) {
    const entry = targetEntry![name];
    if (!entry?.origin) {
      skipped.push(name);
      continue;
    }
    try {
      await updateSkill(name, target, options);
      updated.push(name);
    } catch {
      skipped.push(name);
    }
  }
  return { updated, skipped };
}
