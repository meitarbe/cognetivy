import { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Database } from "lucide-react";

export interface CollectionNodeData extends Record<string, unknown> {
  kind: string;
  /** "input" | "output" for styling */
  role: "input" | "output";
}

function CollectionNodeComponent(props: NodeProps) {
  const { data } = props;
  const d = data as CollectionNodeData;
  const label = d.kind.replace(/_/g, " ");
  return (
    <div className="rounded-md border-2 border-dashed border-muted-foreground/50 bg-muted/40 px-2.5 py-1.5 shadow-sm min-w-[80px] max-w-[140px] cursor-default">
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <div className="flex items-center gap-1.5">
        <Database className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
        <span className="text-[11px] font-medium text-foreground truncate" title={d.kind}>
          {label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
    </div>
  );
}

export const CollectionNode = memo(CollectionNodeComponent);
