import type { CollectionKindSchema } from "./models.js";

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
 */
export function mergeKindTemplate(
  kind: string,
  schema: CollectionKindSchema
): CollectionKindSchema {
  const template = KIND_TEMPLATES[kind];
  if (!template) return schema;

  const itemSchema = schema.item_schema;
  if (itemSchema == null || typeof itemSchema !== "object") return schema;

  const base = itemSchema as Record<string, unknown>;
  if ((base.type as string | undefined) && base.type !== "object") return schema;

  const required = Array.isArray(base.required) ? [...(base.required as string[])] : [];
  for (const field of template.required ?? []) {
    if (!required.includes(field)) required.push(field);
  }

  const properties =
    base.properties && typeof base.properties === "object" ? { ...(base.properties as Record<string, unknown>) } : {};
  for (const [key, prop] of Object.entries(template.properties ?? {})) {
    if (!(key in properties)) properties[key] = prop;
  }

  const mergedSchema: Record<string, unknown> = {
    type: "object",
    ...base,
    required: required.length > 0 ? required : undefined,
    properties,
  };

  return { ...schema, item_schema: mergedSchema };
}
