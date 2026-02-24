import type { WorkflowVersion, WorkflowNode } from "@/api";

export interface VersionDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: string[];
  edgesAdded: { from: string; to: string }[];
  edgesRemoved: { from: string; to: string }[];
}

function nodeKey(n: WorkflowNode): string {
  return `${n.id}|${n.type}|${(n.input_collections ?? []).join(",")}|${(n.output_collections ?? []).join(",")}|${n.prompt ?? ""}|${n.description ?? ""}`;
}

/**
 * Compare current (newer) vs previous (older) version. Returns what changed from previous to current.
 */
export function diffWorkflowVersions(
  previous: WorkflowVersion,
  current: WorkflowVersion
): VersionDiff {
  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesChanged: string[] = [];
  const prevNodes = new Map(previous.nodes.map((n) => [n.id, n]));
  const currNodes = new Map(current.nodes.map((n) => [n.id, n]));
  for (const id of currNodes.keys()) {
    if (!prevNodes.has(id)) nodesAdded.push(id);
    else if (nodeKey(prevNodes.get(id)!) !== nodeKey(currNodes.get(id)!)) nodesChanged.push(id);
  }
  for (const id of prevNodes.keys()) {
    if (!currNodes.has(id)) nodesRemoved.push(id);
  }
  const edgesAdded: { from: string; to: string }[] = [];
  const edgesRemoved: { from: string; to: string }[] = [];
  return {
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
  };
}
