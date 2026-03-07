/**
 * Interactive terminal installer for cognetivy.
 * - Shows a colorful banner (best-effort favicon render)
 * - Asks which tool(s) you use (Claude Code, Cursor, OpenClaw, and others)
 * - Installs accordingly
 */

import * as p from "@clack/prompts";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ora from "ora";
import type { SkillInstallTarget, SkillsConfig } from "./skills.js";
import { ensureWorkspace, workspaceExists } from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { installSkillsFromDirectory, installCognetivySkill } from "./skills.js";
import { renderPngFileToAnsi } from "./terminal-png.js";
import { getCurrentVersionSync, writeInstalledSkillsVersion } from "./skills-version.js";
import { listWorkflowTemplatesForPicker } from "./workflow-templates.js";
import { applyWorkflowTemplateToWorkspace } from "./workflow-template-apply.js";

function getSkillsConfigFromMerged(config: Awaited<ReturnType<typeof getMergedConfig>>): SkillsConfig | undefined {
  const skills = config.skills as SkillsConfig | undefined;
  return skills ?? undefined;
}

enum InstallerClient {
  ClaudeCode = "claude_code",
  Cursor = "cursor",
  OpenClaw = "openclaw",
  OpenAICodex = "openai_codex",
  GitHubCopilot = "github_copilot",
  GeminiCli = "gemini_cli",
  Amp = "amp",
  CursorAgentCli = "cursor_agent_cli",
  OpenCode = "opencode",
  FactoryDroid = "factory_droid",
  CCR = "ccr",
  QwenCode = "qwen_code",
}

interface ClientOption {
  value: InstallerClient;
  label: string;
  hint: string;
}

const CLIENT_OPTIONS: ClientOption[] = [
  { value: InstallerClient.ClaudeCode, label: "Claude Code", hint: "Installs into .claude/skills" },
  { value: InstallerClient.Cursor, label: "Cursor", hint: "Installs into .cursor/skills" },
  { value: InstallerClient.OpenClaw, label: "OpenClaw", hint: "Installs into skills/ (workspace)" },
  { value: InstallerClient.OpenAICodex, label: "OpenAI Codex", hint: "Installs into .agents/skills" },
  { value: InstallerClient.GitHubCopilot, label: "GitHub Copilot", hint: "Installs into .agents/skills" },
  { value: InstallerClient.GeminiCli, label: "Gemini CLI", hint: "Installs into .gemini/skills" },
  { value: InstallerClient.Amp, label: "Amp", hint: "Installs into .agents/skills" },
  { value: InstallerClient.CursorAgentCli, label: "Cursor Agent CLI", hint: "Installs into .agents/skills" },
  { value: InstallerClient.OpenCode, label: "OpenCode", hint: "Installs into .opencode/skills" },
  { value: InstallerClient.FactoryDroid, label: "Factory Droid", hint: "Installs into .factory/skills" },
  { value: InstallerClient.CCR, label: "CCR (Claude Code Router)", hint: "Installs into .claude/skills" },
  { value: InstallerClient.QwenCode, label: "Qwen Code", hint: "Installs into .qwen/skills" },
];

function clientToTargets(clients: InstallerClient[]): SkillInstallTarget[] {
  const targets = new Set<SkillInstallTarget>();
  for (const c of clients) {
    switch (c) {
      case InstallerClient.ClaudeCode:
        targets.add("agent");
        break;
      case InstallerClient.Cursor:
        targets.add("cursor");
        break;
      case InstallerClient.OpenClaw:
        targets.add("openclaw");
        break;
      case InstallerClient.CCR:
        targets.add("agent");
        break;
      case InstallerClient.FactoryDroid:
        targets.add("factory");
        break;
      case InstallerClient.GeminiCli:
        targets.add("gemini");
        break;
      case InstallerClient.OpenCode:
        targets.add("opencode");
        break;
      case InstallerClient.QwenCode:
        targets.add("qwen");
        break;
      default:
        targets.add("agents");
        break;
    }
  }
  return Array.from(targets);
}

