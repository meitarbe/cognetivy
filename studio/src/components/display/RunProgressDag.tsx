import type { WorkflowVersion, EventPayload } from "@/api";
import { getWorkflowLayout } from "@/lib/workflowLayout";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "running" | "completed";

function getStepStatuses(events: EventPayload[]): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {};
  for (const ev of events) {
    const step = ev.data?.step as string | undefined;
    if (!step) continue;
    if (ev.type === "step_started") statuses[step] = "running";
    if (ev.type === "step_completed") statuses[step] = "completed";
  }
  return statuses;
}

interface RunProgressDagProps {
  workflow: WorkflowVersion;
  events: EventPayload[];
}

export function RunProgressDag({ workflow, events }: RunProgressDagProps) {
  const { rows } = getWorkflowLayout(workflow);
  const statuses = getStepStatuses(events);
  const nodeById = new Map(workflow.nodes.map((n) => [n.id, n]));

  function ArrowDown() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" className="text-muted-foreground shrink-0" aria-hidden>
      <path d="M10 0 L10 12 M6 8 L10 12 L14 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

  return (
    <div className="overflow-auto rounded-lg border border-border bg-muted/20 p-2">
      <div className="inline-flex flex-col gap-2 items-center">
        {rows.map((rowNodeIds, rowIndex) => (
          <div key={rowIndex} className="flex flex-col gap-1 items-center">
            <div className="flex flex-wrap gap-2 justify-center items-center">
            {rowNodeIds.map((id) => {
              const node = nodeById.get(id);
              const status = statuses[id] ?? "pending";
              if (!node) return null;
              return (
                <div
                  key={id}
                  className={cn(
                    "rounded-lg border-2 px-3 py-2 min-w-[140px] transition-colors text-xs",
                    status === "completed" &&
                      "border-green-500/60 bg-green-500/10 dark:bg-green-500/15",
                    status === "running" &&
                      "border-amber-500/60 bg-amber-500/10 dark:bg-amber-500/15 animate-pulse",
                    status === "pending" && "border-border bg-card"
                  )}
                >
                  <div className="font-semibold">{node.id}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {node.contract.input.join(", ")} → {node.contract.output.join(", ")}
                  </div>
                  <div className="mt-2">
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded",
                        status === "completed" && "bg-green-500/20 text-green-700 dark:text-green-300",
                        status === "running" && "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                        status === "pending" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
            {rowIndex < rows.length - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowDown />
              </div>
            )}
          </div>
        ))}
      </div>
      {rows.length > 1 && (
        <div className="flex justify-center text-xs text-muted-foreground mt-2">
          Flow: top → bottom
        </div>
      )}
    </div>
  );
}
