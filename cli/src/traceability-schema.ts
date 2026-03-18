/**
 * Re-export traceability and name schema helpers from shared core.
 */
export {
  TRACEABILITY_PROPERTIES,
  TRACEABILITY_EXCLUDED_KINDS,
  NAME_PROPERTY_SCHEMA,
  mergeTraceabilityIntoItemSchema,
  mergeNameRequiredIntoItemSchema,
  mergeNameRequiredIntoSchema,
  mergeTraceabilityIntoSchema,
} from "@cognetivy/core";
