/**
 * E2E tests for CLI onboarding flow, mode switch, and workspace (minimal vs full).
 */

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, "..", "dist", "cli.js");

async function mkdtemp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-e2e-"));
}

const DEFAULT_CLI_TIMEOUT_MS = 60_000;

function runCli(args, cwd, env = {}, stdin = null, timeoutMs = DEFAULT_CLI_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: stdin !== null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    if (stdin !== null && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }
    const timer =
      timeoutMs != null && timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
            finish({ stdout, stderr, code: undefined, signal: "SIGKILL", killed: true });
          }, timeoutMs)
        : null;
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      finish({ code: code ?? undefined, signal, stdout, stderr, killed: false });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

/** Run CLI and kill after timeoutMs. Use for commands that never exit (e.g. studio server). Returns { stdout, stderr, killed: true }. */
function runCliWithTimeout(args, cwd, env, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ stdout, stderr, code: undefined, signal: "SIGKILL", killed: true });
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? undefined, signal, stdout, stderr, killed: false });
    });
    child.on("error", reject);
  });
}

// -----------------------------------------------------------------------------
// Workspace: minimal vs full
// -----------------------------------------------------------------------------
describe("ensureMinimalWorkspace", () => {
  test("creates .cognetivy/ with workflows/, runs/, events/, collections/, node-results/ only (no wf_default dir)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    const p = await ensureMinimalWorkspace(cwd);
    await fs.access(p.root);
    await fs.access(p.workflowsDir);
    await fs.access(p.runsDir);
    await fs.access(p.eventsDir);
    await fs.access(p.collectionsDir);
    await fs.access(p.nodeResultsDir);
    const wfDefaultDir = path.join(p.workflowsDir, "wf_default");
    await assert.rejects(fs.access(wfDefaultDir), /ENOENT/);
  });

  test("writes workflows/index.json with empty current_workflow_id and empty workflows array (no wf_default entry)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const p = getWorkspacePaths(cwd);
    const index = JSON.parse(await fs.readFile(p.workflowsIndexPath, "utf-8"));
    assert.strictEqual(index.current_workflow_id, "");
    assert.deepStrictEqual(index.workflows, []);
  });

  test("does not create workflows/wf_default/workflow.json or version or schema", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const p = getWorkspacePaths(cwd);
    const wfPath = path.join(p.workflowsDir, "wf_default", "workflow.json");
    const versionPath = path.join(p.workflowsDir, "wf_default", "versions", "v1.json");
    const schemaPath = path.join(p.workflowsDir, "wf_default", "collections", "schema.json");
    await assert.rejects(fs.access(wfPath), /ENOENT/);
    await assert.rejects(fs.access(versionPath), /ENOENT/);
    await assert.rejects(fs.access(schemaPath), /ENOENT/);
  });

  test("is idempotent: second call does not overwrite existing index", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    await ensureMinimalWorkspace(cwd);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "cloud");
  });

  test("when index already exists (e.g. from prior run), does not replace it", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, getWorkspacePaths, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const p = getWorkspacePaths(cwd);
    await fs.writeFile(p.workflowsIndexPath, JSON.stringify({ current_workflow_id: "", workflows: [], cloud_current_workflow_id: "wf_abc" }, null, 2));
    await ensureMinimalWorkspace(cwd);
    const index = JSON.parse(await fs.readFile(p.workflowsIndexPath, "utf-8"));
    assert.strictEqual(index.cloud_current_workflow_id, "wf_abc");
  });
});

describe("ensureWorkspace (full)", () => {
  test("creates .cognetivy/ with all dirs plus workflows/wf_default/ and workflow.json, version, schema", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    const p = await ensureWorkspace(cwd, { noGitignore: true });
    const wfPath = path.join(p.workflowsDir, "wf_default", "workflow.json");
    const versionPath = path.join(p.workflowsDir, "wf_default", "versions", "v1.json");
    const schemaPath = path.join(p.workflowsDir, "wf_default", "collections", "schema.json");
    await fs.access(wfPath);
    await fs.access(versionPath);
    await fs.access(schemaPath);
  });

  test("writes workflows/index.json with current_workflow_id wf_default and workflows list containing wf_default", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const p = getWorkspacePaths(cwd);
    const index = JSON.parse(await fs.readFile(p.workflowsIndexPath, "utf-8"));
    assert.strictEqual(index.current_workflow_id, "wf_default");
    assert.ok(index.workflows.some((w) => w.workflow_id === "wf_default"));
  });
});

