import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowVersion, EventPayload, NodeResultRecord } from "@/api";
import { WorkflowNode } from "@/components/workflow/WorkflowNode";
import { type WorkflowNodeData, nodeIdToDisplayName } from "@/components/workflow/WorkflowNode";
import { CollectionNode, type CollectionNodeData } from "@/components/workflow/CollectionNode";
import { workflowToNodesEdges, getStepStatuses } from "@/lib/workflowCanvas";
import { useTheme } from "@/contexts/ThemeContext";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TABLE_LINK_CLASS } from "@/lib/utils";
import { CopyableId } from "@/components/ui/CopyableId";
import { RichText } from "@/components/display/RichText";

const nodeTypes = { workflow: WorkflowNode, collection: CollectionNode };

export interface WorkflowCanvasProps {
  workflow: WorkflowVersion;
  events?: EventPayload[];
  onStepClick?: (stepId: string) => void;
  nodeResults?: NodeResultRecord[];
  readOnly?: boolean;
  /** When true, nodes can be dragged to reposition (overrides readOnly for dragging) */
  nodesDraggable?: boolean;
  showControls?: boolean;
  showBackground?: boolean;
  className?: string;
  /** Override computed nodes (e.g. for diff view) */
  nodesOverride?: Node[];
  /** Override computed edges (e.g. for diff view) */
  edgesOverride?: Edge[];
  /** When set, show a "View runs" link in the node detail modal (workflow page only). */
  runsVersionForLink?: string;
}

function WorkflowCanvasInner({
  workflow,
  events,
  onStepClick,
  nodeResults,
  readOnly = true,
  nodesDraggable = false,
  showControls = true,
  showBackground = false,
  className = "",
  nodesOverride,
  edgesOverride,
  runsVersionForLink,
}: WorkflowCanvasProps) {
  const computed = useMemo(() => {
    const stepStatuses = events ? getStepStatuses(events) : undefined;
    return workflowToNodesEdges(workflow, stepStatuses);
  }, [workflow, events]);

  const baseNodes = nodesOverride ?? computed.nodes;
  const baseEdges = edgesOverride ?? computed.edges;

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  useEffect(() => {
    setNodes(baseNodes);
    setEdges(baseEdges);
  }, [baseNodes, baseEdges, setNodes, setEdges]);

  const canDrag = nodesDraggable || !readOnly;
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { theme } = useTheme();

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node);
    const d = node.data as Record<string, unknown>;
    const nodeId = (d.nodeId as string | undefined) ?? undefined;
    if (nodeId) onStepClick?.(nodeId);
  }

  function handleSheetOpenChange(open: boolean) {
    if (!open) setSelectedNode(null);
  }

  function getNodeResultForNodeId(nodeId: string): NodeResultRecord | null {
    if (!nodeResults || nodeResults.length === 0) return null;
    return nodeResults.find((r) => r.node_id === nodeId) ?? null;
  }

  function renderSelectedNodeContent(node: Node) {
    if (node.type === "collection") {
      const d = node.data as CollectionNodeData;
      return (
        <>
          <SheetHeader>
            <SheetTitle className="text-base">Collection: {d.kind}</SheetTitle>
            <SheetDescription className="sr-only">
              Collection details: {d.kind}
            </SheetDescription>
            <div className="text-xs text-muted-foreground mt-1">
              <CopyableId value={d.kind} />
            </div>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            <Link
              to={`/data/${encodeURIComponent(d.kind)}`}
              className={`text-sm font-medium ${TABLE_LINK_CLASS}`}
            >
              View data →
            </Link>
          </div>
        </>
      );
    }

    const d = node.data as WorkflowNodeData;
    const nodeResult = getNodeResultForNodeId(d.nodeId);
    return (
      <>
        <SheetHeader>
          <SheetTitle className="text-base">{nodeIdToDisplayName(d.nodeId)}</SheetTitle>
          <SheetDescription className="sr-only">
            Workflow node details: {d.nodeId}
          </SheetDescription>
          <div className="text-xs text-muted-foreground mt-1">
            <CopyableId value={d.nodeId} />
          </div>
        </SheetHeader>
        <div className="space-y-4 pt-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Node result</p>
            {nodeResult ? (
              <div className="mt-1 rounded-md border border-border bg-muted/20 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="text-xs font-medium">{nodeResult.status}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Started</span>
                  <span className="text-xs">{formatTimestamp(nodeResult.started_at)}</span>
                </div>
                {nodeResult.completed_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <span className="text-xs">{formatTimestamp(nodeResult.completed_at)}</span>
                  </div>
                )}
                {nodeResult.output && (
                  <div className="pt-2 border-t border-border">
                    <RichText content={nodeResult.output} className="prose prose-sm dark:prose-invert max-w-none" />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No node result yet.</p>
            )}
          </div>
          {d.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
              <p className="text-sm text-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                {d.description}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Input collections</p>
            <p className="font-mono text-sm">{(d.input ?? []).join(", ") || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Output collections</p>
            <p className="font-mono text-sm">{(d.output ?? []).join(", ") || "—"}</p>
          </div>
          {d.stepStatus && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
              <p className="mt-0.5">{d.stepStatus}</p>
            </div>
          )}
          {runsVersionForLink && (
            <div className="pt-4 border-t border-border">
              <Link
                to={`/runs?version=${encodeURIComponent(runsVersionForLink)}`}
                className={`text-sm font-medium ${TABLE_LINK_CLASS}`}
              >
                View runs ({runsVersionForLink})
              </Link>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      nodesDraggable={canDrag}
      nodesConnectable={!readOnly}
      elementsSelectable
      defaultEdgeOptions={{
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
      }}
      nodeOrigin={[0.5, 0.5]}
      fitView
      fitViewOptions={{ padding: 0.5, duration: 0, minZoom: 0.15 }}
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
      className={cn(className || "bg-muted/20", theme === "dark" && "dark")}
    >
      {showBackground && <Background variant={BackgroundVariant.Dots} />}
      {showControls && <Controls showInteractive={false} />}
    </ReactFlow>

    <Sheet open={!!selectedNode} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="right" className="w-full max-w-md">
        {selectedNode && (
          renderSelectedNodeContent(selectedNode)
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <div className="w-full h-full min-h-[200px]">
        <WorkflowCanvasInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}
