import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type RunRecord, type EventPayload, type CollectionStore, type WorkflowVersion, type NodeResultRecord } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EventDataSummary } from "@/components/display/EventDataSummary";
import { CollectionTable } from "@/components/display/CollectionTable";
import { RichText } from "@/components/display/RichText";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ResizablePanel } from "@/components/ui/ResizablePanel";
import { downloadTableCsv, formatTimestamp, getCollectionColor, TABLE_LINK_CLASS } from "@/lib/utils";
import { CopyableId } from "@/components/ui/CopyableId";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ListChecks } from "lucide-react";

const POLL_MS = 3000;

/** Format seconds as "+Xs" or "-" for first event. */
function formatEventDelta(ts: string, prevTs: string | null): string {
  if (!prevTs) return "-";
  const a = Date.parse(ts);
  const b = Date.parse(prevTs);
  if (Number.isNaN(a) || Number.isNaN(b)) return "-";
  const sec = (a - b) / 1000;
  if (sec < 60) return `+${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `+${min}m ${s}s`;
}

function getEventTypeBadgeVariant(type: string): string {
  switch (type) {
    case "run_started":
      return "bg-primary/20 text-primary border-primary/40";
    case "step_started":
      return "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40";
    case "step_completed":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
    case "run_completed":
      return "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [collections, setCollections] = useState<Record<string, CollectionStore>>({});
  const [workflow, setWorkflow] = useState<WorkflowVersion | null>(null);
  const [nodeResults, setNodeResults] = useState<NodeResultRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWorkflowHint, setShowWorkflowHint] = useState(false);
  const [selectedCollectionTab, setSelectedCollectionTab] = useState<string | null>(null);
  const [collectionStepFilter, setCollectionStepFilter] = useState<string | null>(null);
  const [eventsDrawerOpen, setEventsDrawerOpen] = useState(false);
  const eventsScrollRef = useRef<HTMLDivElement>(null);

  const effectiveCollectionTab =
    selectedCollectionTab ?? (tabParam && kinds.includes(tabParam) ? tabParam : kinds[0]) ?? "";

  function handleDownloadEventsCsv() {
    const rows = events.map((ev) => ({
      ts: ev.ts,
      type: ev.type,
      by: ev.by ?? "",
      data: JSON.stringify(ev.data),
    }));
    downloadTableCsv(rows, ["ts", "type", "by", "data"], ["Time", "Type", "By", "Data"], "events.csv");
  }

  function handleDownloadCollectionCsv() {
    const kind = effectiveCollectionTab;
    const store = kind ? collections[kind] : null;
    const items = store?.items ?? [];
    if (items.length === 0) return;
    const exclude = new Set(["id", "created_at"]);
    const columnKeys = Array.from(
      items.reduce<Set<string>>((acc, item) => {
        Object.keys(item).filter((k) => !exclude.has(k)).forEach((k) => acc.add(k));
        return acc;
      }, new Set())
    );
    const headers = columnKeys.map((k) => k.replace(/_/g, " "));
    downloadTableCsv(items, columnKeys, headers, `${kind}.csv`);
  }

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const [runData, eventsData, kindsData, nodeResultsData] = await Promise.all([
        api.getRun(runId),
        api.getRunEvents(runId),
        api.getCollectionKinds(runId),
        api.getNodeResults(runId),
      ]);
      setRun(runData);
      setEvents(eventsData);
      setKinds(kindsData);
      setNodeResults(nodeResultsData);
      setError(null);
      const col: Record<string, CollectionStore> = {};
      for (const kind of kindsData) {
        col[kind] = await api.getCollections(runId, kind);
      }
      setCollections(col);
      if (runData?.workflow_id && runData?.workflow_version_id) {
        try {
          const wf = await api.getWorkflowVersion(runData.workflow_id, runData.workflow_version_id, {
            includePrompts: false,
          });
          setWorkflow(wf);
        } catch {
          setWorkflow(null);
        }
      } else {
        setWorkflow(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!runId || error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "Missing run ID"}</p>
            <Link to="/runs" className={`text-sm mt-2 inline-block ${TABLE_LINK_CLASS}`}>
              Back to runs
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = run === null;

  if (isLoading) {
    return (
      <div className="h-full flex">
        <aside className="w-1/2 border-r border-border flex flex-col bg-muted/20 shrink-0">
          <div className="p-2 border-b border-border">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </aside>
        <main className="flex-1 flex flex-col min-w-0 p-2 gap-2">
          <div className="flex items-center gap-2 py-1.5 border-b border-border">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-40 ml-auto" />
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-border">
            <Skeleton className="h-4 w-full max-w-[200px]" />
            <Skeleton className="h-4 w-full max-w-[280px]" />
          </div>
          <div className="flex-1 flex flex-col border-l-2 border-border pl-2 gap-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="flex-1 min-h-[120px] w-full rounded" />
          </div>
        </main>
      </div>
    );
  }

  const workflowPanel = workflow ? (
    <>
      <div className="px-2 py-2 border-b border-border flex items-center justify-between gap-1">
        <p className="text-xs font-medium text-muted-foreground">Workflow</p>
        <button
          type="button"
          onClick={() => setShowWorkflowHint((v) => !v)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          aria-label="Show workflow tips"
        >
          <span className="text-[10px] font-mono">?</span>
        </button>
      </div>
      {showWorkflowHint && (
        <div className="px-2 py-1.5 border-b border-border bg-muted/50">
          <p className="text-[10px] text-muted-foreground">
            Drag nodes to reposition · Click nodes for details
          </p>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <WorkflowCanvas
          workflow={workflow}
          workflowId={run?.workflow_id}
          versionId={run?.workflow_version_id}
          events={events}
          nodeResults={nodeResults}
          readOnly
          nodesDraggable
          showControls
          showBackground={false}
          className="bg-transparent"
        />
      </div>
    </>
  ) : null;

  const contentPanel = (
    <main className="h-full flex flex-col overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 p-2 gap-1.5">
          <header className="shrink-0 bg-background py-1.5 border-b border-border flex flex-wrap items-center gap-x-3 gap-y-1">
            <Breadcrumbs
              items={[
                { label: "Runs", to: "/runs" },
                { label: run?.name ?? runId ?? "Run", to: undefined },
              ]}
            />
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0",
                run?.status === "completed" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
                run?.status === "running" && "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 animate-pulse",
                run?.status !== "completed" && run?.status !== "running" && "bg-muted text-muted-foreground"
              )}
            >
              {run?.status}
            </Badge>
            {run?.workflow_version_id && (
              <Link
                to={`/workflow?workflow_id=${encodeURIComponent(run.workflow_id)}&version_id=${encodeURIComponent(run.workflow_version_id)}`}
                className={`text-xs shrink-0 ${TABLE_LINK_CLASS}`}
              >
                Workflow version: {run.workflow_version_id}
              </Link>
            )}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <CopyableId
                value={runId}
                truncateLength={20}
                className="text-[11px] text-muted-foreground font-normal"
              />
              <button
                type="button"
                onClick={() => setEventsDrawerOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted",
                  eventsDrawerOpen && "ring-2 ring-ring/50"
                )}
                aria-label="Open events"
              >
                <ListChecks className="size-3.5" />
                Events ({events.length})
              </button>
            </div>
          </header>

          <section className="shrink-0 border-l-2 border-l-primary/40 pl-2 py-1">
            <dl className="text-sm space-y-0.5">
              <div className="flex gap-2">
                <dt className="text-muted-foreground shrink-0 w-16">Created</dt>
                <dd>{formatTimestamp(run?.created_at)}</dd>
              </div>
              {run?.input && Object.keys(run.input).length > 0 && (
                Object.entries(run.input)
                  .filter(([, v]) => v !== undefined && v !== null && v !== "")
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0 w-16 capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="min-w-0 break-words">
                        {typeof v === "string" && v.length > 200 ? (
                          <span className="block rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{v}</span>
                        ) : (
                          <span className="rounded bg-muted/50 px-1.5 py-0.5">{String(v)}</span>
                        )}
                      </dd>
                    </div>
                  ))
              )}
              {(!run?.input || Object.keys(run.input).length === 0) && (
                <div className="text-muted-foreground text-xs">No input</div>
              )}
            </dl>
          </section>

          {run?.final_answer != null && run.final_answer !== "" && (
            <section className="shrink-0 border-l-2 border-l-emerald-500/40 pl-2 py-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Final answer</p>
              <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                <RichText content={run.final_answer} />
              </div>
            </section>
          )}

          <Sheet open={eventsDrawerOpen} onOpenChange={setEventsDrawerOpen}>
            <SheetContent side="right" className="w-full max-w-2xl">
              <SheetHeader>
                <SheetTitle>Events ({events.length})</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 mt-2">
                {events.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadEventsCsv}
                    className="text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted w-fit"
                  >
                    Download CSV
                  </button>
                )}
                <ScrollArea className="flex-1 -mx-2">
                  <div className="pr-2" ref={eventsScrollRef}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-7 px-1.5 text-xs min-w-[70px]">Delta</TableHead>
                          <TableHead className="h-7 px-1.5 text-xs min-w-[100px]">Time</TableHead>
                          <TableHead className="h-7 px-1.5 text-xs min-w-[120px]">Type</TableHead>
                          <TableHead className="h-7 px-1.5 text-xs min-w-[80px]">By</TableHead>
                          <TableHead className="h-7 px-1.5 text-xs min-w-[280px]">Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.map((ev, i) => (
                          <TableRow key={i} data-event-index={i} className="cursor-default">
                            <TableCell className="text-[11px] text-muted-foreground py-1 font-mono">
                              {formatEventDelta(ev.ts, i > 0 ? events[i - 1].ts : null)}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground py-1">{ev.ts ?? "-"}</TableCell>
                            <TableCell className="py-1">
                              <Badge variant="outline" className={cn("text-[10px]", getEventTypeBadgeVariant(ev.type))}>
                                {ev.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm py-1">{ev.by ?? "-"}</TableCell>
                            <TableCell className="min-w-[280px] max-w-none whitespace-normal break-words align-top py-1.5 text-xs overflow-visible">
                              <EventDataSummary type={ev.type} data={ev.data} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              </div>
            </SheetContent>
          </Sheet>

          {kinds.length > 0 && (
            <section className="flex-1 min-h-0 flex flex-col border-l-2 border-l-emerald-500/40 pl-2">
              <Card className="flex-1 min-h-0 flex flex-col gap-0 py-1">
                <CardHeader className="py-1 px-2 shrink-0 flex flex-row items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm">Data collected</CardTitle>
                  <div className="flex items-center gap-2">
                    <select
                      value={collectionStepFilter ?? ""}
                      onChange={(e) => setCollectionStepFilter(e.target.value === "" ? null : e.target.value)}
                      className="text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted min-w-[140px]"
                      aria-label="Filter by step"
                    >
                      <option value="">All steps</option>
                      {workflow?.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.id.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    {(collections[effectiveCollectionTab]?.items?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadCollectionCsv}
                        className="text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
                      >
                        Download CSV
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 overflow-hidden px-2 pb-1 pt-0 flex flex-col">
                  <Tabs
                    value={effectiveCollectionTab}
                    onValueChange={setSelectedCollectionTab}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <div className="shrink-0 min-w-0 overflow-x-auto overflow-y-hidden">
                      <TabsList className="inline-flex w-max">
                        {kinds.map((k) => (
                          <TabsTrigger
                            key={k}
                            value={k}
                            className="shrink-0 border-l-4 pl-2"
                            style={{ borderLeftColor: getCollectionColor(k) }}
                          >
                            {k}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>
                    {kinds.map((kind) => (
                      <TabsContent
                        key={kind}
                        value={kind}
                        className="flex-1 min-h-0 mt-1 data-[state=inactive]:hidden flex flex-col overflow-hidden border-l-4 pl-2"
                        style={{ borderLeftColor: getCollectionColor(kind) }}
                      >
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-1">
                          <CollectionTable
                              kind={kind}
                              items={(collections[kind] ?? { items: [] }).items}
                              workflow={workflow}
                              runId={runId ?? null}
                              stepFilter={collectionStepFilter}
                              searchQuery=""
                            />
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </main>
  );

  return workflow ? (
    <ResizablePanel
      defaultFraction={0.5}
      defaultWidth={400}
      minWidth={200}
      maxWidth={800}
      storageKey="cognetivy-workflow-panel-width"
      left={
        <aside className="h-full flex flex-col border-r border-border bg-muted/20">
          {workflowPanel}
        </aside>
      }
      right={contentPanel}
      className="h-full"
    />
  ) : (
    <div className="h-full flex">
      {contentPanel}
    </div>
  );
}
