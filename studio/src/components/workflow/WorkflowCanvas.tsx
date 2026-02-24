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
import type { WorkflowVersion, EventPayload } from "@/api";
import { WorkflowNode } from "@/components/workflow/WorkflowNode";
import { type WorkflowNodeData, nodeIdToDisplayName } from "@/components/workflow/WorkflowNode";
import { workflowToNodesEdges, getStepStatuses } from "@/lib/workflowCanvas";
import { useTheme } from "@/contexts/ThemeContext";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TABLE_LINK_CLASS } from "@/lib/utils";
import { CopyableId } from "@/components/ui/CopyableId";

const nodeTypes = { workflow: WorkflowNode };

export interface WorkflowCanvasProps {
  workflow: WorkflowVersion;
  events?: EventPayload[];
  onStepClick?: (stepId: string) => void;
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
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const { theme } = useTheme();

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node as Node<WorkflowNodeData>);
    onStepClick?.(node.id);
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

    <Sheet open={!!selectedNode} onOpenChange={(open: boolean) => !open && setSelectedNode(null)}>
      <SheetContent side="right" className="w-full max-w-md">
        {selectedNode && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">{nodeIdToDisplayName(selectedNode.data.nodeId)}</SheetTitle>
              <SheetDescription className="sr-only">
                Workflow step details: {selectedNode.data.nodeId}
              </SheetDescription>
              <div className="text-xs text-muted-foreground mt-1">
                <CopyableId value={selectedNode.data.nodeId} />
              </div>
            </SheetHeader>
            <div className="space-y-4 pt-4">
              {selectedNode.data.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                  <p className="text-sm text-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                    {selectedNode.data.description}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Input collections</p>
                <p className="font-mono text-sm">{(selectedNode.data.input ?? []).join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Output collections</p>
                <p className="font-mono text-sm">{(selectedNode.data.output ?? []).join(", ") || "—"}</p>
              </div>
              {selectedNode.data.stepStatus && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="mt-0.5">{selectedNode.data.stepStatus}</p>
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
