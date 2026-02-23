import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, type WorkflowVersion } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkflowLayout } from "@/lib/workflowLayout";
import { WorkflowNode, type WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import { diffWorkflowVersions } from "@/lib/workflowDiff";

const POLL_MS = 3000;
const nodeTypes = { workflow: WorkflowNode };

function workflowToNodesEdges(wf: WorkflowVersion): { nodes: Node[]; edges: Edge[] } {
  const { positions } = getWorkflowLayout(wf);
  const nodes: Node[] = wf.nodes.map((n) => {
    const pos = positions.get(n.id);
    return {
      id: n.id,
      type: "workflow",
      position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      data: {
        label: n.id,
        nodeId: n.id,
        type: n.type,
        input: n.contract?.input ?? [],
        output: n.contract?.output ?? [],
        description: n.description,
      } as WorkflowNodeData,
    };
  });
  const edges: Edge[] = wf.edges.map((e) => ({
    id: `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
  }));
  return { nodes, edges };
}

function WorkflowPageInner() {
  const [data, setData] = useState<{ pointer: { current_version: string }; workflow: WorkflowVersion } | null>(null);
  const [versions, setVersions] = useState<{ version: string; filename: string }[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [prevVersionWf, setPrevVersionWf] = useState<WorkflowVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Single source of truth: the workflow we're displaying (from API). */
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowVersion | null>(null);

  const load = useCallback(async () => {
    try {
      const [workflowRes, versionsList] = await Promise.all([api.getWorkflow(), api.getWorkflowVersions()]);
      setData(workflowRes);
      setVersions(versionsList);
      if (!selectedVersion) setSelectedVersion(workflowRes.pointer.current_version);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedVersion]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!data && !selectedVersion) return;
    const wf = data?.workflow;
    if (wf && (!selectedVersion || wf.version === selectedVersion)) {
      setCurrentWorkflow(wf);
      const idx = versions.findIndex((x) => x.version === wf.version);
      if (idx > 0) {
        api.getWorkflowVersion(versions[idx - 1].version).then(setPrevVersionWf).catch(() => setPrevVersionWf(null));
      } else {
        setPrevVersionWf(null);
      }
      return;
    }
    if (selectedVersion && (!wf || wf.version !== selectedVersion)) {
      api
        .getWorkflowVersion(selectedVersion)
        .then((v) => {
          setCurrentWorkflow(v);
          const idx = versions.findIndex((x) => x.version === selectedVersion);
          if (idx > 0) {
            api.getWorkflowVersion(versions[idx - 1].version).then(setPrevVersionWf).catch(() => setPrevVersionWf(null));
          } else {
            setPrevVersionWf(null);
          }
        })
        .catch(() => setCurrentWorkflow(null));
    }
  }, [data, selectedVersion, versions]);

  const [diffState, setDiffState] = useState<{ diff: ReturnType<typeof diffWorkflowVersions>; from: string; to: string } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  useEffect(() => {
    const sel = selectedVersion ?? data?.pointer.current_version ?? null;
    if (!sel || !prevVersionWf || !currentWorkflow) {
      setDiffState(null);
      return;
    }
    if (currentWorkflow.version === sel) {
      setDiffState({ diff: diffWorkflowVersions(prevVersionWf, currentWorkflow), from: prevVersionWf.version, to: currentWorkflow.version });
      return;
    }
    setDiffState(null);
  }, [selectedVersion, data, prevVersionWf, currentWorkflow]);

  /** Nodes and edges derived only from currentWorkflow — single source of truth, passed directly to React Flow. */
  const { nodes, edges } = useMemo(() => {
    if (!currentWorkflow) return { nodes: [] as Node[], edges: [] as Edge[] };
    const base = workflowToNodesEdges(currentWorkflow);
    if (!showChanges || !diffState || !prevVersionWf) return base;

    const { diff } = diffState;
    const baseNodes = base.nodes.map((node) => {
      const d = node.data as WorkflowNodeData;
      const changeStatus = diff.nodesAdded.includes(node.id) ? "added" as const : diff.nodesChanged.includes(node.id) ? "changed" as const : undefined;
      return { ...node, data: { ...d, changeStatus } };
    });
    let displayNodes = baseNodes;
    if (diff.nodesRemoved.length > 0) {
      const prevPositions = getWorkflowLayout(prevVersionWf).positions;
      const removedNodes: Node[] = diff.nodesRemoved.map((id) => {
        const prevNode = prevVersionWf.nodes.find((n) => n.id === id);
        const pos = prevPositions.get(id);
        return {
          id: `removed-${id}`,
          type: "workflow",
          position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
          data: {
            label: id,
            nodeId: id,
            type: prevNode?.type ?? "?",
            input: prevNode?.contract?.input ?? [],
            output: prevNode?.contract?.output ?? [],
            description: prevNode?.description,
            changeStatus: "removed" as const,
          } as WorkflowNodeData,
        };
      });
      displayNodes = [...baseNodes, ...removedNodes];
    }

    let displayEdges: Edge[] = base.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    const addedSet = new Set(diff.edgesAdded.map((x) => `${x.from}-${x.to}`));
    displayEdges = displayEdges.map((e) => (addedSet.has(e.id) ? { ...e, style: { stroke: "#22c55e" } } : e));
    const removedNodeIds = new Set(diff.nodesRemoved);
    const remap = new Map(diff.nodesRemoved.map((id) => [id, `removed-${id}`]));
    const removedEdges: Edge[] = diff.edgesRemoved
      .filter((e) => (base.nodes.some((n) => n.id === e.from) || removedNodeIds.has(e.from)) && (base.nodes.some((n) => n.id === e.to) || removedNodeIds.has(e.to)))
      .map((e) => ({
        id: `removed-${e.from}-${e.to}`,
        source: remap.get(e.from) ?? e.from,
        target: remap.get(e.to) ?? e.to,
        style: { stroke: "#ef4444", strokeDasharray: "5 5" },
      }));
    displayEdges = [...displayEdges, ...removedEdges];

    return { nodes: displayNodes, edges: displayEdges };
  }, [currentWorkflow, showChanges, diffState, prevVersionWf]);

  if (error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentVersion = data?.pointer.current_version ?? null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Workflow</h2>
        {currentVersion && (
          <Badge variant="secondary" className="text-xs">Current: {currentVersion}</Badge>
        )}
        {nodes.length > 0 && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {nodes.length} nodes, {edges.length} edges
          </span>
        )}
        {versions.length > 0 && (
          <Select
            value={selectedVersion ?? currentVersion ?? ""}
            onValueChange={(v) => setSelectedVersion(v)}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={v.version}>
                  {v.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {diffState && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Show changes</span>
            <Switch checked={showChanges} onCheckedChange={setShowChanges} />
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={() => {}}
          onEdgesChange={() => {}}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
          nodeOrigin={[0.5, 0.5]}
          fitView
          fitViewOptions={{ padding: 0.2, duration: 200 }}
          className="bg-muted/30"
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export function WorkflowPage() {
  return (
    <ReactFlowProvider>
      <WorkflowPageInner />
    </ReactFlowProvider>
  );
}
