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
import { CollectionNode } from "@/components/workflow/CollectionNode";
import { workflowToNodesEdges, getStepStatuses } from "@/lib/workflowCanvas";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TABLE_LINK_CLASS } from "@/lib/utils";
import { CopyableId } from "@/components/ui/CopyableId";

const nodeTypes = { workflow: WorkflowNode, collection: CollectionNode };

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
      fitViewOptions={{ padding: 0.2, duration: 0 }}
      proOptions={{ hideAttribution: true }}
      className={className || "bg-muted/20"}
    >
      {showBackground && <Background variant={BackgroundVariant.Dots} />}
      {showControls && <Controls showInteractive={false} />}
    </ReactFlow>

    <Dialog open={!!selectedNode} onOpenChange={(open: boolean) => !open && setSelectedNode(null)}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        {selectedNode && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">{nodeIdToDisplayName(selectedNode.data.nodeId)}</DialogTitle>
              <DialogDescription className="sr-only">
                Workflow step details: {selectedNode.data.nodeId}
              </DialogDescription>
              <div className="text-xs text-muted-foreground mt-1">
                <CopyableId value={selectedNode.data.nodeId} />
              </div>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {selectedNode.data.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                  <p className="text-sm text-foreground mt-1 leading-relaxed whitespace-pre-wrap">
                    {selectedNode.data.description}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</p>
                  <p className="mt-0.5 font-mono text-xs">{(selectedNode.data.input ?? []).join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</p>
                  <p className="mt-0.5 font-mono text-xs">{(selectedNode.data.output ?? []).join(", ") || "—"}</p>
                </div>
              </div>
              {selectedNode.data.stepStatus && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="mt-0.5">{selectedNode.data.stepStatus}</p>
                </div>
              )}
              {runsVersionForLink && (
                <div className="pt-2 border-t border-border">
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
      </DialogContent>
    </Dialog>
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
