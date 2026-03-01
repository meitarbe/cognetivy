import { WorkflowNodeType, type WorkflowVersionRecord, type WorkflowNode } from "./models.js";

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

/**
 * Build node-to-node dependency: B is predecessor of A when B outputs a collection that A inputs.
 * Then detect cycle with DFS; throw if the dataflow graph has a cycle.
 */
function assertWorkflowAcyclic(nodes: WorkflowNode[]): void {
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
  for (const [coll, consumers] of collectionToConsumers) {
    const producers = collectionToProducers.get(coll) ?? [];
    for (const from of producers) {
      for (const to of consumers) {
        if (from !== to) inEdges[to].push(from);
      }
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function visit(id: string): void {
    if (stack.has(id)) {
      throw new WorkflowValidationError(
        `Workflow has a cycle in the dataflow (node "${id}" is part of a circular dependency). Ensure no node depends on a collection produced by a node that depends on it.`
      );
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const pred of inEdges[id] ?? []) {
      visit(pred);
    }
    stack.delete(id);
  }

  for (const id of nodeIds) {
    visit(id);
  }
}

/**
 * Validate minimal workflow version schema:
 * - workflow_id, version_id, nodes
 * - nodes have unique ids and required fields
 * - flow is collection→node→collection (no node→node edges)
 */
export function validateWorkflowVersion(wf: unknown): asserts wf is WorkflowVersionRecord {
  if (wf === null || typeof wf !== "object") {
    throw new WorkflowValidationError("Workflow must be a JSON object");
  }
  const o = wf as Record<string, unknown>;
  if (typeof o.workflow_id !== "string" || !o.workflow_id) {
    throw new WorkflowValidationError("workflow_id is required and must be a non-empty string");
  }
  if (typeof o.version_id !== "string" || !o.version_id) {
    throw new WorkflowValidationError("version_id is required and must be a non-empty string");
  }
  if (!Array.isArray(o.nodes)) {
    throw new WorkflowValidationError("nodes must be an array");
  }
  const ids = new Set<string>();
  for (let i = 0; i < (o.nodes as unknown[]).length; i++) {
    const node = (o.nodes as unknown[])[i];
    if (node === null || typeof node !== "object") {
      throw new WorkflowValidationError(`nodes[${i}] must be an object`);
    }
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id) {
      throw new WorkflowValidationError(`nodes[${i}].id is required and must be a non-empty string`);
    }
    if (ids.has(n.id)) {
      throw new WorkflowValidationError(`Duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
    if (typeof n.type !== "string" || !(Object.values(WorkflowNodeType) as string[]).includes(n.type)) {
      throw new WorkflowValidationError(
        `nodes[${i}].type must be one of: ${Object.values(WorkflowNodeType).join(", ")}`
      );
    }
    if (!Array.isArray(n.input_collections)) {
      throw new WorkflowValidationError(`nodes[${i}].input_collections must be an array`);
    }
    if (!Array.isArray(n.output_collections)) {
      throw new WorkflowValidationError(`nodes[${i}].output_collections must be an array`);
    }
    for (const c of n.input_collections as unknown[]) {
      if (typeof c !== "string" || !c) {
        throw new WorkflowValidationError(`nodes[${i}].input_collections must contain non-empty strings`);
      }
    }
    for (const c of n.output_collections as unknown[]) {
      if (typeof c !== "string" || !c) {
        throw new WorkflowValidationError(`nodes[${i}].output_collections must contain non-empty strings`);
      }
    }
    if (n.minimum_rows !== undefined) {
      if (typeof n.minimum_rows !== "number" || !Number.isInteger(n.minimum_rows) || n.minimum_rows < 1) {
        throw new WorkflowValidationError(
          `nodes[${i}].minimum_rows must be a positive integer when present`
        );
      }
    }
  }

  assertWorkflowAcyclic(o.nodes as WorkflowNode[]);
}
