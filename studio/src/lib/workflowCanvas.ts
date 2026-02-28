import type { Node, Edge } from "@xyflow/react";
import type { WorkflowVersion } from "@/api";
import type { WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import type { CollectionNodeData } from "@/components/workflow/CollectionNode";
import {
  getNodeRowsFromDataflow,
  getLayoutWithPreassignedRows,
  type DataflowEdge,
  type DataflowVertex,
} from "@/lib/workflowLayout";
import { getStepIdFromEventData } from "@/lib/utils";
import type { EventPayload } from "@/api";

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

/**
 * Layer-based layout: each node layer has above it only the collections it needs (inputs),
 * and below it what it produces plus the collections for the next level. In each level row
 * we show each collection at most once (no duplicate if already produced there).
 * Physical rows: 0 = inputs for layer 0, 1 = nodes layer 0, 2 = outputs layer 0 + inputs layer 1, ...
 */
export function workflowToNodesEdges(
  wf: WorkflowVersion,
  stepStatuses?: Record<string, StepStatus>
): { nodes: Node[]; edges: Edge[] } {
  const nodeIds = new Set(wf.nodes.map((n) => `node:${n.id}`));
  const edgesSpec: DataflowEdge[] = [];
  for (const n of wf.nodes) {
    for (const c of n.input_collections ?? []) {
      edgesSpec.push({ from: `collection:${c}`, to: `node:${n.id}` });
    }
    for (const c of n.output_collections ?? []) {
      edgesSpec.push({ from: `node:${n.id}`, to: `collection:${c}` });
    }
  }

  const nodeLayers = getNodeRowsFromDataflow({ nodeIds, edges: edgesSpec });
  const maxLayer = Math.max(0, ...Object.values(nodeLayers));

  const inputKindsByLayer: Set<string>[] = [];
  const outputKindsByLayer: Set<string>[] = [];
  const nodesByLayer: typeof wf.nodes[] = [];
  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = wf.nodes.filter((n) => (nodeLayers[`node:${n.id}`] ?? 0) === layer);
    nodesByLayer[layer] = nodesInLayer;
    const inputKinds = new Set<string>();
    const outputKinds = new Set<string>();
    for (const n of nodesInLayer) {
      for (const c of n.input_collections ?? []) inputKinds.add(c);
      for (const c of n.output_collections ?? []) outputKinds.add(c);
    }
    inputKindsByLayer[layer] = inputKinds;
    outputKindsByLayer[layer] = outputKinds;
  }

  const vertices: DataflowVertex[] = [];
  const rowByVertex: Record<string, number> = {};
  const expandedEdges: DataflowEdge[] = [];

  for (const n of wf.nodes) {
    const id = `node:${n.id}`;
    const layer = nodeLayers[id] ?? 0;
    vertices.push({ id, type: "node" });
    rowByVertex[id] = 2 * layer + 1;
  }

  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = nodesByLayer[layer];
    const inputKinds = inputKindsByLayer[layer];
    const outputKinds = outputKindsByLayer[layer];

    if (layer === 0) {
      for (const kind of inputKinds) {
        const id = `collection:${kind}:row0`;
        vertices.push({ id, type: "collection" });
        rowByVertex[id] = 0;
        for (const n of nodesInLayer) {
          if ((n.input_collections ?? []).includes(kind)) {
            expandedEdges.push({ from: id, to: `node:${n.id}` });
          }
        }
      }
    }

    const physicalRowBelow = 2 * layer + 2;
    const kindsInRowBelow = new Set<string>([...outputKinds]);
    if (layer < maxLayer) {
      for (const kind of inputKindsByLayer[layer + 1]) kindsInRowBelow.add(kind);
    }
    for (const kind of kindsInRowBelow) {
      const id = `collection:${kind}:row${physicalRowBelow}`;
      vertices.push({ id, type: "collection" });
      rowByVertex[id] = physicalRowBelow;
      for (const n of nodesInLayer) {
        if ((n.output_collections ?? []).includes(kind)) {
          expandedEdges.push({ from: `node:${n.id}`, to: id });
        }
      }
      if (layer < maxLayer) {
        for (const n of nodesByLayer[layer + 1]) {
          if ((n.input_collections ?? []).includes(kind)) {
            expandedEdges.push({ from: id, to: `node:${n.id}` });
          }
        }
      }
    }
  }

  const { positions } = getLayoutWithPreassignedRows({ vertices, rowByVertex });

  function collectionKindFromId(id: string): string {
    const m = id.match(/^collection:(.+):row\d+$/);
    if (m) return m[1];
    return id.replace(/^collection:/, "");
  }

  const collectionNodes: Node[] = vertices
    .filter((v) => v.type === "collection")
    .map((v) => {
      const pos = positions.get(v.id);
      const kind = collectionKindFromId(v.id);
      const data: CollectionNodeData = { kind, label: kind };
      return {
        id: v.id,
        type: "collection",
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        data,
      };
    });

  const workflowNodes: Node[] = wf.nodes.map((n) => {
    const id = `node:${n.id}`;
    const pos = positions.get(id);
    const data: WorkflowNodeData = {
      label: n.id,
      nodeId: n.id,
      type: n.type,
      input: n.input_collections ?? [],
      output: n.output_collections ?? [],
    };
    if (stepStatuses && stepStatuses[n.id]) data.stepStatus = stepStatuses[n.id];
    return {
      id,
      type: "workflow",
      position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data,
    };
  });

  const edges: Edge[] = expandedEdges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
  }));

  return { nodes: [...collectionNodes, ...workflowNodes], edges };
}
