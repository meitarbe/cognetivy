import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type WorkflowSummary } from "@/api";

const STORAGE_KEY = "cognetivy-selected-workflow-id";
const POLL_MS = 2000;

export interface WorkflowSelectionState {
  workflows: WorkflowSummary[];
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (workflowId: string) => void;
  selectedWorkflow: WorkflowSummary | null;
  reloadWorkflows: () => Promise<void>;
}

const WorkflowSelectionContext = createContext<WorkflowSelectionState | null>(null);

function readStoredWorkflowId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredWorkflowId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function WorkflowSelectionProvider({ children }: { children: React.ReactNode }) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowIdState] = useState<string | null>(readStoredWorkflowId());

  const reloadWorkflows = useCallback(async (): Promise<void> => {
    const list = await api.getWorkflows();
    setWorkflows(list);
    setSelectedWorkflowIdState((prev) => {
      if (prev && list.some((w) => w.workflow_id === prev)) return prev;
      const current = (list as Array<WorkflowSummary & { current?: boolean }>).find((w) => w.current);
      const fallback = current?.workflow_id ?? list[0]?.workflow_id ?? null;
      return fallback;
    });
  }, []);

  useEffect(() => {
    reloadWorkflows().catch(() => setWorkflows([]));
    const t = setInterval(() => {
      reloadWorkflows().catch(() => setWorkflows([]));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [reloadWorkflows]);

  const setSelectedWorkflowId = useCallback((workflowId: string) => {
    setSelectedWorkflowIdState(workflowId);
    writeStoredWorkflowId(workflowId);
  }, []);

  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowId) return null;
    return workflows.find((w) => w.workflow_id === selectedWorkflowId) ?? null;
  }, [workflows, selectedWorkflowId]);

  const value: WorkflowSelectionState = {
    workflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedWorkflow,
    reloadWorkflows,
  };

  return <WorkflowSelectionContext.Provider value={value}>{children}</WorkflowSelectionContext.Provider>;
}

export function useWorkflowSelection(): WorkflowSelectionState {
  const ctx = useContext(WorkflowSelectionContext);
  if (!ctx) throw new Error("useWorkflowSelection must be used within WorkflowSelectionProvider");
  return ctx;
}
