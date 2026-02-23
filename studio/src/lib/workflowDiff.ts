import type { WorkflowVersion, WorkflowNode, WorkflowEdge } from "@/api";

export interface VersionDiff {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: string[];
  edgesAdded: { from: string; to: string }[];
  edgesRemoved: { from: string; to: string }[];
}

function nodeKey(n: WorkflowNode): string {
  return `${n.id}|${n.type}|${(n.contract?.input ?? []).join(",")}|${(n.contract?.output ?? []).join(",")}`;
}

function edgeKey(e: WorkflowEdge): string {
  return `${e.from}->${e.to}`;
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
  const prevEdges = new Set(previous.edges.map(edgeKey));
  const currEdges = new Set(current.edges.map(edgeKey));
  const edgesAdded: { from: string; to: string }[] = current.edges.filter(
    (e) => !prevEdges.has(edgeKey(e))
  );
  const edgesRemoved: { from: string; to: string }[] = previous.edges.filter(
    (e) => !currEdges.has(edgeKey(e))
  );
  return {
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
  };
}
