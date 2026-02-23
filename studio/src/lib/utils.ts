import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
