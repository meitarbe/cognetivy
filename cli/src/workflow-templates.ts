import { WorkflowNodeType, type WorkflowVersionRecord } from "./models.js";

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  use_cases: string[];
  workflow: Omit<WorkflowVersionRecord, "workflow_id" | "version_id" | "created_at">;
}

const SKILLS = ["cognetivy"];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "product-prd-to-release",
    name: "Product PRD to release",
    category: "Product & Engineering",
    description: "Go from product idea to implementation plan, delivery, QA, and launch notes.",
    use_cases: ["Feature delivery", "MVP planning", "Cross-functional handoff"],
    workflow: {
      nodes: [
        { id: "capture_requirements", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["requirements"], required_skills: SKILLS, prompt: "Turn run input into a crisp PRD-style requirements brief with goals, personas, constraints, success metrics, and non-goals." },
        { id: "solution_options", type: WorkflowNodeType.Prompt, input_collections: ["requirements"], output_collections: ["solution_options"], minimum_rows: 3, required_skills: SKILLS, prompt: "Generate at least 3 solution options with tradeoffs, complexity, and risk." },
        { id: "implementation_plan", type: WorkflowNodeType.Prompt, input_collections: ["requirements", "solution_options"], output_collections: ["implementation_plan"], required_skills: SKILLS, prompt: "Produce implementation plan: architecture, files/modules, migration considerations, test plan, release sequencing." },
        { id: "qa_and_launch_notes", type: WorkflowNodeType.Prompt, input_collections: ["implementation_plan"], output_collections: ["release_notes"], required_skills: SKILLS, prompt: "Write QA checklist, launch notes, rollback strategy, and stakeholder update summary." },
      ],
    },
  },
  {
    id: "bug-triage-and-fix",
    name: "Bug triage and fix",
    category: "Engineering",
    description: "Structured flow for reproducing, root-causing, patching, and validating defects.",
    use_cases: ["Production bug", "Regression", "QA issue"],
    workflow: {
      nodes: [
        { id: "triage_issue", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["bug_scope"], required_skills: SKILLS, prompt: "Parse issue details into reproducible scope, expected vs actual, severity, impact, and likely areas." },
        { id: "root_cause_hypotheses", type: WorkflowNodeType.Prompt, input_collections: ["bug_scope"], output_collections: ["hypotheses"], minimum_rows: 3, required_skills: SKILLS, prompt: "Generate at least 3 root-cause hypotheses with confidence and targeted validation steps." },
        { id: "fix_and_tests", type: WorkflowNodeType.Prompt, input_collections: ["bug_scope", "hypotheses"], output_collections: ["fix_plan"], required_skills: SKILLS, prompt: "Create patch plan with specific code/test changes, risk mitigation, and rollback approach." },
        { id: "validation_report", type: WorkflowNodeType.Prompt, input_collections: ["fix_plan"], output_collections: ["qa_report"], required_skills: SKILLS, prompt: "Output regression test checklist, edge cases, results template, and merge readiness criteria." },
      ],
    },
  },
  {
    id: "pr-review-assistant",
    name: "PR review assistant",
    category: "Engineering",
    description: "Review pull requests with architecture, quality, and risk lenses.",
    use_cases: ["Code review", "Release gate", "Team standards"],
    workflow: {
      nodes: [
        { id: "pr_summary", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["pr_summary"], required_skills: SKILLS, prompt: "Summarize PR scope: what changed, why, affected components, and potential blast radius." },
        { id: "review_findings", type: WorkflowNodeType.Prompt, input_collections: ["pr_summary"], output_collections: ["review_findings"], minimum_rows: 5, required_skills: SKILLS, prompt: "Produce concrete review findings across correctness, readability, performance, security, and tests." },
        { id: "approval_recommendation", type: WorkflowNodeType.Prompt, input_collections: ["review_findings"], output_collections: ["recommendation"], required_skills: SKILLS, prompt: "Generate approve/request-changes recommendation with blocking vs non-blocking comments and suggested follow-ups." },
      ],
    },
  },
  {
    id: "incident-response-postmortem",
    name: "Incident response & postmortem",
    category: "Ops & Reliability",
    description: "Capture incident timeline, impact, remediation, and prevention actions.",
    use_cases: ["Outage", "SLA breach", "Reliability review"],
    workflow: {
      nodes: [
        { id: "incident_intake", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["incident_context"], required_skills: SKILLS, prompt: "Normalize incident details into timeline, systems affected, customer impact, and severity." },
        { id: "root_cause_and_fixes", type: WorkflowNodeType.Prompt, input_collections: ["incident_context"], output_collections: ["rca"], required_skills: SKILLS, prompt: "Document root cause, contributing factors, and immediate/long-term remediation." },
        { id: "postmortem_actions", type: WorkflowNodeType.Prompt, input_collections: ["incident_context", "rca"], output_collections: ["action_items"], minimum_rows: 5, required_skills: SKILLS, prompt: "Produce owner-ready action items with priority, owner role, ETA, and measurable prevention criteria." },
      ],
    },
  },
  {
    id: "customer-feedback-insights",
    name: "Customer feedback insights",
    category: "Product & Growth",
    description: "Transform raw feedback into prioritized themes and roadmap candidates.",
    use_cases: ["VOC analysis", "Roadmap shaping", "Churn reduction"],
    workflow: {
      nodes: [
        { id: "normalize_feedback", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["feedback_items"], required_skills: SKILLS, prompt: "Parse feedback messages into normalized items (persona, pain point, context, sentiment, frequency hints)." },
        { id: "theme_clustering", type: WorkflowNodeType.Prompt, input_collections: ["feedback_items"], output_collections: ["themes"], minimum_rows: 4, required_skills: SKILLS, prompt: "Cluster feedback into recurring themes with evidence snippets and impact notes." },
        { id: "prioritize_opportunities", type: WorkflowNodeType.Prompt, input_collections: ["themes"], output_collections: ["opportunities"], required_skills: SKILLS, prompt: "Prioritize opportunities by impact, effort, confidence, and strategic alignment." },
      ],
    },
  },
  {
    id: "content-seo-pipeline",
    name: "Content + SEO pipeline",
    category: "Marketing",
    description: "Build topic clusters, outlines, and distribution-ready content plans.",
    use_cases: ["SEO strategy", "Editorial calendar", "Content operations"],
    workflow: {
      nodes: [
        { id: "topic_research", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["topics"], minimum_rows: 8, required_skills: SKILLS, prompt: "Generate topic clusters from goal/audience with search intent and funnel stage." },
        { id: "briefs", type: WorkflowNodeType.Prompt, input_collections: ["topics"], output_collections: ["content_briefs"], required_skills: SKILLS, prompt: "Create content briefs per topic: angle, outline, CTA, and differentiation points." },
        { id: "distribution_plan", type: WorkflowNodeType.Prompt, input_collections: ["content_briefs"], output_collections: ["distribution"], required_skills: SKILLS, prompt: "Produce channel distribution and repurposing plan (blog, social, newsletter, docs)." },
      ],
    },
  },
  {
    id: "sales-discovery-to-proposal",
    name: "Sales discovery to proposal",
    category: "Sales",
    description: "Turn discovery notes into qualification, proposal draft, and next-step plan.",
    use_cases: ["B2B sales", "Solution selling", "Deal strategy"],
    workflow: {
      nodes: [
        { id: "discovery_extract", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["discovery"], required_skills: SKILLS, prompt: "Extract ICP fit, pains, constraints, timeline, budget signals, and decision process from discovery input." },
        { id: "solution_mapping", type: WorkflowNodeType.Prompt, input_collections: ["discovery"], output_collections: ["solution_fit"], required_skills: SKILLS, prompt: "Map customer pains to solution capabilities, identify gaps/risks, and required proof points." },
        { id: "proposal_pack", type: WorkflowNodeType.Prompt, input_collections: ["solution_fit"], output_collections: ["proposal"], required_skills: SKILLS, prompt: "Create proposal narrative: outcomes, scope, timeline, assumptions, and commercial framing." },
      ],
    },
  },
  {
    id: "research-literature-review",
    name: "Research literature review",
    category: "Research",
    description: "Organize sources, compare findings, and summarize evidence-backed conclusions.",
    use_cases: ["Academic research", "Market research", "Technical deep dive"],
    workflow: {
      nodes: [
        { id: "source_collection", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["sources"], minimum_rows: 5, required_skills: SKILLS, prompt: "Collect and normalize verified sources relevant to the topic with key metadata and excerpt." },
        { id: "evidence_matrix", type: WorkflowNodeType.Prompt, input_collections: ["sources"], output_collections: ["evidence_matrix"], required_skills: SKILLS, prompt: "Build evidence matrix: claim, support level, disagreements, and methodological caveats." },
        { id: "synthesis", type: WorkflowNodeType.Prompt, input_collections: ["evidence_matrix"], output_collections: ["review_summary"], required_skills: SKILLS, prompt: "Write balanced synthesis with confidence levels, open questions, and recommendations for next research steps." },
      ],
    },
  },
  {
    id: "meeting-to-action-plan",
    name: "Meeting notes to action plan",
    category: "Operations",
    description: "Convert long meeting transcripts into decisions, owners, and deadlines.",
    use_cases: ["Team sync", "Client calls", "Project kickoff"],
    workflow: {
      nodes: [
        { id: "extract_decisions", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["decisions"], required_skills: SKILLS, prompt: "Extract explicit decisions and unresolved questions from meeting notes/transcript." },
        { id: "action_items", type: WorkflowNodeType.Prompt, input_collections: ["decisions"], output_collections: ["tasks"], minimum_rows: 5, required_skills: SKILLS, prompt: "Generate actionable tasks with owner role, due date suggestion, dependencies, and success criteria." },
        { id: "status_update", type: WorkflowNodeType.Prompt, input_collections: ["decisions", "tasks"], output_collections: ["summary"], required_skills: SKILLS, prompt: "Write concise status update for stakeholders including key decisions, priorities, and next milestones." },
      ],
    },
  },
  {
    id: "docs-from-code-changes",
    name: "Docs from code changes",
    category: "Developer Experience",
    description: "Generate release docs, migration notes, and examples from implementation details.",
    use_cases: ["Changelog drafting", "API updates", "Developer docs"],
    workflow: {
      nodes: [
        { id: "change_inventory", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["changes"], required_skills: SKILLS, prompt: "Inventory relevant code changes by module/feature and classify user impact." },
        { id: "docs_draft", type: WorkflowNodeType.Prompt, input_collections: ["changes"], output_collections: ["docs_draft"], required_skills: SKILLS, prompt: "Draft docs updates: what changed, why, migration steps, and before/after examples." },
        { id: "release_communication", type: WorkflowNodeType.Prompt, input_collections: ["docs_draft"], output_collections: ["announce"], required_skills: SKILLS, prompt: "Create release communication variants for changelog, internal update, and customer-facing message." },
      ],
    },
  },
  {
    id: "job-candidate-evaluation",
    name: "Candidate evaluation workflow",
    category: "People Ops",
    description: "Structured candidate scoring with strengths, risks, and interview recommendations.",
    use_cases: ["Hiring loop", "Panel debrief", "Interview scorecards"],
    workflow: {
      nodes: [
        { id: "candidate_profile", type: WorkflowNodeType.Prompt, input_collections: ["run_input"], output_collections: ["candidate_profile"], required_skills: SKILLS, prompt: "Normalize candidate information into role fit, skill coverage, and context." },
        { id: "scorecard", type: WorkflowNodeType.Prompt, input_collections: ["candidate_profile"], output_collections: ["scorecard"], required_skills: SKILLS, prompt: "Create weighted scorecard across competencies with objective evidence and confidence levels." },
        { id: "interview_plan", type: WorkflowNodeType.Prompt, input_collections: ["scorecard"], output_collections: ["interview_plan"], required_skills: SKILLS, prompt: "Produce targeted interview plan to validate risks, plus final hire/no-hire recommendation framing." },
      ],
    },
  },
];

const NON_DEVELOPER_FIRST_CATEGORY_ORDER = [
  "Operations",
  "People Ops",
  "Marketing",
  "Sales",
  "Product & Growth",
  "Research",
  "Ops & Reliability",
  "Product & Engineering",
  "Engineering",
  "Developer Experience",
];

export function listWorkflowTemplates() {
  return WORKFLOW_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    use_cases: template.use_cases,
    node_count: template.workflow.nodes.length,
  }));
}

export function listWorkflowTemplatesForPicker() {
  const categoryRank = new Map(NON_DEVELOPER_FIRST_CATEGORY_ORDER.map((c, i) => [c, i]));
  return listWorkflowTemplates().sort((a, b) => {
    const ra = categoryRank.get(a.category) ?? 999;
    const rb = categoryRank.get(b.category) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

export function getWorkflowTemplateById(templateId: string): WorkflowTemplate | null {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function materializeWorkflowTemplate(templateId: string): WorkflowVersionRecord | null {
  const template = getWorkflowTemplateById(templateId);
  if (!template) return null;
  return {
    workflow_id: "wf_template",
    version_id: "v1",
    name: template.name,
    description: template.description,
    created_at: new Date().toISOString(),
    nodes: template.workflow.nodes,
  };
}
