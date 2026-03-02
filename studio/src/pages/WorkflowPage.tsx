import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type WorkflowVersion, type VersionListItem } from "@/api";
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
import { TABLE_LINK_CLASS } from "@/lib/utils";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";

const POLL_MS = 2000;

export function WorkflowPage() {
  const { selectedWorkflowId, setSelectedWorkflowId, selectedWorkflow } = useWorkflowSelection();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowFromUrl = searchParams.get("workflow_id");
  const versionFromUrl = searchParams.get("version_id");

  const [workflowRecord, setWorkflowRecord] = useState<{ current_version_id: string } | null>(null);
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(versionFromUrl);
  const [workflowVersion, setWorkflowVersion] = useState<WorkflowVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workflowFromUrl && workflowFromUrl !== selectedWorkflowId) {
      setSelectedWorkflowId(workflowFromUrl);
    }
  }, [workflowFromUrl, selectedWorkflowId, setSelectedWorkflowId]);

  const load = useCallback(async () => {
    try {
      if (!selectedWorkflowId) return;
      const wf = await api.getWorkflow(selectedWorkflowId);
      const versionsList = await api.getWorkflowVersions(selectedWorkflowId);
      setWorkflowRecord(wf);
      setVersions(versionsList);

      const fallbackVersion = versionFromUrl ?? wf.current_version_id;
      const hasVersion = versionsList.some((v) => v.version_id === fallbackVersion);
      const nextSelected = hasVersion ? fallbackVersion : (versionsList[0]?.version_id ?? null);
      setSelectedVersionId(nextSelected);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedWorkflowId, versionFromUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!selectedWorkflowId || !selectedVersionId) {
      setWorkflowVersion(null);
      return;
    }
    api
      .getWorkflowVersion(selectedWorkflowId, selectedVersionId, { includePrompts: false })
      .then(setWorkflowVersion)
      .catch(() => setWorkflowVersion(null));
  }, [selectedWorkflowId, selectedVersionId]);

  const currentVersionId = workflowRecord?.current_version_id ?? null;

  function handleVersionChange(v: string) {
    setSelectedVersionId(v);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (selectedWorkflowId) next.set("workflow_id", selectedWorkflowId);
      next.set("version_id", v);
      return next;
    });
  }

  const versionItems = useMemo(() => versions.map((v) => v.version_id), [versions]);

  function renderVersionSelectItem(v: VersionListItem) {
    return (
      <SelectItem key={v.version_id} value={v.version_id}>
        {v.version_id}
        {v.version_id === currentVersionId && (
          <span className="ml-1.5 text-muted-foreground font-normal">(current)</span>
        )}
      </SelectItem>
    );
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
    <div className="h-full flex flex-col">
      <div className="px-3 py-1.5 border-b border-border flex flex-wrap items-center gap-2 text-sm">
        <Breadcrumbs items={[{ label: "Workflow" }]} />
        {selectedWorkflow?.name && (
          <span className="text-xs text-muted-foreground">
            {selectedWorkflow.name}
          </span>
        )}
        {versionItems.length > 0 && (
          <Select value={selectedVersionId ?? currentVersionId ?? ""} onValueChange={handleVersionChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs rounded-md border bg-background">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map(renderVersionSelectItem)}
            </SelectContent>
          </Select>
        )}
        {selectedVersionId && (
          <Link
            to={`/runs?version=${encodeURIComponent(selectedVersionId)}`}
            className={`text-xs font-medium ${TABLE_LINK_CLASS}`}
          >
            Runs ({selectedVersionId})
          </Link>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {workflowVersion ? (
          <WorkflowCanvas
            workflow={workflowVersion}
            workflowId={selectedWorkflowId ?? undefined}
            versionId={selectedVersionId ?? undefined}
            runsVersionForLink={selectedVersionId ?? undefined}
            readOnly
            showControls
            showBackground
            className="bg-muted/30"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No workflow selected
          </div>
        )}
      </div>
    </div>
  );
}
