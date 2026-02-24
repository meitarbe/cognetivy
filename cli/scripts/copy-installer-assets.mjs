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

  const srcFavicon = path.resolve(repoRoot, "studio", "public", "favicon.png");
  const srcPixelIcon = path.resolve(repoRoot, "studio", "public", "icon-pixelized.png");
  const srcPixelIcon2 = path.resolve(repoRoot, "studio", "public", "icon-pixelized2.png");
  const destDir = path.resolve(cliRoot, "dist", "installer-assets");
  const destFavicon = path.resolve(destDir, "favicon.png");
  const destPixelIcon = path.resolve(destDir, "icon-pixelized.png");
  const destPixelIcon2 = path.resolve(destDir, "icon-pixelized2.png");

  await fs.mkdir(destDir, { recursive: true });
  if (await fileExists(srcPixelIcon2)) {
    await fs.copyFile(srcPixelIcon2, destPixelIcon2);
  }
  if (await fileExists(srcPixelIcon)) {
    await fs.copyFile(srcPixelIcon, destPixelIcon);
  }
  if (await fileExists(srcFavicon)) {
    await fs.copyFile(srcFavicon, destFavicon);
  }
}

await main();