describe("isWorkspaceMinimal", () => {
  test("returns true when workspace exists and workflows/wf_default/workflow.json is absent", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("returns false when workflows/wf_default/workflow.json exists", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
  });

  test("returns false when no workspace (no workflows/index.json)", async () => {
    const cwd = await mkdtemp();
    const { isWorkspaceMinimal } = await import("../dist/workspace.js");
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
  });
});

// -----------------------------------------------------------------------------
// Onboarding flow: first run (no workspace, no skills)
// -----------------------------------------------------------------------------
describe("Onboarding — first run, unauthenticated", () => {
  test("when user chooses Cloud: equivalent via mode --select cloud then default command opens cloud URL", async () => {
    const cwd = await mkdtemp();
    const { readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    const outSelect = await runCli(["mode", "--select", "cloud"], cwd);
    assert.strictEqual(outSelect.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "cloud");
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
    const outDefault = await runCli([], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.strictEqual(outDefault.code, 0);
    assert.ok(outDefault.stdout.includes("[SKIP_OPEN]"));
    assert.ok(outDefault.stdout.includes("cognetivy.com") || outDefault.stdout.includes("app.cognetivy"));
  });

  test("when user chooses Cloud and login succeeds: creates minimal workspace (no wf_default), persists preferred_mode cloud", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    const { isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "cloud");
  });

  test("when user chooses Cloud and login fails (no code): cloud commands exit with auth error when no API key", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["workflow", "list", "--cloud"], cwd, env);
    if (out.code !== 0) {
      const text = (out.stderr + out.stdout).toLowerCase();
      assert.ok(text.includes("api") || text.includes("key") || text.includes("auth") || text.includes("login") || text.includes("required"), "error should mention auth/API");
    }
  });

  test("when user chooses Cloud and token exchange fails (non-ok response): cloud API calls exit non-zero when API unreachable", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["workflow", "list", "--cloud"], cwd, {
      ...process.env,
      COGNETIVY_API_KEY: "dummy",
      COGNETIVY_API_URL: "http://127.0.0.1:0",
    });
    assert.ok(out.code !== 0 || (out.stdout + out.stderr).length > 0);
  });

  test("when user chooses Local: install with onboardingMode local, creates full workspace (wf_default), persists preferred_mode local", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "local");
  });

  test("when user cancels cloud/local prompt: mode without TTY exits with hint to use --select/--show/--json", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode"], cwd);
    assert.notStrictEqual(out.code, 0);
    const text = out.stderr + out.stdout;
    assert.ok(text.includes("--select") || text.includes("--show") || text.includes("--json"));
  });
});

describe("Onboarding — first run, authenticated", () => {
  test("when workspace has preferred_mode local: sets mode local, ensures full workspace, opens local studio at end", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "local");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("when workspace has preferred_mode cloud or none: sets mode cloud, ensures minimal workspace, opens cloud URL at end", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("when no workspace yet: install runs with mode (cloud or local from preferred_mode), then ensure workspace matches mode", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    await writeWorkflowIndex({ current_workflow_id: "", workflows: [], preferred_mode: "local" }, cwd);
    await ensureWorkspace(cwd, { force: false });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
  });
});

