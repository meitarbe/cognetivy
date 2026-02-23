import fastJsonPatch from "fast-json-patch";
import type { WorkflowVersion, JsonPatchOperation } from "./models.js";
import { readWorkflowVersion, writeWorkflowVersion, nextVersion } from "./workspace.js";

/**
 * Apply RFC 6902 JSON Patch to a workflow version and return the new workflow.
 * Does not write to disk.
 */
export function applyPatchToWorkflow(
  workflow: WorkflowVersion,
  patch: JsonPatchOperation[]
): WorkflowVersion {
  const doc = JSON.parse(JSON.stringify(workflow)) as WorkflowVersion;
  const result = fastJsonPatch.applyPatch(doc, patch as fastJsonPatch.Operation[], true, false);
  return result.newDocument as WorkflowVersion;
}

/**
 * Load workflow version, apply patch, assign next version, write new file, return new version id.
 */
export async function applyMutationToWorkspace(
  fromVersion: string,
  patch: JsonPatchOperation[],
  workflowId: string,
  cwd: string = process.cwd()
): Promise<string> {
  const workflow = await readWorkflowVersion(fromVersion, cwd);
  const next = nextVersion(fromVersion);
  const updated: WorkflowVersion = applyPatchToWorkflow(workflow, patch);
  updated.version = next;
  updated.workflow_id = workflowId;
  await writeWorkflowVersion(updated, cwd);
  return next;
}
