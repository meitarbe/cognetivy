import type { CollectionSchemaConfig } from "./models.js";

/** Empty schema; agent defines all collection kinds via collection_schema_set. */
export const DEFAULT_COLLECTION_SCHEMA: CollectionSchemaConfig = {
  kinds: {},
};
