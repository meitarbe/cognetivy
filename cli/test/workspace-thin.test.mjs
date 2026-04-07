import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureMinimalWorkspace,
  workspaceExists,
  readWorkflowIndex,
  getWorkspacePaths,
} from "../dist/workspace.js";

describe("thin .cognetivy workspace", () => {
  it("ensureMinimalWorkspace creates only the workspace root (no workflows/index.json)", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-thin-"));
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await workspaceExists(cwd), true);
    await assert.rejects(async () => {
      await readWorkflowIndex(cwd);
    });
  });

  it("ensureMinimalWorkspace does not overwrite an existing workflows/index.json", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-thin-"));
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    const indexPath = getWorkspacePaths(cwd).workflowsIndexPath;
    const patched = {
      current_workflow_id: "",
      cloud_current_workflow_id: "wf_preserved",
      workflows: [],
    };
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, `${JSON.stringify(patched, null, 2)}\n`, "utf-8");
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    const after = await readWorkflowIndex(cwd);
    assert.strictEqual(after.cloud_current_workflow_id, "wf_preserved");
  });
});
