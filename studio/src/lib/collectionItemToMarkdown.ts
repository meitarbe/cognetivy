import type { CollectionItem } from "@/api";

const EXCLUDE_KEYS = new Set(["id", "created_at"]);

function formatValueForMarkdown(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValueForMarkdown).join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function collectionItemToMarkdown(item: CollectionItem, kind: string): string {
  const lines: string[] = [`# ${kind.replace(/_/g, " ")}`, ""];
  const entries = Object.entries(item).filter(([k]) => !EXCLUDE_KEYS.has(k));
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    const label = key.replace(/_/g, " ");
    lines.push(`## ${label}`, "", formatValueForMarkdown(value), "");
  }
  return lines.join("\n").trim();
}
