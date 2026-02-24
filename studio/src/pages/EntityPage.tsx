import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, type CollectionSchemaConfig, type CollectionItem } from "@/api";
import { formatTimestamp } from "@/lib/utils";
import { collectionItemToMarkdown } from "@/lib/collectionItemToMarkdown";
import { downloadCollectionItemAsPdf } from "@/lib/collectionItemToPdf";
import { RichText, isRichTextField } from "@/components/display/RichText";
import { Copy, FileDown } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CopyableId } from "@/components/ui/CopyableId";
import { cn, downloadTableCsv, TABLE_LINK_CLASS } from "@/lib/utils";

const POLL_MS = 5000;

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatCellValue(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EntityPage() {
  const { kind } = useParams<{ kind: string }>();
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!kind) return;
    try {
      const [schemaData, itemsData] = await Promise.all([
        api.getCollectionSchema(),
        api.getEntityData(kind),
      ]);
      setSchema(schemaData);
      setItems(itemsData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!kind || error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "Missing entity kind"}</p>
            <p className="text-xs text-muted-foreground mt-2">Use the Collection section in the sidebar to open a collection.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kindSchema = schema?.kinds[kind];
  const columns = kindSchema?.properties
    ? Object.keys(kindSchema.properties)
    : items.length > 0
      ? Array.from(
          new Set(items.flatMap((i) => Object.keys(i).filter((k) => !["id", "created_at"].includes(k))))
        )
      : [];

  const displayColumns = ["run_id", ...columns].filter((c, i, a) => a.indexOf(c) === i);

  const displayKind = kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const kindSafe = kind ?? "";

  function getItemPagePath(item: CollectionItem, index: number): string {
    const id = (item.id as string) ?? String(index);
    const runIdQuery = item.run_id ? `?run_id=${encodeURIComponent(String(item.run_id))}` : "";
    return `/data/${encodeURIComponent(kindSafe)}/items/${encodeURIComponent(id)}${runIdQuery}`;
  }

  function handleCopyMarkdown(item: CollectionItem, e: React.MouseEvent) {
    e.stopPropagation();
    const md = collectionItemToMarkdown(item, kindSafe);
    navigator.clipboard.writeText(md).catch(() => {});
  }

  async function handleDownloadPdf(item: CollectionItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await downloadCollectionItemAsPdf(item, kindSafe);
    } catch {
      // ignore
    }
  }

  function handleDownloadCsv() {
    const csvColumns = ["created_at", ...displayColumns];
    const headers = ["Added", ...displayColumns.map((c) => (c === "run_id" ? "Run" : c.replace(/_/g, " ")))];
    downloadTableCsv(items, csvColumns, headers, `${kindSafe}.csv`);
  }

  return (
    <div className="p-3 space-y-3">
      <Breadcrumbs items={[{ label: "Data" }, { label: kind }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{displayKind}</h1>

      {kindSchema && (
        <div className="text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-muted/40 border border-border/50">
          <span className="font-medium text-foreground/80">Schema:</span> {kindSchema.description}
          {kindSchema.required && kindSchema.required.length > 0 && (
            <span className="ml-2">Required: {kindSchema.required.join(", ")}</span>
          )}
          {kindSchema.global && (
            <Badge variant="secondary" className="ml-2 text-[10px]">Cross-run</Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Data ({items.length} items)</CardTitle>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
            >
              Download CSV
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No data yet. Agent defines and populates entities via collection_schema_set and collection_set.
            </p>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 min-w-8 text-center">#</TableHead>
                  <TableHead className="min-w-[120px]">Added</TableHead>
                  {displayColumns.map((col) => (
                    <TableHead key={col} className="capitalize min-w-[120px]">
                      {col === "run_id" ? "Run" : col.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => {
                  const itemPath = getItemPagePath(item, i);
                  return (
                    <TableRow
                      key={(item.id as string) ?? i}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(itemPath)}
                    >
                      <TableCell className="text-xs text-muted-foreground text-center align-top w-8 min-w-8">
                        {i + 1}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top min-w-[120px]">
                        {formatTimestamp(item.created_at as string | undefined)}
                      </TableCell>
                      {displayColumns.map((col) => {
                        const value = item[col];
                        const isRich = isRichTextField(col) && typeof value === "string";
                        return (
                          <TableCell key={col} className="text-sm min-w-[120px] max-w-[500px] whitespace-normal break-words align-top">
                            {col === "run_id" && item.run_id ? (
                              <span className="inline-flex items-center gap-1.5">
                                <CopyableId value={String(item.run_id)} truncateLength={20} />
                                <Link
                                  to={`/runs/${encodeURIComponent(String(item.run_id))}`}
                                  className={cn("text-xs", TABLE_LINK_CLASS)}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View run
                                </Link>
                              </span>
                            ) : col === "url" && value ? (
                              <a
                                href={value as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(TABLE_LINK_CLASS, "break-all")}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {formatCellValue(value)}
                              </a>
                            ) : isRich ? (
                              <RichText content={value as string} className="line-clamp-3 text-xs" />
                            ) : (
                              formatCellValue(value)
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
