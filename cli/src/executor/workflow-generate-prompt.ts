/**
 * Instructions for the coding agent when generating a workflow JSON payload from a UI brief.
 * Aligned with product expectations (one-shot full create, kinds, DAG) without pasting the full skill.
 */

export const WORKFLOW_GENERATE_OUTPUT_MARKER = "COGNETIVY_WORKFLOW_FILE_JSON=";

export function buildWorkflowGenerateInstructions(): string {
  return `You design a Cognetivy workflow: a DAG of nodes (types PROMPT and HUMAN_IN_THE_LOOP) linked by **collection kinds** (data flowing between steps).

Before the machine-readable JSON, write a **Plan** so operators can follow your chain of thought (same reply; plain text):

1) Start with the heading line: ## Plan
2) Add 5–12 bullet lines (- item) covering: workflow goal; each node id and what it does; collection kinds and how data flows (acyclic DAG); where human review fits if any.
3) Add a blank line, then the heading: ## Workflow JSON
4) On the next line, output exactly this prefix (no spaces before it):
${WORKFLOW_GENERATE_OUTPUT_MARKER}
Immediately after that prefix, output a single JSON object (you may continue the JSON on following lines). No markdown code fences around the JSON.

The Plan section is mandatory. Do not skip it even if the JSON is long.

The JSON object MUST include:
- "name": string — short workflow title.
- "description": optional string.
- "nodes": array. Each node object MUST have:
  - "id": unique non-empty string (snake_case recommended).
  - "type": either "PROMPT" or "HUMAN_IN_THE_LOOP".
  - "input_collections": string[] — collection kinds this node reads (use ["run_input"] when the step only needs the run's input payload).
  - "output_collections": string[] — kinds this node writes (often one kind per PROMPT).
  - "prompt": string — concrete instructions for that step.
  - Optional: "description", "minimum_rows", "required_skills" (string array).
- "kinds": REQUIRED object — one entry per **every** collection kind name that appears in ANY node's input_collections or output_collections. Keys are kind names. Each value:
  { "name"?: string, "description": string, "item_schema": <JSON Schema for one item, usually type "object" with properties> }
  If items need traceability, include properties like "name", "citations", "derived_from", "reasoning" as appropriate.

Hard rules:
- The dataflow graph must be acyclic (no dependency cycles through collections).
- At least one collection kind must appear across the workflow.
- Include "run_input" in kinds if any node uses input_collections containing "run_input".
- Use realistic prompts (goal, constraints, output shape).

Do not append prose after the closing brace of the JSON.`;
}

export function buildWorkflowGenerateUserSection(params: {
  brief: string;
  nameHint?: string;
  descriptionHint?: string;
}): string {
  const lines = ["User request:", "", params.brief.trim()];
  if (params.nameHint?.trim()) {
    lines.push("", `Suggested name (you may adjust): ${params.nameHint.trim()}`);
  }
  if (params.descriptionHint?.trim()) {
    lines.push("", `Extra context: ${params.descriptionHint.trim()}`);
  }
  return lines.join("\n");
}

export function buildWorkflowGenerateFullPrompt(params: {
  brief: string;
  nameHint?: string;
  descriptionHint?: string;
}): string {
  return `${buildWorkflowGenerateInstructions()}\n\n---\n\n${buildWorkflowGenerateUserSection(params)}`;
}
