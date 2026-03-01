import type { CollectionSchemaConfig } from "./models.js";
import { TRACEABILITY_PROPERTIES } from "./traceability-schema.js";

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
      sources: {
        name: "Sources",
        description:
          "Verified sources (e.g. articles, docs). The url field must be a URL the agent has actually retrieved or opened, not invented. Use citations/derived_from on other kinds to point to these.",
        item_schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "URL that has been verified (retrieved or opened); do not invent." },
            title: { type: "string", description: "Short title for the source." },
            excerpt: { type: "string", description: "Brief excerpt or summary." },
            ...TRACEABILITY_PROPERTIES,
          },
          additionalProperties: true,
        },
      },
    },
  };
}