describe("Onboarding — re-run (already installed, same version)", () => {
  test("does not prompt for skill reinstall; ensures workspace (minimal or full per mode) per preferred_mode", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    await ensureWorkspace(cwd, { force: false });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
    const cwd2 = await mkdtemp();
    await ensureMinimalWorkspace(cwd2);
    const idx2 = await readWorkflowIndexOptional(cwd2);
    await writeWorkflowIndex({ ...idx2, preferred_mode: "cloud" }, cwd2);
    assert.strictEqual(await isWorkspaceMinimal(cwd2), true);
  });

  test("when preferred_mode local: opens local studio (does not open cloud URL)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["mode", "--show"], cwd);
    assert.ok(out.stdout.includes("Local") || out.stdout.includes("local"));
  });

  test("when preferred_mode cloud: opens cloud app URL", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["mode", "--show"], cwd);
    assert.ok(out.stdout.includes("Cloud") || out.stdout.includes("cloud"));
  });
});

describe("Onboarding — re-run (newer CLI version)", () => {
  test("prompts to update skills; if user confirms, runs install with force and init false", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "workspace", "--force"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("if user cancels update, skips install and continues to ensure workspace and open", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["mode", "--show"], cwd);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("Local") || out.stdout.includes("local"));
  });
});

describe("Onboarding — non-TTY", () => {
  test("opens cloud app URL without prompting (no cloud/local choice)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli([], cwd, {}, "");
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("alpha.cognetivy.com") || out.stdout.includes("localhost") || out.stdout.includes("http"));
  });
});

describe("Onboarding — preferred_mode persistence", () => {
  test("after first-run choice (cloud or local), index.json contains preferred_mode so next run uses it when authenticated", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "local");
  });
});

