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
    parts.push(
      `\nYour COGNETIVY_COLLECTION_JSON value must be one JSON object or an array of objects. Each object must validate against this schema (includes required "name" and traceability fields the API enforces):\n\n\`\`\`json\n${JSON.stringify(
        collectionSpec.mergedItemSchema,
        null,
        2
      )}\n\`\`\``
    );
    if (collectionSpec.validationFeedback?.trim()) {
      parts.push(buildValidationRetryPromptSection(collectionSpec.validationFeedback.trim()));
    }
  }
  if (outKinds.length === 1) {
    parts.push(
      buildAgentSystemPromptSuffix(outKinds[0], {
        schemaProvidedInline: collectionSpec != null,
      })
    );
  } else if (outKinds.length === 0) {
    parts.push(buildNoOutputPromptSuffix());
  }
  return parts.join("\n");
}
