import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve(__dirname, "../../core");
const targetDir = path.resolve(__dirname, "../src/core");
const files = [
  "action-names.ts",
  "collection-validate.ts",
  "index.ts",
  "next-step-engine.ts",
  "types.ts",
  "workflow-validate.ts",
];

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await cp(path.join(sourceDir, file), path.join(targetDir, file), { force: true });
}
