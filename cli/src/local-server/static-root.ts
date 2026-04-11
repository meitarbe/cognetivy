/**
 * Resolve directory for local studio static assets (built bundle or placeholder).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** After `tsc`, this file lives in dist/local-server/ - bundled studio is dist/local-studio */
export function resolveLocalStudioStaticRoot(): string {
  const fromDist = path.resolve(__dirname, "..", "local-studio");
  if (fs.existsSync(path.join(fromDist, "index.html"))) {
    return fromDist;
  }
  const placeholder = path.resolve(__dirname, "..", "local-studio-placeholder");
  return placeholder;
}

/**
 * True when the shipped static tree is the full cloud-studio build (has React app + /cli-auth).
 * The placeholder page cannot host CLI OAuth.
 */
export function localStudioBundleHasCliAuth(staticRoot: string): boolean {
  try {
    const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf-8");
    return html.includes('id="root"') && html.includes("/assets/");
  } catch {
    return false;
  }
}
