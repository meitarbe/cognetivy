import type { Node, Edge } from "@xyflow/react";
import type { WorkflowVersion, WorkflowEdge } from "@/api";
import type { WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import { getWorkflowLayout } from "@/lib/workflowLayout";
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
  const { positions } = getWorkflowLayout(wf);
  const nodes: Node[] = wf.nodes.map((n) => {
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

  const edges: Edge[] = wf.edges.map((e: WorkflowEdge) => ({
    id: `step-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
  }));

  return { nodes, edges };
}
