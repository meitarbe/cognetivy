/**
 * Run engine: compute next step for a run (deterministic agent guidance).
 * Used by run status and run step to return next_step in every response.
 */

import type { WorkflowVersionRecord, WorkflowNode, RunRecord } from "./models.js";
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
  /** Set when a node is started but not completed; agent/UI can show "in progress". */
  in_progress_node_id?: string;
}

export interface RunStatusEnvelope {
  run_id: string;
  status: string;
  next_step: NextStep;
  /** Node currently in progress (started, not completed). */
  current_node_id?: string;
}

/**
 * Topological order of workflow nodes (DAG): A comes before B if B consumes a collection produced by A.
 * Ensures we pick the next runnable node in dependency order, not array order.
 */
export function topologicalNodeOrder(nodes: WorkflowNode[]): WorkflowNode[] {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const collectionToProducers = new Map<string, string[]>();
  for (const n of nodes) {
    for (const c of n.output_collections ?? []) {
      if (!collectionToProducers.has(c)) collectionToProducers.set(c, []);
      collectionToProducers.get(c)!.push(n.id);
    }
  }
  const outEdges = new Map<string, Set<string>>();
  for (const n of nodes) outEdges.set(n.id, new Set());
  for (const n of nodes) {
    for (const c of n.input_collections ?? []) {
      for (const producerId of collectionToProducers.get(c) ?? []) {
        if (producerId !== n.id) outEdges.get(producerId)!.add(n.id);
      }
    }
  }
  const inDegree: Record<string, number> = {};
  for (const n of nodes) inDegree[n.id] = 0;
  for (const n of nodes) {
    for (const consumerId of outEdges.get(n.id) ?? []) {
      inDegree[consumerId] = (inDegree[consumerId] ?? 0) + 1;
    }
  }
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const consumerId of outEdges.get(id) ?? []) {
      inDegree[consumerId]--;
      if (inDegree[consumerId] === 0) queue.push(consumerId);
    }
  }
  const ordered = order.map((id) => idToNode.get(id)!).filter(Boolean);
  return ordered.length === nodes.length ? ordered : nodes;
}

export interface GetNextStepResult {
  next_step: NextStep;
  run: RunRecord;
  version: WorkflowVersionRecord | null;
  /** Set when a node is started but not completed (in progress). */
  current_node_id?: string;
}

/**
 * Compute the next step for a running workflow: which node to run next, or complete_run/done.
 * A node is runnable when all its input_collections have at least one item in the run.
 * Next node is chosen by topological (DAG) order so dependencies run before consumers.
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
  const orderedNodes = topologicalNodeOrder(nodes);

  for (const node of orderedNodes) {
    if (startedNodeIds.has(node.id)) {
      const outKinds = node.output_collections ?? [];
      const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
      return {
        run,
        version,
        current_node_id: node.id,
        next_step: {
          action: "complete_node",
          node_id: node.id,
          in_progress_node_id: node.id,
          output_collections: outKinds,
          collection_kind: collectionKind,
          hint: `Produce output for node "${node.id}" (${outKinds.join(", ")}), then: cognetivy run step --run ${runId} --node ${node.id}${collectionKind ? ` --collection-kind ${collectionKind}` : ""} [payload via stdin]`,
        },
      };
    }
  }
  for (const node of orderedNodes) {
    if (completedNodeIds.has(node.id)) continue;
    const inputsSatisfied = node.input_collections.every((c) => kindsWithData.has(c));
    if (!inputsSatisfied) continue;
    const outKinds = node.output_collections ?? [];
    const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
    return {
      run,
      version,
      current_node_id: undefined,
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
    current_node_id: undefined,
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
 * Includes current_node_id when a node is in progress (started, not completed).
 */
export function formatNextStepLine(
  runId: string,
  status: string,
  next_step: NextStep,
  current_node_id?: string
): string {
  const payload: Record<string, unknown> = { run_id: runId, status, next_step };
  if (current_node_id !== undefined) payload.current_node_id = current_node_id;
  return `COGNETIVY_NEXT_STEP=${JSON.stringify(payload)}`;
}
