import type { CollectionSchemaConfig } from "./models.js";
import { DEFAULT_WORKFLOW_ID } from "./default-workflow.js";
import { TRACEABILITY_PROPERTIES } from "./traceability-schema.js";

const DEFAULT_SUMMARY_KIND = {
  name: "Summary",
  description: "Synthesized summary derived from sources. Use Markdown for content.",
  item_schema: {
    type: "object",
    required: ["summary"],
    properties: {
      summary: { type: "string", description: "Main content (Markdown)." },
      title: { type: "string", description: "Optional short title." },
      ...TRACEABILITY_PROPERTIES,
    },
    additionalProperties: true,
  },
} as const;

const DEFAULT_APPROVED_SUMMARY_KIND = {
  name: "Approved summary",
  description: "Human-approved summary. Use Markdown for content.",
  item_schema: {
    type: "object",
    required: ["summary"],
    properties: {
      summary: { type: "string", description: "Approved content (Markdown)." },
      title: { type: "string", description: "Optional short title." },
      ...TRACEABILITY_PROPERTIES,
    },
    additionalProperties: true,
  },
} as const;

export function createDefaultCollectionSchema(workflowId: string): CollectionSchemaConfig {
  const base: CollectionSchemaConfig = {
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

  if (workflowId === DEFAULT_WORKFLOW_ID) {
    base.kinds.summary = { ...DEFAULT_SUMMARY_KIND };
    base.kinds.approved_summary = { ...DEFAULT_APPROVED_SUMMARY_KIND };
  }

  return base;
}
