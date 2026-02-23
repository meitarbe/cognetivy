import { Badge } from "@/components/ui/badge";

interface PatchOp {
  op?: string;
  path?: string;
  value?: unknown;
}

interface PatchDisplayProps {
  patch: unknown[];
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function PatchDisplay({ patch }: PatchDisplayProps) {
  const ops = patch as PatchOp[];
  if (!ops.length) return <p className="text-sm text-muted-foreground">No operations.</p>;
  return (
    <ul className="space-y-2">
      {ops.map((op, i) => {
        const opType = (op.op ?? "unknown") as string;
        const isAdd = opType === "add";
        const isRemove = opType === "remove";
        const isReplace = opType === "replace";
        return (
          <li
            key={i}
            className={`rounded-lg border p-3 text-sm ${
              isAdd
                ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/15"
                : isRemove
                  ? "border-red-500/50 bg-red-500/10 dark:bg-red-500/15"
                  : isReplace
                    ? "border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/15"
                    : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={isAdd ? "default" : isRemove ? "destructive" : "secondary"}
                className={
                  isReplace ? "bg-amber-600 hover:bg-amber-600 text-white" : undefined
                }
              >
                {opType}
              </Badge>
              {op.path != null && (
                <code className="text-muted-foreground font-mono text-xs">{op.path}</code>
              )}
            </div>
            {(isAdd || isReplace) && op.value !== undefined && (
              <div className="mt-2 pl-2 border-l-2 border-border">
                <span className="text-muted-foreground">value: </span>
                <span className="break-all">{formatValue(op.value)}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
