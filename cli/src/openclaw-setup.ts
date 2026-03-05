/**
 * One-step OpenClaw setup when user selects OpenClaw in the installer:
 * install the bundled plugin into .openclaw/extensions and config into .openclaw/openclaw.json.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import JSON5 from "json5";

const OPENCLAW_CONFIG_FILE = "openclaw.json";
const PLUGIN_ID = "cognetivy-openclaw-plugin";

/**
 * Resolve the path to the bundled OpenClaw plugin (inside cognetivy's dist).
 */
export function getOpenClawPluginPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "openclaw-plugin");
}

/**
 * Resolve the OpenClaw root directory: .openclaw inside cwd, or cwd if cwd is already .openclaw.
 */
export function getOpenClawRoot(cwd: string): string {
  const resolved = path.resolve(cwd);
  const base = path.basename(resolved);
  return base === ".openclaw" ? resolved : path.join(resolved, ".openclaw");
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
 * Copy the bundled plugin into openclawRoot/extensions/PLUGIN_ID so OpenClaw finds it there.
 */
async function copyPluginToExtensions(pluginPath: string, openclawRoot: string): Promise<string | null> {
  const extensionsDir = path.join(openclawRoot, "extensions");
  const destDir = path.join(extensionsDir, PLUGIN_ID);
  try {
    await fs.mkdir(path.dirname(destDir), { recursive: true });
    const entries = await fs.readdir(pluginPath, { withFileTypes: true });
    for (const ent of entries) {
      const srcPath = path.join(pluginPath, ent.name);
      const destPath = path.join(destDir, ent.name);
      if (ent.isDirectory()) {
        await copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    return (err as Error).message;
  }
  return null;
}

/**
 * Ensure openclawRoot/openclaw.json has cognetivy plugin enabled and workspace set,
 * and that agents have the plugin in tools.allow.
 */
export async function patchOpenClawConfig(workspacePath: string, openclawRoot: string): Promise<string | null> {
  const configPath = path.join(openclawRoot, OPENCLAW_CONFIG_FILE);
  const absoluteWorkspace = path.resolve(workspacePath);

  let config: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    config = JSON5.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return (err as Error).message;
    }
  }

  if (!config.skills || typeof config.skills !== "object") {
    config.skills = {};
  }
  const skillsConfig = config.skills as Record<string, unknown>;
  if (!skillsConfig.load || typeof skillsConfig.load !== "object") {
    skillsConfig.load = {};
  }
  const loadConfig = skillsConfig.load as Record<string, unknown>;
  const skillsDir = path.join(openclawRoot, "skills");
  const extraDirs = Array.isArray(loadConfig.extraDirs) ? (loadConfig.extraDirs as string[]) : [];
  if (!extraDirs.includes(skillsDir)) {
    loadConfig.extraDirs = [...extraDirs, skillsDir];
  }

  if (!config.plugins || typeof config.plugins !== "object") {
    config.plugins = {};
  }
  const plugins = config.plugins as Record<string, unknown>;
  const allowList = Array.isArray(plugins.allow) ? (plugins.allow as string[]) : [];
  if (!allowList.includes(PLUGIN_ID)) {
    plugins.allow = [...allowList, PLUGIN_ID];
  }
  if (!plugins.entries || typeof plugins.entries !== "object") {
    plugins.entries = {};
  }
  const entries = plugins.entries as Record<string, unknown>;
  entries[PLUGIN_ID] = {
    enabled: true,
    config: { workspace: absoluteWorkspace },
  };

  const agents = config.agents as Record<string, unknown> | undefined;
  const list = agents?.list as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(list)) {
    for (const agent of list) {
      if (!agent.tools || typeof agent.tools !== "object") {
        agent.tools = {};
      }
      const tools = agent.tools as Record<string, unknown>;
      let allow: string[] = Array.isArray(tools.allow) ? (tools.allow as string[]) : [];
      if (!allow.includes(PLUGIN_ID)) {
        allow = [...allow, PLUGIN_ID];
      }
      tools.allow = allow;
    }
  }

  try {
    await fs.mkdir(openclawRoot, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    return (err as Error).message;
  }

  return null;
}

/**
 * Run full OpenClaw setup: copy plugin into .openclaw/extensions and patch .openclaw/openclaw.json.
 * Uses workspacePath to resolve the OpenClaw root ( .openclaw in that directory, or the directory itself if it is .openclaw).
 */
export async function setupOpenClaw(workspacePath: string): Promise<string | null> {
  const pluginPath = getOpenClawPluginPath();
  const pluginManifestPath = path.join(pluginPath, "openclaw.plugin.json");
  try {
    await fs.access(pluginManifestPath);
  } catch {
    return "Cognetivy OpenClaw plugin not found (missing dist/openclaw-plugin). Rebuild the package.";
  }

  const openclawRoot = getOpenClawRoot(workspacePath);
  const copyErr = await copyPluginToExtensions(pluginPath, openclawRoot);
  if (copyErr) return copyErr;

  const patchErr = await patchOpenClawConfig(workspacePath, openclawRoot);
  if (patchErr) return patchErr;

  return null;
}
