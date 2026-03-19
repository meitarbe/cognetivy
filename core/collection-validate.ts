/**
 * Collection item schema validation: merge name + traceability into item_schema, validate payload with Ajv.
 * Shared by backend and CLI.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

export class CollectionValidationError extends Error {
  readonly kind?: string;
  readonly details: string[];
  constructor(message: string, kind?: string, details?: string[]) {
    super(message);
    this.name = "CollectionValidationError";
    this.kind = kind;
    this.details = details ?? [];
  }
}

/** JSON Schema properties for traceability (citations, derived_from, reasoning). */
export const TRACEABILITY_PROPERTIES: Record<string, Record<string, unknown>> = {
  citations: {
    type: "array",
    description: "Sources: url/title/excerpt or item_ref (kind, item_id).",
    items: {
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        excerpt: { type: "string" },
        item_ref: {
          type: "object",
          properties: { kind: { type: "string" }, item_id: { type: "string" } },
        },
      },
    },
  },
  derived_from: {
    type: "array",
    description: "Collection items this was derived from.",
    items: {
      type: "object",
      properties: { kind: { type: "string" }, item_id: { type: "string" } },
    },
  },
  reasoning: { type: "string", description: "Optional chain of thought or explanation." },
};

/** Kinds that skip traceability (e.g. run_input). */
export const TRACEABILITY_EXCLUDED_KINDS = new Set<string>(["run_input"]);

/** Minimal schema that only enforces name (for merging). */
export const NAME_PROPERTY_SCHEMA: Record<string, unknown> = {
  type: "string",
  description: "Short display name (required).",
};

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const t = out[key];
    const s = source[key];
    if (
      t != null &&
      s != null &&
      typeof t === "object" &&
      typeof s === "object" &&
      !Array.isArray(t) &&
      !Array.isArray(s)
    ) {
      out[key] = deepMerge(t as Record<string, unknown>, s as Record<string, unknown>);
    } else {
      out[key] = s;
    }
  }
  return out;
}

/**
 * Merge required "name" into item schema (all items must have name).
 */
export function mergeNameRequiredIntoItemSchema(
  itemSchema: Record<string, unknown>
): Record<string, unknown> {
  const props = (itemSchema.properties as Record<string, unknown>) ?? {};
  const required = Array.isArray(itemSchema.required) ? [...itemSchema.required] : [];
  if (!required.includes("name")) required.push("name");
  return {
    ...itemSchema,
    properties: { ...props, name: NAME_PROPERTY_SCHEMA },
    required,
  };
}

/**
 * Merge traceability properties (citations, derived_from, reasoning) into item schema.
 * Skip for TRACEABILITY_EXCLUDED_KINDS (e.g. run_input).
 */
export function mergeTraceabilityIntoItemSchema(
  itemSchema: Record<string, unknown>,
  kind?: string
): Record<string, unknown> {
  if (kind != null && TRACEABILITY_EXCLUDED_KINDS.has(kind)) {
    return itemSchema;
  }
  const props = (itemSchema.properties as Record<string, unknown>) ?? {};
  const mergedProps = { ...props, ...TRACEABILITY_PROPERTIES };
  return { ...itemSchema, properties: mergedProps };
}

/**
 * Build merged item schema: name required + traceability (unless kind is run_input).
 * Used by backend validator before validatePayload.
 */
export function buildMergedItemSchema(
  itemSchema: Record<string, unknown>,
  kind?: string
): Record<string, unknown> {
  const withName = mergeNameRequiredIntoItemSchema(itemSchema);
  return mergeTraceabilityIntoItemSchema(withName, kind);
}

/** Alias for buildMergedItemSchema (CLI compatibility). */
export const getMergedItemSchema = buildMergedItemSchema;

/** Alias for mergeNameRequiredIntoItemSchema (CLI compatibility). */
export const mergeNameRequiredIntoSchema = mergeNameRequiredIntoItemSchema;

/** Alias for mergeTraceabilityIntoItemSchema (CLI compatibility). */
export const mergeTraceabilityIntoSchema = mergeTraceabilityIntoItemSchema;

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Validate payload against merged item schema. Returns { valid, errors? }.
 */
export function validatePayload(
  payload: unknown,
  mergedItemSchema: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  const ok = ajv.validate(mergedItemSchema, payload);
  if (ok) return { valid: true };
  const errs = ajv.errors ?? [];
  const messages = errs.map((e) => ajv.errorsText([e]));
  return { valid: false, errors: messages };
}

/**
 * Validate a single collection item; throws CollectionValidationError if invalid.
 */
export function validateCollectionItemPayload(
  payload: unknown,
  itemSchema: Record<string, unknown>,
  kind?: string
): void {
  const merged = buildMergedItemSchema(itemSchema, kind);
  const result = validatePayload(payload, merged);
  if (!result.valid) {
    throw new CollectionValidationError(
      `Collection item validation failed: ${(result.errors ?? []).join("; ")}`,
      kind,
      result.errors
    );
  }
}

/**
 * Validate an array of collection items; throws CollectionValidationError if any invalid.
 */
export function validateCollectionItemsPayload(
  payloads: unknown[],
  itemSchema: Record<string, unknown>,
  kind?: string
): void {
  const merged = buildMergedItemSchema(itemSchema, kind);
  const allErrors: string[] = [];
  for (let i = 0; i < payloads.length; i++) {
    const result = validatePayload(payloads[i], merged);
    if (!result.valid) {
      const errs = result.errors ?? [];
      allErrors.push(`item[${i}]: ${errs.join("; ")}`);
    }
  }
  if (allErrors.length > 0) {
    throw new CollectionValidationError(
      `Collection items validation failed: ${allErrors.join("; ")}`,
      kind,
      allErrors
    );
  }
}
