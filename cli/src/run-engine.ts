/**
 * Next-step types and formatting for CLI stdout (cloud API maps backend actions into these).
 */

import type { CanonicalNextStep } from "./core/index.js";

export type NextStepAction = "run_node" | "run_nodes_parallel" | "complete_node" | "complete_run" | "done";

export type NextStep = CanonicalNextStep;

/**
 * Format next_step as a single JSON line for agent parsing (append to stdout).
 */
export function formatNextStepLine(
  runId: string,
  status: string,
  next_step: NextStep,
  current_node_id?: string,
  current_node_ids?: string[]
): string {
  const payload: Record<string, unknown> = { run_id: runId, status, next_step };
  if (current_node_id !== undefined) {
    payload.current_node_id = current_node_id;
  }
  if (current_node_ids !== undefined && current_node_ids.length > 0) {
    payload.current_node_ids = current_node_ids;
  }
  return `COGNETIVY_NEXT_STEP=${JSON.stringify(payload)}`;
}
