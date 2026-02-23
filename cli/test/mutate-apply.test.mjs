import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureWorkspace,
  readWorkflowPointer,
  readWorkflowVersion,
  writeMutationFile,
  readMutationFile,
  updateMutationFile,
} from "../dist/workspace.js";
import { applyMutationToWorkspace } from "../dist/mutation.js";

describe("mutate apply", () => {
  it("apply creates v2 workflow and updates pointer", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-test-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const mutationId = "mut_2025-01-01T00-00-00Z_abc";
    const record = {
      mutation_id: mutationId,
      target: { type: "workflow", workflow_id: "wf_default", from_version: "v1" },
      patch: [
        {
          op: "add",
          path: "/nodes/-",
          value: {
            id: "validate",
            type: "TASK",
            contract: { input: ["summary"], output: ["validated"] },
          },
        },
        { op: "add", path: "/edges/-", value: { from: "synthesize", to: "validate" } },
      ],
      reason: "Add validation step",
      status: "proposed",
      created_by: "test",
      created_at: new Date().toISOString(),
    };
    await writeMutationFile(record, cwd);

    const newVersion = await applyMutationToWorkspace(
      "v1",
      record.patch,
      record.target.workflow_id,
      cwd
    );
    assert.strictEqual(newVersion, "v2");

    await fs.writeFile(
      path.join(cwd, ".cognetivy", "workflow.json"),
      JSON.stringify({ workflow_id: "wf_default", current_version: newVersion }, null, 2)
    );
    const pointer2 = await readWorkflowPointer(cwd);
    assert.strictEqual(pointer2.current_version, "v2");

    const wf2 = await readWorkflowVersion("v2", cwd);
    assert.strictEqual(wf2.nodes.length, 3);
    assert.strictEqual(wf2.nodes.some((n) => n.id === "validate"), true);
    assert.strictEqual(
      wf2.edges.some((e) => e.from === "synthesize" && e.to === "validate"),
      true
    );

    await updateMutationFile(
      mutationId,
      { status: "applied", applied_to_version: newVersion },
      cwd
    );
    const mut = await readMutationFile(mutationId, cwd);
    assert.strictEqual(mut.status, "applied");
    assert.strictEqual(mut.applied_to_version, "v2");
  });
});
