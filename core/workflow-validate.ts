/**
 * Workflow version validation and acyclic DAG check.
 * Shared by backend (createVersion/createFull) and CLI.
 */

import { WorkflowNodeType, type WorkflowNode, type WorkflowVersionRecord } from "./types.js";

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

/** Built-in collection kinds that don't need to be defined in schema (run_input is special). */
export const BUILTIN_COLLECTION_KINDS = new Set<string>(["run_input"]);

const NODE_TYPES = new Set<string>(Object.values(WorkflowNodeType));

/**
 * Build node-to-node dependency: B is predecessor of A when B outputs a collection that A inputs.
 * Throws WorkflowValidationError if the dataflow graph has a cycle.
 */
export function assertWorkflowAcyclic(nodes: WorkflowNode[]): void {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inEdges: Record<string, string[]> = {};
  nodeIds.forEach((id) => (inEdges[id] = []));
  const collectionToProducers = new Map<string, string[]>();
  const collectionToConsumers = new Map<string, string[]>();
  for (const n of nodes) {
    for (const c of n.output_collections ?? []) {
      if (!collectionToProducers.has(c)) collectionToProducers.set(c, []);
      collectionToProducers.get(c)!.push(n.id);
    }
    for (const c of n.input_collections ?? []) {
      if (!collectionToConsumers.has(c)) collectionToConsumers.set(c, []);
      collectionToConsumers.get(c)!.push(n.id);
    }
  }
  for (const [col, producers] of collectionToProducers) {
    const consumers = collectionToConsumers.get(col) ?? [];
    for (const p of producers) {
      for (const a of consumers) {
        if (p !== a) inEdges[a].push(p);
      }
    }
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  function visit(id: string): void {
    if (stack.has(id)) {
      throw new WorkflowValidationError(
        `Workflow has a cycle (dataflow dependency loop involving node "${id}").`
      );
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const pred of inEdges[id] ?? []) visit(pred);
    stack.delete(id);
  }
  for (const id of nodeIds) visit(id);
}

/**
 * Collect all collection names referenced in nodes (input_collections and output_collections).
 */
export function getCollectionNamesFromNodes(nodes: WorkflowNode[]): string[] {
  const names = new Set<string>();
  for (const n of nodes) {
    for (const c of n.input_collections ?? []) names.add(c);
    for (const c of n.output_collections ?? []) names.add(c);
  }
  return Array.from(names);
}

/**
 * Validate a workflow version: node shape, valid types, acyclic DAG.
 * Throws WorkflowValidationError on failure.
 */
export function validateWorkflowVersion(version: WorkflowVersionRecord): void {
  const nodes = version.nodes;
  if (!Array.isArray(nodes)) {
    throw new WorkflowValidationError("Workflow version must have a nodes array.");
  }
  const ids = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== "object") {
      throw new WorkflowValidationError(`Node at index ${i} must be an object.`);
    }
    if (typeof n.id !== "string" || n.id.trim() === "") {
      throw new WorkflowValidationError(`Node at index ${i} must have a non-empty string id.`);
    }
    if (ids.has(n.id)) {
      throw new WorkflowValidationError(`Duplicate node id: "${n.id}".`);
    }
    ids.add(n.id);
    if (!NODE_TYPES.has(n.type)) {
      throw new WorkflowValidationError(
        `Node "${n.id}" has invalid type "${n.type}". Must be one of: ${Array.from(NODE_TYPES).join(", ")}.`
      );
    }
    if (!Array.isArray(n.input_collections)) {
      throw new WorkflowValidationError(`Node "${n.id}" must have input_collections (array).`);
    }
    if (!Array.isArray(n.output_collections)) {
      throw new WorkflowValidationError(`Node "${n.id}" must have output_collections (array).`);
    }
  }
  assertWorkflowAcyclic(nodes);
}
