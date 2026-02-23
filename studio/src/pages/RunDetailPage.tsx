import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type RunRecord, type EventPayload, type CollectionStore, type WorkflowVersion } from "@/api";
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
import { EventDataSummary } from "@/components/display/EventDataSummary";
import { CollectionTable } from "@/components/display/CollectionTable";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { ResizablePanel } from "@/components/ui/ResizablePanel";
import { getStepIdFromEventData } from "@/lib/utils";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

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
  const [error, setError] = useState<string | null>(null);
  const [showWorkflowHint, setShowWorkflowHint] = useState(false);
  const eventsScrollRef = useRef<HTMLDivElement>(null);

  function handleStepClick(stepId: string) {
    const idx = events.findIndex((ev) => getStepIdFromEventData(ev.data) === stepId);
    if (idx >= 0) {
      const rowEl = eventsScrollRef.current?.querySelector(`[data-event-index="${idx}"]`);
      rowEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const [runData, eventsData, kindsData] = await Promise.all([
        api.getRun(runId),
        api.getRunEvents(runId),
        api.getCollectionKinds(runId),
      ]);
      setRun(runData);
      setEvents(eventsData);
      setKinds(kindsData);
      setError(null);
      const col: Record<string, CollectionStore> = {};
      for (const kind of kindsData) {
        col[kind] = await api.getCollections(runId, kind);
      }
      setCollections(col);
      if (runData?.workflow_version) {
        try {
          const wf = await api.getWorkflowVersion(runData.workflow_version);
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
            <Link to="/runs" className="text-primary text-sm mt-2 inline-block hover:underline">
              Back to runs
            </Link>
          </CardContent>
        </Card>
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
            Drag nodes to reposition · Click step to scroll to events
          </p>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <WorkflowCanvas
          workflow={workflow}
          events={events}
          onStepClick={handleStepClick}
          readOnly
          nodesDraggable
          showControls={false}
          showBackground={false}
          className="bg-transparent"
        />
      </div>
    </>
  ) : null;

  const contentPanel = (
    <main className="h-full flex flex-col overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0 p-2 gap-2">
          <header className="shrink-0 bg-background pb-1.5 border-b border-border">
            <div className="flex items-center gap-2 text-xs mb-1">
              <Link to="/runs" className="text-muted-foreground hover:text-foreground">
                Runs
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="truncate max-w-md">
                {run?.name ? (
                  <>
                    <span className="font-medium">{run.name}</span>
                    <span className="ml-1.5 font-mono text-muted-foreground">{runId}</span>
                  </>
                ) : (
                  <span className="font-mono">{runId}</span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  run?.status === "completed" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
                  run?.status === "running" && "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 animate-pulse",
                  run?.status !== "completed" && run?.status !== "running" && "bg-muted text-muted-foreground"
                )}
              >
                {run?.status}
              </Badge>
              {run?.workflow_version && (
                <Link
                  to={`/workflow?version=${encodeURIComponent(run.workflow_version)}`}
                  className="text-xs text-primary hover:underline"
                >
                  {run.workflow_version}
                </Link>
              )}
            </div>
          </header>

          <section className="shrink-0 border-l-4 border-l-primary/50 pl-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs py-0.5">
              <span className="text-muted-foreground font-medium">Metadata</span>
              <span><span className="text-muted-foreground">Created:</span> {run?.created_at}</span>
              {run?.input && Object.keys(run.input).length > 0 && (
                <span>
                  <span className="text-muted-foreground">Input:</span>{" "}
                  {Object.entries(run.input)
                    .filter(([, v]) => v !== undefined && v !== null && v !== "")
                    .map(([k, v]) => (
                      <span key={k} className="ml-1">
                        <span className="font-medium">{k}:</span>{" "}
                        <span className="rounded bg-muted/70 px-1.5 py-0.5">{String(v)}</span>
                      </span>
                    ))}
                </span>
              )}
            </div>
          </section>

          <section className="flex-1 min-h-0 flex flex-col border-l-4 border-l-blue-500/50 pl-2">
            <Card className="flex-1 min-h-0 flex flex-col gap-0 py-1">
              <CardHeader className="py-1 px-2 shrink-0">
                <CardTitle className="text-sm">Events</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-1 pt-0 flex-1 min-h-0 overflow-hidden" ref={eventsScrollRef}>
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-7 px-1.5 text-xs">Time</TableHead>
                        <TableHead className="h-7 px-1.5 text-xs">Type</TableHead>
                        <TableHead className="h-7 px-1.5 text-xs">By</TableHead>
                        <TableHead className="h-7 px-1.5 text-xs">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((ev, i) => (
                        <TableRow key={i} data-event-index={i} className="cursor-default">
                          <TableCell className="text-[11px] text-muted-foreground py-1">{ev.ts}</TableCell>
                          <TableCell className="py-1">
                            <Badge variant="outline" className={cn("text-[10px]", getEventTypeBadgeVariant(ev.type))}>
                              {ev.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm py-1">{ev.by ?? "—"}</TableCell>
                          <TableCell className="max-w-[480px] whitespace-normal break-words align-top py-1 text-xs">
                            <EventDataSummary type={ev.type} data={ev.data} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>

          {kinds.length > 0 && (
            <section className="flex-1 min-h-0 flex flex-col border-l-4 border-l-emerald-500/50 pl-2">
              <Card className="flex-1 min-h-0 flex flex-col gap-0 py-1">
                <CardHeader className="py-1 px-2 shrink-0">
                  <CardTitle className="text-sm">Collections</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Data collected by workflow steps. Each item is traceable to its source step.
                  </p>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 overflow-hidden px-2 pb-1 pt-0">
                  <Tabs defaultValue={tabParam && kinds.includes(tabParam) ? tabParam : kinds[0]} className="flex flex-col h-full">
                    <TabsList className="shrink-0">
                      {kinds.map((k) => (
                        <TabsTrigger key={k} value={k}>
                          {k}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {kinds.map((kind) => (
                      <TabsContent key={kind} value={kind} className="flex-1 min-h-0 mt-1 data-[state=inactive]:hidden">
                        <ScrollArea className="h-full">
                          <div className="p-1">
                            <CollectionTable
                              kind={kind}
                              items={(collections[kind] ?? { items: [] }).items}
                              workflow={workflow}
                            />
                          </div>
                        </ScrollArea>
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
      defaultWidth={300}
      minWidth={200}
      maxWidth={600}
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
