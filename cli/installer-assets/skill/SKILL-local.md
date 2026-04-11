---
name: cognetivy
description: Manage workflows, workflow versions, runs, step events, node results, and strict schema-backed collections in this project. Use when the user asks to start/complete a run, execute workflow nodes, log step_started/step_completed events, persist node results, or read/write structured data in collections. All operations run via the cognetivy CLI from the project root that contains .cognetivy/
---

# Cognetivy

Workflows, runs, node results, and schema-backed collections. **Single surface: use the cognetivy CLI.** Run commands from **project root** (directory with `.cognetivy/`). Local workspace is a SQLite DB at `.cognetivy/cognetivy.db`; `cognetivy init --workspace-only` creates it. Full CLI reference: [REFERENCE.md](REFERENCE.md).

---

## Mandatory: use only the CLI

- **Never** run `sqlite3`, `sql`, or any direct database commands. Never open, edit, or query `.cognetivy/cognetivy.db` yourself.
- **Never** compose raw JSON or SQL to insert/update workflow, run, or collection data. All reads and writes go through cognetivy commands only.
- **Never** manually create or edit files under `.cognetivy/` (except you may create an input JSON file to pass to `run start --input`).
- To list workflows: `cognetivy workflow list --local`. To get a workflow: `cognetivy workflow get --local --workflow <id>`. To create a run: `cognetivy run start --local ...`. To complete a node: `cognetivy run step --local --run <id> --node <node_id> --collection-kind <kind>` with payload on stdin or `--collection-file`. To read collection data: `cognetivy collection get --local --run <id> --kind <kind>`.

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections", or ".cognetivy/".

---

## Quick start (minimal run)

**Four commands.** Every response includes `COGNETIVY_NEXT_STEP=...` (JSON with `run_id`, `status`, `next_step`, and `current_node_id` when a node is in progress). **Do what the hint says**; no guessing. The next node is chosen by DAG (topological) order so dependencies run before consumers.

1. **Start:** `cognetivy run start --local --workflow <workflow_id> --input input.json --name "Short name"` (or `--input -` for stdin, or `--input-inline '{"topic":"..."}'`). You must pass `--workflow <id>`; get the id from `workflow list --local`. Prints `run_id` and `COGNETIVY_NEXT_STEP=...`. Parse `next_step` and also check `current_node_id` / `current_node_ids`: if they exist, you are resuming in-progress node(s) and must only follow `next_step.action === "complete_node"` (complete `next_step.node_id`, matching `current_node_id` when single).

2. **Status (optional):** `cognetivy run status --run <run_id> [--json]`
   - Shows run state, `current_node_id` (in progress) when a node is started but not completed, and `next_step`.

3. **Step (repeat until done):**
   - **Always spawn one sub-agent per runnable node** (even when there is only one). This keeps each agent's context small and avoids context-window bloat. For a single runnable node, spawn one sub-agent for that node; for `run_nodes_parallel`, spawn one sub-agent per node in `runnable_node_ids`. First run `cognetivy run step --run <run_id>` (no `--node`) to start the node(s); then each sub-agent does the work and completes with `run step --run <id> --node <node_id> --collection-kind <kind>` and payload.
   - **Resume/stop-continue rule:** If you see `current_node_id` / `current_node_ids` in the response, you must not start new runnable nodes. You must only complete `next_step.node_id` using `next_step.action === "complete_node"`.
   - **Complete node with output:** `cognetivy run step --run <run_id> --node <node_id> --collection-kind <kind>` with payload on stdin (single object = append, array = set). Use `--collection-kind` only when `next_step.collection_kind` is set (or when `next_step.output_collections.length === 1`) and it must match exactly. Never complete a node with the wrong output kind.
   - **Complete node with no output:** Only when `next_step.output_collections` is empty.
   - Each call prints `COGNETIVY_NEXT_STEP=...`. When `action` is `complete_run`, follow the hint (event append run_completed + run complete).

4. **End the run (reflection + versioning):** When `next_step.action` is `complete_run`:
   - Reflect on issues/gaps you found, and explicitly suggest the next workflow changes.
   - If the user requests changes, create a **new workflow version** and set it current (use `cognetivy workflow set --file <path> --local --workflow <workflow_id>`; get `<workflow_id>` from `run status --run <run_id>`). Then start a new run using the updated workflow.
   - Then finish: `echo '{"type":"run_completed","data":{}}' | cognetivy event append --local --run <run_id>`, then `cognetivy run complete --local --run <run_id>`.