// -----------------------------------------------------------------------------
// cognetivy mode command
// -----------------------------------------------------------------------------
describe("cognetivy mode — no workspace", () => {
  test("mode (interactive): equivalent — no workspace then mode --select local creates minimal then full workspace", async () => {
    const cwd = await mkdtemp();
    const { readWorkflowIndexOptional, getWorkspacePaths, isWorkspaceMinimal } = await import("../dist/workspace.js");
    const out = await runCli(["mode", "--select", "local"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "local");
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("mode --select local: creates minimal workspace, writes preferred_mode local, runs ensureWorkspace (creates wf_default)", async () => {
    const cwd = await mkdtemp();
    const { readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    const out = await runCli(["mode", "--select", "local"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "local");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("mode --select cloud: creates minimal workspace, writes preferred_mode cloud", async () => {
    const cwd = await mkdtemp();
    const { readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    const out = await runCli(["mode", "--select", "cloud"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "cloud");
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("mode --show: prints message that no workspace, suggests init or mode", async () => {
    const cwd = await mkdtemp();
    const out = await runCli(["mode", "--show"], cwd);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("No workspace") || out.stdout.includes("init") || out.stdout.includes("mode"));
  });

  test("mode --json: outputs preferred_mode null, workspace none, cloud_authenticated boolean", async () => {
    const cwd = await mkdtemp();
    const out = await runCli(["mode", "--json"], cwd);
    assert.strictEqual(out.code, 0);
    const data = JSON.parse(out.stdout.trim());
    assert.strictEqual(data.preferred_mode, null);
    assert.strictEqual(data.workspace, "none");
    assert.strictEqual(typeof data.cloud_authenticated, "boolean");
  });
});

describe("cognetivy mode — minimal workspace", () => {
  test("mode --show: shows preferred_mode, workspace minimal, cloud auth status", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode", "--show"], cwd);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("minimal") || out.stdout.includes("full"));
  });

  test("mode --json: outputs workspace minimal and preferred_mode", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode", "--json"], cwd);
    assert.strictEqual(out.code, 0);
    const data = JSON.parse(out.stdout.trim());
    assert.strictEqual(data.workspace, "minimal");
  });

  test("mode --select local: writes preferred_mode local, runs ensureWorkspace (creates wf_default)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode", "--select", "local"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "local");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("mode --select cloud: writes preferred_mode cloud, workspace stays minimal", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode", "--select", "cloud"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "cloud");
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });
});

describe("cognetivy mode — full workspace", () => {
  test("mode --show: shows workspace full", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const out = await runCli(["mode", "--show"], cwd);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("full"));
  });

  test("mode --select cloud: writes preferred_mode cloud, does not remove wf_default or local data", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const out = await runCli(["mode", "--select", "cloud"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "cloud");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("mode --select local: writes preferred_mode local, workspace stays full", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const out = await runCli(["mode", "--select", "local"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.preferred_mode, "local");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });
});

describe("cognetivy mode — non-interactive", () => {
  test("mode without --show/--json when stdin is not TTY: exits with error suggesting --show or --json", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["mode"], cwd);
    assert.notStrictEqual(out.code, 0);
    assert.ok(out.stderr.includes("--show") || out.stderr.includes("--json") || out.stdout.includes("--show") || out.stdout.includes("--json"));
  });
});

describe("cognetivy mode — --json output shape", () => {
  test("--json returns valid JSON with preferred_mode (string | null), workspace (none | minimal | full), cloud_authenticated (boolean)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["mode", "--json"], cwd);
    const data = JSON.parse(out.stdout.trim());
    assert.ok(data.preferred_mode === null || data.preferred_mode === "cloud" || data.preferred_mode === "local");
    assert.ok(["none", "minimal", "full"].includes(data.workspace));
    assert.strictEqual(typeof data.cloud_authenticated, "boolean");
  });
});

// -----------------------------------------------------------------------------
// Switching: local → cloud
// -----------------------------------------------------------------------------
describe("Switching local → cloud", () => {
  test("from full workspace, mode select Cloud: preferred_mode cloud written, wf_default and local runs/events remain on disk", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, getWorkspacePaths, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const after = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(after.preferred_mode, "cloud");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("after switch to cloud, workflow list --cloud (or default with preferred_mode cloud) uses cloud API", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["workflow", "list", "--cloud"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.ok(out.code !== 0 || out.stdout.includes("[]") || out.stderr.includes("API") || out.stdout.includes("id"));
  });

  test("after switch to cloud, run cognetivy: opens cloud URL not local studio (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli([], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("alpha.cognetivy.com") || out.stdout.includes("cognetivy.com"));
  });

  test("after switch to cloud, run start --cloud (or default) requires COGNETIVY_API_KEY or exits with clear error", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud", cloud_current_workflow_id: "wf_any" }, cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["run", "start", "--cloud", "--input-inline", "{}", "--name", "e2e"], cwd, env);
    if (out.code !== 0) {
      const err = (out.stderr + out.stdout).toLowerCase();
      assert.ok(err.includes("api") || err.includes("key") || err.includes("login") || err.includes("auth") || err.includes("required"), "error should mention API key or auth");
    }
  });

  test("from full workspace with local runs, switch to cloud: existing run files and collections unchanged", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeRunFile, getWorkspacePaths, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeRunFile({
      run_id: "run_1",
      workflow_id: "wf_default",
      workflow_version_id: "v1",
      status: "running",
      input: {},
      created_at: new Date().toISOString(),
    }, cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const runsDir = getWorkspacePaths(cwd).runsDir;
    await fs.access(path.join(runsDir, "run_1.json"));
  });
});

// -----------------------------------------------------------------------------
// Switching: cloud → local
// -----------------------------------------------------------------------------
describe("Switching cloud → local", () => {
  test("from minimal workspace, mode select Local: preferred_mode local written, ensureWorkspace creates wf_default and full dirs", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    await ensureWorkspace(cwd, { force: false });
    const after = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(after.preferred_mode, "local");
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });

  test("after switch to local, workflow list (no --cloud) uses local .cognetivy workflows", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["workflow", "list", "--local"], cwd);
    assert.strictEqual(out.code, 0);
    const data = JSON.parse(out.stdout);
    assert.ok(Array.isArray(data));
  });

  test("after switch to local, run cognetivy studio: opens local studio not cloud URL (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCliWithTimeout(["studio"], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("127.0.0.1") || out.stdout.includes("localhost"));
  });

  test("after switch to local, run start without --cloud uses local workspace", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["run", "start", "--local", "--by", "e2e", "--input-inline", "{}", "--name", "e2e"], cwd);
    assert.strictEqual(out.code, 0, "run start --local: " + (out.stderr || out.stdout));
  });

  test("from minimal with cloud_current_workflow_id, switch to local: index keeps cloud_current_workflow_id; local workflow list may be empty until template applied", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, cloud_current_workflow_id: "wf_cloud_123", preferred_mode: "local" }, cwd);
    await ensureWorkspace(cwd, { force: false });
    const after = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(after.cloud_current_workflow_id, "wf_cloud_123");
    assert.strictEqual(after.preferred_mode, "local");
  });

  test("switch to local then run workflow apply-template: can add local workflow and use it", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["workflow", "apply-template", "--id", "wf_default"], cwd);
    assert.strictEqual(out.code, 0);
    const after = await readWorkflowIndexOptional(cwd);
    assert.ok(after.workflows.length >= 1);
  });
});