function targetToInstallPathHint(target: SkillInstallTarget): string {
  switch (target) {
    case "agent":
      return ".claude/skills";
    case "agents":
      return ".agents/skills";
    case "cursor":
      return ".cursor/skills";
    case "factory":
      return ".factory/skills";
    case "gemini":
      return ".gemini/skills";
    case "openclaw":
      return "skills/";
    case "opencode":
      return ".opencode/skills";
    case "qwen":
      return ".qwen/skills";
    case "workspace":
      return ".cognetivy/skills";
    default:
      return String(target);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function tryPrintFaviconBanner(cwd: string): Promise<void> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "installer-assets", "icon-pixelized2.png"),
    path.resolve(moduleDir, "installer-assets", "icon-pixelized.png"),
    path.resolve(moduleDir, "installer-assets", "favicon.png"),
    path.resolve(cwd, "studio", "public", "icon-pixelized2.png"),
    path.resolve(cwd, "studio", "public", "icon-pixelized.png"),
    path.resolve(cwd, "studio", "public", "favicon.png"),
    path.resolve(moduleDir, "../../studio/public/icon-pixelized2.png"),
    path.resolve(moduleDir, "../../studio/public/icon-pixelized.png"),
    path.resolve(moduleDir, "../../studio/public/favicon.png"),
  ];
  async function resolveFirstExistingPath(paths: string[]): Promise<string | null> {
    for (const candidatePath of paths) {
      if (await fileExists(candidatePath)) return candidatePath;
    }
    return null;
  }
  const faviconPath = await resolveFirstExistingPath(candidates);

  if (!faviconPath) {
    return;
  }

  const rendered = await renderPngFileToAnsi(faviconPath, { widthChars: 18 });
  if (rendered) {
    // Print before clack intro so prompts keep their layout.
    console.log(rendered);
    console.log("");
  }
}

export interface InstallTUIOptions {
  cwd: string;
  force?: boolean;
  init?: boolean;
  noGitignore?: boolean;
}

export async function runInstallTUI(options: InstallTUIOptions): Promise<void> {
  const { cwd, force = false, init = true, noGitignore = false } = options;

  await tryPrintFaviconBanner(cwd);
  p.intro("cognetivy install");

  const selectedClients = await p.multiselect({
    message: "Which tool(s) are you using?",
    options: CLIENT_OPTIONS,
    required: true,
  });

  if (p.isCancel(selectedClients)) {
    p.cancel("Install cancelled.");
    process.exit(0);
  }

  const targetsToInstall = clientToTargets(selectedClients as InstallerClient[]);

  p.note(
    targetsToInstall.map((t) => `- ${t}: ${targetToInstallPathHint(t)}`).join("\n"),
    "Install plan"
  );

  const hadWorkspaceBefore = await workspaceExists(cwd);

  if (init) {
    const initSpinner = ora("Initializing workspace...").start();
    try {
      await ensureWorkspace(cwd, { force, noGitignore });
      initSpinner.succeed("Workspace ready");
    } catch (err) {
      initSpinner.fail("Workspace init failed");
      throw err;
    }
  }

  const config = await getMergedConfig(cwd);
  const skillsConfig = getSkillsConfigFromMerged(config);
  const forceSkills = force ?? true;
  const optsCommon = { force: forceSkills, cwd, config: skillsConfig ?? {} };
  const installedPaths: string[] = [];

  for (const internalTarget of targetsToInstall) {
    const spinner = ora(`Installing (${targetToInstallPathHint(internalTarget)})...`).start();
    try {
      const { results } = await installSkillsFromDirectory(cwd, internalTarget, optsCommon);
      for (const r of results) {
        installedPaths.push(`[${internalTarget}] ${r.path}`);
      }
      const cognetivyPath = await installCognetivySkill(internalTarget, cwd, skillsConfig);
      installedPaths.push(`[${internalTarget}] Cognetivy skill: ${cognetivyPath}`);
      spinner.succeed(`Installed to ${targetToInstallPathHint(internalTarget)}`);
    } catch (err) {
      spinner.fail(`Failed for ${internalTarget}`);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Skill already exists") && message.includes("--force")) {
        p.note(
          `Skills are already installed at ${targetToInstallPathHint(internalTarget)}. Run \`cognetivy install --force\` to update them.`,
          "Tip"
        );
        process.exit(1);
      }
      throw err;
    }
  }

  await writeInstalledSkillsVersion(cwd, getCurrentVersionSync());

  if (hadWorkspaceBefore) {
    p.note("Workspace already set up; skipping template.", "Skills updated");
  } else {
    const templates = listWorkflowTemplatesForPicker();
    const templateSelection = await p.select({
      message: "Pick a workflow template to apply now",
      options: templates.map((t) => ({ value: t.id, label: t.name, hint: `${t.category} · ${t.node_count} nodes` })),
    });

    if (p.isCancel(templateSelection)) {
      p.cancel("Install cancelled.");
      process.exit(0);
    }

    const templateId = templateSelection as string;
    try {
      const result = await applyWorkflowTemplateToWorkspace({ cwd, templateId });
      p.note(
        `Applied template \"${result.template.name}\"\nWorkflow: ${result.workflow.workflow_id}\nNow current: ${result.workflow.workflow_id}`,
        "Template applied"
      );
    } catch (err) {
      p.note(
        err instanceof Error ? err.message : String(err),
        "Template apply failed"
      );
    }
  }

  p.outro("Done! Installed to:");
  installedPaths.forEach((line) => console.log(`  ${line}`));
}
