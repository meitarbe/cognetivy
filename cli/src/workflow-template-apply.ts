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
  pr_summary: {
    name: "PR summary",
    description: "Structured summary of pull request scope, changes, and blast radius.",
    required: ["title", "summary"],
    properties: {
      title: { type: "string", description: "Short PR scope label." },
      summary: { type: "string", description: "What changed and why." },
      affected_components: { type: "array", items: { type: "string" }, description: "Modules/areas touched." },
      blast_radius: { type: "string", description: "Potential impact area." },
    },
  },
  review_findings: {
    name: "Review findings",
    description: "Concrete code review findings (correctness, readability, performance, security, tests).",
    required: ["category", "finding", "severity"],
    properties: {
      category: { type: "string", description: "Correctness, readability, performance, security, tests." },
      finding: { type: "string", description: "Specific finding description." },
      severity: { type: "string", description: "Blocking, non-blocking, suggestion." },
      location: { type: "string", description: "File/area reference." },
      suggestion: { type: "string", description: "Optional fix or improvement." },
    },
  },
  risk_hotspots: {
    name: "Risk hotspots",
    description: "High-risk code areas with failure modes and suggested deep-dive checks.",
    required: ["area", "risk", "suggestion"],
    properties: {
      area: { type: "string", description: "Code/subsystem area." },
      risk: { type: "string", description: "Failure mode or risk." },
      suggestion: { type: "string", description: "Suggested validation or check." },
    },
  },
  recommendation: {
    name: "Approval recommendation",
    description: "Approve or request-changes recommendation with blocking vs non-blocking comments.",
    required: ["verdict", "summary"],
    properties: {
      verdict: { type: "string", description: "Approve or request-changes." },
      summary: { type: "string", description: "Recommendation summary." },
      blocking: { type: "array", items: { type: "string" }, description: "Blocking comments." },
      non_blocking: { type: "array", items: { type: "string" }, description: "Non-blocking suggestions." },
      follow_ups: { type: "array", items: { type: "string" }, description: "Suggested follow-up work." },
    },
  },
  incident_context: {
    name: "Incident context",
    description: "Normalized incident details: timeline, systems affected, customer impact, severity.",
    required: ["summary", "severity"],
    properties: {
      summary: { type: "string", description: "Incident summary." },
      severity: { type: "string", description: "Severity level." },
      timeline: { type: "string", description: "Key timeline events." },
      systems_affected: { type: "array", items: { type: "string" }, description: "Affected systems." },
      customer_impact: { type: "string", description: "Customer-facing impact." },
    },
  },
  rca: {
    name: "Root cause analysis",
    description: "Root cause, contributing factors, and immediate/long-term remediation.",
    required: ["root_cause", "remediation"],
    properties: {
      root_cause: { type: "string", description: "Identified root cause." },
      contributing_factors: { type: "array", items: { type: "string" }, description: "Contributing factors." },
      remediation: { type: "string", description: "Immediate and long-term remediation." },
    },
  },
  incident_comms: {
    name: "Incident communications",
    description: "Stakeholder communication arc: internal updates, customer messaging, leadership brief.",
    required: ["audience", "message"],
    properties: {
      audience: { type: "string", description: "Internal, customer, leadership." },
      message: { type: "string", description: "Message content." },
      channel: { type: "string", description: "Delivery channel." },
    },
  },
  action_items: {
    name: "Postmortem action items",
    description: "Owner-ready action items with priority, owner role, ETA, and prevention criteria.",
    required: ["action", "owner_role", "priority"],
    properties: {
      action: { type: "string", description: "Concrete action." },
      owner_role: { type: "string", description: "Owner role or team." },
      priority: { type: "string", description: "Priority level." },
      eta: { type: "string", description: "Target completion." },
      prevention_criteria: { type: "string", description: "How we prevent recurrence." },
    },
  },
  feedback_items: {
    name: "Feedback items",
    description: "Normalized feedback: persona, pain point, context, sentiment, frequency.",
    required: ["pain_point", "context"],
    properties: {
      persona: { type: "string", description: "User segment or persona." },
      pain_point: { type: "string", description: "Reported pain or need." },
      context: { type: "string", description: "Usage context." },
      sentiment: { type: "string", description: "Sentiment hint." },
      frequency: { type: "string", description: "How often reported." },
    },
  },
  themes: {
    name: "Feedback themes",
    description: "Recurring feedback themes with evidence snippets and impact notes.",
    required: ["theme", "evidence"],
    properties: {
      theme: { type: "string", description: "Theme name." },
      evidence: { type: "string", description: "Representative evidence or quotes." },
      impact: { type: "string", description: "Business/user impact." },
    },
  },
  growth_signals: {
    name: "Churn and revenue signals",
    description: "Churn risk and expansion signals with revenue impact and urgency.",
    required: ["signal_type", "description", "urgency"],
    properties: {
      signal_type: { type: "string", description: "Churn_risk or expansion." },
      description: { type: "string", description: "Signal description." },
      urgency: { type: "string", description: "Urgency score or level." },
      revenue_impact: { type: "string", description: "Likely revenue impact." },
    },
  },
  opportunities: {
    name: "Prioritized opportunities",
    description: "Opportunities ranked by impact, effort, confidence, and strategic alignment.",
    required: ["opportunity", "impact", "effort"],
    properties: {
      opportunity: { type: "string", description: "Opportunity description." },
      impact: { type: "string", description: "Impact assessment." },
      effort: { type: "string", description: "Effort estimate." },
      confidence: { type: "string", description: "Confidence level." },
      alignment: { type: "string", description: "Strategic alignment." },
    },
  },
  topics: {
    name: "Topic clusters",
    description: "Topic clusters from goal/audience with search intent and funnel stage.",
    required: ["topic", "search_intent"],
    properties: {
      topic: { type: "string", description: "Topic or cluster name." },
      search_intent: { type: "string", description: "Search intent (informational, commercial, etc.)." },
      funnel_stage: { type: "string", description: "Awareness, consideration, decision." },
    },
  },
  content_briefs: {
    name: "Content briefs",
    description: "Content brief per topic: angle, outline, CTA, differentiation.",
    required: ["topic", "angle", "outline"],
    properties: {
      topic: { type: "string", description: "Topic this brief is for." },
      angle: { type: "string", description: "Editorial angle." },
      outline: { type: "string", description: "Content outline." },
      cta: { type: "string", description: "Call to action." },
      differentiation: { type: "string", description: "Differentiation points." },
    },
  },
  seo_signals: {
    name: "SEO signals",
    description: "Keyword and SERP strategy: terms, search intent, internal links, schema opportunities.",
    required: ["keyword", "intent"],
    properties: {
      keyword: { type: "string", description: "Primary or secondary keyword." },
      intent: { type: "string", description: "Search intent match." },
      internal_links: { type: "array", items: { type: "string" }, description: "Suggested internal link anchors." },
      schema_opportunity: { type: "string", description: "Schema or SERP opportunity." },
    },
  },
  distribution: {
    name: "Distribution plan",
    description: "Channel distribution and repurposing plan (blog, social, newsletter, docs) by funnel stage.",
    required: ["channel", "plan"],
    properties: {
      channel: { type: "string", description: "Blog, social, newsletter, docs." },
      plan: { type: "string", description: "Distribution plan for this channel." },
      funnel_stage: { type: "string", description: "Target funnel stage." },
    },
  },
  discovery: {
    name: "Discovery extract",
    description: "ICP fit, pains, constraints, timeline, budget, and decision process from discovery.",
    required: ["pain", "constraint"],
    properties: {
      pain: { type: "string", description: "Customer pain or need." },
      constraint: { type: "string", description: "Constraint (timeline, budget, technical)." },
      decision_process: { type: "string", description: "How they decide." },
      icp_fit: { type: "string", description: "Ideal customer profile fit." },
    },
  },
  solution_fit: {
    name: "Solution fit",
    description: "Customer pains mapped to solution capabilities, gaps, risks, proof points.",
    required: ["pain", "fit"],
    properties: {
      pain: { type: "string", description: "Customer pain." },
      fit: { type: "string", description: "How solution addresses it." },
      gap_or_risk: { type: "string", description: "Gap or risk." },
      proof_point: { type: "string", description: "Required proof point." },
    },
  },
  deal_risks: {
    name: "Deal risks",
    description: "Deal risk map: procurement blockers, technical concerns, political dynamics, mitigation.",
    required: ["risk", "mitigation"],
    properties: {
      risk: { type: "string", description: "Risk category or description." },
      mitigation: { type: "string", description: "Mitigation playbook." },
    },
  },
  proposal: {
    name: "Proposal",
    description: "Proposal narrative: outcomes, scope, timeline, assumptions, commercial framing, next steps.",
    required: ["outcomes", "scope", "next_steps"],
    properties: {
      outcomes: { type: "string", description: "Proposed outcomes." },
      scope: { type: "string", description: "Scope of work." },
      timeline: { type: "string", description: "Timeline." },
      assumptions: { type: "string", description: "Key assumptions." },
      next_steps: { type: "string", description: "Commitment asks or next steps." },
    },
  },
  evidence_matrix: {
    name: "Evidence matrix",
    description: "Evidence matrix: claim, support level, disagreements, methodological caveats.",
    required: ["claim", "support_level"],
    properties: {
      claim: { type: "string", description: "Claim or finding." },
      support_level: { type: "string", description: "Strength of support." },
      disagreements: { type: "string", description: "Conflicting evidence if any." },
      caveats: { type: "string", description: "Methodological caveats." },
    },
  },
  method_quality: {
    name: "Method quality assessment",
    description: "Source methodology quality, bias risks, evidence strength per source.",
    required: ["source_ref", "quality", "bias_risk"],
    properties: {
      source_ref: { type: "string", description: "Source reference." },
      quality: { type: "string", description: "Methodology quality." },
      bias_risk: { type: "string", description: "Bias risks." },
      evidence_strength: { type: "string", description: "Evidence strength tier." },
    },
  },
  review_summary: {
    name: "Literature review summary",
    description: "Balanced synthesis with confidence levels, open questions, next research steps.",
    required: ["synthesis", "confidence"],
    properties: {
      synthesis: { type: "string", description: "Synthesis summary." },
      confidence: { type: "string", description: "Confidence level." },
      open_questions: { type: "array", items: { type: "string" }, description: "Open questions." },
      next_steps: { type: "array", items: { type: "string" }, description: "Recommended next research." },
    },
  },
  decisions: {
    name: "Decisions",
    description: "Explicit decisions and unresolved questions from meeting notes.",
    required: ["decision", "status"],
    properties: {
      decision: { type: "string", description: "Decision or question." },
      status: { type: "string", description: "Resolved or open." },
      context: { type: "string", description: "Context from meeting." },
    },
  },
  tasks: {
    name: "Action tasks",
    description: "Actionable tasks with owner role, due date, dependencies, success criteria.",
    required: ["task", "owner_role"],
    properties: {
      task: { type: "string", description: "Task description." },
      owner_role: { type: "string", description: "Owner role." },
      due_date: { type: "string", description: "Suggested due date." },
      dependencies: { type: "array", items: { type: "string" }, description: "Dependencies." },
      success_criteria: { type: "string", description: "Success criteria." },
    },
  },
  blockers: {
    name: "Blockers and risks",
    description: "Delivery blockers/risks from meeting with mitigation owners and trigger dates.",
    required: ["blocker", "mitigation"],
    properties: {
      blocker: { type: "string", description: "Blocker or risk." },
      mitigation: { type: "string", description: "Proposed mitigation." },
      owner: { type: "string", description: "Mitigation owner." },
      trigger_date: { type: "string", description: "Trigger or review date." },
    },
  },
  changes: {
    name: "Change inventory",
    description: "Code changes by module/feature with user impact classification.",
    required: ["module", "summary", "impact"],
    properties: {
      module: { type: "string", description: "Module or feature." },
      summary: { type: "string", description: "What changed." },
      impact: { type: "string", description: "User impact (breaking, additive, internal)." },
    },
  },
  docs_draft: {
    name: "Docs draft",
    description: "Draft docs: what changed, why, migration steps, before/after examples.",
    required: ["section", "content"],
    properties: {
      section: { type: "string", description: "Doc section (e.g. migration, API)." },
      content: { type: "string", description: "Draft content." },
      migration_steps: { type: "array", items: { type: "string" }, description: "Migration steps if applicable." },
    },
  },
  examples: {
    name: "Example snippets",
    description: "Runnable example snippets and edge-case notes for new behavior.",
    required: ["snippet", "purpose"],
    properties: {
      snippet: { type: "string", description: "Code or usage snippet." },
      purpose: { type: "string", description: "What this demonstrates." },
      edge_case: { type: "string", description: "Edge case or caveat." },
    },
  },
  announce: {
    name: "Release communication",
    description: "Release communication for changelog, internal update, customer-facing message.",
    required: ["variant", "content"],
    properties: {
      variant: { type: "string", description: "Changelog, internal, customer." },
      content: { type: "string", description: "Message content." },
    },
  },
  candidate_profile: {
    name: "Candidate profile",
    description: "Normalized candidate info: role fit, skill coverage, context.",
    required: ["summary", "role_fit"],
    properties: {
      summary: { type: "string", description: "Candidate summary." },
      role_fit: { type: "string", description: "Role fit assessment." },
      skill_coverage: { type: "array", items: { type: "string" }, description: "Skills covered." },
    },
  },
  scorecard: {
    name: "Scorecard",
    description: "Weighted scorecard across competencies with evidence and confidence.",
    required: ["competency", "score", "evidence"],
    properties: {
      competency: { type: "string", description: "Competency area." },
      score: { type: "string", description: "Score or level." },
      evidence: { type: "string", description: "Objective evidence." },
      confidence: { type: "string", description: "Confidence level." },
    },
  },
  culture_growth: {
    name: "Culture and growth assessment",
    description: "Culture contribution, growth trajectory, manager enablement, interview evidence gaps.",
    required: ["dimension", "assessment"],
    properties: {
      dimension: { type: "string", description: "Culture, growth, or enablement." },
      assessment: { type: "string", description: "Assessment with evidence." },
      evidence_gap: { type: "string", description: "Interview evidence gap if any." },
    },
  },
  interview_plan: {
    name: "Interview plan",
    description: "Targeted interview plan to validate risks and hire/no-hire recommendation.",
    required: ["focus", "recommendation"],
    properties: {
      focus: { type: "string", description: "What to validate in next interviews." },
      recommendation: { type: "string", description: "Hire / no-hire framing." },
      risks_to_validate: { type: "array", items: { type: "string" }, description: "Risks to validate." },
    },
  },
  approved_summary: {
    name: "Approved summary",
    description: "Human-approved summary (default workflow). Use Markdown for content.",
    required: ["summary"],
    properties: {
      summary: { type: "string", description: "Approved content (Markdown)." },
      title: { type: "string", description: "Optional short title." },
    },
  },
  competitor_landscape: {
    name: "Competitor landscape",
    description: "Key competitors with offering, segment, and differentiators.",
    required: ["name", "offering"],
    properties: {
      name: { type: "string", description: "Competitor name." },
      offering: { type: "string", description: "Product or service offering." },
      target_segment: { type: "string", description: "Target segment." },
      differentiators: { type: "array", items: { type: "string" }, description: "Key differentiators." },
    },
  },
  strengths_weaknesses: {
    name: "Strengths and weaknesses",
    description: "Per-competitor strengths and weaknesses with evidence.",
    required: ["competitor", "strengths", "weaknesses"],
    properties: {
      competitor: { type: "string", description: "Competitor name." },
      strengths: { type: "array", items: { type: "string" }, description: "Strengths with evidence." },
      weaknesses: { type: "array", items: { type: "string" }, description: "Weaknesses with evidence." },
    },
  },
  positioning_map: {
    name: "Positioning map",
    description: "Positioning dimensions, competitor placement, and white-space opportunities.",
    required: ["dimensions", "placements"],
    properties: {
      dimensions: { type: "array", items: { type: "string" }, description: "Axis dimensions (e.g. price vs quality)." },
      placements: { type: "string", description: "Where each competitor sits and white-space." },
    },
  },
  strategic_implications: {
    name: "Strategic implications",
    description: "Where we can win, threats to watch, recommended moves.",
    required: ["implication", "recommendation"],
    properties: {
      implication: { type: "string", description: "Strategic implication." },
      recommendation: { type: "string", description: "Recommended move (positioning, feature, messaging)." },
      threats: { type: "array", items: { type: "string" }, description: "Threats to watch." },
    },
  },
  assumptions: {
    name: "Assumptions",
    description: "Key assumptions: revenue drivers, costs, timelines, adoption, dependencies.",
    required: ["assumption", "rationale"],
    properties: {
      assumption: { type: "string", description: "Assumption statement." },
      rationale: { type: "string", description: "Short rationale." },
      category: { type: "string", description: "Revenue, cost, timeline, adoption, etc." },
    },
  },
  financial_model: {
    name: "Financial model",
    description: "Revenue build, cost build, NPV/ROI/payback, key metrics.",
    required: ["metric", "value"],
    properties: {
      metric: { type: "string", description: "Metric name." },
      value: { type: "string", description: "Value or range." },
      notes: { type: "string", description: "Method or caveat." },
    },
  },
  sensitivity: {
    name: "Sensitivity analysis",
    description: "Impact of key assumptions, best/worst case, break-even.",
    required: ["assumption", "impact"],
    properties: {
      assumption: { type: "string", description: "Assumption varied." },
      impact: { type: "string", description: "Impact on outcome." },
      best_worst_case: { type: "string", description: "Best/worst case or break-even." },
    },
  },
  executive_summary: {
    name: "Executive summary",
    description: "Recommendation, headline numbers, risks, next steps.",
    required: ["recommendation", "headline_numbers"],
    properties: {
      recommendation: { type: "string", description: "Go/no-go or prioritization recommendation." },
      headline_numbers: { type: "string", description: "Key metrics." },
      key_risks: { type: "array", items: { type: "string" }, description: "Key risks and assumptions." },
      next_steps: { type: "array", items: { type: "string" }, description: "Next steps for approval." },
    },
  },
  campaign_brief: {
    name: "Campaign brief",
    description: "Structured campaign brief: objectives, audience, message, tone, channels, timeline.",
    required: ["objectives", "audience", "key_message"],
    properties: {
      objectives: { type: "string", description: "Campaign objectives." },
      audience: { type: "string", description: "Target audience." },
      key_message: { type: "string", description: "Key message." },
      tone: { type: "string", description: "Tone of voice." },
      channels: { type: "array", items: { type: "string" }, description: "Channels." },
      timeline: { type: "string", description: "Timeline." },
    },
  },
  creative_briefs: {
    name: "Creative briefs",
    description: "Per-asset creative brief: format, copy direction, visual direction, CTA, specs.",
    required: ["asset_type", "copy_direction", "visual_direction"],
    properties: {
      asset_type: { type: "string", description: "Asset or channel type." },
      copy_direction: { type: "string", description: "Copy direction." },
      visual_direction: { type: "string", description: "Visual direction." },
      cta: { type: "string", description: "Call to action." },
      specs: { type: "string", description: "Format/spec notes." },
    },
  },
  channel_plan: {
    name: "Channel plan",
    description: "Channel, role in funnel, format, placement, budget, sequencing.",
    required: ["channel", "role", "format"],
    properties: {
      channel: { type: "string", description: "Channel name." },
      role: { type: "string", description: "Role in funnel." },
      format: { type: "string", description: "Format and placement." },
      budget_allocation: { type: "string", description: "Budget allocation." },
      sequencing: { type: "string", description: "Sequencing notes." },
    },
  },
  deliverables: {
    name: "Deliverables",
    description: "Asset name, channel, format, dimensions, due date, handoff notes.",
    required: ["asset_name", "channel", "format"],
    properties: {
      asset_name: { type: "string", description: "Deliverable name." },
      channel: { type: "string", description: "Channel." },
      format: { type: "string", description: "Format and dimensions." },
      due_date: { type: "string", description: "Due date." },
      handoff_notes: { type: "string", description: "Owner/handoff notes." },
    },
  },
  brand_inputs: {
    name: "Brand inputs",
    description: "Positioning, values, audience, differentiators, existing voice/messaging.",
    required: ["positioning", "audience"],
    properties: {
      positioning: { type: "string", description: "Brand positioning." },
      values: { type: "array", items: { type: "string" }, description: "Brand values." },
      audience: { type: "string", description: "Target audience." },
      differentiators: { type: "array", items: { type: "string" }, description: "Differentiators." },
      existing_voice: { type: "string", description: "Existing voice or messaging." },
    },
  },
  voice_guidelines: {
    name: "Voice guidelines",
    description: "Tone do/don't, vocabulary, sentence rhythm, examples.",
    required: ["tone", "do_dont"],
    properties: {
      tone: { type: "string", description: "Brand tone." },
      do_dont: { type: "string", description: "Do and don't examples." },
      vocabulary: { type: "string", description: "Vocabulary guidance." },
      examples: { type: "array", items: { type: "string" }, description: "Example phrases." },
    },
  },
  messaging_pillars: {
    name: "Messaging pillars",
    description: "Pillar name, key message, proof points, one-liner.",
    required: ["pillar", "key_message", "one_liner"],
    properties: {
      pillar: { type: "string", description: "Pillar name." },
      key_message: { type: "string", description: "Key message." },
      proof_points: { type: "array", items: { type: "string" }, description: "Proof points." },
      one_liner: { type: "string", description: "One-liner." },
    },
  },
  messaging_toolkit: {
    name: "Messaging toolkit",
    description: "Elevator pitch, taglines, key phrases, FAQ Q&A, usage notes.",
    required: ["elevator_pitch", "key_phrases"],
    properties: {
      elevator_pitch: { type: "string", description: "Elevator pitch." },
      taglines: { type: "array", items: { type: "string" }, description: "Tagline options." },
      key_phrases: { type: "array", items: { type: "string" }, description: "Key phrases." },
      faq: { type: "string", description: "FAQ-style Q&A." },
      usage_notes: { type: "string", description: "Usage notes for sales/marketing." },
    },
  },
  contract_clauses: {
    name: "Contract clauses",
    description: "Extracted key clauses: parties, term, liability, indemnity, IP, termination.",
    required: ["clause_type", "content"],
    properties: {
      clause_type: { type: "string", description: "Type (liability, indemnity, IP, termination, etc.)." },
      content: { type: "string", description: "Clause summary or excerpt." },
    },
  },
  risk_flags: {
    name: "Risk flags",
    description: "Per-clause risk: level, issue, suggested fallback or negotiation point.",
    required: ["clause", "risk_level", "issue"],
    properties: {
      clause: { type: "string", description: "Clause reference." },
      risk_level: { type: "string", description: "High, medium, low." },
      issue: { type: "string", description: "Issue description." },
      suggestion: { type: "string", description: "Fallback or negotiation point." },
    },
  },
  redlines: {
    name: "Redlines",
    description: "Original language, suggested change, rationale.",
    required: ["original", "suggested", "rationale"],
    properties: {
      original: { type: "string", description: "Original language." },
      suggested: { type: "string", description: "Suggested change." },
      rationale: { type: "string", description: "Rationale." },
    },
  },
  legal_summary: {
    name: "Legal review summary",
    description: "Overall risk, must-fix, nice-to-have, next steps (negotiate, accept, escalate).",
    required: ["overall_risk", "must_fix", "next_steps"],
    properties: {
      overall_risk: { type: "string", description: "Overall risk assessment." },
      must_fix: { type: "array", items: { type: "string" }, description: "Must-fix items." },
      nice_to_have: { type: "array", items: { type: "string" }, description: "Nice-to-have changes." },
      next_steps: { type: "array", items: { type: "string" }, description: "Recommended next steps." },
    },
  },
  compliance_requirements: {
    name: "Compliance requirements",
    description: "Framework/standard, control ID, requirement text, scope.",
    required: ["framework", "control_id", "requirement"],
    properties: {
      framework: { type: "string", description: "Framework or standard." },
      control_id: { type: "string", description: "Control ID." },
      requirement: { type: "string", description: "Requirement text." },
      scope: { type: "string", description: "Scope." },
    },
  },
  control_mapping: {
    name: "Control mapping",
    description: "Requirement to existing controls: evidence type, owner, status.",
    required: ["requirement_ref", "control_name", "status"],
    properties: {
      requirement_ref: { type: "string", description: "Requirement reference." },
      control_name: { type: "string", description: "Existing control name." },
      evidence_type: { type: "string", description: "Evidence type." },
      owner: { type: "string", description: "Owner." },
      status: { type: "string", description: "In place, partial, missing." },
    },
  },
  gap_analysis: {
    name: "Gap analysis",
    description: "Requirement, gap description, risk if unaddressed, remediation.",
    required: ["requirement", "gap", "remediation"],
    properties: {
      requirement: { type: "string", description: "Requirement." },
      gap: { type: "string", description: "Gap description." },
      risk: { type: "string", description: "Risk if unaddressed." },
      remediation: { type: "string", description: "Recommended remediation." },
    },
  },
  compliance_action_plan: {
    name: "Compliance action plan",
    description: "Prioritized actions, owner, due date, evidence needed, dependencies.",
    required: ["action", "owner", "priority"],
    properties: {
      action: { type: "string", description: "Concrete action." },
      owner: { type: "string", description: "Owner." },
      priority: { type: "string", description: "Priority." },
      due_date: { type: "string", description: "Due date." },
      evidence_needed: { type: "string", description: "Evidence needed." },
      dependencies: { type: "array", items: { type: "string" }, description: "Dependencies on other controls." },
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