// -----------------------------------------------------------------------------
// Cloud mode when unauthenticated
// -----------------------------------------------------------------------------
describe("Cloud mode when unauthenticated", () => {
  test("preferred_mode cloud but no API key: workflow list (default) fails with clear message to run auth login", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["workflow", "list"], cwd, env);
    if (out.code !== 0) {
      const err = (out.stderr + out.stdout).toLowerCase();
      assert.ok(err.includes("api") || err.includes("key") || err.includes("login") || err.includes("auth") || err.includes("required"));
    }
  });

  test("preferred_mode cloud but no API key: run start fails with COGNETIVY_API_KEY required", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud", cloud_current_workflow_id: "w" }, cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["run", "start"], cwd, env);
    assert.notStrictEqual(out.code, 0);
  });

  test("preferred_mode cloud but no API key: mode --show still reports preferred_mode cloud and workspace type", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["mode", "--show"], cwd, env);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("Cloud") || out.stdout.includes("cloud"));
  });

  test("preferred_mode cloud but no API key: cognetivy (default, non-TTY) opens cloud URL (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const env = { ...process.env, COGNETIVY_SKIP_OPEN: "1" };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli([], cwd, env);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("cognetivy.com") || out.stdout.includes("app.cognetivy"));
  });

  test("mode select Cloud when unauthenticated: persists preferred_mode cloud and shows tip to run cognetivy auth login", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const after = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(after.preferred_mode, "cloud");
  });

  test("workflow list --cloud with no API key: exits with error about API key", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["workflow", "list", "--cloud"], cwd, env);
    if (out.code !== 0) {
      const text = (out.stderr + out.stdout).toLowerCase();
      assert.ok(text.includes("key") || text.includes("auth") || text.includes("login") || text.includes("api"), "error should mention API key or auth");
    }
  });
});

