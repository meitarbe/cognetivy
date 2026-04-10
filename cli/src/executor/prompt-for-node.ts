import type { WorkflowNode } from "../core/index.js";
import { cloudGetCollectionItems } from "../cloud-client.js";
import {
  buildValidationRetryPromptSection,
  type CollectionPromptSpec,
} from "./collection-output-helpers.js";
import { buildAgentSystemPromptSuffix, buildNoOutputPromptSuffix } from "./agent-node-runner.js";

export async function buildPromptForPromptNode(
  runId: string,
  node: WorkflowNode,
  hint: string | undefined,
  collectionSpec?: CollectionPromptSpec
): Promise<string> {
  const parts: string[] = [];
  parts.push(`You are executing workflow node "${node.id}".`);
  const requiredSkills = (node.required_skills ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  if (requiredSkills.length > 0) {
    parts.push(
      `Required agent skills (use them if they are installed in this workspace; follow their instructions when relevant): ${requiredSkills.join(", ")}.`
    );
  }
  if (node.description) {
    parts.push(`Description: ${node.description}`);
  }
  if (node.prompt) {
    parts.push(`Instructions:\n${node.prompt}`);
  }
  const inputCols = node.input_collections ?? [];
  for (const kind of inputCols) {
    try {
      const pack = await cloudGetCollectionItems(runId, kind);
      const items = pack.items ?? [];
      parts.push(`\nInput collection "${kind}" (${items.length} items):\n${JSON.stringify(items, null, 2)}`);
    } catch {
      parts.push(`\n(Input collection "${kind}" could not be loaded.)`);
    }
  }
  if (hint?.trim()) {
    parts.push(`\nOrchestrator hint:\n${hint}`);
  }
  const outKinds = node.output_collections ?? [];
  if (outKinds.length > 1) {
    parts.push(
      `\nNote: This node has multiple output kinds (${outKinds.join(", ")}). Local executor v1 supports single-output nodes only; ask the team or split the workflow.`
    );
  }
  if (outKinds.length === 1 && collectionSpec) {
    parts.push(`\n\n## Required output shape for collection kind "${collectionSpec.kind}"`);
    if (collectionSpec.kindName?.trim()) {
      parts.push(`\nDisplay name: ${collectionSpec.kindName.trim()}`);
    }
    const desc = collectionSpec.kindDescription.trim() || "(no kind description)";
    parts.push(`\nKind description: ${desc}`);
    const minRows = node.minimum_rows;
    if (typeof minRows === "number" && Number.isInteger(minRows) && minRows >= 1) {
      if (minRows > 1) {
        parts.push(
          `\n**Minimum rows (workflow contract):** Produce **at least ${minRows}** separate collection items for this step (one JSON object per item). Prefer a **JSON array** of length ≥ ${minRows}. If you emit fewer than ${minRows} items, the run will fail validation.`
        );
      } else {
        parts.push(
          `\n**Minimum rows (workflow contract):** Produce **exactly one** collection item (one JSON object, or a one-element array).`
        );
      }
    }
    parts.push(
      `\nYour COGNETIVY_COLLECTION_JSON value must be one JSON object or an array of objects. Each object must validate against this schema (includes required "name" and traceability fields the API enforces):\n\n\`\`\`json\n${JSON.stringify(
        collectionSpec.mergedItemSchema,
        null,
        2
      )}\n\`\`\``
    );
    parts.push(
      `\n**Content style (strict):** For **every property whose schema type is string** (summaries, reasoning, bodies, excerpts, etc.), the value must be **one Markdown string only**. Put headings, bullet lists, numbered lists, and paragraphs **inside that single string** (line breaks allowed). Do **not** use a JSON array of strings for prose, and do **not** put a JSON array where the schema expects a string (wrong: ["a","b"]; right: one string whose content is Markdown bullets, each item on its own line). Do **not** paste a whole JSON object or array into a string field. The only JSON structure is the outer COGNETIVY_COLLECTION_JSON= payload; if the schema says string, never output a JSON array in that property.`
    );
    if (collectionSpec.validationFeedback?.trim()) {
      parts.push(buildValidationRetryPromptSection(collectionSpec.validationFeedback.trim()));
    }
  }
  if (outKinds.length === 1) {
    parts.push(
      buildAgentSystemPromptSuffix(outKinds[0], {
        schemaProvidedInline: collectionSpec != null,
        minimumRows:
          typeof node.minimum_rows === "number" && Number.isInteger(node.minimum_rows) && node.minimum_rows >= 1
            ? node.minimum_rows
            : undefined,
      })
    );
  } else if (outKinds.length === 0) {
    parts.push(buildNoOutputPromptSuffix());
  }
  return parts.join("\n");
}
