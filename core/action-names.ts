/**
 * Canonical next-step action names (used in core) and mapping to/from backend API action names.
 * Backend keeps API contract: execute_node, execute_nodes_parallel, complete_run, wait.
 * CLI and core use: run_node, run_nodes_parallel, complete_node, complete_run, done.
 */

import type { CanonicalNextStepAction } from "./types.js";

const CANONICAL_TO_API: Record<CanonicalNextStepAction, string> = {
  run_node: "execute_node",
  run_nodes_parallel: "execute_nodes_parallel",
  complete_node: "execute_node", // backend uses execute_node for "in progress, produce output"
  complete_run: "complete_run",
  done: "wait",
};

const API_TO_CANONICAL: Record<string, CanonicalNextStepAction> = {
  execute_node: "run_node",
  execute_nodes_parallel: "run_nodes_parallel",
  complete_run: "complete_run",
  complete_node: "complete_node",
  wait: "done",
};

/**
 * Map canonical action (from getNextStep) to API action for backend response.
 */
export function mapCanonicalToApi(action: CanonicalNextStepAction): string {
  return CANONICAL_TO_API[action] ?? "wait";
}

/**
 * Map API action (from backend) to canonical action for CLI display / agent.
 */
export function mapApiToCanonical(action: string): CanonicalNextStepAction {
  return (API_TO_CANONICAL[action] ?? "done") as CanonicalNextStepAction;
}
