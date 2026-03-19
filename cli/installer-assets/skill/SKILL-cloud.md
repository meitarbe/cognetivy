---
name: cognetivy
description: Manage workflows, runs, and collections on Cognetivy Cloud. Use when the user asks to start/complete a run, execute workflow nodes, or read/write structured data. No local .cognetivy/ folder; use --cloud on CLI commands. Sign in with cognetivy login first.
---

# Cognetivy (Cloud)

Workflows, runs, and collections on **Cognetivy Cloud**. Run commands with `--cloud` (or rely on default when authenticated). Full reference: [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections" in a cloud context.

---

## Quick start (cloud run)

1. **Sign in:** `cognetivy login` (once per machine).
2. **Start:** `cognetivy run start --workflow <workflow_id> --input <path>|--input-inline '{"key":"value"}' --name "Short name" --cloud`
3. **Step:** `cognetivy run step --run <run_id> [--node <id>] [--collection-kind <kind>] --cloud` (payload via --collection-file or stdin).
4. **Complete:** `cognetivy run complete --run <run_id> --cloud` (only after `run_completed` event).

Every response includes `COGNETIVY_NEXT_STEP`; follow the hint. Use `workflow get --workflow <id> --cloud` to load the workflow.

Resume/stop-continue rule: if the response includes `current_node_id` (or `current_node_ids`), you are resuming in-progress node(s). You must only follow `next_step.action === "complete_node"` and complete `next_step.node_id` (matching `current_node_id` when single).

Node completion output rule: when completing a node that has an output kind, you must provide output using `--collection-kind <next_step.collection_kind>` (or the single element of `next_step.output_collections`) and it must match exactly. Never complete a node with the wrong output kind.

Parallel nodes: spawn one sub-agent per node when `next_step.action === "run_nodes_parallel"`.

End-of-run (reflection + versioning): when `next_step.action === "complete_run"`, reflect on issues/gaps + suggest next workflow changes. If the user requests changes, create a new workflow version and set it current (use `cognetivy workflow set --file <path> --cloud --workflow <workflow_id>`), then start a new run with the updated workflow.

---

## Workflow (cloud)

`workflow list --cloud`, `workflow get --workflow <id> --cloud`, `workflow create --cloud`, `workflow set --file <path> --cloud` (updates by creating a new version for the selected workflow; do not use workflow create for updates—if the workflow has no versions yet, workflow set creates the first version). Always pass `--workflow <id>` on run commands.

When creating a workflow from a file, the JSON must include a top-level `kinds` object with an entry for **every** collection referenced in nodes (including `run_input` and all node input/output collections). Each kind needs `name`, `description`, and `item_schema`. Omitting any referenced collection causes "Missing kinds for: ..."; add those kinds and retry.

---

## Traceability

Every collection kind (except `run_input`) requires `citations`, `derived_from`, and `reasoning` (and `citations`/`derived_from` must be non-empty). Populate them. Every item must have a `name` field.

---

## Token usage and performance

1. **Hard max prompt length (C2):** Keep the prompt text you send for a single node-work completion request to **<= 100 words**.
2. **Split when needed:** If you need more than 100 words, split the work into intermediate research nodes/collections (write partial `research_notes_*`-style items), then synthesize in a later node.

3. **Context compression artifact (C3):** After completing a node, save a small compressed artifact into `node_result.output` (small summary + key references). On the next runnable node, use only this compressed artifact as context (instead of replaying full run history).
4. **Token estimates (MCP):** If you use MCP tools, follow `estimated_tokens` returned by `collection_get` and `estimated_output_tokens` returned by `run_step` completion; if estimates are too large, split into intermediate nodes/collections.