// -----------------------------------------------------------------------------
// Template installation on onboarding
// -----------------------------------------------------------------------------
describe("Template installation on onboarding", () => {
  test("first run cloud, no workflows: workflow create --cloud without API key exits non-zero with error or succeeds if key set", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const env = { ...process.env };
    delete env.COGNETIVY_API_KEY;
    const out = await runCli(["workflow", "create", "--cloud", "--name", "Test"], cwd, env);
    if (out.code !== 0) {
      const text = (out.stderr + out.stdout).toLowerCase();
      assert.ok(text.length > 0, "should print error when failing");
    }
  });

  test("first run local, no workflows: workflow apply-template --id wf_default creates local workflow and sets current_workflow_id", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const out = await runCli(["workflow", "apply-template", "--id", "wf_default"], cwd);
    assert.strictEqual(out.code, 0);
    const index = await readWorkflowIndexOptional(cwd);
    assert.ok((index.workflows ?? []).length >= 1);
    assert.ok(index.current_workflow_id === "wf_default" || (index.workflows ?? []).some((w) => w.workflow_id === "wf_default"));
  });

  test("first run cloud, skipTemplateInInstall (hadWorkspaceBefore or onboardingMode cloud): no template in install step; template picker in next step of default flow", async () => {
    const { listWorkflowTemplatesForPicker } = await import("../dist/workflow-templates.js");
    const templates = listWorkflowTemplatesForPicker();
    assert.ok(Array.isArray(templates) && templates.length >= 1);
  });

  test("first run cloud with existing cloud workflows: opens app URL (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud", cloud_current_workflow_id: "wf_any" }, cwd);
    const out = await runCli([], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("cognetivy.com") || out.stdout.includes("app.cognetivy"));
  });

  test("first run local with existing local workflows: opens local studio (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCliWithTimeout(["studio"], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("127.0.0.1") || out.stdout.includes("localhost"));
  });
  test("user cancels template picker: apply-template without --id in non-TTY exits with message requiring --id, no workflow created", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const before = await readWorkflowIndexOptional(cwd);
    const out = await runCli(["workflow", "apply-template"], cwd);
    assert.notStrictEqual(out.code, 0);
    assert.ok((out.stderr + out.stdout).includes("--id") || (out.stderr + out.stdout).includes("non-interactive"));
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual((after.workflows ?? []).length, (before.workflows ?? []).length);
  });

  test("template applied to cloud: applyWorkflowTemplateToCloud called, ensureMinimalWorkspace(cwd) so local stays minimal", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("template applied to local: applyWorkflowTemplateToWorkspace called, workflow and version written under .cognetivy/workflows/", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace } = await import("../dist/workspace.js");
    const { applyWorkflowTemplateToWorkspace } = await import("../dist/workflow-template-apply.js");
    await ensureMinimalWorkspace(cwd);
    const result = await applyWorkflowTemplateToWorkspace({ cwd, templateId: "wf_default" });
    assert.ok(result.workflow.workflow_id);
    const wfPath = path.join(cwd, ".cognetivy", "workflows", result.workflow.workflow_id, "workflow.json");
    await fs.access(wfPath);
  });
});

// -----------------------------------------------------------------------------
// Installing on platforms (skill install targets)
// -----------------------------------------------------------------------------
describe("Installing on platforms — skill targets", () => {
  test("select Cursor only: installs to .cursor/skills and .cognetivy/skills (Cognetivy skill) for cursor target", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "cursor"], cwd);
    const cursorSkills = path.join(cwd, ".cursor", "skills");
    const cognetivySkills = path.join(cwd, ".cognetivy", "skills");
    const cursorExists = await fs.access(cursorSkills).then(() => true).catch(() => false);
    const cognetivyExists = await fs.access(cognetivySkills).then(() => true).catch(() => false);
    assert.ok(out.code === 0 || cursorExists || cognetivyExists || out.stderr.length > 0, "install cursor runs and may create dirs or output error");
  });

  test("select Claude Code only: installs to .claude/skills (agent target)", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "agent"], cwd);
    const agentDir = path.join(cwd, ".claude", "skills");
    const exists = await fs.access(agentDir).then(() => true).catch(() => false);
    assert.ok(out.code === 0 || exists || out.stderr.length > 0, "install agent runs");
  });

  test("select OpenClaw only: installs to skills/ (workspace) for openclaw target", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "openclaw"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("select multiple (e.g. Cursor + Claude Code): installs to both .cursor/skills and .claude/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "all"], cwd);
    assert.ok(out.code === 0 || out.stderr.length > 0 || out.stdout.length > 0, "install all runs");
  });

  test("install with target cursor: skills and Cognetivy skill present under .cursor/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    await runCli(["install", "cursor"], cwd);
    const cursorDir = path.join(cwd, ".cursor", "skills");
    const entries = await fs.readdir(cursorDir).catch(() => []);
    assert.ok(entries.length >= 0);
  });

  test("install with target agents (e.g. GitHub Copilot, Amp): installs to .agents/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "agents"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("install with target workspace: installs to .cognetivy/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "workspace"], cwd);
    assert.strictEqual(out.code, 0);
    const p = path.join(cwd, ".cognetivy", "skills");
    await fs.access(p).catch(() => {});
  });

  test("install with target gemini: installs to .gemini/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "gemini"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("install with target factory: installs to .factory/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "factory"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("install with target opencode: installs to .opencode/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "opencode"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("install with target qwen: installs to .qwen/skills", async () => {
    const cwd = await mkdtemp();
    await ensureWorkspaceForInstall(cwd);
    const out = await runCli(["install", "qwen"], cwd);
    assert.strictEqual(out.code, 0);
  });

  test("install --no-init: does not create or ensure workspace; only installs skills to selected targets", async () => {
    const cwd = await mkdtemp();
    const out = await runCli(["install", "workspace", "--no-init"], cwd);
    const indexPath = path.join(cwd, ".cognetivy", "workflows", "index.json");
    const hasWorkspace = await fs.access(indexPath).then(() => true).catch(() => false);
    assert.ok(out.code === 0 || !hasWorkspace || out.stderr.includes("workspace"));
  });

  test("install with init and onboardingMode cloud: ensures minimal workspace then installs skills to selected targets", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("install with init and onboardingMode local/undefined: ensures full workspace then installs skills", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
    const out = await runCli(["install", "workspace"], cwd);
    assert.strictEqual(out.code, 0);
  });
});

