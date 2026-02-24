import type { Node, Edge } from "@xyflow/react";
import type { WorkflowVersion } from "@/api";
import type { WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import type { CollectionNodeData } from "@/components/workflow/CollectionNode";
import { getDataflowLayout, type DataflowEdge, type DataflowVertex } from "@/lib/workflowLayout";
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

export function workflowToNodesEdges(
  wf: WorkflowVersion,
  stepStatuses?: Record<string, StepStatus>
): { nodes: Node[]; edges: Edge[] } {
  const collections = new Set<string>();
  for (const n of wf.nodes) {
    for (const c of n.input_collections ?? []) collections.add(c);
    for (const c of n.output_collections ?? []) collections.add(c);
  }

  const vertices: DataflowVertex[] = [
    ...Array.from(collections).map((kind) => ({ id: `collection:${kind}`, type: "collection" as const })),
    ...wf.nodes.map((n) => ({ id: `node:${n.id}`, type: "node" as const })),
  ];

  const edgesSpec: DataflowEdge[] = [];
  for (const n of wf.nodes) {
    for (const c of n.input_collections ?? []) {
      edgesSpec.push({ from: `collection:${c}`, to: `node:${n.id}` });
    }
    for (const c of n.output_collections ?? []) {
      edgesSpec.push({ from: `node:${n.id}`, to: `collection:${c}` });
    }
  }

  const { positions } = getDataflowLayout({ vertices, edges: edgesSpec });

  const collectionNodes: Node[] = Array.from(collections).map((kind) => {
    const id = `collection:${kind}`;
    const pos = positions.get(id);
    const data: CollectionNodeData = { kind, label: kind };
    return {
      id,
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
      description: n.prompt ?? n.description,
    };
    if (stepStatuses && stepStatuses[n.id]) data.stepStatus = stepStatuses[n.id];
    return {
      id,
      type: "workflow",
      position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data,
    };
  });

  const edges: Edge[] = edgesSpec.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
  }));

  return { nodes: [...collectionNodes, ...workflowNodes], edges };
}
