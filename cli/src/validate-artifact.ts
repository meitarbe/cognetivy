import type { ArtifactSchemaConfig, ArtifactItem } from "./models.js";

export class ArtifactValidationError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly missing?: string[]
  ) {
    super(message);
    this.name = "ArtifactValidationError";
  }
}

/**
 * Validate a single artifact item against the schema for the given kind.
 * Ensures all required keys are present. Does not validate types.
 */
export function validateArtifactItem(
  schema: ArtifactSchemaConfig,
  kind: string,
  payload: Record<string, unknown>
): void {
  const kindSchema = schema.kinds[kind];
  if (!kindSchema) {
    throw new ArtifactValidationError(
      `Unknown artifact kind "${kind}". Known kinds: ${Object.keys(schema.kinds).join(", ")}.`,
      kind
    );
  }
  const required = kindSchema.required ?? [];
  const missing = required.filter((key) => payload[key] === undefined || payload[key] === null);
  if (missing.length > 0) {
    throw new ArtifactValidationError(
      `Artifact kind "${kind}" requires: ${required.join(", ")}. Missing: ${missing.join(", ")}.`,
      kind,
      missing
    );
  }
}

/**
 * Validate multiple items (e.g. for set). Each item is validated as a payload (id/created_at are optional).
 */
export function validateArtifactItems(
  schema: ArtifactSchemaConfig,
  kind: string,
  items: ArtifactItem[]
): void {
  for (let i = 0; i < items.length; i++) {
    validateArtifactItem(schema, kind, items[i] as Record<string, unknown>);
  }
}
