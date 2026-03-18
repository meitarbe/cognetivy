/**
 * Re-export collection validation from shared core.
 */
export {
  validateCollectionItemPayload,
  validateCollectionItemsPayload,
  CollectionValidationError,
  getMergedItemSchema,
  buildMergedItemSchema,
  mergeNameRequiredIntoItemSchema,
  mergeTraceabilityIntoItemSchema,
  mergeNameRequiredIntoSchema,
  mergeTraceabilityIntoSchema,
  TRACEABILITY_EXCLUDED_KINDS,
  NAME_PROPERTY_SCHEMA,
  TRACEABILITY_PROPERTIES,
} from "@cognetivy/core";
