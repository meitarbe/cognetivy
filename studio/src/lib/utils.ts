import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract workflow step/node id from event data. Studio accepts step, step_id, or node_id. */
export function getStepIdFromEventData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  return (data.step ?? data.step_id ?? data.node_id) as string | undefined;
}
