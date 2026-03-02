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
        minimum_rows: 5,
        required_skills: ["cognetivy"],
        required_mcps: ["user-context7", "cursor-ide-browser"],
        prompt:
          "Retrieve relevant sources for the run input topic. Use only real sources: either provided in run input/collections or actually retrieved by you via tools (e.g. web search, MCP, browser). Do not invent or guess URLs or facts. Each source must be something you have verified (e.g. fetched or opened). For each item output: a verified URL, a short title, and a brief excerpt. Aim for at least the minimum number of sources required by this node.",
      },
      {
        id: "synthesize_summary",
        type: WorkflowNodeType.Prompt,
        input_collections: ["sources"],
        output_collections: ["summary"],
        required_skills: ["cognetivy"],
        prompt:
          "Synthesize the provided sources into a concise summary. Use only the content from the sources collection; do not add claims, quotes, or facts that are not present in those sources. If the sources are insufficient for a point, say so rather than inventing information. Output clear, well-structured markdown.",
      },
      {
        id: "human_review",
        type: WorkflowNodeType.HumanInTheLoop,
        input_collections: ["summary"],
        output_collections: ["approved_summary"],
        prompt:
          "Review the summary. If approved, copy it into approved_summary (or edit it). If changes are needed, update the content before approving.",
      },
    ],
  };
}
