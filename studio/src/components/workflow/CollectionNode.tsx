import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { cn, getCollectionColor } from "@/lib/utils";

export interface CollectionNodeData extends Record<string, unknown> {
  kind: string;
  label: string;
}

function CollectionNodeComponent(props: NodeProps) {
  const d = props.data as CollectionNodeData;
  const color = getCollectionColor(d.kind);
  return (
    <div
      className={cn(
        "relative px-2 py-2 w-[140px] rounded-lg bg-card border shadow-sm text-xs cursor-pointer",
        "border-border"
      )}
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <div className="absolute left-2 right-2 -top-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />
      <div className="absolute left-2 right-2 -bottom-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />

      <div className="flex items-center gap-1.5 justify-center">
        <Database className="size-3 text-muted-foreground" aria-hidden />
        <span className="font-semibold truncate" title={d.kind}>
          {d.label}
        </span>
      </div>
    </div>
  );
}

export const CollectionNode = memo(CollectionNodeComponent);
