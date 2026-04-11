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
 * True if an input_collections entry is satisfied for scheduling:
 * - the string names a collection kind that already has data in the run, or
 * - the string equals another node's id and every declared output kind for that node has data.
 *
 * The second case fixes workflows where authors list upstream node ids instead of output collection kinds
 * (e.g. input "fundamentals_deep_dive" while that node's output kind is "equity_fundamentals").
 */
function inputCollectionReady(
  ref: string,
  kindsWithData: Set<string>,
  nodeById: Map<string, WorkflowNode>,
): boolean {
  if (kindsWithData.has(ref)) {
    return true;
  }
  const producerNode = nodeById.get(ref);
  if (!producerNode) {
    return false;
  }
  const outs = producerNode.output_collections ?? [];
  if (outs.length === 0) {
    return false;
  }
  return outs.every((k) => kindsWithData.has(k));
}

/**
 * Directed edges producerId -> consumerId: consumer depends on producer's outputs
 * (same graph as used for topological sort).
 */
export function buildProducerToConsumerEdges(nodes: WorkflowNode[]): Map<string, Set<string>> {
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
      if (idToNode.has(c) && c !== n.id) {
        outEdges.get(c)!.add(n.id);
      }
      for (const producerId of collectionToProducers.get(c) ?? []) {
        if (producerId !== n.id) outEdges.get(producerId)!.add(n.id);
      }
    }
  }
  return outEdges;
}

/**
 * All workflow node ids reachable from `fromNodeId` following producer→consumer edges,
 * including `fromNodeId`. Used for "re-run from node" reset scope.
 * Returns [] if `fromNodeId` is not a node in the graph.
 */
export function getDownstreamNodeIds(nodes: WorkflowNode[], fromNodeId: string): string[] {
  const idSet = new Set(nodes.map((n) => n.id));
  if (!idSet.has(fromNodeId)) {
    return [];
  }
  const outEdges = buildProducerToConsumerEdges(nodes);
  const visited = new Set<string>();
  const queue = [fromNodeId];
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const consumerId of outEdges.get(id) ?? []) {
      if (!visited.has(consumerId)) {
        queue.push(consumerId);
      }
    }
  }
  return order;
}

/**
 * Topological order of workflow nodes (DAG): A comes before B if B consumes a collection produced by A.
 */
