import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "..", "..");
const cloudDistLocal = path.join(repoRoot, "cloud-studio", "dist-local");
const distRoot = path.join(cliRoot, "dist");
const placeholderSrc = path.join(cliRoot, "local-studio-placeholder");
const placeholderDest = path.join(distRoot, "local-studio-placeholder");
const bundleDest = path.join(distRoot, "local-studio");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, name.name);
    const to = path.join(dest, name.name);
    if (name.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

if (fs.existsSync(placeholderSrc)) {
  copyDir(placeholderSrc, placeholderDest);
}

if (fs.existsSync(path.join(cloudDistLocal, "index.html"))) {
  if (fs.existsSync(bundleDest)) {
    fs.rmSync(bundleDest, { recursive: true });
  }
  copyDir(cloudDistLocal, bundleDest);
}
