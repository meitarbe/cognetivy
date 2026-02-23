import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CollectionItem, WorkflowVersion } from "@/api";

const CATEGORY_TO_STEP: Record<string, string> = {
  tech: "tech_breakthroughs",
  market: "market_signals",
  regulatory: "regulatory_signals",
  competitor: "competitor_landscape",
  funding: "funding_signals",
  behavior: "consumer_behavior",
};

interface CollectionTableProps {
  kind: string;
  items: CollectionItem[];
  workflow?: WorkflowVersion | null;
}

function inferSourceStep(kind: string, item: CollectionItem): string | null {
  if (kind === "ideas") return "synthesize_why_now";
  if (kind === "sources") {
    const cat = item.category as string | undefined;
    return cat ? CATEGORY_TO_STEP[cat] ?? null : null;
  }
  return null;
}

function getDisplayKeys(items: CollectionItem[]): string[] {
  const exclude = new Set(["id", "created_at"]);
  const keySet = new Set<string>();
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (!exclude.has(k)) keySet.add(k);
    }
  }
  return Array.from(keySet);
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatCellValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CollectionTable({ kind, items, workflow }: CollectionTableProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No {kind} yet.</p>;
  }

  const columns = getDisplayKeys(items);
  const showTraceability = Boolean(workflow);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showTraceability && (
            <TableHead className="w-[140px]">Collected by</TableHead>
          )}
          {columns.map((col) => (
            <TableHead key={col} className="capitalize">
              {col.replace(/_/g, " ")}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, i) => {
          const step = showTraceability ? inferSourceStep(kind, item) : null;
          return (
            <TableRow key={(item.id as string) ?? i}>
              {showTraceability && (
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top py-1.5">
                  {step ? (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                      {step.replace(/_/g, " ")}
                    </code>
                  ) : (
                    "—"
                  )}
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col} className="text-sm max-w-[500px] whitespace-normal break-words align-top py-1.5">
                  {col === "url" ? (
                    <a
                      href={item[col] as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      {formatCellValue(item[col])}
                    </a>
                  ) : (
                    formatCellValue(item[col])
                  )}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
