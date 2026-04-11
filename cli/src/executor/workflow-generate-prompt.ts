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

Emit that prefix **exactly once**. Do not repeat ## Workflow JSON or the prefix after the JSON; no duplicate workflow blocks.

The Plan section is mandatory. Do not skip it even if the JSON is long.

The JSON object MUST include:
- "name": string - short **human-readable** workflow title (e.g. "Competitor landscape review", "PR impact summary"). Use normal words and spacing; **do not** use snake_case, slug-style identifiers, or ALL_CAPS machine ids-those belong in node ids, not the workflow name.
- "description": optional string.
- "nodes": array. Each node object MUST have:
  - "id": unique non-empty string (snake_case recommended).
  - "type": either "PROMPT" or "HUMAN_IN_THE_LOOP".
  - "input_collections": string[] - collection kinds this node reads (use ["run_input"] when the step only needs the run's input payload).
  - "output_collections": string[] - kinds this node writes (often one kind per PROMPT).
  - "prompt": string - concrete instructions for that step.
  - Optional: "description", "required_skills" (string array) - only when the user asked or a named skill highly fits (see **Skills on nodes** above).
- **minimum_rows (required for every PROMPT node):** Integer **≥ 1**. It is the minimum number of collection **items** this step must produce in a single run.
  - If the step emits **multiple** rows (e.g. one record per entity, per week, per keyword, per finding), set **minimum_rows to an integer greater than 1**-typically **≥ 3** for list-like outputs, or match the expected count (e.g. 12 for a 12-week calendar).
  - If the step emits a **single** aggregate artifact (one consolidated report or document as **one** row), set **minimum_rows to 1**.
  - Do **not** leave minimum_rows unset for PROMPT nodes.
- "kinds": REQUIRED object - one entry per **every** collection kind name that appears in ANY node's input_collections or output_collections. Keys are kind names. Each value:
  { "name"?: string, "description": string, "item_schema": <JSON Schema for one item, usually type "object" with properties> }
  If items need traceability, include properties like "name", "citations", "derived_from", "reasoning" as appropriate.

**Collection item_schema (avoid huge blobs):** Prefer structured, bounded fields: short strings, enums, arrays of short strings (e.g. \`key_points\`, \`bullets\`), and IDs. **Do not** define properties named \`summary\`, \`executive_summary\`, \`full_text\`, or similar that invite unbounded long prose-split into sections, bullet lists, or capped string fields with clear max length in the description.

**run_input schema (must be lean):** The "run_input" kind defines the form at run start. In kinds.run_input.item_schema, define **only 1–3 properties** in the properties map (not counting optional system fields). Prefer short string fields (Markdown) or simple enums; avoid wide forms or deep nested objects. Fewer, clearer inputs are better than many optional fields.

**Existing agents in the repo:** When you are working against the user's codebase and you can see **already-defined agents** (e.g. editor agent configs, saved system prompts, or similar instructions checked into the repo), you **may** write a node's \`prompt\` so it **matches or reuses the intent** of those agents-paraphrase or adapt; keep prompts bounded and do not dump huge files verbatim. Do this **only** when the user **explicitly asks** to tie the workflow to those agents or to reuse that setup, **or** when aligning with that existing agent **clearly and strongly** fits the workflow they described. If the brief is generic, use **standalone** prompts instead of guessing repo-specific agents.

**Skills on nodes (\`required_skills\`):** Same decision bar: add \`required_skills\` **only** when the user **explicitly names** skills to require, **or** when a **concrete named** skill in the workspace would **highly** improve that step. **Do not** put skills on every node or "just in case." **Never** list \`"cognetivy"\` as a required skill.

Hard rules:
- Obey **Output hygiene** above; a run fails if reasoning tags leak into the reply or JSON is incomplete.
- Workflow "name" is a display title for people: readable words, not snake_case.
- The dataflow graph must be acyclic (no dependency cycles through collections).
- At least one collection kind must appear across the workflow.
- Include "run_input" in kinds if any node uses input_collections containing "run_input".
- Use realistic prompts (goal, constraints, output shape).
- **required_skills:** Follow **Skills on nodes** above; do not contradict those rules.

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
