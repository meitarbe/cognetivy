/**
 * Collection output: normalize agent payloads, load schema for prompts, cloud validation retry detection.
 */
import { buildMergedItemSchema, CollectionValidationError } from "../core/collection-validate.js";
import { cloudGetCollectionSchema } from "../cloud-client.js";

export interface CollectionPromptSpec {
  kind: string;
  kindName?: string;
  kindDescription: string;
  /** Stored workflow item_schema from API; CLI validation merges name + traceability like the backend. */
  itemSchemaRaw: Record<string, unknown>;
  mergedItemSchema: Record<string, unknown>;
  validationFeedback?: string;
}

export async function loadCollectionPromptSpec(
  workflowId: string,
  kind: string
): Promise<Omit<CollectionPromptSpec, "validationFeedback">> {
  const pack = await cloudGetCollectionSchema(workflowId);
  const entry = pack.kinds[kind];
  if (!entry) {
    throw new Error(`Workflow has no collection schema for kind "${kind}".`);
  }
  const raw = entry.item_schema;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Collection kind "${kind}" has no valid item_schema.`);
  }
  const itemSchemaRaw = raw as Record<string, unknown>;
  const mergedItemSchema = buildMergedItemSchema(itemSchemaRaw, kind);
  return {
    kind,
    kindName: typeof entry.name === "string" ? entry.name : undefined,
    kindDescription: typeof entry.description === "string" ? entry.description : "",
    itemSchemaRaw,
    mergedItemSchema,
  };
}

export function normalizeToCollectionItems(payload: unknown): object[] {
  if (payload === null || payload === undefined) {
    throw new Error("Collection payload is empty.");
  }
  const arr = Array.isArray(payload) ? payload : [payload];
  const objects: object[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each collection item must be a JSON object.");
    }
    objects.push(item as object);
  }
  if (objects.length === 0) {
    throw new Error("Collection payload produced no items.");
  }
  return objects;
}

export function isCloudCollectionValidationError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  return (
    err.message.includes("Collection item validation failed") ||
    err.message.includes("produced no collection items") ||
    err.message.includes("Ensure collectionPayload items are objects that match the schema")
  );
}

export function formatAgentValidationFeedback(err: unknown): string {
  if (err instanceof CollectionValidationError) {
    const d = err.details?.length ? ` Details: ${err.details.join("; ")}` : "";
    return `${err.message}${d}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function buildValidationRetryPromptSection(feedback: string): string {
  return (
    `\n\n---\n**Your previous output was rejected (validation).** Fix the JSON so it matches the schema exactly.\n` +
    `Errors:\n${feedback}\n\nRe-run the task and end with COGNETIVY_COLLECTION_JSON= again with corrected JSON. ` +
    `If the error mentions string fields that look like JSON, rewrite those values as Markdown prose (or use proper object/array properties in the schema), not JSON text inside strings. ` +
    `If you used JSON arrays for list-like content inside a field that must be a string, replace them with one Markdown string (bullets/newlines), not \`["…"]\`.`
  );
}
