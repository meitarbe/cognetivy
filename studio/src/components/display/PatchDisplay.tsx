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
  if (v === undefined || v === null) return "-";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function formatNodeValue(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  const v = value as Record<string, unknown>;
  const id = v.id as string | undefined;
  const type = v.type as string | undefined;
  const contract = v.contract as { input?: string[]; output?: string[] } | undefined;
  const parts: string[] = [];
  if (id) parts.push(`'${id}'`);
  if (type) parts.push(`(${type})`);
  if (contract) {
    const inOut: string[] = [];
    if (contract.input?.length) inOut.push(`in: ${contract.input.join(", ")}`);
    if (contract.output?.length) inOut.push(`out: ${contract.output.join(", ")}`);
    if (inOut.length) parts.push(`[${inOut.join("; ")}]`);
  }
  return parts.length ? parts.join(" ") : JSON.stringify(value);
}

function formatEdgeValue(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  const v = value as Record<string, unknown>;
  const from = v.from as string | undefined;
  const to = v.to as string | undefined;
  if (from && to) return `${from} → ${to}`;
  return JSON.stringify(value);
}

function interpretOp(op: PatchOp): string | null {
  const opType = (op.op ?? "unknown") as string;
  const path = op.path ?? "";
  const value = op.value;

  if (opType === "add") {
    if (path === "/nodes/-" || path.match(/^\/nodes\/\d+$/)) {
      return `Added node ${formatNodeValue(value)}`;
    }
    if (path === "/edges/-" || path.match(/^\/edges\/\d+$/)) {
      return `Added edge ${formatEdgeValue(value)}`;
    }
    const nodeMatch = path.match(/^\/nodes\/(\d+)$/);
    if (nodeMatch) return `Added node at index ${nodeMatch[1]}: ${formatNodeValue(value)}`;
  }

  if (opType === "remove") {
    if (path.match(/^\/nodes\/\d+$/)) {
      const idx = path.split("/")[2];
      return `Removed node at index ${idx}`;
    }
    if (path.match(/^\/edges\/\d+$/)) {
      const idx = path.split("/")[2];
      return `Removed edge at index ${idx}`;
    }
    if (path.match(/^\/nodes\/\d+\/id$/)) {
      return `Renamed node (removed old id)`;
    }
  }

  if (opType === "replace") {
    if (path.match(/^\/nodes\/\d+\/id$/)) {
      return `Renamed node to '${String(value)}'`;
    }
    if (path.match(/^\/nodes\/\d+\/type$/)) {
      return `Changed node type to ${String(value)}`;
    }
    if (path.match(/^\/nodes\/\d+\/contract$/)) {
      return `Changed node contract`;
    }
    if (path.match(/^\/nodes\/\d+$/)) {
      return `Changed node: ${formatNodeValue(value)}`;
    }
    if (path.match(/^\/edges\/\d+$/)) {
      return `Changed edge: ${formatEdgeValue(value)}`;
    }
  }

  return null;
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
        const human = interpretOp(op);
        const displayText = human ?? (op.path ? `${opType} ${op.path}` : opType);
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
              <span>{displayText}</span>
            </div>
            {!human && (isAdd || isReplace) && op.value !== undefined && (
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
