import { createDefaultCollectionSchema } from "./default-collection-schema.js";
import { DEFAULT_WORKFLOW_ID, createDefaultWorkflowVersionRecord } from "./default-workflow.js";
import type { CollectionSchemaConfig, WorkflowRecord, WorkflowVersionRecord } from "./models.js";
import {
  readWorkflowIndex,
  readWorkflowRecord,
  writeWorkflowIndex,
  writeWorkflowRecord,
  writeWorkflowVersionRecord,
  writeCollectionSchema,
} from "./workspace.js";
import { getWorkflowTemplateById, materializeWorkflowTemplate, type WorkflowTemplate } from "./workflow-templates.js";

type JsonSchemaProperty = Record<string, unknown>;

interface CollectionKindPreset {
  name: string;
  description: string;
  required?: string[];
  properties: Record<string, JsonSchemaProperty>;
}

const TRACEABILITY_FIELDS: Record<string, JsonSchemaProperty> = {
  citations: {
    type: "array",
    description: "Optional source links/references for this item.",
    items: { type: "object", additionalProperties: true },
  },
  derived_from: {
    type: "array",
    description: "Optional links to upstream collection items used to derive this output.",
    items: {
      type: "object",
      properties: {
        kind: { type: "string" },
        item_id: { type: "string" },
      },
      required: ["kind", "item_id"],
      additionalProperties: true,
    },
  },
  reasoning: {
    type: "string",
    description: "Optional concise reasoning summary behind this item.",
  },
};

const COLLECTION_KIND_PRESETS: Record<string, CollectionKindPreset> = {
  run_input: {
    name: "Run input",
    description: "System collection containing the run input payload.",
    properties: {},
  },
  sources: {
    name: "Verified sources",
    description: "External sources that were actually opened/retrieved and used as evidence.",
    required: ["url", "title"],
    properties: {
      url: { type: "string", description: "Verified source URL." },
      title: { type: "string", description: "Human-readable source title." },
      excerpt: { type: "string", description: "Optional excerpt relevant to this workflow." },
      source_type: { type: "string", description: "Source type (docs, article, report, API, etc.)." },
      published_at: { type: "string", description: "Optional publish date/time." },
      confidence_score: { type: "number", minimum: 0, maximum: 1, description: "Confidence in source relevance." },
    },
  },
  requirements: {
    name: "Requirements",
    description: "Structured product/feature requirements extracted from the brief.",
    required: ["title", "summary"],
    properties: {
      title: { type: "string", description: "Requirement title." },
      summary: { type: "string", description: "What this requirement asks for." },
      goals: { type: "array", items: { type: "string" }, description: "Business/user goals." },
      constraints: { type: "array", items: { type: "string" }, description: "Known constraints and boundaries." },
      success_metrics: { type: "array", items: { type: "string" }, description: "How success will be measured." },
    },
  },
  user_lens: {
    name: "User lens insights",
    description: "User-centric insights, friction points, and outcome framing.",
    required: ["persona", "insight"],
    properties: {
      persona: { type: "string", description: "Persona or user segment." },
      insight: { type: "string", description: "Key user insight." },
      pain_point: { type: "string", description: "Observed user pain/friction." },
      suggested_outcome: { type: "string", description: "Desired outcome for the user." },
    },
  },
  solution_options: {
    name: "Solution options",
    description: "Alternative solution options with tradeoffs.",
    required: ["option", "tradeoffs"],
    properties: {
      option: { type: "string", description: "Option name/label." },
      tradeoffs: { type: "string", description: "Main tradeoffs for this option." },
      complexity: { type: "string", description: "Engineering complexity estimate." },
      risks: { type: "array", items: { type: "string" }, description: "Key risks for this option." },
    },
  },
  implementation_plan: {
    name: "Implementation plan",
    description: "Execution plan for architecture, implementation, and rollout.",
    required: ["phase", "summary"],
    properties: {
      phase: { type: "string", description: "Execution phase or milestone." },
      summary: { type: "string", description: "What will be done in this phase." },
      owner_role: { type: "string", description: "Owner role for this work." },
      test_plan: { type: "string", description: "Validation/testing plan." },
      rollout_notes: { type: "string", description: "Rollout/launch sequencing notes." },
    },
  },
  release_notes: {
    name: "Release notes",
    description: "QA and launch communication items ready for release.",
    required: ["title", "summary"],
    properties: {
      title: { type: "string", description: "Release note title." },
      summary: { type: "string", description: "What changed and why it matters." },
      qa_checklist: { type: "array", items: { type: "string" }, description: "Validation checklist." },
      rollback_plan: { type: "string", description: "Rollback/fallback plan." },
    },
  },
  bug_scope: {
    name: "Bug scope",
    description: "Bug reproduction scope and impact framing.",
    required: ["summary", "severity"],
    properties: {
      summary: { type: "string", description: "Issue summary." },
      severity: { type: "string", description: "Severity level." },
      reproducibility: { type: "string", description: "Repro steps/conditions." },
      impact: { type: "string", description: "User/business impact." },
    },
  },
  hypotheses: {
    name: "Root-cause hypotheses",
    description: "Candidate root causes to validate.",
    required: ["hypothesis", "confidence_score"],
    properties: {
      hypothesis: { type: "string", description: "Root cause hypothesis." },
      confidence_score: { type: "number", minimum: 0, maximum: 1, description: "Confidence in this hypothesis." },
      validation_step: { type: "string", description: "How to validate/refute this hypothesis." },
    },
  },
  diagnostics: {
    name: "Diagnostics matrix",
    description: "Signals, logs, and checks to disambiguate root causes.",
    required: ["signal", "check"],
    properties: {
      signal: { type: "string", description: "Observed signal or symptom." },
      check: { type: "string", description: "Diagnostic check to run." },
      expected_finding: { type: "string", description: "Expected finding if hypothesis is true." },
    },
  },
  fix_plan: {
    name: "Fix plan",
    description: "Patch plan with validation and rollback details.",
    required: ["change", "validation"],
    properties: {
      change: { type: "string", description: "Code/system change to make." },
      validation: { type: "string", description: "How the fix is validated." },
      rollback: { type: "string", description: "Rollback approach." },
      risk_level: { type: "string", description: "Estimated execution risk." },
    },
  },
  qa_report: {
    name: "QA report",
    description: "Regression coverage and readiness outputs.",
    required: ["check", "result"],
    properties: {
      check: { type: "string", description: "Test/check performed." },
      result: { type: "string", description: "Outcome of this check." },
      notes: { type: "string", description: "Additional QA notes." },
    },
  },
  summary: {
    name: "Summary",
    description: "Final structured summary output for the run.",
    required: ["title", "summary"],
    properties: {
      title: { type: "string", description: "Summary title." },
      summary: { type: "string", description: "Main summary text." },
      key_points: { type: "array", items: { type: "string" }, description: "Key bullets." },
      next_steps: { type: "array", items: { type: "string" }, description: "Suggested follow-up actions." },
    },
  },
};

