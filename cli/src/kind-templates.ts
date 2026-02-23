import type { CollectionKindSchema } from "./models.js";

/**
 * Default fields to merge when adding certain collection kinds via collection_schema_add_kind.
 * Ensures standard fields (e.g. industry for ideas) are always present.
 */
const KIND_TEMPLATES: Record<string, Partial<CollectionKindSchema>> = {
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

  const required = [...(schema.required ?? [])];
  for (const field of template.required ?? []) {
    if (!required.includes(field)) required.push(field);
  }

  const properties = { ...(schema.properties ?? {}) };
  for (const [key, prop] of Object.entries(template.properties ?? {})) {
    if (!(key in properties)) properties[key] = prop;
  }

  return { ...schema, required, properties };
}
