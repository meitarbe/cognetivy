import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.join(__dirname, "..", "dist", "cli.js");

describe("CLI smoke", () => {
  it("prints version and exits 0", () => {
    const result = spawnSync(process.execPath, [cliEntry, "--version"], {
      encoding: "utf-8",
    });
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout ?? "", /\d+\.\d+\.\d+/);
  });
});
