import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type RunRecord } from "@/api";
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
import { downloadTableCsv, TABLE_LINK_CLASS } from "@/lib/utils";

const POLL_MS = 3000;
const ALL_VERSIONS = "";
const ALL_STATUSES = "";

export function RunsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const versionFilter = searchParams.get("version") ?? ALL_VERSIONS;
  const statusFilter = searchParams.get("status") ?? ALL_STATUSES;
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (versionFilter && r.workflow_version !== versionFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, versionFilter, statusFilter]);

  const uniqueVersions = useMemo(
    () => Array.from(new Set(runs.map((r) => r.workflow_version))).sort(),
    [runs]
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
    const columnKeys: string[] = ["name", "run_id", "workflow_version", "status", "created_at"];
    const headers = ["Name", "ID", "Version", "Status", "Created"];
    downloadTableCsv(
      filteredRuns.map((r) => ({
        name: r.name ?? "",
        run_id: r.run_id,
        workflow_version: r.workflow_version,
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {runs.length === 0 ? "No runs yet" : "No runs match filter"}
                  </TableCell>
                </TableRow>
              )}
              {filteredRuns.map((run, i) => (
                <TableRow
                  key={run.run_id}
                  className={run.status === "running" ? "bg-amber-500/5 dark:bg-amber-500/10" : undefined}
                >
                  <TableCell className="text-xs text-muted-foreground text-center align-top w-8 min-w-8">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/runs/${encodeURIComponent(run.run_id)}`}
                      className={TABLE_LINK_CLASS}
                    >
                      {run.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <CopyableId value={run.run_id} truncateLength={24} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/runs?version=${encodeURIComponent(run.workflow_version)}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`}
                      className={TABLE_LINK_CLASS}
                    >
                      {run.workflow_version}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/runs?status=${encodeURIComponent(run.status)}${versionFilter ? `&version=${encodeURIComponent(versionFilter)}` : ""}`}
                      className="inline-block"
                    >
                      <Badge variant={run.status === "running" ? "default" : "secondary"}>
                        {run.status}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {run.created_at}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
