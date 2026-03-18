/**
 * Run engine: load run state from workspace and compute next step via shared core.
 */

import { getNextStep as getNextStepCore, topologicalNodeOrder as topologicalNodeOrderCore } from "@cognetivy/core";
import type { CanonicalNextStep, GetNextStepResult as CoreGetNextStepResult } from "@cognetivy/core";
import type { WorkflowVersionRecord, RunRecord } from "./models.js";
import {
  readRunFile,
  listNodeResults,
  listCollectionKindsForRun,
  readWorkflowVersionRecord,
} from "./workspace.js";

export type NextStepAction = "run_node" | "run_nodes_parallel" | "complete_node" | "complete_run" | "done";

export type NextStep = CanonicalNextStep;

export interface RunStatusEnvelope {
  run_id: string;
  status: string;
  next_step: NextStep;
  current_node_id?: string;
  current_node_ids?: string[];
}

export { topologicalNodeOrderCore as topologicalNodeOrder };

export interface GetNextStepResult {
  next_step: NextStep;
  run: RunRecord;
  version: WorkflowVersionRecord | null;
  current_node_id?: string;
  current_node_ids?: string[];
}

/**
 * Compute the next step for a running workflow (loads from workspace, delegates to core).
 */
export async function getNextStep(runId: string, cwd: string): Promise<GetNextStepResult> {
  const run = await readRunFile(runId, cwd);
  if (run.status !== "running") {
    return {
      run,
      version: null,
      next_step: { action: "done", hint: "Run is not running." },
    };
  }

  let version: WorkflowVersionRecord | null = null;
  try {
    version = await readWorkflowVersionRecord(run.workflow_id, run.workflow_version_id, cwd);
  } catch {
    return {
      run,
      version: null,
      next_step: { action: "done", hint: "Workflow version not found." },
    };
  }

  const nodeResults = await listNodeResults(runId, cwd);
  const completedNodeIds = new Set(
    nodeResults.filter((r) => r.status === "completed").map((r) => r.node_id)
  );
  const startedNodeIds = new Set(
    nodeResults.filter((r) => r.status === "started").map((r) => r.node_id)
  );
  const kindsWithData = new Set(await listCollectionKindsForRun(runId, cwd));

  const nodes = version.nodes ?? [];
  const result = getNextStepCore({
    nodes,
    completedNodeIds,
    startedNodeIds,
    kindsWithData,
  });

  return {
    run,
    version,
    next_step: result.next_step,
    current_node_id: result.current_node_id,
    current_node_ids: result.current_node_ids,
  };
}

/**
 * Format next_step as a single JSON line for agent parsing (append to stdout).
 */
export function formatNextStepLine(
  runId: string,
  status: string,
  next_step: NextStep,
  current_node_id?: string,
  current_node_ids?: string[]
): string {
  const payload: Record<string, unknown> = { run_id: runId, status, next_step };
  if (current_node_id !== undefined) payload.current_node_id = current_node_id;
  if (current_node_ids !== undefined && current_node_ids.length > 0) payload.current_node_ids = current_node_ids;
  return `COGNETIVY_NEXT_STEP=${JSON.stringify(payload)}`;
}