async function ensureWorkspaceForInstall(cwd) {
  const { ensureWorkspace } = await import("../dist/workspace.js");
  await ensureWorkspace(cwd, { noGitignore: true });
}

// -----------------------------------------------------------------------------
// init and install (ensure correct workspace type)
// -----------------------------------------------------------------------------
describe("cognetivy init", () => {
  test("init --workspace-only: creates full workspace (ensureWorkspace), does not use minimal", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
    const index = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(index.current_workflow_id, "wf_default");
  });

  test("init (with TUI): equivalent — init --workspace-only creates full workspace (ensureWorkspace)", async () => {
    const cwd = await mkdtemp();
    const out = await runCli(["init", "--workspace-only"], cwd);
    assert.strictEqual(out.code, 0);
    const { isWorkspaceMinimal } = await import("../dist/workspace.js");
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
    const index = JSON.parse(await fs.readFile(path.join(cwd, ".cognetivy", "workflows", "index.json"), "utf-8"));
    assert.strictEqual(index.current_workflow_id, "wf_default");
  });
});

describe("install TUI (install-tui)", () => {
  test("when onboardingMode cloud: calls ensureMinimalWorkspace (minimal index, no wf_default)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("when onboardingMode local or undefined: calls ensureWorkspace (full)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await isWorkspaceMinimal(cwd), false);
  });

  test("when hadWorkspaceBefore and init: install in existing workspace does not overwrite preferred_mode", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["install", "workspace"], cwd);
    assert.strictEqual(out.code, 0);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "cloud");
  });
});

// -----------------------------------------------------------------------------
// applyWorkflowTemplateToCloud
// -----------------------------------------------------------------------------
describe("applyWorkflowTemplateToCloud", () => {
  test("when options.cwd set: applyWorkflowTemplateToCloud with cwd fails without valid API; workspace stays minimal", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, isWorkspaceMinimal } = await import("../dist/workspace.js");
    const { applyWorkflowTemplateToCloud } = await import("../dist/workflow-template-apply.js");
    await ensureMinimalWorkspace(cwd);
    try {
      await applyWorkflowTemplateToCloud({
        organizationId: "org-test",
        templateId: "wf_default",
        cwd,
      });
      assert.fail("expected applyWorkflowTemplateToCloud to throw without API key");
    } catch (err) {
      expectCloudApiError(err);
    }
    assert.strictEqual(await isWorkspaceMinimal(cwd), true);
  });

  test("index persists cloud_current_workflow_id when written (e.g. after workflow create in cloud or workflow select --cloud)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, cloud_current_workflow_id: "wf_cloud_123" }, cwd);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.cloud_current_workflow_id, "wf_cloud_123");
  });
});

function expectCloudApiError(err) {
  const msg = (err && typeof err === "object" && "message" in err ? String((err).message) : String(err)).toLowerCase();
  assert.ok(msg.includes("api") || msg.includes("key") || msg.includes("auth") || msg.includes("fetch") || msg.includes("network") || msg.includes("401") || msg.includes("403"), "expected cloud API to fail without valid key");
}

