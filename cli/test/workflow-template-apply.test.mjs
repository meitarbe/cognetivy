import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import { ensureWorkspace, readWorkflowIndex, readWorkflowRecord, readWorkflowVersionRecord } from "../dist/workspace.js";
import { applyWorkflowTemplateToWorkspace } from "../dist/workflow-template-apply.js";

describe("workflow apply-template", () => {
  it("creates workflow from template and sets it current", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-template-"));
    await ensureWorkspace(cwd, { noGitignore: true });

    const result = await applyWorkflowTemplateToWorkspace({
      cwd,
      templateId: "bug-triage-and-fix",
      workflowId: "wf_bug_template_test",
    });

    assert.strictEqual(result.workflow.workflow_id, "wf_bug_template_test");
    assert.strictEqual(result.version.workflow_id, "wf_bug_template_test");
    assert.strictEqual(result.version.version_id, "v1");

    const index = await readWorkflowIndex(cwd);
    assert.strictEqual(index.current_workflow_id, "wf_bug_template_test");
    assert.ok(index.workflows.some((w) => w.workflow_id === "wf_bug_template_test"));

    const wf = await readWorkflowRecord("wf_bug_template_test", cwd);
    assert.strictEqual(wf.current_version_id, "v1");

    const version = await readWorkflowVersionRecord("wf_bug_template_test", "v1", cwd);
    assert.ok(Array.isArray(version.nodes));
    assert.ok(version.nodes.length > 0);
  });
});
