import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type RunRecord, type EventPayload, type ArtifactStore, type WorkflowVersion } from "@/api";
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
import { KeyValueGrid } from "@/components/display/KeyValueGrid";
import { EventDataSummary } from "@/components/display/EventDataSummary";
import { ArtifactCards } from "@/components/display/ArtifactCards";
import { RunProgressDag } from "@/components/display/RunProgressDag";

const POLL_MS = 3000;

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactStore>>({});
  const [workflow, setWorkflow] = useState<WorkflowVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const [runData, eventsData, kindsData] = await Promise.all([
        api.getRun(runId),
        api.getRunEvents(runId),
        api.getArtifactKinds(runId),
      ]);
      setRun(runData);
      setEvents(eventsData);
      setKinds(kindsData);
      setError(null);
      const art: Record<string, ArtifactStore> = {};
      for (const kind of kindsData) {
        art[kind] = await api.getArtifacts(runId, kind);
      }
      setArtifacts(art);
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

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <Link to="/runs" className="text-muted-foreground hover:text-foreground">
          Runs
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono truncate max-w-md">{runId}</span>
      </div>

      {run && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Run metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs py-2 px-3">
            <p>
              <span className="text-muted-foreground">Workflow version:</span> {run.workflow_version}
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span>{" "}
              <Badge variant={run.status === "running" ? "default" : "secondary"}>{run.status}</Badge>
            </p>
            <p>
              <span className="text-muted-foreground">Created:</span> {run.created_at}
            </p>
            {run.input && Object.keys(run.input).length > 0 && (
              <div className="mt-2">
                <span className="text-muted-foreground block mb-1">Input:</span>
                <KeyValueGrid data={run.input} className="rounded bg-muted/50 p-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {workflow && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Run progress</CardTitle>
            <p className="text-xs text-muted-foreground">
              Step status from events (pending → started → completed)
            </p>
          </CardHeader>
          <CardContent>
            <RunProgressDag workflow={workflow} events={events} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Events</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ScrollArea className="h-[220px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{ev.ts}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ev.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{ev.by ?? "—"}</TableCell>
                    <TableCell className="max-w-md">
                      <EventDataSummary data={ev.data} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {kinds.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Artifacts</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={kinds[0]}>
              <TabsList>
                {kinds.map((k) => (
                  <TabsTrigger key={k} value={k}>
                    {k}
                  </TabsTrigger>
                ))}
              </TabsList>
              {kinds.map((kind) => (
                <TabsContent key={kind} value={kind}>
                  <ScrollArea className="h-[280px]">
                    <div className="p-2">
                      <ArtifactCards
                        kind={kind}
                        items={(artifacts[kind] ?? { items: [] }).items}
                      />
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
