---
name: cognetivy
description: Manage workflows, workflow versions, runs, step events, node results, and strict schema-backed collections in this project. Use when the user asks to start/complete a run, execute workflow nodes, log step_started/step_completed events, persist node results, or read/write structured data in collections. All operations run via the cognetivy CLI from the project root that contains .cognetivy/
---

# Cognetivy

Workflows, runs, node results, and schema-backed collections. Run commands from **project root** (directory with `.cognetivy/`). Full CLI reference: [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections", or ".cognetivy/".

---

## Quick start (minimal run)

**Four commands.** Every response includes `COGNETIVY_NEXT_STEP=...` (JSON with `run_id`, `status`, `next_step`, and `current_node_id` when a node is in progress). **Do what the hint says**; no guessing. The next node is chosen by DAG (topological) order so dependencies run before consumers.

1. **Start:** `cognetivy run start --input input.json --name "Short name"`
   - Prints `run_id` and `COGNETIVY_NEXT_STEP=...`. Parse `next_step`; usually `action: "run_node"`, `node_id`, `hint` (do work for that node, then run step with payload).

2. **Status (optional):** `cognetivy run status --run <run_id> [--json]`
   - Shows run state, `current_node_id` (in progress) when a node is started but not completed, and `next_step`.

3. **Step (repeat until done):**
   - When `next_step.action` is `run_nodes_parallel` (`runnable_node_ids` has more than one node): **you must spawn one sub-agent per node** unless the user says otherwise. First run `cognetivy run step --run <run_id>` (no `--node`) so the CLI marks all those nodes in progress; then each sub-agent does the work and completes with `run step --run <id> --node <node_id> --collection-kind <kind>` and payload (no need to "start" first).
   - **Start next node:** `cognetivy run step --run <run_id>` (no `--node`). For a single runnable node this starts it; for multiple runnable it starts all (then spawn sub-agents). Then do the work for the node(s).
   - **Complete node with output:** `cognetivy run step --run <run_id> --node <node_id> --collection-kind <kind>` with payload on stdin (single object = append, array = set). Or without `--collection-kind` to mark node completed with no collection.
   - Each call prints `COGNETIVY_NEXT_STEP=...`. When `action` is `complete_run`, follow the hint (event append run_completed + run complete).

4. **End the run:** When `next_step.action` is `complete_run`: `echo '{"type":"run_completed","data":{}}' | cognetivy event append --run <run_id>`, then `cognetivy run complete --run <run_id>`.

---

## Workflow

`workflow get` (and `workflow list` / `select` / `versions` / `set --file <path>`). Versions have nodes (collection→node→collection).

**Workflow structure (required):**
- **Single connected graph:** Do not create two or more disconnected subgraphs. All nodes must be part of one dataflow (every node reachable via input/output collections from the rest).
- **No cycles:** The dataflow must be acyclic. No node may depend (directly or indirectly) on a collection produced by a node that depends on it. Saving a workflow with a cycle will fail validation.

**Node prompts and output:** Node prompts work best when **long and specific**: include the goal, constraints (e.g. source discipline, output format), and examples if helpful. Prefer detailed prompts over short one-liners. If a node has `minimum_rows`, produce at least that many items for its output collection(s).

**Per-node skills and MCPs:** Each node can declare `required_skills` (array of skill names, e.g. `["cognetivy", "tavily"]`) and `required_mcps` (array of MCP server names, e.g. `["user-context7", "cursor-ide-browser"]`). Use these field names in workflow JSON - **not** `skills` (use `required_skills`). Run `workflow get` to see the default workflow example.

## Runs (agent surface: 4 commands)

`run start`, `run status --run <id> [--json]`, `run step --run <id> [--node N] [--collection-kind K]`, `run complete`. Every response includes `COGNETIVY_NEXT_STEP`; use it to decide the next action. Low-level `node` / `event` / `collection` commands exist for scripts; see REFERENCE.md.

## Events

`event append --run <run_id> [--file <path>]` - omit `--file` to read from stdin. Event JSON: `type`, `data` (for step events set `data.step` = node id). E.g. `echo '{"type":"step_completed","data":{"step":"synthesize"}}' | cognetivy event append --run <run_id>`.

## Node results

Usually covered by `node complete`. For inspect or when not using it: `node-result list`, `node-result get`, `node-result set` (prints `COGNETIVY_NODE_RESULT_ID=...`).

---

## Collections (strict schema-backed)

`collection-schema get` / `set --file` (kinds + `item_schema`). `collection list --run <id>`, `collection get --run <id> --kind <kind>`. `collection set` / `collection append` need `--node` and `--node-result` (or use `node complete --collection-kind` which creates the result). Omit `--file` to read from stdin.
- **Many items:** Prefer incremental `collection append` or `node complete` per item instead of one large `collection set`. Use Markdown in long text fields for Studio.

**Traceability (enforced by schema):** Every kind (except `run_input`) has optional `citations`, `derived_from`, and `reasoning`. **Always populate these** so outputs are traceable:
- **citations:** Array of sources: `{ url?, title?, excerpt? }` for external URLs (only verified), or `{ item_ref: { kind, item_id } }` for another collection item (e.g. a `sources` item). Enables "where did this come from?"
- **derived_from:** Array of `{ kind, item_id }`  -  which collection items this was derived from (chain of thinking). Enables "why did we decide this?"
- **reasoning:** Optional string explaining the conclusion or chain of thought.

**Payload:** Must match `item_schema` for the kind; do not include `created_at`, `created_by_node_id` - cognetivy adds them. For kinds like `sources` that have a `url` field: only include URLs you have verified (retrieved or opened); do not invent URLs.

---

## Node runner pattern

`workflow get` once → for each node: `collection get` for that node's inputs only → do work → `node complete`. If a node has `minimum_rows`, produce at least that many items for its output collection(s). **You must spawn sub-agents when multiple nodes are runnable at the same level** (`next_step.action === "run_nodes_parallel"`, `runnable_node_ids`): one sub-agent per node, unless the user says otherwise. For a single runnable node, one agent is fine.

## Important

- **Parallel same-layer:** When `next_step.action` is `run_nodes_parallel`, you **must** spawn one sub-agent per node in `runnable_node_ids` unless the user says otherwise.
- **Schema first:** `collection-schema get` before writing; add kinds if missing.
- **Step events:** `data.step` = workflow node id (for Studio).
- **Provenance:** When using `collection set`/ `append` directly (not `node complete`), create a node result first and pass `--node` + `--node-result`.
- **Always end runs:** `event append run_completed` then `run complete`.
- **Version suggestions:** When discussing dependencies, tools, or libraries, proactively check for and suggest newer versions (e.g. via web search or docs) and mention upgrade paths when relevant.

## Source discipline and traceability

- **Rely only on real information:** Use (a) run input/collections, or (b) sources you actually retrieve via tools (e.g. web search, MCP, browser). Do not invent or guess URLs, quotes, or facts.
- **When writing to a `sources` (or similar) collection:** Only include URLs you have verified (e.g. fetched or opened). Do not fabricate URLs; if a URL is unverified, omit it or mark it clearly as unverified.
- **Trace every output:** When writing any collection item (except `run_input`), include `citations` (sources: URLs or `item_ref` to other items) and/or `derived_from` (items this was derived from) so the chain of thinking and sources are always traceable.

## Performance

- **Smaller context:** Per-item extraction (e.g. per-video) over all-at-once when a node maps over a list.
- **Parallel sub-agents (required when same-layer):** When `run_nodes_parallel` and `runnable_node_ids` has multiple nodes, you **must** spawn one sub-agent per node unless the user says otherwise. For data-parallel nodes (e.g. many items), spawning one agent per item in parallel can yield large speedup.
- **Structured output:** Future extensions may enforce "output must match this schema" so the agent skips manual schema-checking.
