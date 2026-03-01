/**
 * Standard traceability fields for collection items: citations (sources) and chain-of-thinking (derived_from).
 * Merged into kind schemas so every item can point to sources (URLs or other items) and to items it was derived from.
 */

import type { CollectionSchemaConfig } from "./models.js";

/** JSON Schema properties for traceability. Include in kind item_schema for full traceability. */
export const TRACEABILITY_PROPERTIES: Record<string, Record<string, unknown>> = {
  citations: {
    type: "array",
    description:
      "Sources for this item: external (url + title) or internal (item_ref to another collection item). Use for every claim or decision so outputs are traceable to sources.",
    items: {
      type: "object",
      description: "One citation: either external source (url) or reference to another collection item (item_ref).",
      properties: {
        url: {
          type: "string",
          description: "External source URL (only if you actually retrieved or opened it; do not invent).",
        },
        title: { type: "string", description: "Short title for the source." },
        excerpt: { type: "string", description: "Optional excerpt or quote." },
        item_ref: {
          type: "object",
          description: "Reference to another collection item in this run (kind + item_id).",
          properties: {
            kind: { type: "string", description: "Collection kind (e.g. sources, product_brief)." },
            item_id: { type: "string", description: "Id of the item in that collection." },
          },
          required: ["kind", "item_id"],
        },
      },
      additionalProperties: true,
    },
  },
  derived_from: {
    type: "array",
    description:
      "Chain of thinking: collection items this was derived from (kind + item_id). Enables tracing why this conclusion was reached.",
    items: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Collection kind of the source item." },
        item_id: { type: "string", description: "Id of the item this was derived from." },
      },
      required: ["kind", "item_id"],
    },
  },
  reasoning: {
    type: "string",
    description:
      "Optional short explanation of why this was decided or how it was derived (chain of thought). Supports traceability.",
  },
};

/** Kind ids that should not get traceability fields (system or root sources). */
export const TRACEABILITY_EXCLUDED_KINDS = new Set(["run_input"]);

export function mergeTraceabilityIntoItemSchema(
  kind: string,
  itemSchema: Record<string, unknown>
): Record<string, unknown> {
  if (TRACEABILITY_EXCLUDED_KINDS.has(kind)) return itemSchema;
  if ((itemSchema.type as string) && itemSchema.type !== "object") return itemSchema;

  const properties =
    itemSchema.properties && typeof itemSchema.properties === "object"
      ? { ...(itemSchema.properties as Record<string, unknown>) }
      : {};

  for (const [key, prop] of Object.entries(TRACEABILITY_PROPERTIES)) {
    if (!(key in properties)) properties[key] = prop;
  }

  return {
    ...itemSchema,
    type: "object",
    properties,
  };
}

/**
 * Merge traceability fields into every kind's item_schema (except run_input).
 * Call when reading schema so all workflows get citations/derived_from/reasoning available.
 */
export function mergeTraceabilityIntoSchema(schema: CollectionSchemaConfig): CollectionSchemaConfig {
  const kinds = { ...schema.kinds };
  for (const [kind, kindSchema] of Object.entries(kinds)) {
    const itemSchema = kindSchema.item_schema;
    if (itemSchema && typeof itemSchema === "object") {
      kinds[kind] = {
        ...kindSchema,
        item_schema: mergeTraceabilityIntoItemSchema(kind, itemSchema as Record<string, unknown>) as Record<string, unknown>,
      };
    }
  }
  return { ...schema, kinds };
}
