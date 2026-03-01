/**
 * Run engine: compute next step for a run (deterministic agent guidance).
 * Used by run status and run step to return next_step in every response.
 */

import type { WorkflowVersionRecord, RunRecord } from "./models.js";
import {
  readRunFile,
  listNodeResults,
  listCollectionKindsForRun,
  readWorkflowVersionRecord,
} from "./workspace.js";

export type NextStepAction = "run_node" | "complete_node" | "complete_run" | "done";

export interface NextStep {
  action: NextStepAction;
  node_id?: string;
  output_collections?: string[];
  collection_kind?: string;
  hint?: string;
}

export interface RunStatusEnvelope {
  run_id: string;
  status: string;
  next_step: NextStep;
}

/**
 * Compute the next step for a running workflow: which node to run next, or complete_run/done.
 * A node is runnable when all its input_collections have at least one item in the run.
 */
export async function getNextStep(
  runId: string,
  cwd: string
): Promise<{ next_step: NextStep; run: RunRecord; version: WorkflowVersionRecord | null }> {
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
  for (const node of nodes) {
    if (startedNodeIds.has(node.id)) {
      const outKinds = node.output_collections ?? [];
      const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
      return {
        run,
        version,
        next_step: {
          action: "complete_node",
          node_id: node.id,
          output_collections: outKinds,
          collection_kind: collectionKind,
          hint: `Produce output for node "${node.id}" (${outKinds.join(", ")}), then: cognetivy run step --run ${runId} --node ${node.id}${collectionKind ? ` --collection-kind ${collectionKind}` : ""} [payload via stdin]`,
        },
      };
    }
  }
  for (const node of nodes) {
    if (completedNodeIds.has(node.id)) continue;
    const inputsSatisfied = node.input_collections.every((c) => kindsWithData.has(c));
    if (!inputsSatisfied) continue;
    const outKinds = node.output_collections ?? [];
    const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
    return {
      run,
      version,
      next_step: {
        action: "run_node",
        node_id: node.id,
        output_collections: outKinds,
        collection_kind: collectionKind,
        hint: `Do work for node "${node.id}" (output: ${outKinds.join(", ")}), then: cognetivy run step --run ${runId} --node ${node.id}${collectionKind ? ` --collection-kind ${collectionKind}` : ""} [payload via stdin]`,
      },
    };
  }

  const allCompleted = nodes.length > 0 && nodes.every((n) => completedNodeIds.has(n.id));
  return {
    run,
    version,
    next_step: allCompleted
      ? {
          action: "complete_run",
          hint: "All nodes done. Run: echo '{\"type\":\"run_completed\",\"data\":{}}' | cognetivy event append --run " + runId + " && cognetivy run complete --run " + runId,
        }
      : {
          action: "done",
          hint: "No runnable node (inputs not ready) or workflow has no nodes.",
        },
  };
}

/**
 * Format next_step as a single JSON line for agent parsing (append to stdout).
 */
export function formatNextStepLine(runId: string, status: string, next_step: NextStep): string {
  return `COGNETIVY_NEXT_STEP=${JSON.stringify({ run_id: runId, status, next_step })}`;
}
