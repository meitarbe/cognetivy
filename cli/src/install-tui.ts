/**
 * Interactive terminal UI for cognetivy install (target selection, spinners, summary).
 */

import * as p from "@clack/prompts";
import ora from "ora";
import type { SkillInstallTarget, SkillsConfig } from "./skills.js";
import { ensureWorkspace } from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { installSkillsFromDirectory, installCognetivySkill } from "./skills.js";

function getSkillsConfigFromMerged(config: Awaited<ReturnType<typeof getMergedConfig>>): SkillsConfig | undefined {
  const skills = config.skills as SkillsConfig | undefined;
  return skills ?? undefined;
}

const TARGET_OPTIONS: { value: "all" | SkillInstallTarget; label: string }[] = [
  { value: "all", label: "All (Claude Code, OpenClaw, Workspace)" },
  { value: "agent", label: "Claude Code (.claude/skills)" },
  { value: "openclaw", label: "OpenClaw (skills/)" },
  { value: "workspace", label: "Workspace (.cognetivy/skills)" },
];

function targetToLabel(t: SkillInstallTarget): string {
  switch (t) {
    case "agent":
      return "Claude Code";
    case "openclaw":
      return "OpenClaw";
    case "workspace":
      return "Workspace";
    default:
      return String(t);
  }
}

export interface InstallTUIOptions {
  cwd: string;
  force?: boolean;
  init?: boolean;
}

export async function runInstallTUI(options: InstallTUIOptions): Promise<void> {
  const { cwd, force = false, init = true } = options;

  p.intro("cognetivy install");

  const targetAnswer = await p.select({
    message: "Where do you want to install?",
    options: TARGET_OPTIONS,
  });

  if (p.isCancel(targetAnswer)) {
    p.cancel("Install cancelled.");
    process.exit(0);
  }

  const resolved = targetAnswer as "all" | SkillInstallTarget;
  const targetsToInstall: SkillInstallTarget[] =
    resolved === "all" ? (["agent", "openclaw", "workspace"] as SkillInstallTarget[]) : [resolved];

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
    const label = targetToLabel(internalTarget);
    const spinner = ora(`Installing skills for ${label}...`).start();
    try {
      const { results } = await installSkillsFromDirectory(cwd, internalTarget, optsCommon);
      for (const r of results) {
        installedPaths.push(`[${label}] ${r.path}`);
      }
      const cognetivyPath = await installCognetivySkill(internalTarget, cwd, skillsConfig);
      installedPaths.push(`[${label}] Cognetivy skill: ${cognetivyPath}`);
      spinner.succeed(`${label}: installed`);
    } catch (err) {
      spinner.fail(`${label}: failed`);
      throw err;
    }
  }

  p.outro("Done! Installed to:");
  installedPaths.forEach((line) => console.log(`  ${line}`));
}
