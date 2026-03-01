import type { CollectionKindSchema } from "./models.js";
import { mergeTraceabilityIntoItemSchema } from "./traceability-schema.js";

/**
 * Default fields to merge when adding certain collection kinds via collection_schema_add_kind.
 * Ensures standard fields (e.g. industry for ideas) are always present.
 */
const KIND_TEMPLATES: Record<
  string,
  { required?: string[]; properties?: Record<string, Record<string, unknown>> }
> = {
  ideas: {
    required: ["industry"],
    properties: {
      industry: {
        type: "string",
        description: "Industry or vertical the idea targets (e.g. healthcare, fintech, edtech)",
      },
    },
  },
};

/**
 * Merge kind template into the provided kind schema. Template fields are added if not already present.
 * Also merges traceability fields (citations, derived_from, reasoning) for non-run_input kinds.
 */
export function mergeKindTemplate(
  kind: string,
  schema: CollectionKindSchema
): CollectionKindSchema {
  const itemSchema = schema.item_schema;
  if (itemSchema == null || typeof itemSchema !== "object") return schema;

  const base = itemSchema as Record<string, unknown>;
  let mergedSchema = mergeTraceabilityIntoItemSchema(kind, { ...base });

  const template = KIND_TEMPLATES[kind];
  if (!template) return { ...schema, item_schema: mergedSchema };

  if ((mergedSchema.type as string | undefined) && mergedSchema.type !== "object") return { ...schema, item_schema: mergedSchema };

  const required = Array.isArray(mergedSchema.required) ? [...(mergedSchema.required as string[])] : [];
  for (const field of template.required ?? []) {
    if (!required.includes(field)) required.push(field);
  }

  const properties =
    mergedSchema.properties && typeof mergedSchema.properties === "object"
      ? { ...(mergedSchema.properties as Record<string, unknown>) }
      : {};
  for (const [key, prop] of Object.entries(template.properties ?? {})) {
    if (!(key in properties)) properties[key] = prop;
  }

  mergedSchema = {
    type: "object",
    ...mergedSchema,
    required: required.length > 0 ? required : undefined,
    properties,
  };

  return { ...schema, item_schema: mergedSchema };
}
