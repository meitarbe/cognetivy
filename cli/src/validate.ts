import type { WorkflowVersion } from "./models.js";

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

/**
 * Validate minimal workflow schema: workflow_id, version, nodes, edges;
 * nodes must have unique ids and required fields.
 */
export function validateWorkflow(wf: unknown): asserts wf is WorkflowVersion {
  if (wf === null || typeof wf !== "object") {
    throw new WorkflowValidationError("Workflow must be a JSON object");
  }
  const o = wf as Record<string, unknown>;
  if (typeof o.workflow_id !== "string" || !o.workflow_id) {
    throw new WorkflowValidationError("workflow_id is required and must be a non-empty string");
  }
  if (typeof o.version !== "string" || !o.version) {
    throw new WorkflowValidationError("version is required and must be a non-empty string");
  }
  if (!Array.isArray(o.nodes)) {
    throw new WorkflowValidationError("nodes must be an array");
  }
  if (!Array.isArray(o.edges)) {
    throw new WorkflowValidationError("edges must be an array");
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
    if (n.type !== "TASK") {
      throw new WorkflowValidationError(`nodes[${i}].type must be "TASK"`);
    }
    if (n.contract === null || typeof n.contract !== "object") {
      throw new WorkflowValidationError(`nodes[${i}].contract is required and must be an object`);
    }
    const contract = n.contract as Record<string, unknown>;
    if (!Array.isArray(contract.input)) {
      throw new WorkflowValidationError(`nodes[${i}].contract.input must be an array`);
    }
    if (!Array.isArray(contract.output)) {
      throw new WorkflowValidationError(`nodes[${i}].contract.output must be an array`);
    }
  }
  for (let i = 0; i < (o.edges as unknown[]).length; i++) {
    const edge = (o.edges as unknown[])[i];
    if (edge === null || typeof edge !== "object") {
      throw new WorkflowValidationError(`edges[${i}] must be an object`);
    }
    const e = edge as Record<string, unknown>;
    if (typeof e.from !== "string" || typeof e.to !== "string") {
      throw new WorkflowValidationError(`edges[${i}] must have from and to strings`);
    }
    if (!ids.has(e.from)) {
      throw new WorkflowValidationError(`edges[${i}].from references unknown node: ${e.from}`);
    }
    if (!ids.has(e.to)) {
      throw new WorkflowValidationError(`edges[${i}].to references unknown node: ${e.to}`);
    }
  }
}
