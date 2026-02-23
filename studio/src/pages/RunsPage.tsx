import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PencilIcon } from "lucide-react";
import { api, type RunRecord } from "@/api";
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

const POLL_MS = 3000;

export function RunsPage() {
  const [searchParams] = useSearchParams();
  const versionFilter = searchParams.get("version");
  const statusFilter = searchParams.get("status");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (versionFilter && r.workflow_version !== versionFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, versionFilter, statusFilter]);

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

  function handleStartEdit(run: RunRecord) {
    setEditingRunId(run.run_id);
    setEditName(run.name ?? "");
  }

  async function handleSaveName(runId: string) {
    const trimmed = editName.trim();
    setEditingRunId(null);
    if (trimmed === "") return; // Don't save empty name
    try {
      const updated = await api.updateRunName(runId, trimmed);
      setRuns((prev) => prev.map((r) => (r.run_id === runId ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, runId: string) {
    if (e.key === "Enter") {
      handleSaveName(runId);
    }
    if (e.key === "Escape") {
      setEditingRunId(null);
    }
  }

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

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">Runs</h2>
        {(versionFilter || statusFilter) && (
          <span className="text-xs text-muted-foreground">
            {versionFilter && `Version: ${versionFilter}`}
            {versionFilter && statusFilter && " · "}
            {statusFilter && `Status: ${statusFilter}`}
            <Link to="/runs" className="ml-2 text-primary hover:underline">Clear</Link>
          </span>
        )}
      </div>
      <Card>
        <CardContent className="p-0 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
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
                <TableRow key={run.run_id}>
                  <TableCell className="text-xs text-muted-foreground text-center align-top w-8">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    {editingRunId === run.run_id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => handleSaveName(run.run_id)}
                        onKeyDown={(e) => handleKeyDown(e, run.run_id)}
                        className="w-full max-w-[200px] px-2 py-0.5 text-sm rounded border border-input bg-background"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/runs/${encodeURIComponent(run.run_id)}`}
                          className="text-primary hover:underline"
                        >
                          {run.name ?? "—"}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(run)}
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          aria-label="Edit run name"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/runs/${encodeURIComponent(run.run_id)}`}
                      className="text-primary hover:underline truncate max-w-[200px] block"
                      title={run.run_id}
                    >
                      {run.name ?? run.run_id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/runs?version=${encodeURIComponent(run.workflow_version)}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`}
                      className="text-primary hover:underline"
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
                  <TableCell className="text-muted-foreground text-sm">
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
