/**
 * Storage-agnostic next-step engine: given nodes and run state, returns canonical next step.
 * Used by backend (loads from Prisma, calls this, maps to API) and CLI (loads from workspace, calls this).
 */

import type {
  WorkflowNode,
  CanonicalNextStep,
  GetNextStepParams,
  GetNextStepResult,
} from "./types.js";

/**
 * Topological order of workflow nodes (DAG): A comes before B if B consumes a collection produced by A.
 */
export function topologicalNodeOrder(nodes: WorkflowNode[]): WorkflowNode[] {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const collectionToProducers = new Map<string, string[]>();
  for (const n of nodes) {
    const outCols = n.output_collections ?? [];
    for (const c of outCols) {
      if (!collectionToProducers.has(c)) collectionToProducers.set(c, []);
      collectionToProducers.get(c)!.push(n.id);
    }
  }
  const outEdges = new Map<string, Set<string>>();
  for (const n of nodes) outEdges.set(n.id, new Set());
  for (const n of nodes) {
    const inCols = n.input_collections ?? [];
    for (const c of inCols) {
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

/**
 * Return the node ids that should be auto-started when a run is created (first runnable set).
 * Call this right after creating the run and run_input; then persist step_started + node result
 * for each returned id so the run shows "in progress" immediately. Used by CLI and backend.
 */
export function getInitialRunnableNodeIds(
  nodes: WorkflowNode[],
  kindsWithData: Set<string>
): string[] {
  if (nodes.length === 0) return [];
  const orderedNodes = topologicalNodeOrder(nodes);
  const completedNodeIds = new Set<string>();
  const startedNodeIds = new Set<string>();
  const inputCols = (n: WorkflowNode) => n.input_collections ?? [];
  const runnableNodes = orderedNodes.filter(
    (n) =>
      !completedNodeIds.has(n.id) &&
      !startedNodeIds.has(n.id) &&
      inputCols(n).every((c) => kindsWithData.has(c))
  );
  return runnableNodes.map((n) => n.id);
}

/**
 * Compute the canonical next step from run state (storage-agnostic).
 */
export function getNextStep(params: GetNextStepParams): GetNextStepResult {
  const { nodes, completedNodeIds, startedNodeIds, kindsWithData } = params;

  if (nodes.length === 0) {
    return {
      next_step: {
        action: "done",
        hint: "Workflow has no nodes or version not found.",
      },
    };
  }

  const orderedNodes = topologicalNodeOrder(nodes);
  const startedList = Array.from(startedNodeIds);

  // In-progress: node started but not completed (complete_node)
  for (const node of orderedNodes) {
    if (startedNodeIds.has(node.id)) {
      const outKinds = node.output_collections ?? [];
      const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
      const inputKinds = node.input_collections ?? [];
      return {
        current_node_id: node.id,
        current_node_ids: startedList.length > 0 ? startedList : undefined,
        next_step: {
          action: "complete_node",
          node_id: node.id,
          in_progress_node_id: node.id,
          input_collections: inputKinds,
          output_collections: outKinds,
          collection_kind: collectionKind,
          hint: `Produce output for node "${node.id}" and complete.`,
        },
      };
    }
  }

  const inputCols = (n: WorkflowNode) => n.input_collections ?? [];
  const runnableNodes = orderedNodes.filter(
    (n) =>
      !completedNodeIds.has(n.id) &&
      !startedNodeIds.has(n.id) &&
      inputCols(n).every((c) => kindsWithData.has(c))
  );
  const runnableIds = runnableNodes.map((n) => n.id);

  if (runnableIds.length > 1) {
    const inputCollectionsByNode: Record<string, string[]> = {};
    for (const n of runnableNodes) {
      inputCollectionsByNode[n.id] = n.input_collections ?? [];
    }
    return {
      current_node_ids: startedList.length > 0 ? startedList : undefined,
      next_step: {
        action: "run_nodes_parallel",
        runnable_node_ids: runnableIds,
        input_collections_by_node: inputCollectionsByNode,
        hint: `Multiple nodes runnable (${runnableIds.join(", ")}). Spawn one sub-agent per node or start all then complete each.`,
      },
    };
  }

  if (runnableIds.length === 1) {
    const node = runnableNodes[0]!;
    const outKinds = node.output_collections ?? [];
    const collectionKind = outKinds.length === 1 ? outKinds[0] : undefined;
    const inputKinds = node.input_collections ?? [];
    return {
      current_node_ids: startedList.length > 0 ? startedList : undefined,
      next_step: {
        action: "run_node",
        node_id: node.id,
        input_collections: inputKinds,
        output_collections: outKinds,
        collection_kind: collectionKind,
        hint: `Do work for node "${node.id}" (output: ${outKinds.join(", ")}), then complete.`,
      },
    };
  }

  const allCompleted = nodes.every((n) => completedNodeIds.has(n.id));
  const next_step: CanonicalNextStep = allCompleted
    ? {
        action: "complete_run",
        hint: "All nodes done. Send run_completed event and complete the run.",
      }
    : {
        action: "done",
        hint: "No runnable node (inputs not ready).",
      };

  return { next_step };
}
