import { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type NodeChangeStatus = "added" | "changed" | "removed" | undefined;

export type StepStatus = "pending" | "running" | "completed";

export function nodeIdToDisplayName(nodeId: string): string {
  return nodeId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  nodeId: string;
  type: string;
  input: string[];
  output: string[];
  description?: string;
  changeStatus?: NodeChangeStatus;
  stepStatus?: StepStatus;
}

function WorkflowNodeComponent(props: NodeProps) {
  const { data } = props;
  const d = data as WorkflowNodeData;
  const stepStatus = d.stepStatus;
  const changeStatus = d.changeStatus;
  const statusForStyle = stepStatus ?? changeStatus;
  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-3 py-2 shadow-sm min-w-[160px] max-w-[200px] cursor-pointer",
        stepStatus === "completed" && "border-emerald-500/70 bg-emerald-500/10 dark:bg-emerald-500/15",
        stepStatus === "running" && "border-amber-500/70 bg-amber-500/10 dark:bg-amber-500/15 animate-pulse",
        stepStatus === "pending" && "border-border bg-muted/30",
        !stepStatus && changeStatus === "added" && "border-green-500 bg-green-500/10 dark:bg-green-500/15",
        !stepStatus && changeStatus === "changed" && "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15",
        !stepStatus && changeStatus === "removed" && "border-red-500/80 bg-red-500/10 dark:bg-red-500/15 opacity-70 border-dashed",
        !statusForStyle && "border-primary/30"
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold text-xs text-primary hover:underline cursor-pointer">
        {nodeIdToDisplayName(d.nodeId)}
      </div>
      <Badge variant="secondary" className="mt-0.5 text-[10px]">
        {d.type}
      </Badge>
      <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
        <div>
          <span className="text-muted-foreground/80">In: </span>
          <span className="font-medium">{(d.input ?? []).join(", ") || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground/80">Out: </span>
          <span className="font-medium">{(d.output ?? []).join(", ") || "—"}</span>
        </div>
      </div>
      {stepStatus && (
        <div className="mt-2">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              stepStatus === "completed" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
              stepStatus === "running" && "bg-amber-500/20 text-amber-700 dark:text-amber-300",
              stepStatus === "pending" && "bg-muted text-muted-foreground"
            )}
          >
            {stepStatus}
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
