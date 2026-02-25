import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api, type CollectionSchemaConfig, type CollectionItem, type RunRecord } from "@/api";
import { useWorkflowSelection } from "@/contexts/WorkflowSelectionContext";
import { formatTimestamp } from "@/lib/utils";
import { downloadCollectionItemAsPdf } from "@/lib/collectionItemToPdf";
import { RichText, shouldRenderRichText } from "@/components/display/RichText";
import { FileDown } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, downloadTableCsv, getCollectionColor, TABLE_LINK_CLASS } from "@/lib/utils";

const POLL_MS = 5000;
const COLLECTION_RUN_FILTER_STORAGE_KEY = "cognetivy_collection_run_id";

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatCellValue(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EntityPage() {
  const { kind } = useParams<{ kind: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedWorkflowId, selectedWorkflow } = useWorkflowSelection();
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const runFilterId = searchParams.get("run_id") ?? "";

  const runIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of runs) {
      map.set(r.run_id, r.name ?? r.run_id);
    }
    return map;
  }, [runs]);

  const load = useCallback(async () => {
    if (!kind) return;
    try {
      if (!selectedWorkflowId) return;
      const [schemaData, itemsData, runsData] = await Promise.all([
        api.getCollectionSchema(selectedWorkflowId),
        api.getEntityData(kind, { workflowId: selectedWorkflowId }),
        api.getRuns(),
      ]);
      setSchema(schemaData);
      setItems(itemsData);
      setRuns(runsData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind, selectedWorkflowId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!kind || searchParams.get("run_id")) return;
    try {
      const saved = localStorage.getItem(COLLECTION_RUN_FILTER_STORAGE_KEY);
      if (saved) {
        const next = new URLSearchParams(searchParams);
        next.set("run_id", saved);
        setSearchParams(next, { replace: true });
      }
    } catch {
      // ignore localStorage errors
    }
  }, [kind, searchParams, setSearchParams]);

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
  const references = kindSchema?.references ?? {};
  const columns = useMemo(() => {
    const itemSchema = kindSchema?.item_schema;
    if (itemSchema && typeof itemSchema === "object") {
      const props = (itemSchema as Record<string, unknown>).properties;
      if (props && typeof props === "object") {
        return Object.keys(props as Record<string, unknown>);
      }
    }
    if (items.length > 0) {
      return Array.from(
        new Set(items.flatMap((i) => Object.keys(i).filter((k) => !["id", "created_at"].includes(k))))
      );
    }
    return [];
  }, [items, kindSchema]);

  const displayColumns = columns.filter((c, i, a) => a.indexOf(c) === i && c !== "run_id");

  const filteredItems = useMemo(() => {
    if (!runFilterId) return items;
    return items.filter((item) => String(item.run_id ?? "") === runFilterId);
  }, [items, runFilterId]);

  const displayKind = kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  function handleRunFilterChange(value: string) {
    const nextRunId = value === "all" ? "" : value;
    const next = new URLSearchParams(searchParams);
    if (nextRunId) {
      next.set("run_id", nextRunId);
    } else {
      next.delete("run_id");
    }
    setSearchParams(next, { replace: true });
    try {
      if (nextRunId) {
        localStorage.setItem(COLLECTION_RUN_FILTER_STORAGE_KEY, nextRunId);
      } else {
        localStorage.removeItem(COLLECTION_RUN_FILTER_STORAGE_KEY);
      }
    } catch {
      // ignore localStorage errors
    }
  }

  const kindSafe = kind ?? "";

  function getItemPagePath(item: CollectionItem, index: number): string {
    const id = (item.id as string) ?? String(index);
    const runIdQuery = item.run_id ? `?run_id=${encodeURIComponent(String(item.run_id))}` : "";
    return `/data/${encodeURIComponent(kindSafe)}/items/${encodeURIComponent(id)}${runIdQuery}`;
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
    const csvColumns = ["created_at", "run_name", ...displayColumns];
    const headers = ["Added", "Run", ...displayColumns.map((c) => c.replace(/_/g, " "))];
    const rows = filteredItems.map((item) => ({
      ...item,
      run_name: item.run_id ? (runIdToName.get(String(item.run_id)) ?? "") : "",
    }));
    downloadTableCsv(rows, csvColumns, headers, `${kindSafe}.csv`);
  }

  return (
    <div className="p-3 space-y-3">
      <Breadcrumbs items={[{ label: "Data" }, { label: kind }]} />
      <h1 className="text-2xl font-semibold tracking-tight border-l-4 pl-3" style={{ borderLeftColor: getCollectionColor(kind) }}>
        {displayKind}
      </h1>

      {kindSchema && (
        <div className="text-xs text-muted-foreground py-1.5 px-2 rounded-md bg-muted/40 border border-border/50">
          <span className="font-medium text-foreground/80">Workflow:</span> {selectedWorkflow?.name ?? "-"}
          <span className="ml-2"><span className="font-medium text-foreground/80">Schema:</span> {kindSchema.description}</span>
        </div>
      )}

      <Card>
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-sm">Data ({filteredItems.length} items)</CardTitle>
            {runs.length > 0 && (
              <Select value={runFilterId || "all"} onValueChange={handleRunFilterChange}>
                <SelectTrigger className="w-[200px] h-8 text-xs" size="sm">
                  <SelectValue placeholder="Filter by run" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All runs</SelectItem>
                  {runs.map((r) => (
                    <SelectItem key={r.run_id} value={r.run_id}>
                      {r.name ?? r.run_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {filteredItems.length > 0 && (
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
          {filteredItems.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {items.length === 0
                ? "No data yet. Agent defines and populates entities via collection_schema_set and collection_set."
                : runFilterId
                  ? "No items for the selected run."
                  : "No data yet."}
            </p>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 min-w-8 text-center">#</TableHead>
                  <TableHead className="min-w-[120px]">Added</TableHead>
                  <TableHead className="min-w-[120px]">Run</TableHead>
                  {displayColumns.map((col) => (
                    <TableHead key={col} className="capitalize min-w-[120px]">
                      {col.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, i) => {
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
                      <TableCell className="text-sm min-w-[120px] align-top">
                        {item.run_id ? (
                          <Link
                            to={`/runs/${encodeURIComponent(String(item.run_id))}`}
                            className={TABLE_LINK_CLASS}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {runIdToName.get(String(item.run_id)) ?? "-"}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      {displayColumns.map((col) => {
                        const value = item[col];
                        const isRich = shouldRenderRichText(col, value);
                        const ref = references[col];
                        return (
                          <TableCell key={col} className="text-sm min-w-[120px] max-w-[500px] whitespace-normal break-words align-top">
                            {ref && value ? (
                              Array.isArray(value) ? (
                                <span className="space-x-1">
                                  {(value as unknown[]).map((v, idx) => {
                                    const id = String(v);
                                    const runIdQuery = item.run_id ? `?run_id=${encodeURIComponent(String(item.run_id))}` : "";
                                    return (
                                      <Link
                                        key={`${col}-${id}-${idx}`}
                                        to={`/data/${encodeURIComponent(ref.kind)}/items/${encodeURIComponent(id)}${runIdQuery}`}
                                        className={TABLE_LINK_CLASS}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {id}
                                      </Link>
                                    );
                                  })}
                                </span>
                              ) : (
                                <Link
                                  to={`/data/${encodeURIComponent(ref.kind)}/items/${encodeURIComponent(String(value))}${item.run_id ? `?run_id=${encodeURIComponent(String(item.run_id))}` : ""}`}
                                  className={TABLE_LINK_CLASS}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {String(value)}
                                </Link>
                              )
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
                              <RichText content={value} className="line-clamp-3 text-xs" />
                            ) : (
                              formatCellValue(value)
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right align-top" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => handleDownloadPdf(item, e)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Download as PDF"
                          aria-label="Download as PDF"
                        >
                          <FileDown className="size-3.5" />
                        </button>
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
