import { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { ArrowDownToLine, ArrowUpFromLine, Plug, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatIoList(list: string[]): string {
  if (list.length === 0) return "-";
  return list.join(", ");
}

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
  requiredMcps?: string[];
  requiredSkills?: string[];
}

function WorkflowNodeComponent(props: NodeProps) {
  const { data } = props;
  const d = data as WorkflowNodeData;
  const stepStatus = d.stepStatus;
  const changeStatus = d.changeStatus;
  const statusForStyle = stepStatus ?? changeStatus;
  const isHitl = d.type === "HUMAN_IN_THE_LOOP";
  const mcps = d.requiredMcps ?? [];
  const skills = d.requiredSkills ?? [];
  const mcpText = mcps.length === 0 ? "—" : mcps.join(", ");
  const skillText = skills.length === 0 ? "—" : skills.join(", ");

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card shadow-md hover:shadow-lg transition-shadow min-w-[180px] cursor-pointer w-max max-w-[340px] overflow-hidden",
        "px-4 py-3 space-y-3",
        isHitl && "border-violet-500/60 bg-violet-500/5 dark:bg-violet-500/10",
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
      {/* Header: title + type */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm text-foreground break-words leading-tight">
          {nodeIdToDisplayName(d.nodeId)}
        </h3>
        <Badge
          variant={isHitl ? "default" : "secondary"}
          className={cn(
            "text-[10px] font-medium shrink-0",
            isHitl && "bg-violet-600 hover:bg-violet-600 text-white"
          )}
        >
          {d.type.replace(/_/g, " ")}
        </Badge>
      </div>
      {/* Input / Output */}
      <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 space-y-2">
        <div className="flex items-start gap-2">
          <ArrowDownToLine className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="min-w-0 break-words">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Input</div>
            <div className="text-xs font-medium text-foreground break-words mt-0.5">
              {formatIoList(d.input ?? [])}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ArrowUpFromLine className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="min-w-0 break-words">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Output</div>
            <div className="text-xs font-medium text-foreground break-words mt-0.5">
              {formatIoList(d.output ?? [])}
            </div>
          </div>
        </div>
      </div>
      {/* Skills & MCPs: compact block, full text (no ellipsis), min height so nodes stay even */}
      <div className="rounded-lg border-2 border-primary/20 bg-primary/5 dark:bg-primary/10 px-3 py-2 min-h-[40px] flex items-center">
        <div className="flex items-center gap-3 text-[10px] font-medium text-foreground min-w-0 flex-1 flex-wrap">
          <span className="flex items-center gap-1.5 min-w-0 break-words">
            <Sparkles className="size-3 text-primary shrink-0" aria-hidden />
            <span className="text-muted-foreground uppercase tracking-wider font-semibold shrink-0">Skills</span>
            <span className="break-words">{skillText}</span>
          </span>
          <span className="text-border shrink-0" aria-hidden>
            ·
          </span>
          <span className="flex items-center gap-1.5 min-w-0 break-words">
            <Plug className="size-3 text-primary shrink-0" aria-hidden />
            <span className="text-muted-foreground uppercase tracking-wider font-semibold shrink-0">MCPs</span>
            <span className="break-words">{mcpText}</span>
          </span>
        </div>
      </div>
      {stepStatus && (
        <div className="pt-0.5">
          <span
            className={cn(
              "inline-block text-xs font-semibold px-2.5 py-1 rounded-md",
              stepStatus === "completed" && "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200",
              stepStatus === "running" && "bg-amber-500/25 text-amber-800 dark:text-amber-200",
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
