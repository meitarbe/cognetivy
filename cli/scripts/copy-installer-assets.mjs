import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const thisFile = fileURLToPath(import.meta.url);
  const scriptsDir = path.dirname(thisFile);
  const cliRoot = path.resolve(scriptsDir, "..");
  const repoRoot = path.resolve(cliRoot, "..");

  const destDir = path.resolve(cliRoot, "dist", "installer-assets");
  await fs.mkdir(destDir, { recursive: true });

  const skillSrcDir = path.resolve(cliRoot, "installer-assets", "skill");
  const skillDestDir = path.resolve(destDir, "skill");
  if (await fileExists(skillSrcDir)) {
    await fs.mkdir(skillDestDir, { recursive: true });
    const entries = await fs.readdir(skillSrcDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) {
        await fs.copyFile(path.join(skillSrcDir, e.name), path.join(skillDestDir, e.name));
      }
    }
  }
}

await main();

