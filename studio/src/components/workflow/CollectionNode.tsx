import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { cn, getCollectionColor } from "@/lib/utils";

export interface CollectionNodeData extends Record<string, unknown> {
  kind: string;
  label: string;
  collected?: boolean;
}

function CollectionNodeComponent(props: NodeProps) {
  const d = props.data as CollectionNodeData;
  const color = getCollectionColor(d.kind);
  return (
    <div
      className={cn(
        "relative px-2 py-2 w-[140px] rounded-lg border shadow-sm text-xs cursor-pointer transition-colors",
        d.collected ? "bg-emerald-500/10 border-emerald-500/60" : "bg-card border-border"
      )}
      style={{ borderColor: d.collected ? undefined : color }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <div className="absolute left-2 right-2 -top-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />
      <div className="absolute left-2 right-2 -bottom-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />

      <div className="flex items-center gap-1.5 justify-center">
        <Database className={cn("size-3", d.collected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} aria-hidden />
        <span className="font-semibold truncate" title={d.kind}>
          {d.label}
        </span>
        {d.collected && <span className="text-[10px] text-emerald-700 dark:text-emerald-400">●</span>}
      </div>
    </div>
  );
}

export const CollectionNode = memo(CollectionNodeComponent);
