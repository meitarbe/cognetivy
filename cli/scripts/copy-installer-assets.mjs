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

async function copyDirRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
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

  const pluginSrc = path.resolve(repoRoot, "openclaw-plugin");
  const pluginDest = path.resolve(cliRoot, "dist", "openclaw-plugin");
  if (await fileExists(path.join(pluginSrc, "openclaw.plugin.json"))) {
    await fs.mkdir(pluginDest, { recursive: true });
    await fs.copyFile(
      path.join(pluginSrc, "openclaw.plugin.json"),
      path.join(pluginDest, "openclaw.plugin.json")
    );
    if (await fileExists(path.join(pluginSrc, "dist"))) {
      await copyDirRecursive(path.join(pluginSrc, "dist"), path.join(pluginDest, "dist"));
    }
    const cliPkg = JSON.parse(await fs.readFile(path.join(cliRoot, "package.json"), "utf-8"));
    const pluginPkg = JSON.parse(await fs.readFile(path.join(pluginSrc, "package.json"), "utf-8"));
    pluginPkg.dependencies = pluginPkg.dependencies || {};
    pluginPkg.dependencies.cognetivy = `^${cliPkg.version}`;
    await fs.writeFile(
      path.join(pluginDest, "package.json"),
      JSON.stringify(pluginPkg, null, 2),
      "utf-8"
    );
  }
}

await main();

