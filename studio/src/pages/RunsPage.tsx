import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type RunRecord } from "@/api";
import { useWorkflowSelection } from "@/contexts/WorkflowSelectionContext";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { downloadTableCsv, formatTimestamp } from "@/lib/utils";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const POLL_MS = 3000;
const ALL_VERSIONS = "";
const ALL_STATUSES = "";

export function RunsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedWorkflowId, selectedWorkflow } = useWorkflowSelection();
  const versionFilter = searchParams.get("version") ?? ALL_VERSIONS;
  const statusFilter = searchParams.get("status") ?? ALL_STATUSES;
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const workflowRuns = useMemo(() => {
    if (!selectedWorkflowId) return runs;
    return runs.filter((r) => r.workflow_id === selectedWorkflowId);
  }, [runs, selectedWorkflowId]);

  const filteredRuns = useMemo(() => {
    return workflowRuns.filter((r) => {
      if (versionFilter && r.workflow_version_id !== versionFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [workflowRuns, versionFilter, statusFilter]);

  const uniqueVersions = useMemo(
    () => Array.from(new Set(workflowRuns.map((r) => r.workflow_version_id))).sort(),
    [workflowRuns]
  );
  const uniqueStatuses = useMemo(
    () => Array.from(new Set(runs.map((r) => r.status))).sort(),
    [runs]
  );

  function handleVersionChange(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === ALL_VERSIONS) next.delete("version");
      else next.set("version", value);
      return next;
    });
  }

  function handleStatusChange(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === ALL_STATUSES) next.delete("status");
      else next.set("status", value);
      return next;
    });
  }

  function toggleRowExpanded(rowKey: string) {
    setExpandedRowKey((prev) => (prev === rowKey ? null : rowKey));
  }

  const load = useCallback(async () => {
    try {
      const data = await api.getRuns();
      setRuns(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleDownloadCsv() {
    const columnKeys: string[] = ["name", "run_id", "workflow_id", "workflow_version_id", "status", "created_at"];
    const headers = ["Name", "ID", "Workflow", "Version", "Status", "Created"];
    downloadTableCsv(
      filteredRuns.map((r) => ({
        name: r.name ?? "",
        run_id: r.run_id,
        workflow_id: r.workflow_id,
        workflow_version_id: r.workflow_version_id,
        status: r.status,
        created_at: r.created_at,
      })),
      columnKeys,
      headers,
      "runs.csv"
    );
  }

  const runningCount = runs.filter((r) => r.status === "running").length;

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 py-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Breadcrumbs items={[{ label: "Runs" }]} />
          {selectedWorkflow?.name && (
            <span className="text-xs text-muted-foreground">
              Workflow: <span className="font-medium text-foreground/80">{selectedWorkflow.name}</span>
            </span>
          )}
          {runningCount > 0 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
              {runningCount} running
            </span>
          )}
          <div className="flex items-center gap-2">
            <Select
              value={versionFilter || "all"}
              onValueChange={(v) => handleVersionChange(v === "all" ? ALL_VERSIONS : v)}
            >
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue placeholder="Workflow version" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All versions</SelectItem>
                {uniqueVersions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => handleStatusChange(v === "all" ? ALL_STATUSES : v)}
            >
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {uniqueStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filteredRuns.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
            >
              Download CSV
            </button>
          )}
        </div>
      </div>
      <Card>
        <CardContent className="p-0 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-right">Actions</TableHead>
                <TableHead className="w-8 min-w-8 text-center">#</TableHead>
                <TableHead className="min-w-[120px]">Name</TableHead>
                <TableHead className="min-w-[180px]">ID</TableHead>
                <TableHead className="min-w-[80px]">Version</TableHead>
                <TableHead className="min-w-[80px]">Status</TableHead>
                <TableHead className="min-w-[140px] whitespace-nowrap">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {runs.length === 0 ? "No runs yet" : "No runs match filter"}
                  </TableCell>
                </TableRow>
              )}
              {filteredRuns.map((run, i) => {
                const rowKey = run.run_id;
                const isExpanded = expandedRowKey === rowKey;
                return (
                  <TableRow
                    key={run.run_id}
                    className={[
                      "cursor-pointer hover:bg-muted/50",
                      run.status === "running" ? "bg-amber-500/5 dark:bg-amber-500/10" : "",
                      isExpanded ? "bg-muted/30" : "",
                    ].join(" ")}
                    onClick={() => toggleRowExpanded(rowKey)}
                  >
                    <TableCell className="text-right align-top py-1.5 w-24" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleRowExpanded(rowKey)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          title={isExpanded ? "Collapse" : "Expand"}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                        <Link
                          to={`/runs/${encodeURIComponent(run.run_id)}`}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted inline-flex"
                          title="Open run"
                          aria-label="Open run"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground text-center align-top w-8 min-w-8 py-1.5">
                      {i + 1}
                    </TableCell>
                    <TableCell className="align-top py-1.5">
                      <div className={["text-sm whitespace-normal break-words", !isExpanded ? "line-clamp-2 overflow-hidden" : ""].join(" ")}>
                        {run.name ?? "-"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] align-top py-1.5">
                      <CopyableId value={run.run_id} truncateLength={24} />
                    </TableCell>
                    <TableCell className="align-top py-1.5 text-sm">{run.workflow_version_id}</TableCell>
                    <TableCell className="align-top py-1.5">
                      <Badge variant={run.status === "running" ? "default" : "secondary"}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap align-top py-1.5">
                      {formatTimestamp(run.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
