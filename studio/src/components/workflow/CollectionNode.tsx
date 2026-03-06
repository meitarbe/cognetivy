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
        "relative px-3 py-3 w-[180px] rounded-xl border-2 shadow-md text-sm cursor-pointer transition-all duration-150",
        "hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5",
        d.collected ? "bg-emerald-500/10 border-emerald-500/70 ring-2 ring-emerald-500/25" : "bg-card border-primary/45 ring-2 ring-primary/20"
      )}
      style={{ borderColor: d.collected ? undefined : color }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <div className="absolute left-2 right-2 -top-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />
      <div className="absolute left-2 right-2 -bottom-2 h-4 rounded-full border bg-background" style={{ borderColor: color }} />

      <div className="flex items-center gap-1.5 justify-center">
        <Database className="size-3 text-muted-foreground" aria-hidden />
        <span className="font-semibold truncate" title={d.kind}>
          {d.label}{d.collected ? " ✓" : ""}
        </span>
      </div>

    </div>
  );
}

export const CollectionNode = memo(CollectionNodeComponent);
