import { createDefaultCollectionSchema } from "./default-collection-schema.js";
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

function createCollectionSchemaFromWorkflow(workflowId: string, version: WorkflowVersionRecord): CollectionSchemaConfig {
  const schema = createDefaultCollectionSchema(workflowId);
  const kinds = new Set<string>();

  for (const node of version.nodes ?? []) {
    for (const k of node.input_collections ?? []) kinds.add(k);
    for (const k of node.output_collections ?? []) kinds.add(k);
  }

  for (const kind of kinds) {
    if (schema.kinds[kind]) continue;
    schema.kinds[kind] = {
      name: kind.replace(/_/g, " "),
      description: `Collection for \"${kind}\" generated from workflow template.`,
      item_schema: {
        type: "object",
        additionalProperties: true,
      },
    };
  }

  return schema;
}

export async function applyWorkflowTemplateToWorkspace(options: ApplyWorkflowTemplateOptions): Promise<ApplyWorkflowTemplateResult> {
  const { cwd, templateId } = options;
  const templateMeta = getWorkflowTemplateById(templateId);
  const template = materializeWorkflowTemplate(templateId);
  if (!template || !templateMeta) {
    throw new Error(`Unknown template "${templateId}".`);
  }

  const index = await readWorkflowIndex(cwd);
  const workflowId = options.workflowId?.trim() || normalizeWorkflowIdFromTemplate(templateId);

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
  await writeCollectionSchema(workflowId, createCollectionSchemaFromWorkflow(workflowId, version), cwd);

  const existingWorkflows = index.workflows ?? [];
  const deduped = existingWorkflows.filter((w) => w.workflow_id !== workflowId);
  await writeWorkflowIndex({
    ...index,
    current_workflow_id: workflowId,
    workflows: [
      ...deduped,
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
