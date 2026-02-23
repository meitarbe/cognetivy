import { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type NodeChangeStatus = "added" | "changed" | "removed" | undefined;

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeId: string;
  type: string;
  input: string[];
  output: string[];
  description?: string;
  changeStatus?: NodeChangeStatus;
}

function WorkflowNodeComponent(props: NodeProps) {
  const { data } = props;
  const d = data as WorkflowNodeData;
  const changeStatus = d.changeStatus;
  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-3 py-2 shadow-sm min-w-[200px] max-w-[260px]",
        changeStatus === "added" && "border-green-500 bg-green-500/10 dark:bg-green-500/15",
        changeStatus === "changed" && "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15",
        changeStatus === "removed" && "border-red-500/80 bg-red-500/10 dark:bg-red-500/15 opacity-70 border-dashed",
        !changeStatus && "border-primary/30"
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-xs text-foreground">{d.nodeId}</div>
      {d.description && (
        <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{d.description}</p>
      )}
      <Badge variant="secondary" className="mt-0.5 text-[10px]">
        {d.type}
      </Badge>
      <div className="mt-1 text-[11px] text-muted-foreground">
        <span className="font-medium">{(d.input ?? []).join(", ") || "—"}</span>
        <span className="mx-0.5">→</span>
        <span className="font-medium">{(d.output ?? []).join(", ") || "—"}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
