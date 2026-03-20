/**
 * Re-export workflow validation from shared core.
 */
export {
  validateWorkflowVersion,
  assertWorkflowAcyclic,
  getCollectionNamesFromNodes,
  WorkflowValidationError,
} from "./core/index.js";
