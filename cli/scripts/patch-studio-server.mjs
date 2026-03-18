/**
 * Patches dist/studio-server.js to use SQLite for runs and run events
 * (listRuns / readRunEvents from workspace) instead of file-based reads.
 * Run after tsc so the patch survives every build and npm i -g .
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioPath = path.resolve(__dirname, "..", "dist", "studio-server.js");

const OLD_IMPORT =
  `import { getWorkspacePaths, workspaceExists, readWorkflowIndex, readWorkflowRecord, listWorkflowVersionIds, readWorkflowVersionRecord, readRunFile, updateRunFile, runExists, readCollectionSchema, listCollectionKindsForRun, readCollections, listNodeResults, } from "./workspace.js";`;

const NEW_IMPORT =
  `import { getWorkspacePaths, workspaceExists, readWorkflowIndex, readWorkflowRecord, listWorkflowVersionIds, readWorkflowVersionRecord, listRuns, readRunFile, readRunEvents, updateRunFile, runExists, readCollectionSchema, listCollectionKindsForRun, readCollections, listNodeResults, } from "./workspace.js";`;

// Use regex so we match regardless of .json regex escaping or whitespace in source
const OLD_HANDLE_API_RUNS_RE = /async function handleApiRuns\s*\(\s*cwd\s*\)\s*\{[\s\S]*?return runs;\s*\}/;

const NEW_HANDLE_API_RUNS = "async function handleApiRuns(cwd) {\n    return listRuns(cwd);\n}";

const OLD_HANDLE_API_RUN_EVENTS_RE = /async function handleApiRunEvents\s*\(\s*cwd\s*,\s*runId\s*\)\s*\{[\s\S]*?\.map\s*\(\s*\(line\)\s*=>\s*JSON\.parse\s*\(line\)\s*\)\s*;\s*\}/;
const NEW_HANDLE_API_RUN_EVENTS = "async function handleApiRunEvents(cwd, runId) {\n    return readRunEvents(runId, cwd);\n}";

async function main() {
  let content = await fs.readFile(studioPath, "utf-8");
  const needsRuns = !content.includes("return listRuns(cwd)");
  const needsEvents = !content.includes("return readRunEvents(runId, cwd)");
  if (!needsRuns && !needsEvents) {
    console.log("studio-server.js already patched, skip");
    return;
  }
  if (needsRuns) {
    content = content.replace(OLD_IMPORT, NEW_IMPORT);
    if (!content.includes("listRuns")) {
      throw new Error("patch-studio-server.mjs: import replacement failed (workspace.js may have changed)");
    }
    const beforeRuns = content;
    content = content.replace(OLD_HANDLE_API_RUNS_RE, NEW_HANDLE_API_RUNS);
    if (content === beforeRuns || !content.includes("return listRuns(cwd)")) {
      throw new Error(
        "patch-studio-server.mjs: handleApiRuns regex did not match. " +
        "Ensure dist/studio-server.js contains 'async function handleApiRuns' and 'return runs;'."
      );
    }
  }
  if (needsEvents) {
    const beforeEvents = content;
    content = content.replace(OLD_HANDLE_API_RUN_EVENTS_RE, NEW_HANDLE_API_RUN_EVENTS);
    if (content === beforeEvents || !content.includes("return readRunEvents(runId, cwd)")) {
      throw new Error(
        "patch-studio-server.mjs: handleApiRunEvents regex did not match. " +
        "Ensure dist/studio-server.js contains 'async function handleApiRunEvents' and '.map((line) => JSON.parse(line))'."
      );
    }
  }
  await fs.writeFile(studioPath, content);
  console.log("Patched dist/studio-server.js (listRuns, readRunEvents)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
