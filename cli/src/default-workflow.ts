import { WorkflowNodeType, type WorkflowIndexRecord, type WorkflowRecord, type WorkflowVersionRecord } from "./models.js";

export const DEFAULT_WORKFLOW_ID = "wf_default";
export const DEFAULT_VERSION_ID = "v1";

export function createDefaultWorkflowIndex(): WorkflowIndexRecord {
  return {
    current_workflow_id: DEFAULT_WORKFLOW_ID,
    workflows: [
      {
        workflow_id: DEFAULT_WORKFLOW_ID,
        name: "Default workflow",
        description: "Example workflow demonstrating collection→node→collection flow.",
        current_version_id: DEFAULT_VERSION_ID,
      },
    ],
  };
}

export function createDefaultWorkflowRecord(now: string = new Date().toISOString()): WorkflowRecord {
  return {
    workflow_id: DEFAULT_WORKFLOW_ID,
    name: "Default workflow",
    description: "Example workflow demonstrating collection→node→collection flow.",
    current_version_id: DEFAULT_VERSION_ID,
    created_at: now,
  };
}

export function createDefaultWorkflowVersionRecord(
  now: string = new Date().toISOString()
): WorkflowVersionRecord {
  return {
    workflow_id: DEFAULT_WORKFLOW_ID,
    version_id: DEFAULT_VERSION_ID,
    name: "v1",
    created_at: now,
    nodes: [
      {
        id: "retrieve_sources",
        type: WorkflowNodeType.Prompt,
        input_collections: ["run_input"],
        output_collections: ["sources"],
        prompt: "Retrieve relevant sources for the run input topic.",
      },
      {
        id: "synthesize_summary",
        type: WorkflowNodeType.Prompt,
        input_collections: ["sources"],
        output_collections: ["summary"],
        prompt: "Synthesize the sources into a summary.",
      },
      {
        id: "human_review",
        type: WorkflowNodeType.HumanInTheLoop,
        input_collections: ["summary"],
        output_collections: ["approved_summary"],
        prompt: "Review the summary. If approved, copy it into approved_summary (or edit it).",
      },
    ],
  };
}