export function topologicalNodeOrder(nodes: WorkflowNode[]): WorkflowNode[] {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const outEdges = buildProducerToConsumerEdges(nodes);
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

function getBehavioralHintSuffix(params: {
  includeResumeRule: boolean;
  includeReplaceRule: boolean;
  includePromptSplitRule: boolean;
  includeTraceabilityRule: boolean;
  includeOutputKindRule: boolean;
  includeContextCompressionSetRule: boolean;
  includeContextCompressionUseRule: boolean;
  inProgressNodeIds?: string[];
}): string {
  const parts: string[] = [];

  if (params.includeResumeRule) {
    parts.push(
      params.inProgressNodeIds && params.inProgressNodeIds.length > 0
        ? `Resume/stop: current_node_ids present (${params.inProgressNodeIds.join(", ")}). Do not start new nodes; only complete the node_id in next_step.`
        : `Resume/stop: current_node_id/current_node_ids present. Do not start new nodes; only complete the node_id in next_step.`,
    );
  }

  if (params.includeOutputKindRule) {
    parts.push(
      `Output kind matching: when next_step provides collection_kind/output_collections, complete with the matching --collection-kind (exact match).`,
    );
  }

  if (params.includeTraceabilityRule) {
    parts.push(
      `Traceability (required): every output item must include citations + derived_from + reasoning; citations and derived_from must be non-empty.`,
    );
  }

  if (params.includePromptSplitRule) {
    parts.push(
      `Token/prompt rule (<= 100 words): keep the completion prompt for this node-work request <= 100 words; if more is needed, split into intermediate research nodes/collections then synthesize later.`,
    );
  }

  if (params.includeReplaceRule) {
    parts.push(`Replace semantics (retry-safe): if you complete the same node again for the same output kind, previous output items are replaced.`);
  }

  if (params.includeContextCompressionSetRule) {
    parts.push(`C3 context compression: after this node completes, store a compressed artifact in node_result.output (small summary + key references).`);
  }

  if (params.includeContextCompressionUseRule) {
    parts.push(`C3 context compression: for your work, use node_result.output from the latest completed node as the compressed context; do not replay full run history.`);
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
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
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const inputCols = (n: WorkflowNode) => n.input_collections ?? [];
  const runnableNodes = orderedNodes.filter(
    (n) =>
      !completedNodeIds.has(n.id) &&
      !startedNodeIds.has(n.id) &&
      inputCols(n).every((c) => inputCollectionReady(c, kindsWithData, nodeById))
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
          hint: `Produce output for node "${node.id}" and complete.` +
            getBehavioralHintSuffix({
              includeResumeRule: true,
              includeReplaceRule: true,
              includePromptSplitRule: true,
              includeTraceabilityRule: true,
              includeOutputKindRule: true,
              includeContextCompressionSetRule: true,
              includeContextCompressionUseRule: false,
              inProgressNodeIds: startedList.length > 0 ? startedList : undefined,
            }),
        },
      };
    }
  }

  const inputCols = (n: WorkflowNode) => n.input_collections ?? [];
  // "Completed" is a storage-level flag (nodeResult.status === COMPLETED).
  // For reliability we treat a node as effectively completed only when its
  // required outputs exist in the run's collections (tracked via kindsWithData).
  //
  // For now we enforce this strictly for single-output nodes. Multi-output
  // nodes can be revisited after we confirm real workflows patterns.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const effectiveCompletedNodeIds = new Set<string>();
  for (const nodeId of completedNodeIds) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const outKinds = node.output_collections ?? [];
    if (outKinds.length === 0) {
      effectiveCompletedNodeIds.add(nodeId);
      continue;
    }
    // Measure change remaining-2: for reliability, a node is effectively completed
    // only when ALL of its output collection kinds have data in the run.
    const allOutputsPresent = outKinds.every((k) => kindsWithData.has(k));
    if (allOutputsPresent) effectiveCompletedNodeIds.add(nodeId);
  }
  const runnableNodes = orderedNodes.filter(
    (n) =>
      !effectiveCompletedNodeIds.has(n.id) &&
      !startedNodeIds.has(n.id) &&
      inputCols(n).every((c) => inputCollectionReady(c, kindsWithData, nodeById))
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
        hint: `Multiple nodes runnable (${runnableIds.join(", ")}). Spawn one sub-agent per node or start all then complete each.` +
          getBehavioralHintSuffix({
            includeResumeRule: false,
            includeReplaceRule: false,
            includePromptSplitRule: true,
            includeTraceabilityRule: true,
            includeOutputKindRule: false,
            includeContextCompressionSetRule: false,
            includeContextCompressionUseRule: true,
          }),
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
        hint: `Do work for node "${node.id}" (output: ${outKinds.join(", ")}), then complete.` +
          getBehavioralHintSuffix({
            includeResumeRule: false,
            includeReplaceRule: false,
            includePromptSplitRule: true,
            includeTraceabilityRule: true,
            includeOutputKindRule: false,
            includeContextCompressionSetRule: false,
            includeContextCompressionUseRule: true,
          }),
      },
    };
  }

  function buildStuckWorkflowHint(): string {
    const kindsList = Array.from(kindsWithData).sort().join(", ") || "none";
    const parts: string[] = [
      "No runnable node (inputs not ready).",
      `Collections present in run: ${kindsList}.`,
    ];

    const dataGaps: string[] = [];
    for (const nodeId of completedNodeIds) {
      if (effectiveCompletedNodeIds.has(nodeId)) continue;
      const node = nodeById.get(nodeId);
      const outs = (node?.output_collections ?? []).join(", ") || "(none)";
      dataGaps.push(
        `"${nodeId}" is COMPLETED in storage but output kinds [${outs}] are not all present in run collections.`,
      );
    }
    if (dataGaps.length > 0) {
      parts.push(`Data gaps: ${dataGaps.join(" ")}`);
    }

    const blocked: string[] = [];
    for (const n of orderedNodes) {
      if (effectiveCompletedNodeIds.has(n.id)) continue;
      if (startedNodeIds.has(n.id)) continue;
      const ins = inputCols(n);
      const missing = ins.filter((k) => !inputCollectionReady(k, kindsWithData, nodeById));
      if (missing.length > 0) {
        blocked.push(`"${n.id}" needs collection kinds: ${missing.join(", ")}`);
      }
    }
    if (blocked.length > 0) {
      parts.push(`Blocked downstream nodes: ${blocked.join(" | ")}`);
    }

    if (dataGaps.length === 0 && blocked.length === 0) {
      parts.push(
        "Tip: after parallel branches, list each branch's output collection kinds in input_collections, or use the upstream node's id (treated as satisfied when that node's output kinds all have data).",
      );
    }

    return parts.join(" ");
  }

  const allCompleted = nodes.every((n) => effectiveCompletedNodeIds.has(n.id));
  const next_step: CanonicalNextStep = allCompleted
    ? {
        action: "complete_run",
        hint: "All nodes done. Reflect on issues/gaps and explicitly suggest next workflow changes. If the user requests changes, create a new workflow version and set it current, then start a new run with the updated workflow. Finally: send run_completed event and complete the run.",
      }
    : {
        action: "done",
        hint: buildStuckWorkflowHint(),
      };

  return { next_step };
}