function normalizeWorkflowIdFromTemplate(templateId: string): string {
  return `wf_${templateId.replace(/[^a-z0-9_-]/gi, "_")}`;
}

export interface ApplyWorkflowTemplateOptions {
  cwd: string;
  templateId: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
}

export interface ApplyWorkflowTemplateResult {
  template: WorkflowTemplate;
  workflow: WorkflowRecord;
  version: WorkflowVersionRecord;
}

function titleCaseFromKind(kind: string): string {
  return kind
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createKindSchema(kind: string): CollectionSchemaConfig["kinds"][string] {
  const preset = COLLECTION_KIND_PRESETS[kind];
  if (preset) {
    return {
      name: preset.name,
      description: preset.description,
      item_schema: {
        type: "object",
        required: preset.required,
        properties: {
          ...preset.properties,
          ...(kind === "run_input" ? {} : TRACEABILITY_FIELDS),
        },
        additionalProperties: true,
      },
    };
  }

  return {
    name: titleCaseFromKind(kind),
    description: `Structured collection for ${titleCaseFromKind(kind).toLowerCase()} generated by this workflow template.`,
    item_schema: {
      type: "object",
      required: ["title", "summary"],
      properties: {
        title: { type: "string", description: `Short title for the ${kind} item.` },
        summary: { type: "string", description: `Main content for the ${kind} item.` },
        status: { type: "string", description: "Optional lifecycle status (draft, in_review, approved, etc.)." },
        priority: { type: "string", description: "Optional priority indicator." },
        owner_role: { type: "string", description: "Optional owner role." },
        confidence_score: { type: "number", minimum: 0, maximum: 1, description: "Optional confidence score." },
        ...TRACEABILITY_FIELDS,
      },
      additionalProperties: true,
    },
  };
}

function buildCollectionSchema(workflowId: string, version: WorkflowVersionRecord): CollectionSchemaConfig {
  const schema = createDefaultCollectionSchema(workflowId);
  const kinds = new Set<string>();

  for (const node of version.nodes ?? []) {
    for (const k of node.input_collections ?? []) kinds.add(k);
    for (const k of node.output_collections ?? []) kinds.add(k);
  }

  for (const kind of kinds) {
    schema.kinds[kind] = createKindSchema(kind);
  }

  return schema;
}

function materializeTemplateOrDefault(templateId: string): { template: WorkflowTemplate; workflow: WorkflowVersionRecord } | null {
  if (templateId === DEFAULT_WORKFLOW_ID) {
    const now = new Date().toISOString();
    const defaultVersion = createDefaultWorkflowVersionRecord(now);
    const defaultTemplate: WorkflowTemplate = {
      id: DEFAULT_WORKFLOW_ID,
      name: "Default workflow",
      category: "Getting started",
      description: "Starter workflow demonstrating collection → node → collection flow.",
      use_cases: ["Onboarding", "Quick start", "Smoke testing"],
      workflow: {
        nodes: defaultVersion.nodes,
      },
    };
    return {
      template: defaultTemplate,
      workflow: {
        ...defaultVersion,
        workflow_id: "wf_template",
      },
    };
  }

  const templateMeta = getWorkflowTemplateById(templateId);
  const template = materializeWorkflowTemplate(templateId);
  if (!templateMeta || !template) return null;
  return { template: templateMeta, workflow: template };
}

export async function applyWorkflowTemplateToWorkspace(options: ApplyWorkflowTemplateOptions): Promise<ApplyWorkflowTemplateResult> {
  const { cwd, templateId } = options;
  const materialized = materializeTemplateOrDefault(templateId);
  if (!materialized) {
    throw new Error(`Unknown template "${templateId}".`);
  }

  const { template: templateMeta, workflow: template } = materialized;
  const index = await readWorkflowIndex(cwd);
  const suggestedWorkflowId = templateId === DEFAULT_WORKFLOW_ID ? DEFAULT_WORKFLOW_ID : normalizeWorkflowIdFromTemplate(templateId);
  const workflowId = options.workflowId?.trim() || suggestedWorkflowId;

  let workflowExists = false;
  try {
    await readWorkflowRecord(workflowId, cwd);
    workflowExists = true;
  } catch {
    workflowExists = false;
  }

  if (workflowExists) {
    throw new Error(`Workflow "${workflowId}" already exists. Choose a different --workflow id.`);
  }

  const now = new Date().toISOString();
  const workflow: WorkflowRecord = {
    workflow_id: workflowId,
    name: options.workflowName ?? templateMeta.name,
    description: options.workflowDescription ?? templateMeta.description,
    current_version_id: "v1",
    created_at: now,
  };

  const version: WorkflowVersionRecord = {
    ...template,
    workflow_id: workflowId,
    version_id: "v1",
    name: options.workflowName ?? templateMeta.name,
    description: options.workflowDescription ?? templateMeta.description,
    created_at: now,
  };

  await writeWorkflowRecord(workflow, cwd);
  await writeWorkflowVersionRecord(version, cwd);
  await writeCollectionSchema(workflowId, buildCollectionSchema(workflowId, version), cwd);

  const existingWorkflows = index.workflows ?? [];
  const deduped = existingWorkflows.filter((w) => w.workflow_id !== workflowId);
  const withoutDefault = workflowId === DEFAULT_WORKFLOW_ID
    ? deduped
    : deduped.filter((w) => w.workflow_id !== DEFAULT_WORKFLOW_ID);

  await writeWorkflowIndex({
    ...index,
    current_workflow_id: workflowId,
    workflows: [
      ...withoutDefault,
      {
        workflow_id: workflowId,
        name: workflow.name,
        description: workflow.description,
        current_version_id: workflow.current_version_id,
      },
    ],
  }, cwd);

  return { template: templateMeta, workflow, version };
}
