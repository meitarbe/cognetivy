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
import { ensureWorkspace } from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { installSkillsFromDirectory, installCognetivySkill } from "./skills.js";
import { renderPngFileToAnsi } from "./terminal-png.js";

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
  { value: InstallerClient.OpenClaw, label: "OpenClaw", hint: "Installs Agent Skills bundle into skills/" },
  { value: InstallerClient.OpenAICodex, label: "OpenAI Codex", hint: "Installs into .agents/skills" },
  { value: InstallerClient.GitHubCopilot, label: "GitHub Copilot", hint: "Installs into .agents/skills" },
  { value: InstallerClient.GeminiCli, label: "Gemini CLI", hint: "Installs into .gemini/skills" },
  { value: InstallerClient.Amp, label: "Amp", hint: "Installs into .agents/skills" },
  { value: InstallerClient.CursorAgentCli, label: "Cursor Agent CLI", hint: "Installs into .agents/skills" },
  { value: InstallerClient.OpenCode, label: "OpenCode", hint: "Installs into .agents/skills" },
  { value: InstallerClient.FactoryDroid, label: "Factory Droid", hint: "Installs into .agents/skills" },
  { value: InstallerClient.CCR, label: "CCR (Claude Code Router)", hint: "Installs into .agents/skills" },
  { value: InstallerClient.QwenCode, label: "Qwen Code", hint: "Installs into .agents/skills" },
];

function clientToTarget(client: InstallerClient): SkillInstallTarget {
  switch (client) {
    case InstallerClient.ClaudeCode:
      return "agent";
    case InstallerClient.Cursor:
      return "cursor";
    case InstallerClient.OpenClaw:
      return "openclaw";
    case InstallerClient.GeminiCli:
      return "gemini";
    case InstallerClient.OpenAICodex:
    case InstallerClient.GitHubCopilot:
    case InstallerClient.Amp:
    case InstallerClient.CursorAgentCli:
    case InstallerClient.OpenCode:
    case InstallerClient.FactoryDroid:
    case InstallerClient.CCR:
    case InstallerClient.QwenCode:
      return "agents";
    default:
      return "agents";
  }
}

function clientToTargets(clients: InstallerClient[]): SkillInstallTarget[] {
  const targets = new Set<SkillInstallTarget>();
  for (const c of clients) {
    targets.add(clientToTarget(c));
  }
  return Array.from(targets);
}

function getTargetToClientsMap(clients: InstallerClient[]): Map<SkillInstallTarget, InstallerClient[]> {
  const map = new Map<SkillInstallTarget, InstallerClient[]>();
  for (const c of clients) {
    const target = clientToTarget(c);
    const list = map.get(target) ?? [];
    list.push(c);
    map.set(target, list);
  }
  return map;
}

function getClientLabel(client: InstallerClient): string {
  const opt = CLIENT_OPTIONS.find((o) => o.value === client);
  return opt?.label ?? String(client);
}

function targetToDisplayLabel(target: SkillInstallTarget, clientsForTarget: InstallerClient[]): string {
  if (clientsForTarget.length === 0) {
    return targetToFallbackDisplayLabel(target);
  }
  if (clientsForTarget.length === 1) {
    return getClientLabel(clientsForTarget[0]);
  }
  if (target === "agents") {
    return "Agent skills";
  }
  return clientsForTarget.map(getClientLabel).join(", ");
}

function targetToFallbackDisplayLabel(target: SkillInstallTarget): string {
  switch (target) {
    case "agent":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "openclaw":
      return "OpenClaw";
    case "gemini":
      return "Gemini CLI";
    case "agents":
      return "Agent skills";
    case "workspace":
      return "Workspace";
    default:
      return String(target);
  }
}

function targetToInstallPathHint(target: SkillInstallTarget): string {
  switch (target) {
    case "agent":
      return ".claude/skills";
    case "cursor":
      return ".cursor/skills";
    case "openclaw":
      return "skills/";
    case "workspace":
      return ".cognetivy/skills";
    case "gemini":
      return ".gemini/skills";
    case "agents":
      return ".agents/skills";
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

  const selectedClientsList = selectedClients as InstallerClient[];
  const targetsToInstall = clientToTargets(selectedClientsList);
  const targetToClients = getTargetToClientsMap(selectedClientsList);

  p.note(
    targetsToInstall
      .map((t) => `- ${targetToDisplayLabel(t, targetToClients.get(t) ?? [])}: ${targetToInstallPathHint(t)}`)
      .join("\n"),
    "Install plan"
  );

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
  const optsCommon = { force, cwd, config: skillsConfig ?? {} };
  const installedPaths: string[] = [];

  for (const internalTarget of targetsToInstall) {
    const displayLabel = targetToDisplayLabel(internalTarget, targetToClients.get(internalTarget) ?? []);
    const pathHint = targetToInstallPathHint(internalTarget);
    const spinner = ora(`Installing (${pathHint})...`).start();
    try {
      const { results } = await installSkillsFromDirectory(cwd, internalTarget, optsCommon);
      for (const r of results) {
        installedPaths.push(`[${displayLabel}] ${r.path}`);
      }
      const cognetivyPath = await installCognetivySkill(internalTarget, cwd, skillsConfig);
      installedPaths.push(`[${displayLabel}] Cognetivy skill: ${cognetivyPath}`);
      spinner.succeed(`Installed to ${pathHint}`);
    } catch (err) {
      spinner.fail(`Failed for ${internalTarget}`);
      throw err;
    }
  }

  p.outro("Done! Installed to:");
  installedPaths.forEach((line) => console.log(`  ${line}`));
}
