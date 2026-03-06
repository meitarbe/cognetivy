# Workflow Templates Gallery

Cognetivy now includes practical workflow templates you can use as a starting point for common AI-assistant jobs.

## Why templates?

Templates help teams launch repeatable workflows quickly, without starting from a blank graph.

Each template includes:
- node structure (`input_collections` → `output_collections`)
- prompts oriented to real-world outcomes
- skill guardrails (`required_skills: ["cognetivy"]`)

## Browse templates

```bash
cognetivy workflow templates
```

This prints template metadata (id, name, category, use cases, node count).

## Export a template

```bash
cognetivy workflow template --id bug-triage-and-fix > workflow.template.json
```

Then save it as a new version for your chosen workflow:

```bash
cognetivy workflow set --workflow <your_workflow_id> --file workflow.template.json --name "bug triage baseline"
```

## Included templates

- `product-prd-to-release`
- `bug-triage-and-fix`
- `pr-review-assistant`
- `incident-response-postmortem`
- `customer-feedback-insights`
- `content-seo-pipeline`
- `sales-discovery-to-proposal`
- `research-literature-review`
- `meeting-to-action-plan`
- `docs-from-code-changes`
- `job-candidate-evaluation`

## Studio discoverability

In Studio’s **Workflow** page, a “Practical templates” strip shows template cards with category, node count, and use-case hints.
