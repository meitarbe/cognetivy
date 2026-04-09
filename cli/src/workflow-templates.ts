import { WorkflowNodeType, type WorkflowVersionRecord } from "./models.js";

export interface WorkflowRunInputField {
  type: string;
  description: string;
}

export interface WorkflowRunInputSchema {
  required?: string[];
  properties: Record<string, WorkflowRunInputField>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  use_cases: string[];
  run_input_schema: WorkflowRunInputSchema;
  workflow: Omit<WorkflowVersionRecord, "workflow_id" | "version_id" | "created_at">;
}

const SKILLS = ["cognetivy"];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ── Marketing ──────────────────────────────────────────────────────────────

  {
    id: "competitor-analysis",
    name: "Competitor analysis",
    category: "Marketing",
    description: "Build a living competitive intelligence layer - profile competitors, map features and positioning, then synthesize strategic implications.",
    use_cases: ["Competitive intelligence", "Market positioning", "Go-to-market strategy", "Product differentiation", "Quarterly strategy review"],
    run_input_schema: {
      required: ["competitors"],
      properties: {
        competitors: { type: "string", description: "Competitor names and/or domains to research (one per line)." },
        focus_areas: { type: "string", description: "Optional: specific areas to focus on - e.g. pricing, features, messaging." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "profile_competitors",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["competitor_profiles"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Research each competitor named in the run input. For each, extract: full name, core offering, target segment, pricing model, and 3–5 key differentiators. Use only verifiable sources; do not invent data. Output one structured record per competitor.",
        },
        {
          id: "feature_comparison",
          type: WorkflowNodeType.Prompt,
          input_collections: ["competitor_profiles"],
          output_collections: ["feature_matrix"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Build a detailed feature and capability comparison matrix across all competitors from the profiles. For each competitor, document specific capabilities, gaps relative to peers, and claimed differentiators with evidence. Structure output as one record per competitor–feature pair.",
        },
        {
          id: "positioning_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["competitor_profiles"],
          output_collections: ["positioning_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze each competitor's messaging, brand voice, and go-to-market narrative from the profiles. Identify where each player sits on key positioning axes (price vs. quality, segment breadth, maturity). Document tone, target persona language, and any positioning pivots.",
        },
        {
          id: "competitive_brief",
          type: WorkflowNodeType.Prompt,
          input_collections: ["feature_matrix", "positioning_data"],
          output_collections: ["competitive_brief"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Synthesize the feature matrix and positioning data into actionable competitive intelligence: identify white-space opportunities, areas of feature parity, key threats, and 3–5 strategic recommendations (positioning focus, feature priority, messaging angle).",
        },
      ],
    },
  },

  {
    id: "content-marketing-strategy",
    name: "Content marketing strategy",
    category: "Marketing",
    description: "Turn audience research into a prioritized editorial calendar - discover topics, map content gaps, and plan distribution.",
    use_cases: ["Editorial planning", "Content operations", "Demand generation", "SEO content strategy", "Campaign content"],
    run_input_schema: {
      required: ["audience", "product_or_brand"],
      properties: {
        audience: { type: "string", description: "Target audience - persona, role, and key pain points." },
        product_or_brand: { type: "string", description: "Your product or brand and its core value proposition." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "audience_research",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["audience_insights"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Research the target audience described in the run input: pain points, language patterns, content formats they consume, key questions they ask, and jobs-to-be-done. Output structured audience insight records, one per distinct pain point or need.",
        },
        {
          id: "topic_discovery",
          type: WorkflowNodeType.Prompt,
          input_collections: ["audience_insights"],
          output_collections: ["topic_clusters"],
          minimum_rows: 6,
          required_skills: SKILLS,
          prompt: "Discover high-value topic clusters aligned to the audience insights. For each cluster: name, search intent type (informational/commercial/transactional), funnel stage, competitive white-space signal, and 3–5 specific content angles. Output one record per cluster.",
        },
        {
          id: "content_gap_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["audience_insights"],
          output_collections: ["content_gaps"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Identify content gaps by comparing audience needs from the insights to common competitor content patterns. For each gap: describe the unmet need, estimate opportunity size, and suggest the content format best suited to fill it.",
        },
        {
          id: "editorial_calendar",
          type: WorkflowNodeType.Prompt,
          input_collections: ["topic_clusters", "content_gaps"],
          output_collections: ["editorial_plan"],
          minimum_rows: 12,
          required_skills: SKILLS,
          prompt: "Produce a prioritized 12-week editorial calendar. For each entry: week, topic, content angle, format (blog/video/guide/newsletter), primary CTA, target funnel stage, and the audience insight or gap that justifies it. Sequence entries to build topical authority progressively.",
        },
      ],
    },
  },

  {
    id: "bmad-development-workflow",
    name: "BMAD development workflow",
    category: "Engineering",
    description: "Run structured BMAD cycles - break down the problem, then map dependencies and analyze implementation paths in parallel before producing the development plan.",
    use_cases: ["Feature development", "Iterative dev cycles", "Architecture planning", "Sprint planning", "Agent-assisted development"],
    run_input_schema: {
      required: ["feature_description"],
      properties: {
        feature_description: { type: "string", description: "Feature or development task to build - describe the goal and scope." },
        codebase_context: { type: "string", description: "Optional: relevant tech stack, architecture context, or constraints." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "problem_breakdown",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["task_decomposition"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Break down the development problem from the run input into atomic, independently implementable tasks. For each task: scope description, acceptance criteria, integration boundaries, and identified unknowns. Flag tasks with unclear requirements that need clarification before development.",
        },
        {
          id: "dependency_mapping",
          type: WorkflowNodeType.Prompt,
          input_collections: ["task_decomposition"],
          output_collections: ["dependency_map"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Map task dependencies from the decomposition: which tasks must complete before others, which can run in parallel, and what external dependencies (APIs, services, team handoffs) exist. Identify the critical path and any bottlenecks. Output one record per dependency relationship.",
        },
        {
          id: "implementation_paths",
          type: WorkflowNodeType.Prompt,
          input_collections: ["task_decomposition"],
          output_collections: ["implementation_options"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze implementation approaches for the key task groups: architectural options, library or pattern choices, build vs. reuse decisions, and complexity trade-offs. For each option: approach description, pros, cons, risk surface, and recommended default. Output one record per decision point.",
        },
        {
          id: "development_plan",
          type: WorkflowNodeType.Prompt,
          input_collections: ["dependency_map", "implementation_options"],
          output_collections: ["dev_plan"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a structured development plan: ordered task sequence with parallelization opportunities, implementation decisions with rationale, testing strategy per phase, rollout sequencing, and key architectural decisions as an ADR overview. Highlight risk mitigations for highest-complexity tasks.",
        },
      ],
    },
  },

  {
    id: "seo-keyword-research",
    name: "SEO & keyword research",
    category: "Marketing",
    description: "Systematic keyword discovery and opportunity mapping - expand seed topics, classify intent, assess difficulty, and map to content priorities.",
    use_cases: ["SEO strategy", "Organic growth", "Content planning", "Keyword gap analysis", "SERP opportunity mapping"],
    run_input_schema: {
      required: ["seed_topics"],
      properties: {
        seed_topics: { type: "string", description: "Seed topics to expand - one per line." },
        target_audience: { type: "string", description: "Target audience and their goals or jobs-to-be-done." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "keyword_expansion",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["keyword_candidates"],
          minimum_rows: 10,
          required_skills: SKILLS,
          prompt: "Expand the seed topics from the run input into a broad keyword candidate list: head terms, long-tail variants, question-based queries (who/what/how/why), and comparison queries. For each keyword, note search intent type and funnel stage. Output one record per keyword.",
        },
        {
          id: "intent_classification",
          type: WorkflowNodeType.Prompt,
          input_collections: ["keyword_candidates"],
          output_collections: ["intent_groups"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Classify and cluster keyword candidates by search intent (informational, commercial, transactional, navigational). Group into named topic clusters. For each cluster: list member keywords, dominant intent, audience stage, and strategic fit rationale.",
        },
        {
          id: "serp_difficulty_signals",
          type: WorkflowNodeType.Prompt,
          input_collections: ["keyword_candidates"],
          output_collections: ["serp_signals"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "For each keyword candidate, assess SERP difficulty signals: typical ranking content types and formats, estimated competition density based on query specificity, and recommended content length and angle to be competitive. Flag quick-win opportunities.",
        },
        {
          id: "opportunity_map",
          type: WorkflowNodeType.Prompt,
          input_collections: ["intent_groups", "serp_signals"],
          output_collections: ["seo_opportunities"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Synthesize intent clusters and difficulty signals into a prioritized SEO opportunity map. For each opportunity: keyword cluster, recommended content angle, estimated effort, traffic potential tier, and priority ranking. Flag the top 5 quick-win and top 5 long-term opportunities.",
        },
      ],
    },
  },

  {
    id: "campaign-performance-reporting",
    name: "Campaign performance reporting",
    category: "Marketing",
    description: "Transform raw campaign metrics into an executive-ready report - normalize data, analyze performance, surface trends, and produce recommendations.",
    use_cases: ["Campaign reporting", "Marketing analytics", "Budget optimization", "Channel performance review", "Executive marketing update"],
    run_input_schema: {
      required: ["campaign_data"],
      properties: {
        campaign_data: { type: "string", description: "Paste campaign metrics - CSV, table, or brief metrics block (channels, impressions, clicks, conversions, spend)." },
        reporting_period: { type: "string", description: "Reporting period - e.g. 'Q1 2026' or 'Jan 1 – Mar 31 2026'." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "data_normalization",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["normalized_metrics"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Parse the campaign performance data from the run input. Normalize into a consistent schema per channel/campaign: name, period, impressions, clicks, CTR, conversions, conversion rate, spend, CPA, and ROAS. Flag any missing fields or data quality issues. Output one record per channel-period.",
        },
        {
          id: "performance_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["normalized_metrics"],
          output_collections: ["performance_insights"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze performance across channels and campaigns from the normalized metrics. Identify top performers and underperformers with specific data points. Calculate efficiency ratios. Flag any anomalies or unexpected patterns. Output one insight record per significant finding.",
        },
        {
          id: "trend_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["normalized_metrics"],
          output_collections: ["trend_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Calculate period-over-period trends from the normalized metrics: week/month deltas per channel, velocity changes in key metrics (CPA trend, conversion rate trajectory), and any seasonality or saturation signals. Output one trend record per channel-metric pair.",
        },
        {
          id: "report_generation",
          type: WorkflowNodeType.Prompt,
          input_collections: ["performance_insights", "trend_data"],
          output_collections: ["campaign_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce an executive-ready campaign performance report. Include: headline KPIs, channel-level breakdown with trend commentary, key wins and concerns, and 3–5 specific budget reallocation or optimization recommendations backed by the data.",
        },
      ],
    },
  },

  // ── Product Management ─────────────────────────────────────────────────────

  {
    id: "deep-product-research",
    name: "Deep product research",
    category: "Product Management",
    description: "Turn scattered research inputs into a structured product research brief - gather sources, extract user signals and market landscape in parallel, then synthesize.",
    use_cases: ["Product discovery", "Feature prioritization", "Market validation", "Roadmap research", "Opportunity assessment"],
    run_input_schema: {
      required: ["research_topic"],
      properties: {
        research_topic: { type: "string", description: "Product area or problem to research." },
        context: { type: "string", description: "Optional: prior research, relevant sources, or specific questions to answer." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "source_collection",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["research_sources"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Gather and structure research sources relevant to the product topic from the run input. For each source: title, type (article/report/forum/review), key claims, publication date, and relevance to the research question. Flag sources with strong user evidence vs. analyst opinion.",
        },
        {
          id: "user_signals_research",
          type: WorkflowNodeType.Prompt,
          input_collections: ["research_sources"],
          output_collections: ["user_signal_data"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Extract and synthesize user signals from the research sources: unmet needs, workarounds users employ, pain point frequency and severity, and persona-specific patterns. Group by theme. Output one record per distinct user signal.",
        },
        {
          id: "market_landscape_research",
          type: WorkflowNodeType.Prompt,
          input_collections: ["research_sources"],
          output_collections: ["market_landscape_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Map the market landscape from the research sources: existing solutions and their limitations, category dynamics, emerging trends, and analyst commentary. Identify white-space areas and competitive saturation signals. Output one record per market dimension.",
        },
        {
          id: "research_synthesis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["user_signal_data", "market_landscape_data"],
          output_collections: ["research_brief"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Synthesize user signals and market landscape into a structured product research brief: problem statement with evidence, opportunity size signals, top 5 insights, identified gaps in current research, and prioritized next research questions.",
        },
      ],
    },
  },

  {
    id: "user-research-synthesis",
    name: "User research & synthesis",
    category: "Product Management",
    description: "Transform raw qualitative feedback into prioritized themes and product insights - normalize, cluster themes and sentiment in parallel, then produce an insights report.",
    use_cases: ["VOC analysis", "Interview synthesis", "Survey analysis", "Feedback triage", "Churn signal detection"],
    run_input_schema: {
      required: ["raw_feedback"],
      properties: {
        raw_feedback: { type: "string", description: "Paste raw user feedback - interview transcripts, survey responses, support tickets, or reviews." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "feedback_normalization",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["feedback_items"],
          minimum_rows: 8,
          required_skills: SKILLS,
          prompt: "Parse the raw user feedback from the run input (transcripts, survey responses, support tickets, or review text) into structured feedback items. For each item: persona (if inferable), pain point or need, context, sentiment (positive/neutral/negative), and urgency signal. Output one record per distinct feedback item.",
        },
        {
          id: "theme_clustering",
          type: WorkflowNodeType.Prompt,
          input_collections: ["feedback_items"],
          output_collections: ["themes"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Cluster the feedback items into recurring themes by pain point similarity. For each theme: theme name, frequency count, representative quotes (2–3), affected personas, and severity signal. Order themes by frequency descending.",
        },
        {
          id: "sentiment_and_severity",
          type: WorkflowNodeType.Prompt,
          input_collections: ["feedback_items"],
          output_collections: ["sentiment_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze sentiment distribution and severity scoring across the feedback items. Identify the most emotionally resonant pain points, highest-urgency signals, and any delight moments. Flag items with churn risk language or strong expansion intent.",
        },
        {
          id: "insights_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["themes", "sentiment_data"],
          output_collections: ["insights_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a prioritized user research insights report: top 5 themes with evidence and severity weighting, sentiment breakdown, churn and expansion signals, recommended product actions per theme, and open questions for follow-up research.",
        },
      ],
    },
  },

  {
    id: "prd-spec-writing",
    name: "PRD & spec writing",
    category: "Product Management",
    description: "Go from a feature idea to a complete PRD - extract requirements, then draft user stories and technical constraints in parallel before assembling the final document.",
    use_cases: ["Feature specification", "MVP scoping", "Cross-functional handoff", "Stakeholder alignment", "Engineering brief"],
    run_input_schema: {
      required: ["feature_idea", "user_context"],
      properties: {
        feature_idea: { type: "string", description: "Feature idea or problem to solve - describe the goal and why it matters." },
        user_context: { type: "string", description: "Target users and their goals - who is this for and what are they trying to accomplish." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "requirements_extraction",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["requirements"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Extract and structure product requirements from the run input: goals, user personas, core use cases, success metrics, constraints, and explicit non-goals. Flag ambiguous requirements that need clarification. Output one record per requirement.",
        },
        {
          id: "user_stories",
          type: WorkflowNodeType.Prompt,
          input_collections: ["requirements"],
          output_collections: ["user_stories"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Write user stories for each requirement: 'As a [persona], I want [goal] so that [benefit].' Include acceptance criteria (3–5 testable conditions per story). Flag stories with unclear acceptance criteria or dependency conflicts.",
        },
        {
          id: "technical_constraints",
          type: WorkflowNodeType.Prompt,
          input_collections: ["requirements"],
          output_collections: ["tech_constraints"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Identify technical constraints, integration dependencies, edge cases, and implementation risks from the requirements. For each constraint: description, impact on scope, and whether it's a hard constraint or soft preference. Note assumptions that need engineering validation.",
        },
        {
          id: "prd_draft",
          type: WorkflowNodeType.Prompt,
          input_collections: ["user_stories", "tech_constraints"],
          output_collections: ["prd_document"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Assemble a complete PRD draft with these sections: Overview and problem statement, Goals and success metrics, User stories with acceptance criteria, Technical constraints and risks, Non-goals, Open questions. Use clear, unambiguous language. Each requirement must be testable.",
        },
      ],
    },
  },

  {
    id: "market-sizing-tam",
    name: "Market sizing & TAM analysis",
    category: "Product Management",
    description: "Build a rigorous, source-backed market sizing model - collect data, then apply top-down and bottom-up methodologies in parallel before triangulating.",
    use_cases: ["TAM/SAM/SOM analysis", "Investor materials", "Business case", "Market validation", "Expansion planning"],
    run_input_schema: {
      required: ["market_definition"],
      properties: {
        market_definition: { type: "string", description: "Market to size - product category, target segment, and scope." },
        geography: { type: "string", description: "Target geography - e.g. North America, Global, UK." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "market_data_collection",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["market_data"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Research and collect market sizing data points relevant to the market defined in the run input: industry reports, analyst estimates, proxy metrics, public company revenue figures, and benchmark comparables. For each data point: value, source, date, and confidence tier (high/medium/low).",
        },
        {
          id: "top_down_sizing",
          type: WorkflowNodeType.Prompt,
          input_collections: ["market_data"],
          output_collections: ["top_down_estimate"],
          minimum_rows: 12,
          required_skills: SKILLS,
          prompt: "Apply top-down TAM sizing using the collected market data: start from total addressable universe (industry size, geography), apply segmentation filters to reach SAM, then apply realistic capture rate to reach SOM. Show each calculation step with the data point used. Flag key assumptions.",
        },
        {
          id: "bottom_up_sizing",
          type: WorkflowNodeType.Prompt,
          input_collections: ["market_data"],
          output_collections: ["bottom_up_estimate"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Apply bottom-up TAM sizing using the collected market data: estimate total buyer count, segment by size/behavior, apply average revenue per buyer and realistic win rates. Build the model from unit economics upward. Document each assumption and its data source. Show base, bear, and bull scenarios.",
        },
        {
          id: "market_sizing_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["top_down_estimate", "bottom_up_estimate"],
          output_collections: ["market_sizing_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Triangulate top-down and bottom-up estimates into a final market sizing model. Present TAM/SAM/SOM as ranges with base/bear/bull scenarios. Summarize key assumptions, confidence levels, data quality caveats, and a defensible narrative suitable for investors or internal stakeholders.",
        },
      ],
    },
  },

  // ── Engineering ────────────────────────────────────────────────────────────

  {
    id: "code-review-documentation",
    name: "Code review & documentation",
    category: "Engineering",
    description: "Structured code review with quality and security lenses in parallel - summarize changes, then scan for quality issues and security risks before composing the final report.",
    use_cases: ["Pull request review", "Release gate", "Code quality", "Security review", "Documentation coverage"],
    run_input_schema: {
      required: ["code_changes"],
      properties: {
        code_changes: { type: "string", description: "Paste the code diff or describe the changes - include file names and what was added, changed, or removed." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "change_overview",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["change_analysis"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Parse the code changes from the run input and produce one record per changed module or component: what changed, intent (if stated), change type (feature/fix/refactor/infrastructure), potential blast radius, and areas that require deeper scrutiny.",
        },
        {
          id: "quality_findings",
          type: WorkflowNodeType.Prompt,
          input_collections: ["change_analysis"],
          output_collections: ["quality_issues"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Review code quality across the changed areas: correctness and edge case coverage, readability and naming clarity, performance hotspots, error handling completeness, test coverage adequacy, and adherence to standard patterns. For each finding: component, issue description, severity (blocking/non-blocking), and suggested fix.",
        },
        {
          id: "security_risk_scan",
          type: WorkflowNodeType.Prompt,
          input_collections: ["change_analysis"],
          output_collections: ["security_findings"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Scan the code changes for security issues: injection vectors (SQL, command, XSS), authentication and authorization gaps, data exposure risks, unsafe deserialization, sensitive data in logs or responses, and dependency-related risks. For each finding: location, issue description, severity, and remediation guidance.",
        },
        {
          id: "review_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["quality_issues", "security_findings"],
          output_collections: ["review_output"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Compose the final code review report: approve/request-changes recommendation, blocking quality issues, blocking security findings, non-blocking suggestions, and documentation coverage gaps. Organize by priority. Include merge readiness criteria with any conditions that must be met.",
        },
      ],
    },
  },

  {
    id: "technical-architecture-research",
    name: "Technical architecture research",
    category: "Engineering",
    description: "Research and compare architectural options - identify candidates, then evaluate technical fit and ecosystem risk in parallel before producing the ADR.",
    use_cases: ["Architecture decision records", "Technology selection", "Platform evaluation", "Infrastructure planning", "System design"],
    run_input_schema: {
      required: ["decision_question"],
      properties: {
        decision_question: { type: "string", description: "The architectural decision to make - describe the problem and what you need to choose between." },
        constraints: { type: "string", description: "Technical constraints, team context, scale requirements, or non-negotiables." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "options_identification",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["architecture_options"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Define the architectural decision question from the run input and identify candidate options. For each option: name, brief description, primary use cases it suits, and known trade-offs. Ensure options span the realistic solution space - do not pre-filter based on apparent preference.",
        },
        {
          id: "technical_evaluation",
          type: WorkflowNodeType.Prompt,
          input_collections: ["architecture_options"],
          output_collections: ["technical_scores"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Evaluate each architectural option on technical dimensions: performance characteristics, scalability ceiling, maintainability, testability, migration complexity from current state, and developer ergonomics. Score each dimension (1–5) with a brief evidence rationale. Cite documentation or benchmarks where possible.",
        },
        {
          id: "ecosystem_risk_assessment",
          type: WorkflowNodeType.Prompt,
          input_collections: ["architecture_options"],
          output_collections: ["risk_scores"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Assess ecosystem and operational risk for each option: community health and adoption trends, vendor or project stability, operational complexity at scale, team familiarity gap, long-term support trajectory, and known production failure modes. Score each risk dimension (1–5) with rationale.",
        },
        {
          id: "architecture_decision_record",
          type: WorkflowNodeType.Prompt,
          input_collections: ["technical_scores", "risk_scores"],
          output_collections: ["adr_document"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a structured Architecture Decision Record: decision context and constraints, options considered with evaluation scores, final recommendation with rationale, rejected options with reasons, consequences and trade-offs of the chosen approach, and open questions requiring follow-up.",
        },
      ],
    },
  },

  {
    id: "api-integration-research",
    name: "API & integration research",
    category: "Engineering",
    description: "Systematically evaluate a third-party API - scan documentation, then assess capabilities and integration risk in parallel before producing the integration brief.",
    use_cases: ["API evaluation", "Third-party integration planning", "Vendor assessment", "SDK selection", "Integration risk review"],
    run_input_schema: {
      required: ["api_name", "api_documentation"],
      properties: {
        api_name: { type: "string", description: "Name of the API or service to evaluate." },
        api_documentation: { type: "string", description: "Paste key excerpts from the API documentation, spec, or changelog." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "documentation_scan",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["api_specs"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Systematically read and structure the API documentation from the run input: available endpoints, authentication methods, rate limits, request/response data models, pagination patterns, webhook support, and SDK availability. Note documentation completeness gaps and any ambiguities.",
        },
        {
          id: "capability_assessment",
          type: WorkflowNodeType.Prompt,
          input_collections: ["api_specs"],
          output_collections: ["capabilities"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Evaluate API capabilities against typical integration requirements from the specs: feature coverage for the stated use case, data access granularity, real-time vs. polling patterns, error response consistency, and extensibility. Flag gaps between what is needed and what is available.",
        },
        {
          id: "risk_and_reliability",
          type: WorkflowNodeType.Prompt,
          input_collections: ["api_specs"],
          output_collections: ["integration_risks"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Assess integration risks from the API specs: vendor stability signals, breaking change history in changelogs, SLA claims vs. community reports, API design quality (versioning, backwards compatibility), authentication security posture, and data portability/exit risks.",
        },
        {
          id: "integration_brief",
          type: WorkflowNodeType.Prompt,
          input_collections: ["capabilities", "integration_risks"],
          output_collections: ["integration_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce an integration evaluation report: capability fit overview, risk assessment with severity ratings, recommended implementation approach, authentication strategy, error handling and retry patterns, rate limit management approach, and a go/no-go recommendation with conditions.",
        },
      ],
    },
  },

  // ── Business & Strategy ────────────────────────────────────────────────────

  {
    id: "investor-funding-research",
    name: "Investor & funding research",
    category: "Business & Strategy",
    description: "Build a targeted investor pipeline - profile investors, then analyze portfolio thesis and score fit in parallel before generating personalized outreach briefs.",
    use_cases: ["Fundraising research", "Investor targeting", "Pitch preparation", "Series A/B/C prep", "Angel investor outreach"],
    run_input_schema: {
      required: ["investors", "funding_stage"],
      properties: {
        investors: { type: "string", description: "Investor names or firms to research - one per line." },
        funding_stage: { type: "string", description: "Your current funding stage and company brief - e.g. Seed, Series A, B2B SaaS, $1M ARR." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "investor_profiling",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["investor_profiles"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Research each target investor from the run input. For each: fund name, fund size (if public), investment stage focus, sector preferences, geography, typical check size range, and recent portfolio activity (last 12–18 months). Use only verifiable sources. Output one record per investor.",
        },
        {
          id: "portfolio_thesis_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["investor_profiles"],
          output_collections: ["portfolio_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze each investor's portfolio composition and thesis signals from their profiles: recurring sector and business model patterns, stage progression of notable portfolio companies, complementary vs. competitive portfolio companies, and implied preferences based on investment history.",
        },
        {
          id: "fit_scoring",
          type: WorkflowNodeType.Prompt,
          input_collections: ["investor_profiles"],
          output_collections: ["fit_scores"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Score each investor for fit with the company described in the run input: thesis alignment (1–5), portfolio adjacency (1–5), stage preference match (1–5), competitive conflict risk (inverse). Provide a composite fit score, confidence level, and 2–3 sentence rationale per investor.",
        },
        {
          id: "outreach_briefs",
          type: WorkflowNodeType.Prompt,
          input_collections: ["portfolio_data", "fit_scores"],
          output_collections: ["investor_briefs"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Produce a prioritized outreach brief per investor (starting with highest fit score): why they are a strong fit, 2–3 specific portfolio connection points, suggested personalization angle for the intro, and recommended outreach approach (warm intro vs. cold). Include any potential concerns to proactively address.",
        },
      ],
    },
  },

  {
    id: "sales-intelligence-lead-research",
    name: "Sales intelligence & lead research",
    category: "Business & Strategy",
    description: "Build deep account intelligence before outreach - profile accounts, then extract pain signals and qualify fit in parallel before generating sales briefs.",
    use_cases: ["Account-based sales", "Lead qualification", "Outreach personalization", "Deal strategy", "Sales prospecting"],
    run_input_schema: {
      required: ["target_accounts", "icp_criteria"],
      properties: {
        target_accounts: { type: "string", description: "Target account names to research - one per line." },
        icp_criteria: { type: "string", description: "Ideal customer profile - industry, company size, tech signals, and what pain you solve." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "account_research",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["account_profiles"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Research each target account from the run input: company overview, estimated revenue and headcount, core business model, technology stack signals (if inferable), key decision-maker roles, and recent company news or announced initiatives. Output one structured record per account.",
        },
        {
          id: "pain_signal_extraction",
          type: WorkflowNodeType.Prompt,
          input_collections: ["account_profiles"],
          output_collections: ["pain_signals"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Extract buying and pain signals from the account profiles: hiring patterns that suggest investment areas, announced technology migrations, expansion into new markets or segments, executive-level public statements about priorities, and any explicit problem mentions. Output one record per signal.",
        },
        {
          id: "fit_qualification",
          type: WorkflowNodeType.Prompt,
          input_collections: ["account_profiles"],
          output_collections: ["qualification_scores"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Score each account against ICP fit criteria from the run input: company size and segment match, industry and use case alignment, technology compatibility signals, timing signals (urgency, budget cycle), and estimated deal potential. Output a composite ICP score with rationale per account.",
        },
        {
          id: "sales_briefs",
          type: WorkflowNodeType.Prompt,
          input_collections: ["pain_signals", "qualification_scores"],
          output_collections: ["sales_briefs"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Produce a structured outreach brief per account (prioritized by ICP score): key pain signals that map to the offering, why now (specific trigger events), relevant use case alignment, suggested opening angle and personalization points, and any objections to anticipate.",
        },
      ],
    },
  },

  {
    id: "market-entry-research",
    name: "Market entry research",
    category: "Business & Strategy",
    description: "Validate a new market before committing - research market dynamics, then map competition and assess regulatory risk in parallel before producing the entry recommendation.",
    use_cases: ["Geographic expansion", "New segment entry", "Market validation", "Internationalization", "Business development"],
    run_input_schema: {
      required: ["target_market", "product_or_service"],
      properties: {
        target_market: { type: "string", description: "Target geography and market segment to enter." },
        product_or_service: { type: "string", description: "Product or service you are considering bringing to this market." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "market_landscape",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["market_data"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Research the target market from the run input: market size and growth trajectory, buyer segments and their characteristics, distribution channel dynamics, key success factors for market entrants, and macro trends affecting the space. Cite all data sources and note confidence levels.",
        },
        {
          id: "competitive_landscape",
          type: WorkflowNodeType.Prompt,
          input_collections: ["market_data"],
          output_collections: ["local_competitors"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Map the competitive landscape in the target market from the market data: local incumbents and global entrants, their positioning and pricing, estimated market share signals, and degree of overlap with the proposed offering. Score each competitor's defensive moat.",
        },
        {
          id: "regulatory_and_risk",
          type: WorkflowNodeType.Prompt,
          input_collections: ["market_data"],
          output_collections: ["market_risks"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Assess market entry risks from the market data: regulatory barriers and compliance requirements, cultural or localization requirements, required local partnerships, capital intensity and payback period signals, and macroeconomic or political risks. Rate each risk (critical/high/medium/low).",
        },
        {
          id: "entry_recommendation",
          type: WorkflowNodeType.Prompt,
          input_collections: ["local_competitors", "market_risks"],
          output_collections: ["market_entry_brief"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a market entry brief: opportunity assessment (market size, growth, whitespace), competitive gap analysis, prioritized risks with mitigation strategies, recommended GTM approach (direct/partnership/acquisition), sequencing recommendation, and top 5 open questions requiring primary research.",
        },
      ],
    },
  },

  {
    id: "legal-compliance-research",
    name: "Legal & compliance research",
    category: "Business & Strategy",
    description: "Build a structured compliance research base - research obligations, then map controls and identify gaps in parallel before generating the compliance action plan.",
    use_cases: ["Regulatory compliance", "GDPR/CCPA readiness", "SOC 2 prep", "Audit preparation", "New market legal diligence"],
    run_input_schema: {
      required: ["regulatory_framework", "jurisdiction_and_scope"],
      properties: {
        regulatory_framework: { type: "string", description: "Regulatory framework or standard - e.g. GDPR, SOC 2, HIPAA, PCI-DSS." },
        jurisdiction_and_scope: { type: "string", description: "Jurisdiction and product or business scope this compliance applies to." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "obligation_research",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["compliance_obligations"],
          minimum_rows: 6,
          required_skills: SKILLS,
          prompt: "Research and structure compliance obligations for the regulatory framework, jurisdiction, and product scope from the run input. For each obligation: requirement text, control category, enforcement precedents, applicable scope, and source citation. Flag the highest-risk obligations.",
        },
        {
          id: "control_mapping",
          type: WorkflowNodeType.Prompt,
          input_collections: ["compliance_obligations"],
          output_collections: ["current_controls"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Map each compliance obligation to existing or typical controls: control name, implementation status (in place / partial / missing), evidence type required for audit, and responsible owner function. For partial or missing controls, note the specific gap.",
        },
        {
          id: "gap_identification",
          type: WorkflowNodeType.Prompt,
          input_collections: ["compliance_obligations"],
          output_collections: ["compliance_gaps"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Identify compliance gaps: obligations that are unmet or only partially met, risk level if gap remains unaddressed (critical/high/medium/low), estimated remediation complexity, and recommended remediation approach. Order gaps by risk level descending.",
        },
        {
          id: "compliance_brief",
          type: WorkflowNodeType.Prompt,
          input_collections: ["current_controls", "compliance_gaps"],
          output_collections: ["compliance_brief"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a compliance action plan: full obligation inventory with control status matrix, prioritized remediation actions with owner roles, recommended due dates, evidence artifacts needed per obligation, and a readiness score with key blockers. Format for use as an audit preparation document.",
        },
      ],
    },
  },

  // ── Research ───────────────────────────────────────────────────────────────

  {
    id: "academic-deep-research",
    name: "Academic deep research",
    category: "Research",
    description: "Conduct systematic literature reviews - collect and screen papers, then extract findings and assess methodology in parallel before synthesizing the review.",
    use_cases: ["Literature review", "Systematic review", "Research synthesis", "Evidence mapping", "Academic paper preparation"],
    run_input_schema: {
      required: ["research_question"],
      properties: {
        research_question: { type: "string", description: "Primary research question or hypothesis to investigate." },
        topic_scope: { type: "string", description: "Topic scope, relevant disciplines, and date range for literature - e.g. 2015–2025, cognitive psychology." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "literature_collection",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["papers"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Gather and screen literature relevant to the research question from the run input. Apply inclusion/exclusion criteria. For each qualifying source: title, authors, year, publication venue, methodology type, sample size or scope, and a concise abstract excerpt (≤400 chars). Flag papers with high citation counts or landmark status.",
        },
        {
          id: "findings_extraction",
          type: WorkflowNodeType.Prompt,
          input_collections: ["papers"],
          output_collections: ["extracted_findings"],
          minimum_rows: 12,
          required_skills: SKILLS,
          prompt: "Extract key findings from each paper: primary claims and conclusions, effect sizes or quantitative results where available, data quality indicators, and thematic tags. For each finding, note the paper it came from and the confidence level based on study design.",
        },
        {
          id: "methodology_assessment",
          type: WorkflowNodeType.Prompt,
          input_collections: ["papers"],
          output_collections: ["methodology_quality"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Assess methodology quality for each paper: research design (RCT, observational, qualitative, etc.), sample validity and generalizability, potential biases and confounders, replication status, and evidence strength tier (strong/moderate/weak/very weak). Note key limitations and caveats per paper.",
        },
        {
          id: "literature_synthesis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["extracted_findings", "methodology_quality"],
          output_collections: ["literature_review_out"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Synthesize findings and methodology quality into a structured literature review: consensus findings by theme (with evidence strength), areas of significant disagreement, methodological limitations of the body of evidence, identified research gaps, and recommendations for future research priorities.",
        },
      ],
    },
  },

  {
    id: "financial-analysis-due-diligence",
    name: "Financial analysis & due diligence",
    category: "Research",
    description: "Structured financial diligence with full source traceability - ingest statements, then run ratio analysis and trend/risk analysis in parallel before producing the report.",
    use_cases: ["Investment due diligence", "Company financial review", "M&A analysis", "Credit analysis", "Comparative company analysis"],
    run_input_schema: {
      required: ["company_name", "financial_data"],
      properties: {
        company_name: { type: "string", description: "Company name(s) to analyze." },
        financial_data: { type: "string", description: "Paste financial statements, earnings release, or key metrics - include multiple periods where possible." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "financial_data_ingestion",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["financial_statements"],
          minimum_rows: 4,
          required_skills: SKILLS,
          prompt: "Parse and structure financial data from the run input (statements, earnings releases, or financial summaries). Extract by period: revenue, gross profit, operating income, EBITDA, net income, cash and equivalents, total debt, free cash flow, and capex. Flag missing periods or restatements.",
        },
        {
          id: "ratio_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["financial_statements"],
          output_collections: ["financial_ratios"],
          minimum_rows: 12,
          required_skills: SKILLS,
          prompt: "Calculate standard financial ratios from the structured data: profitability (gross margin, EBITDA margin, net margin, ROIC), liquidity (current ratio, quick ratio, cash ratio), leverage (debt/equity, net debt/EBITDA, interest coverage), and efficiency (asset turnover, receivables days). Show calculations and flag outliers.",
        },
        {
          id: "trend_and_risk_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["financial_statements"],
          output_collections: ["trend_risk_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze multi-period trends from the financial data: revenue CAGR and growth acceleration/deceleration, margin trajectory, cash generation quality (operating cash flow vs. EBITDA), working capital dynamics, and capex intensity changes. Flag risk signals: deteriorating margins, rising leverage, or unusual accruals.",
        },
        {
          id: "diligence_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["financial_ratios", "trend_risk_data"],
          output_collections: ["financial_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a structured financial due diligence report: executive overview with key findings, financial performance overview by period, ratio analysis with peer benchmarks where possible, trend narrative, material risks and red flags, and investment or decision considerations with supporting data.",
        },
      ],
    },
  },

  // ── Finance ────────────────────────────────────────────────────────────────

  {
    id: "stock-fundamentals-analysis",
    name: "Stock fundamentals analysis",
    category: "Finance",
    description: "Evaluate a stock on fundamentals - profile the business, then analyze financial metrics and quality/risk factors in parallel before producing the investment thesis.",
    use_cases: ["Equity research", "Long-term investment evaluation", "Buy/sell/hold analysis", "Portfolio stock review", "Fundamental stock screening"],
    run_input_schema: {
      required: ["ticker"],
      properties: {
        ticker: { type: "string", description: "Stock ticker symbol(s) to analyze - e.g. AAPL, MSFT, NVDA." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "company_overview",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["company_data"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Research the company for the ticker(s) in the run input: business model description, primary revenue segments and their relative sizes, competitive positioning and market share context, management tenure and capital allocation track record, and sector/industry dynamics. Cite verifiable sources.",
        },
        {
          id: "financial_metrics",
          type: WorkflowNodeType.Prompt,
          input_collections: ["company_data"],
          output_collections: ["financial_data"],
          minimum_rows: 12,
          required_skills: SKILLS,
          prompt: "Extract and structure financial fundamentals from the company data: revenue and earnings growth rates (3Y, 5Y), gross margin and EBITDA margin with trend, free cash flow yield, balance sheet strength (net debt/EBITDA, interest coverage), and key valuation multiples (P/E, EV/EBITDA, P/S, P/FCF). Note metric trends.",
        },
        {
          id: "quality_and_risk_factors",
          type: WorkflowNodeType.Prompt,
          input_collections: ["company_data"],
          output_collections: ["risk_factors"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Assess company quality and risk from the company data: business model durability and recurring revenue characteristics, competitive moat evidence (pricing power, switching costs, network effects, scale advantages), customer concentration risk, regulatory and litigation exposure, and key balance sheet risks.",
        },
        {
          id: "fundamental_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["financial_data", "risk_factors"],
          output_collections: ["fundamental_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a structured fundamental analysis report: business overview and competitive positioning, key financial metrics with trend context, moat assessment with evidence, material risks with severity ratings, valuation snapshot (current multiples vs. historical ranges and peers), and a balanced investment thesis with key bull and bear scenarios.",
        },
      ],
    },
  },

  {
    id: "stock-technical-analysis",
    name: "Stock technical analysis",
    category: "Finance",
    description: "Analyze a stock technically - summarize price and volume data, then examine trend indicators and momentum signals in parallel before composing the technical report.",
    use_cases: ["Trading setup analysis", "Entry/exit timing", "Technical chart review", "Swing trade research", "Momentum analysis"],
    run_input_schema: {
      required: ["ticker", "price_data"],
      properties: {
        ticker: { type: "string", description: "Stock ticker symbol to analyze." },
        price_data: { type: "string", description: "Paste recent OHLCV data or describe the chart - include date range, key price levels, and notable volume events." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "price_data_snapshot",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["price_data"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Structure the price and volume data from the run input into one record per key technical element: (1) price overview - current price, 52-week range, ATH/ATL; (2) moving averages - 20/50/200 MA levels and price position relative to each; (3) volume profile - average daily volume and recent volume patterns; (4) key support levels with price and basis; (5) key resistance levels with price and basis. Add additional records for major gap zones or other notable price levels.",
        },
        {
          id: "trend_indicator_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["price_data"],
          output_collections: ["trend_signals"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Analyze trend indicators from the price data: moving average alignment (20/50/200 MA relative positions and slopes), price position relative to each MA, trend structure (higher highs/higher lows or opposite), ADX-style trend strength inference from price action, and any MA crossover events. Rate trend direction and strength.",
        },
        {
          id: "momentum_volume_analysis",
          type: WorkflowNodeType.Prompt,
          input_collections: ["price_data"],
          output_collections: ["momentum_signals"],
          minimum_rows: 3,
          required_skills: SKILLS,
          prompt: "Analyze momentum and volume signals from the price data: RSI level and any divergences vs. price, MACD line relative to signal and zero line, volume on up days vs. down days (accumulation/distribution), relative strength vs. sector or index, and any notable volume climax events.",
        },
        {
          id: "technical_report",
          type: WorkflowNodeType.Prompt,
          input_collections: ["trend_signals", "momentum_signals"],
          output_collections: ["technical_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a structured technical analysis report: trend readout (direction, strength, stage), momentum posture (overbought/oversold, divergences), key price levels to watch (support, resistance, breakout triggers), potential setup scenarios (continuation or reversal), and a risk/reward framing with suggested stop and target zones.",
        },
      ],
    },
  },

  {
    id: "stock-screener-discovery",
    name: "Stock screener & discovery",
    category: "Finance",
    description: "Discover investment candidates systematically - define the universe, then screen on fundamentals and technicals in parallel before ranking and reporting results.",
    use_cases: ["Stock screening", "Investment idea generation", "Sector rotation research", "Thematic investing", "Watch list building"],
    run_input_schema: {
      required: ["screening_criteria"],
      properties: {
        screening_criteria: { type: "string", description: "Screening criteria - sector or theme, market cap range, and key fundamental or technical filters (e.g. profitable growth, strong relative strength)." },
      },
    },
    workflow: {
      nodes: [
        {
          id: "universe_definition",
          type: WorkflowNodeType.Prompt,
          input_collections: ["run_input"],
          output_collections: ["stock_universe"],
          minimum_rows: 15,
          required_skills: SKILLS,
          prompt: "Define the stock screening universe from the criteria in the run input: sector or industry filters, market cap range, geographic scope, and any thematic filters (e.g., AI infrastructure, healthcare innovation). List 15–30 candidate stocks that plausibly match the universe definition with brief one-line descriptions.",
        },
        {
          id: "fundamental_screening",
          type: WorkflowNodeType.Prompt,
          input_collections: ["stock_universe"],
          output_collections: ["fundamental_candidates"],
          minimum_rows: 15,
          required_skills: SKILLS,
          prompt: "Screen each stock in the universe on fundamental criteria: revenue growth rate, profitability trajectory, balance sheet quality, valuation relative to peers and history, and earnings quality signals. Score each candidate (1–10) with a brief rationale. Flag top 5 fundamental standouts.",
        },
        {
          id: "technical_screening",
          type: WorkflowNodeType.Prompt,
          input_collections: ["stock_universe"],
          output_collections: ["technical_candidates"],
          minimum_rows: 5,
          required_skills: SKILLS,
          prompt: "Screen each stock in the universe on technical criteria: primary trend posture (uptrend/downtrend/range), momentum signal (positive/neutral/negative), relative strength vs. the relevant benchmark over the past 3 months, and any notable setup patterns. Score each candidate (1–10) with rationale. Flag top 5 technical standouts.",
        },
        {
          id: "screener_results",
          type: WorkflowNodeType.Prompt,
          input_collections: ["fundamental_candidates", "technical_candidates"],
          output_collections: ["screener_report"],
          minimum_rows: 1,
          required_skills: SKILLS,
          prompt: "Produce a ranked screener results report: composite score (fundamental + technical) for each candidate, top 10 ranked stocks with rationale, highest-conviction names (strong on both dimensions), watch list candidates (strong on one dimension), and suggested criteria for entry (fundamental catalyst or technical trigger) for the top picks.",
        },
      ],
    },
  },
];

const TEMPLATE_CATEGORY_ORDER = [
  "Marketing",
  "Product Management",
  "Engineering",
  "Business & Strategy",
  "Research",
  "Finance",
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
  const categoryRank = new Map(TEMPLATE_CATEGORY_ORDER.map((c, i) => [c, i]));
  const sorted = listWorkflowTemplates().sort((a, b) => {
    const ra = categoryRank.get(a.category) ?? 999;
    const rb = categoryRank.get(b.category) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  return sorted;
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
