import type { ArtifactSchemaConfig } from "./models.js";

export const DEFAULT_ARTIFACT_SCHEMA: ArtifactSchemaConfig = {
  kinds: {
    sources: {
      description: "References (URLs, citations) used during research or reasoning",
      required: ["url"],
      properties: {
        url: { type: "string", description: "Source URL or identifier" },
        title: { type: "string", description: "Title or label" },
        snippet: { type: "string", description: "Relevant excerpt" },
        type: { type: "string", description: "e.g. article, doc, api" },
      },
    },
    collected: {
      description: "Structured data already gathered (signals, themes, raw findings)",
      required: [],
      properties: {
        themes: { type: "array", description: "Theme or category labels" },
        signals: { type: "object", description: "Key-value signals" },
        raw: { type: "array", description: "Raw findings or quotes" },
      },
    },
    ideas: {
      description: "Output ideas or proposals the agent produces (e.g. startup ideas, recommendations)",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Short name or title" },
        why_now: { type: "string", description: "Why-now thesis or timing rationale" },
        description: { type: "string", description: "Full description" },
        signals: { type: "array", description: "Supporting signals or sources" },
      },
    },
  },
};
