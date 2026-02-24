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
  { value: InstallerClient.OpenAICodex, label: "OpenAI Codex", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.GitHubCopilot, label: "GitHub Copilot", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.GeminiCli, label: "Gemini CLI", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.Amp, label: "Amp", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.CursorAgentCli, label: "Cursor Agent CLI", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.OpenCode, label: "OpenCode", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.FactoryDroid, label: "Factory Droid", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.CCR, label: "CCR (Claude Code Router)", hint: "Agent Skills bundle (SKILL.md) into skills/" },
  { value: InstallerClient.QwenCode, label: "Qwen Code", hint: "Agent Skills bundle (SKILL.md) into skills/" },
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
      default:
        targets.add("openclaw");
        break;
    }
  }
  return Array.from(targets);
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
  const faviconPath = await (async function resolveFavicon(): Promise<string | null> {
    for (const c of candidates) {
      if (await fileExists(c)) return c;
    }
    return null;
  })();

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
}

export async function runInstallTUI(options: InstallTUIOptions): Promise<void> {
  const { cwd, force = false, init = true } = options;

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

  if (init) {
    const initSpinner = ora("Initializing workspace...").start();
    try {
      await ensureWorkspace(cwd);
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
      throw err;
    }
  }

  p.outro("Done! Installed to:");
  installedPaths.forEach((line) => console.log(`  ${line}`));
}