**Pitfalls to avoid:** Do not run sqlite3 or edit the DB. Do not create a workflow with `workflow create --name` then `workflow set` for a brand-new workflow-use `workflow create --file` once. When updating an existing workflow (including one with no versions yet), do not call `workflow create` again-use `workflow set --file <path> --local --workflow <workflow_id>`. Always pass `--local` when using the local workspace. Always pass `--workflow <id>` to `run start`.

---

## Workflow

**Creating a new workflow (always do this in one step):** Use `cognetivy workflow create --file <path> --local` with a single JSON file that contains `name`, optional `description`, `nodes` (array of workflow nodes), and **`kinds`** (object: every collection name referenced in nodes must have an entry with `description` and `item_schema`). This creates the workflow, its first version, and the collection schema atomically. Do **not** use `workflow create --name` followed by `workflow set` to create a brand-new workflow from scratch; use `workflow create --file` once.

**Inspecting/updating:** `cognetivy workflow list --local`, `cognetivy workflow get --local --workflow <id> [--version <vid>]`, `cognetivy workflow versions --local --workflow <id>`, `cognetivy workflow set --file <path> --local --workflow <id>` (updates or adds a version to an existing workflow).

**Workflow structure (required):**
- **Single connected graph:** Do not create two or more disconnected subgraphs. All nodes must be part of one dataflow (every node reachable via input/output collections from the rest).
- **No cycles:** The dataflow must be acyclic. No node may depend (directly or indirectly) on a collection produced by a node that depends on it. Saving a workflow with a cycle will fail validation.

