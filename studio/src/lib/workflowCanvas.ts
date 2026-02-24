import type { Node, Edge } from "@xyflow/react";
import type { WorkflowVersion, WorkflowEdge } from "@/api";
import type { WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import type { CollectionNodeData } from "@/components/workflow/CollectionNode";
import {
  getWorkflowLayout,
  VERTICAL_GAP,
  COLLECTION_NODE_WIDTH,
  COLLECTION_NODE_HEIGHT,
} from "@/lib/workflowLayout";
import { getStepIdFromEventData } from "@/lib/utils";
import type { EventPayload } from "@/api";

const COLLECTION_NODE_GAP = 24;

export type StepStatus = "pending" | "running" | "completed";

export function getStepStatuses(events: EventPayload[]): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {};
  for (const ev of events) {
    const step = getStepIdFromEventData(ev.data);
    if (!step) continue;
    if (ev.type === "step_started") statuses[step] = "running";
    if (ev.type === "step_completed") statuses[step] = "completed";
  }
  return statuses;
}

function collectInputOutputKinds(wf: WorkflowVersion): { inputKinds: string[]; outputKinds: string[] } {
  const inputSet = new Set<string>();
  const outputSet = new Set<string>();
  for (const n of wf.nodes) {
    (n.contract?.input ?? []).forEach((k: string) => inputSet.add(k));
    (n.contract?.output ?? []).forEach((k: string) => outputSet.add(k));
  }
  return {
    inputKinds: [...inputSet].sort(),
    outputKinds: [...outputSet].sort(),
  };
}

export function workflowToNodesEdges(
  wf: WorkflowVersion,
  stepStatuses?: Record<string, StepStatus>
): { nodes: Node[]; edges: Edge[] } {
  const { positions } = getWorkflowLayout(wf);
  const stepNodes: Node[] = wf.nodes.map((n) => {
    const pos = positions.get(n.id);
    const data: WorkflowNodeData = {
      label: n.id,
      nodeId: n.id,
      type: n.type,
      input: n.contract?.input ?? [],
      output: n.contract?.output ?? [],
      description: n.description,
    };
    if (stepStatuses && stepStatuses[n.id]) {
      data.stepStatus = stepStatuses[n.id];
    }
    return {
      id: n.id,
      type: "workflow",
      position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data,
    };
  });

  const stepEdges: Edge[] = wf.edges.map((e: WorkflowEdge) => ({
    id: `step-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
  }));

  const { inputKinds, outputKinds } = collectInputOutputKinds(wf);
  const collectionNodes: Node[] = [];
  const collectionEdges: Edge[] = [];

  const stepPositions = [...positions.values()];
  const minStepY = stepPositions.length > 0 ? Math.min(...stepPositions.map((p) => p.y)) : 0;
  const maxStepY = stepPositions.length > 0 ? Math.max(...stepPositions.map((p) => p.y)) : 0;
  const centerX =
    stepPositions.length > 0
      ? (Math.min(...stepPositions.map((p) => p.x)) + Math.max(...stepPositions.map((p) => p.x))) / 2
      : 0;

  const inputRowY = minStepY - VERTICAL_GAP - COLLECTION_NODE_HEIGHT / 2;
  const outputRowY = maxStepY + VERTICAL_GAP + COLLECTION_NODE_HEIGHT / 2;

  const inputOnlyKinds = inputKinds.filter((k) => !outputKinds.includes(k));
  const outputOnlyKinds = outputKinds.filter((k) => !inputKinds.includes(k));
  const bothKinds = inputKinds.filter((k) => outputKinds.includes(k));

  if (inputOnlyKinds.length > 0 || bothKinds.length > 0) {
    const inputRowKinds = [...inputOnlyKinds, ...bothKinds];
    const totalWidth = inputRowKinds.length * COLLECTION_NODE_WIDTH + (inputRowKinds.length - 1) * COLLECTION_NODE_GAP;
    const firstX = centerX - totalWidth / 2 + COLLECTION_NODE_WIDTH / 2;
    inputRowKinds.forEach((kind, i) => {
      collectionNodes.push({
        id: `collection:${kind}`,
        type: "collection",
        position: { x: firstX + i * (COLLECTION_NODE_WIDTH + COLLECTION_NODE_GAP), y: inputRowY },
        data: { kind, role: "input" } as CollectionNodeData & Record<string, unknown>,
      });
    });
  }

  if (outputOnlyKinds.length > 0) {
    const totalWidth = outputOnlyKinds.length * COLLECTION_NODE_WIDTH + (outputOnlyKinds.length - 1) * COLLECTION_NODE_GAP;
    const firstX = centerX - totalWidth / 2 + COLLECTION_NODE_WIDTH / 2;
    outputOnlyKinds.forEach((kind, i) => {
      collectionNodes.push({
        id: `collection:${kind}`,
        type: "collection",
        position: { x: firstX + i * (COLLECTION_NODE_WIDTH + COLLECTION_NODE_GAP), y: outputRowY },
        data: { kind, role: "output" } as CollectionNodeData & Record<string, unknown>,
      });
    });
  }

  for (const n of wf.nodes) {
    const inputs = n.contract?.input ?? [];
    const outputs = n.contract?.output ?? [];
    for (const kind of inputs) {
      collectionEdges.push({
        id: `col-in-${kind}-${n.id}`,
        source: `collection:${kind}`,
        target: n.id,
      });
    }
    for (const kind of outputs) {
      collectionEdges.push({
        id: `col-out-${n.id}-${kind}`,
        source: n.id,
        target: `collection:${kind}`,
      });
    }
  }

  return {
    nodes: [...collectionNodes, ...stepNodes],
    edges: [...collectionEdges, ...stepEdges],
  };
}
