import path from "node:path";
import fs from "node:fs/promises";

export type SkillSourceConfig = "agent" | "openclaw" | "workspace";
export type SkillInstallTargetConfig = "agent" | "cursor" | "openclaw" | "workspace";

export interface SkillsConfigBlock {
  sources?: SkillSourceConfig[];
  extraDirs?: string[];
  default_install_target?: SkillInstallTargetConfig;
}

export interface CognetivyConfig {
  /** Default "by" value for runs/events (e.g. "agent:cursor"). */
  default_by?: string;
  /** Skill discovery and install target config. */
  skills?: SkillsConfigBlock;
  [key: string]: unknown;
}

const CONFIG_FILENAME = "config.json";

/**
 * Get user-level config path using env-paths (e.g. ~/.config/cognetivy/config.json).
 */
async function getGlobalConfigPath(): Promise<string> {
  const { default: envPaths } = await import("env-paths");
  const paths = envPaths("cognetivy", { suffix: "" });
  return path.join(paths.config, CONFIG_FILENAME);
}

/**
 * Load global config if it exists. Returns empty object if missing.
 */
export async function loadGlobalConfig(): Promise<CognetivyConfig> {
  try {
    const configPath = await getGlobalConfigPath();
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as CognetivyConfig;
  } catch {
    return {};
  }
}

/**
 * Load local workspace config from .cognetivy/config.json if it exists.
 */
export async function loadLocalConfig(cwd: string = process.cwd()): Promise<CognetivyConfig> {
  const path = await import("node:path");
  const localPath = path.default.resolve(cwd, ".cognetivy", CONFIG_FILENAME);
  try {
    const raw = await fs.readFile(localPath, "utf-8");
    return JSON.parse(raw) as CognetivyConfig;
  } catch {
    return {};
  }
}

/**
 * Merged config: local overrides global.
 */
export async function getMergedConfig(cwd: string = process.cwd()): Promise<CognetivyConfig> {
  const [global, local] = await Promise.all([loadGlobalConfig(), loadLocalConfig(cwd)]);
  return { ...global, ...local };
}
