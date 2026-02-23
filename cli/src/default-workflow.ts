import type { WorkflowPointer, WorkflowVersion } from "./models.js";

export const DEFAULT_WORKFLOW_ID = "wf_default";
export const DEFAULT_VERSION = "v1";

export function createDefaultPointer(): WorkflowPointer {
  return {
    workflow_id: DEFAULT_WORKFLOW_ID,
    current_version: DEFAULT_VERSION,
  };
}

export function createDefaultWorkflowVersion(): WorkflowVersion {
  return {
    workflow_id: DEFAULT_WORKFLOW_ID,
    version: DEFAULT_VERSION,
    nodes: [
      {
        id: "retrieve",
        type: "TASK",
        contract: { input: ["topic"], output: ["sources"] },
      },
      {
        id: "synthesize",
        type: "TASK",
        contract: { input: ["sources"], output: ["summary"] },
      },
    ],
    edges: [{ from: "retrieve", to: "synthesize" }],
  };
}
