import type { CollectionSchemaConfig } from "./models.js";
import { createRequire } from "node:module";
import type { ValidateFunction } from "ajv";

export class CollectionValidationError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly details?: string[]
  ) {
    super(message);
    this.name = "CollectionValidationError";
  }
}

type AjvInstance = {
  compile: (schema: unknown) => ValidateFunction;
};
type AjvConstructor = new (opts: unknown) => AjvInstance;
type AjvFormatsPlugin = (ajv: AjvInstance, options?: unknown) => AjvInstance;

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as AjvConstructor;
const addFormats = require("ajv-formats") as AjvFormatsPlugin;

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(ajv);

/**
 * Validate a single collection item payload against JSON Schema.
 * The payload must NOT include system provenance keys (those are added by storage).
 */
export function validateCollectionItemPayload(schema: CollectionSchemaConfig, kind: string, payload: unknown): void {
  const kindSchema = schema.kinds[kind];
  if (!kindSchema) {
    throw new CollectionValidationError(
      `Unknown kind "${kind}". Known kinds: ${Object.keys(schema.kinds).join(", ")}.`,
      kind
    );
  }
  const validate = getValidator(schema, kind);
  const ok = validate(payload);
  if (ok) return;
  const details = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  throw new CollectionValidationError(`Kind "${kind}" failed schema validation.`, kind, details);
}

/**
 * Validate multiple item payloads.
 */
export function validateCollectionItemsPayload(
  schema: CollectionSchemaConfig,
  kind: string,
  payloads: unknown[]
): void {
  for (let i = 0; i < payloads.length; i++) {
    try {
      validateCollectionItemPayload(schema, kind, payloads[i]);
    } catch (err) {
      if (err instanceof CollectionValidationError) {
        throw new CollectionValidationError(`Item[${i}] invalid: ${err.message}`, kind, err.details);
      }
      throw err;
    }
  }
}

const validatorCache = new Map<string, ValidateFunction>();

function getValidator(schema: CollectionSchemaConfig, kind: string): ValidateFunction {
  const key = `${schema.workflow_id}:${kind}`;
  const cached = validatorCache.get(key);
  if (cached) return cached;

  const kindSchema = schema.kinds[kind];
  if (!kindSchema) {
    throw new CollectionValidationError(
      `Unknown kind "${kind}". Known kinds: ${Object.keys(schema.kinds).join(", ")}.`,
      kind
    );
  }

  const validate = ajv.compile(kindSchema.item_schema);
  validatorCache.set(key, validate);
  return validate;
}
