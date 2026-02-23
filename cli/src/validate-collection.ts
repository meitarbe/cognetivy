import type { CollectionSchemaConfig, CollectionItem } from "./models.js";

export class CollectionValidationError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly missing?: string[]
  ) {
    super(message);
    this.name = "CollectionValidationError";
  }
}

const VALID_TYPES = ["string", "number", "boolean", "array", "object"] as const;

function validateType(key: string, value: unknown, expectedType: string, kind: string): void {
  if (value === undefined || value === null) return;
  const actual = Array.isArray(value) ? "array" : typeof value;
  if (expectedType === "object" && actual === "object" && !Array.isArray(value)) return;
  if (actual !== expectedType) {
    throw new CollectionValidationError(
      `Property "${key}" must be ${expectedType}, got ${actual}`,
      kind
    );
  }
}

/**
 * Validate a single collection item against the schema. Strict: required keys + type validation.
 */
export function validateCollectionItem(
  schema: CollectionSchemaConfig,
  kind: string,
  payload: Record<string, unknown>
): void {
  const kindSchema = schema.kinds[kind];
  if (!kindSchema) {
    throw new CollectionValidationError(
      `Unknown kind "${kind}". Known kinds: ${Object.keys(schema.kinds).join(", ")}.`,
      kind
    );
  }
  const required = kindSchema.required ?? [];
  const missing = required.filter((key) => payload[key] === undefined || payload[key] === null);
  if (missing.length > 0) {
    throw new CollectionValidationError(
      `Kind "${kind}" requires: ${required.join(", ")}. Missing: ${missing.join(", ")}.`,
      kind,
      missing
    );
  }
  const properties = kindSchema.properties ?? {};
  for (const [key, prop] of Object.entries(properties)) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    const expectedType = (prop.type ?? "string") as string;
    if (VALID_TYPES.includes(expectedType as (typeof VALID_TYPES)[number])) {
      validateType(key, value, expectedType, kind);
    }
  }
}

/**
 * Validate multiple items (e.g. for set). Each item is validated as a payload (id/created_at are optional).
 */
export function validateCollectionItems(
  schema: CollectionSchemaConfig,
  kind: string,
  items: CollectionItem[]
): void {
  for (let i = 0; i < items.length; i++) {
    validateCollectionItem(schema, kind, items[i] as Record<string, unknown>);
  }
}
