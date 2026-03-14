/**
 * Parse JSON or YAML payloads (for run input, workflow, events, collections, etc.).
 * Use for token-cheaper YAML input when the agent emits YAML.
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type PayloadFormat = "json" | "yaml" | "auto";

/**
 * Parse a raw string as JSON or YAML. When format is "auto", treats leading `{` or `[` as JSON, else YAML.
 */
export function parsePayload(raw: string, format: PayloadFormat = "auto"): unknown {
  const trimmed = raw.trim();
  if (format === "json" || (format === "auto" && (trimmed.startsWith("{") || trimmed.startsWith("[")))) {
    return JSON.parse(raw) as unknown;
  }
  return parseYaml(raw) as unknown;
}

/**
 * Stringify a value as JSON or YAML. Use "yaml" for fewer tokens when the consumer supports it.
 */
export function stringifyPayload(value: unknown, format: "json" | "yaml"): string {
  if (format === "yaml") {
    return stringifyYaml(value);
  }
  return JSON.stringify(value, null, 2);
}

/** Detect format from file extension. */
export function formatFromFilePath(filePath: string): PayloadFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".json")) return "json";
  return "auto";
}
