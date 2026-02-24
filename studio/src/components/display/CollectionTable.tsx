import { useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CollectionItem, WorkflowVersion } from "@/api";
import { formatTimestamp, TABLE_LINK_CLASS } from "@/lib/utils";
import { RichText, isRichTextField } from "./RichText";
import { collectionItemToMarkdown } from "@/lib/collectionItemToMarkdown";
import { downloadCollectionItemAsPdf } from "@/lib/collectionItemToPdf";
import { Copy, FileDown, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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
  /** When set, row click and links use run-scoped item URL. */
  runId?: string | null;
  /** Filter by step that collected the item (Collected by). */
  stepFilter?: string | null;
  /** Filter items by text search in any field. */
  searchQuery?: string;
}

export function inferSourceStep(kind: string, item: CollectionItem): string | null {
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

function itemMatchesSearch(item: CollectionItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  for (const value of Object.values(item)) {
    if (value == null) continue;
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (s.toLowerCase().includes(q)) return true;
  }
  return false;
}

function getItemPagePath(
  kind: string,
  item: CollectionItem,
  index: number,
  runId: string | null | undefined
): string {
  const id = (item.id as string) ?? String(index);
  if (runId) {
    return `/runs/${encodeURIComponent(runId)}/collections/${encodeURIComponent(kind)}/items/${encodeURIComponent(id)}`;
  }
  const runIdQuery = item.run_id ? `?run_id=${encodeURIComponent(String(item.run_id))}` : "";
  return `/data/${encodeURIComponent(kind)}/items/${encodeURIComponent(id)}${runIdQuery}`;
}

export function CollectionTable({ kind, items, workflow, runId, stepFilter, searchQuery }: CollectionTableProps) {
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const toggleRowExpanded = useCallback((rowKey: string) => {
    setExpandedRowKey((prev) => (prev === rowKey ? null : rowKey));
  }, []);

  const safeItems = items ?? [];
  const filteredItems = safeItems.filter((item) => {
    if (stepFilter != null && stepFilter !== "") {
      const step = inferSourceStep(kind, item);
      if (step !== stepFilter) return false;
    }
    if (searchQuery != null && !itemMatchesSearch(item, searchQuery)) return false;
    return true;
  });

  if (safeItems.length === 0) {
    return <p className="text-sm text-muted-foreground">No {kind} yet.</p>;
  }

  const columns = getDisplayKeys(filteredItems);
  const showTraceability = Boolean(workflow);

  function handleCopyMarkdown(item: CollectionItem, e: React.MouseEvent) {
    e.stopPropagation();
    const md = collectionItemToMarkdown(item, kind);
    navigator.clipboard.writeText(md).catch(() => {});
  }

  async function handleDownloadPdf(item: CollectionItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await downloadCollectionItemAsPdf(item, kind);
    } catch {
      // ignore
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 min-w-8 text-center">#</TableHead>
          <TableHead className="min-w-[120px]">Added</TableHead>
          {showTraceability && (
            <TableHead className="min-w-[120px]">Collected by</TableHead>
          )}
          {columns.map((col) => (
            <TableHead key={col} className="capitalize min-w-[120px]">
              {col.replace(/_/g, " ")}
            </TableHead>
          ))}
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredItems.map((item, i) => {
          const step = showTraceability ? inferSourceStep(kind, item) : null;
          const itemPath = getItemPagePath(kind, item, i, runId);
          const rowKey = (item.id as string) ?? `row-${i}`;
          const isExpanded = expandedRowKey === rowKey;
          return (
            <TableRow
              key={rowKey}
              className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/30")}
              onClick={() => toggleRowExpanded(rowKey)}
            >
              <TableCell className="text-xs text-muted-foreground text-center align-top py-1.5 w-8">
                {i + 1}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top py-1.5">
                {formatTimestamp(item.created_at as string | undefined)}
              </TableCell>
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
              {columns.map((col) => {
                const value = item[col];
                const isRich = isRichTextField(col) && typeof value === "string";
                const showClamp = !isExpanded;
                return (
                  <TableCell
                    key={col}
                    className="text-sm min-w-[120px] max-w-[500px] align-top py-1.5"
                  >
                    <div
                      className={cn(
                        "whitespace-normal break-words",
                        showClamp && "line-clamp-2 overflow-hidden"
                      )}
                    >
                      {col === "url" ? (
                        <a
                          href={value as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${TABLE_LINK_CLASS} break-all`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {formatCellValue(value)}
                        </a>
                      ) : isRich ? (
                        <RichText
                          content={value}
                          className={cn("text-xs", showClamp && "line-clamp-2")}
                        />
                      ) : (
                        formatCellValue(value)
                      )}
                    </div>
                  </TableCell>
                );
              })}
              <TableCell className="text-right align-top py-1.5 w-28" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleRowExpanded(rowKey)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    title={isExpanded ? "Collapse" : "Expand"}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </button>
                  <a
                    href={itemPath}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted inline-flex"
                    title="Open full page"
                    aria-label="Open full page"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={(e) => handleCopyMarkdown(item, e)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Copy as Markdown"
                    aria-label="Copy as Markdown"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDownloadPdf(item, e)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Download as PDF"
                    aria-label="Download as PDF"
                  >
                    <FileDown className="size-3.5" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