**Collection schemas (kinds) required:** The JSON for `workflow create --file` **must** include a top-level `kinds` object. **Every** collection referenced in any node (as input or output) must have an entry in `kinds`, including:
- `run_input` (the run's input collection)
- every other collection name that appears in nodes (e.g. `reddit_query_plan`, `reddit_post_candidates`, `best_reddit_post`, `sources`, etc.)

Each kind entry must have `name`, `description`, and `item_schema` (JSON Schema). If you omit `kinds` or any referenced collection, `workflow create` will fail with: "Collection schema (kinds) is required for all collections referenced in nodes. Missing kinds for: run_input, ...". Add a `kinds` object with an entry for each listed name before retrying.

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

**Traceability (enforced by schema):** Every kind (except `run_input`) requires non-empty `citations` and non-empty `derived_from`, plus `reasoning`. **Always populate these** so outputs are traceable:
- **citations:** Array of sources: `{ url?, title?, excerpt? }` for external URLs (only verified), or `{ item_ref: { kind, item_id } }` for another collection item (e.g. a `sources` item). Enables "where did this come from?"
- **derived_from:** Array of `{ kind, item_id }`  -  which collection items this was derived from (chain of thinking). Enables "why did we decide this?"
- **reasoning:** String explaining the conclusion or chain of thought.

**Payload:** Must match `item_schema` for the kind; do not include `created_at`, `created_by_node_id` - cognetivy adds them. For kinds like `sources` that have a `url` field: only include URLs you have verified (retrieved or opened); do not invent URLs.

---

## Node runner pattern

`workflow get` once → for each node: fetch **only** the kinds in `next_step.input_collections` (single node) or `next_step.input_collections_by_node[node_id]` (parallel) with `collection get --run <id> --kind <k>` for each kind; do work → complete the node. If a node has `minimum_rows`, produce at least that many items. **Always spawn one sub-agent per runnable node** (one node = one sub-agent; multiple runnable = one sub-agent per node) to keep context small.

## Commands you may use (exhaustive)

All from project root; use `--local` when you have an API key set and want to use the local workspace only.

| Action | Command |
|--------|--------|
| List workflows | `cognetivy workflow list --local` |
| Get workflow JSON | `cognetivy workflow get --local --workflow <id> [--version <vid>]` |
| Create workflow + version + schema (one step) | `cognetivy workflow create --file <path> --local` |
| Set workflow version from file | `cognetivy workflow set --file <path> --local [--workflow <id>]` |
| List versions | `cognetivy workflow versions --local [--workflow <id>]` |
| Start a run | `cognetivy run start --local --workflow <id> --input <file> \| --input - \| --input-inline '{"key":"value"}' --name "Run name"` |
| Run status | `cognetivy run status --local --run <run_id> [--json]` |
| Start next node(s) | `cognetivy run step --local --run <run_id>` (no --node) |
| Complete node with output | `cognetivy run step --local --run <run_id> --node <node_id> --collection-kind <kind>` (payload on stdin or `--collection-file <path>`) |
| Complete node with no output | `cognetivy run step --local --run <run_id> --node <node_id>` |
| End run | `cognetivy run complete --local --run <run_id>` |
| Append event | `cognetivy event append --local --run <run_id>` (stdin or `--file <path>`) |
| List collection kinds for run | `cognetivy collection list --local --run <run_id>` |
| Get collection items | `cognetivy collection get --local --run <run_id> --kind <kind>` |
| Get collection schema | `cognetivy collection-schema get --local [--workflow <id>]` |

Use `--local` on every command when using the local workspace so the CLI does not try to reach the cloud API.

## Important

- **Scoped fetch:** Call `collection get` **only** for kinds listed in `next_step.input_collections` (or, for parallel, `next_step.input_collections_by_node` for that node). Do not fetch all kinds or re-fetch the workflow to infer inputs.
- **One sub-agent per node:** Always spawn one sub-agent per runnable node (even when there is one), so each agent has minimal context.
- **Schema first:** `collection-schema get` before writing; add kinds if missing.
- **Step events:** `data.step` = workflow node id (for Studio).
- **Provenance:** When using `collection set`/ `append` directly (not `node complete`), create a node result first and pass `--node` + `--node-result`.
- **Always end runs:** `event append run_completed` then `run complete`.
- **Version suggestions:** When discussing dependencies, tools, or libraries, proactively check for and suggest newer versions (e.g. via web search or docs) and mention upgrade paths when relevant.

## Source discipline and traceability

- **Rely only on real information:** Use (a) run input/collections, or (b) sources you actually retrieve via tools (e.g. web search, MCP, browser). Do not invent or guess URLs, quotes, or facts.
- **When writing to a `sources` (or similar) collection:** Only include URLs you have verified (e.g. fetched or opened). Do not fabricate URLs; if a URL is unverified, omit it or mark it clearly as unverified.
- **Trace every output:** When writing any collection item (except `run_input`), include `citations` (sources: URLs or `item_ref` to other items), `derived_from` (items this was derived from), and `reasoning` so the chain of thinking and sources are always traceable.

## Token usage and performance

Follow these rules to minimize context size and token use.

1. **Use `COGNETIVY_NEXT_STEP` as the source of truth.** Prefer `next_step` from the last `run start` or `run step` output. Do not call `run status` or `workflow get` every turn unless the user asked or you need to list workflows.

2. **Fetch only what this node needs.** For the current node, call `collection get` **only** for the kinds in `next_step.input_collections` (single node) or `next_step.input_collections_by_node[node_id]` (when handling one node from a parallel set). Do not fetch all kinds for the run.

3. **Prefer YAML for payloads.** When writing collection payloads or run input, prefer YAML (fewer tokens than JSON) where the CLI/API accept it.

4. **Do not re-send completed work.** Do not re-fetch or re-paste outputs from already-completed nodes into the conversation unless the current node's task truly needs them. The run state and `next_step` are enough to decide what to do next.

5. **One step per turn.** Each sub-agent does the work for one node, then calls `run step` to complete. Do not try to complete multiple nodes in one turn unless the design explicitly allows it.

6. **Always spawn one sub-agent per runnable node.** Even for a single runnable node, spawn one sub-agent dedicated to that node. This keeps each context window small and avoids bloating the parent with full run history and all collections.

7. **Per-item extraction.** When a node maps over a list (e.g. many items), prefer per-item extraction over all-at-once so each agent turn sees a bounded amount of data.

8. **Hard max prompt length (C2):** Keep the prompt text you send for a single node-work completion request to **<= 100 words**. If you need more, split the work into intermediate research nodes/collections (e.g. write partial `research_notes_*` items), then use a later node to synthesize them.

9. **Context compression artifact (C3):** After completing a node, save a small compressed artifact into `node_result.output` (small summary + key references). On the next runnable node, use only this compressed artifact as context (instead of replaying full run history).

10. **Token estimates (MCP):** If you use MCP tools, follow `estimated_tokens` returned by `collection_get` and `estimated_output_tokens` returned by `run_step` node completion; if estimates are too large, split into intermediate nodes/collections.
