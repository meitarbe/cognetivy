import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { TABLE_LINK_CLASS } from "@/lib/utils";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { diffWorkflowVersions } from "@/lib/workflowDiff";
import { workflowToNodesEdges } from "@/lib/workflowCanvas";

const POLL_MS = 3000;

export function WorkflowPage() {
  const { selectedWorkflowId, setSelectedWorkflowId, selectedWorkflow } = useWorkflowSelection();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowFromUrl = searchParams.get("workflow_id");
  const versionFromUrl = searchParams.get("version_id");

  const [workflowRecord, setWorkflowRecord] = useState<{ current_version_id: string } | null>(null);
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(versionFromUrl);
  const [workflowVersion, setWorkflowVersion] = useState<WorkflowVersion | null>(null);
  const [prevWorkflowVersion, setPrevWorkflowVersion] = useState<WorkflowVersion | null>(null);
  const [showChanges, setShowChanges] = useState(false);
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
      const nextSelected = versionFromUrl ?? selectedVersionId ?? wf.current_version_id;
      setSelectedVersionId(nextSelected);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedWorkflowId, selectedVersionId, versionFromUrl]);

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
      .getWorkflowVersion(selectedWorkflowId, selectedVersionId)
      .then(setWorkflowVersion)
      .catch(() => setWorkflowVersion(null));
  }, [selectedWorkflowId, selectedVersionId]);

  useEffect(() => {
    if (!selectedWorkflowId || !selectedVersionId || versions.length === 0) {
      setPrevWorkflowVersion(null);
      return;
    }
    const idx = versions.findIndex((v) => v.version_id === selectedVersionId);
    if (idx <= 0) {
      setPrevWorkflowVersion(null);
      setShowChanges(false);
      return;
    }
    const prevVersionId = versions[idx - 1].version_id;
    api
      .getWorkflowVersion(selectedWorkflowId, prevVersionId)
      .then(setPrevWorkflowVersion)
      .catch(() => setPrevWorkflowVersion(null));
  }, [selectedWorkflowId, selectedVersionId, versions]);

  const diff = useMemo(() => {
    if (!prevWorkflowVersion || !workflowVersion) return null;
    return diffWorkflowVersions(prevWorkflowVersion, workflowVersion);
  }, [prevWorkflowVersion, workflowVersion]);

  const diffOverride = useMemo(() => {
    if (!diff || !workflowVersion || !prevWorkflowVersion || !showChanges) return undefined;
    // Merge current nodes with removed nodes from the previous version so removed
    // nodes appear on the canvas as ghost (dashed red) nodes.
    const removedNodes = prevWorkflowVersion.nodes.filter((n) => diff.nodesRemoved.includes(n.id));
    const mergedWorkflow = { ...workflowVersion, nodes: [...workflowVersion.nodes, ...removedNodes] };
    // Compute nodes AND edges from the same merged layout so they stay consistent.
    const { nodes, edges } = workflowToNodesEdges(mergedWorkflow);
    const annotatedNodes = nodes.map((node) => {
      if (node.type !== "workflow") return node;
      const nodeId = (node.data as { nodeId: string }).nodeId;
      let changeStatus: "added" | "changed" | "removed" | undefined;
      if (diff.nodesAdded.includes(nodeId)) changeStatus = "added";
      else if (diff.nodesChanged.includes(nodeId)) changeStatus = "changed";
      else if (diff.nodesRemoved.includes(nodeId)) changeStatus = "removed";
      return { ...node, data: { ...node.data, changeStatus } };
    });
    return { nodes: annotatedNodes, edges };
  }, [diff, workflowVersion, prevWorkflowVersion, showChanges]);

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
        {diff && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show changes</span>
            <Switch checked={showChanges} onCheckedChange={setShowChanges} />
            <div className="relative group">
              <Info className="size-3.5 text-muted-foreground cursor-default" />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-56 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                <p className="mb-2 text-muted-foreground">Highlights what changed between this version and the previous one.</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm shrink-0 bg-green-500/80 border border-green-500" />Added node</div>
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm shrink-0 bg-amber-500/80 border border-amber-500" />Edited node</div>
                  <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm shrink-0 bg-red-500/30 border border-red-500/80 border-dashed" />Removed node</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {workflowVersion ? (
          <WorkflowCanvas
            workflow={workflowVersion}
            workflowId={selectedWorkflowId ?? undefined}
            versionId={selectedVersionId ?? undefined}
            runsVersionForLink={selectedVersionId ?? undefined}
            nodesOverride={diffOverride?.nodes}
            edgesOverride={diffOverride?.edges}
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