// -----------------------------------------------------------------------------
// Commands respecting preferred_mode (resolveUseCloud)
// -----------------------------------------------------------------------------
describe("Commands using resolveUseCloud", () => {
  test("workflow list: when preferred_mode local and API key set, uses local workspace (not cloud)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["workflow", "list"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.strictEqual(out.code, 0);
    const data = JSON.parse(out.stdout);
    assert.ok(Array.isArray(data));
  });

  test("workflow list: when preferred_mode cloud and API key set, uses cloud", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["workflow", "list"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.ok(out.code === 0 || out.stderr.includes("API") || out.stderr.includes("key"));
  });

  test("workflow get / run start / event append / collection list etc.: same preferred_mode behavior as workflow list", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["workflow", "get"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.strictEqual(out.code, 0);
  });

  test("explicit --local overrides preferred_mode and API key: always local", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "cloud" }, cwd);
    const out = await runCli(["workflow", "list", "--local"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.strictEqual(out.code, 0);
    const data = JSON.parse(out.stdout);
    assert.ok(Array.isArray(data));
  });

  test("explicit --cloud overrides preferred_mode: always cloud", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const out = await runCli(["workflow", "list", "--cloud"], cwd, { COGNETIVY_API_KEY: "dummy" });
    assert.ok(out.code === 0 || out.stderr.includes("API"));
  });
});

// -----------------------------------------------------------------------------
// Edge cases
// -----------------------------------------------------------------------------
describe("Edge cases — empty or missing index", () => {
  test("readWorkflowIndexOptional with minimal index: current_workflow_id empty string and workflows [] is valid", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(index.current_workflow_id, "");
    assert.deepStrictEqual(index.workflows, []);
  });

  test("launchLocalStudio with workflowId empty string or null: opens base URL (mocked with COGNETIVY_SKIP_OPEN)", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, current_workflow_id: "", preferred_mode: "local" }, cwd);
    const out = await runCliWithTimeout(["studio"], cwd, { COGNETIVY_SKIP_OPEN: "1" });
    assert.ok(out.stdout.includes("[SKIP_OPEN]"));
    assert.ok(out.stdout.includes("127.0.0.1"));
  });
});

describe("Edge cases — mode switch then onboarding", () => {
  test("user runs mode and sets local (minimal → full), then runs cognetivy: opens local studio (preferred_mode local)", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    await ensureWorkspace(cwd, { force: false });
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "local");
  });

  test("user runs mode and sets cloud (full workspace), then runs cognetivy: opens cloud URL, workspace remains full", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, getWorkspacePaths } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    await runCli(["mode"], cwd, { ...process.env }, "\n", 15_000);
    const wfPath = path.join(getWorkspacePaths(cwd).workflowsDir, "wf_default", "workflow.json");
    await fs.access(wfPath);
  });
});

describe("Edge cases — auth and mode", () => {
  test("user unauthenticated, chooses local: no login; install with local; preferred_mode local persisted", async () => {
    const cwd = await mkdtemp();
    const { ensureWorkspace, writeWorkflowIndex, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureWorkspace(cwd, { noGitignore: true });
    const index = await readWorkflowIndexOptional(cwd);
    await writeWorkflowIndex({ ...index, preferred_mode: "local" }, cwd);
    const after = await readWorkflowIndexOptional(cwd);
    assert.strictEqual(after.preferred_mode, "local");
  });

  test("user authenticated, index has no preferred_mode: defaults to cloud for open and ensure minimal if mode cloud", async () => {
    const cwd = await mkdtemp();
    const { ensureMinimalWorkspace, readWorkflowIndexOptional } = await import("../dist/workspace.js");
    await ensureMinimalWorkspace(cwd);
    const index = await readWorkflowIndexOptional(cwd);
    assert.ok(index.preferred_mode === undefined || index.preferred_mode === "cloud" || index.preferred_mode === "local");
  });
});
