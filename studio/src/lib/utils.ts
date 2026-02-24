import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared link styling: primary color, no underline. */
export const TABLE_LINK_CLASS = "text-primary/90 hover:text-primary";

/** Escape a value for CSV (quotes and double-quotes). */
function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build CSV string from rows and column keys, then trigger download.
 * @param rows Array of row objects (keys match columnKeys)
 * @param columnKeys Keys to use for columns (order and subset of row keys)
 * @param headers Optional display headers for CSV first row (defaults to columnKeys)
 * @param filename Download filename (default: export.csv)
 */
export function downloadTableCsv(
  rows: Record<string, unknown>[],
  columnKeys: string[],
  headers?: string[],
  filename = "export.csv"
): void {
  const headerRow = (headers ?? columnKeys).map(escapeCsvValue).join(",");
  const valueToString = (v: unknown): string => {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.map(valueToString).join("; ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const dataRows = rows.map((row) =>
    columnKeys.map((k) => escapeCsvValue(valueToString(row[k]))).join(",")
  );
  const csv = [headerRow, ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format ISO timestamp for display. Returns "—" if missing or invalid. */
export function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return ts;
  }
}

/** Extract workflow step/node id from event data. Studio accepts step, step_id, or node_id. */
export function getStepIdFromEventData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  return (data.step ?? data.step_id ?? data.node_id) as string | undefined;
}
