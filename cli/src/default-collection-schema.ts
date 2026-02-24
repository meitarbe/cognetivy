import type { CollectionSchemaConfig } from "./models.js";

export function createDefaultCollectionSchema(workflowId: string): CollectionSchemaConfig {
  return {
    workflow_id: workflowId,
    kinds: {
      run_input: {
        name: "Run input",
        description: "System collection containing the run input payload.",
        item_schema: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  };
}
