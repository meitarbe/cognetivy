---
name: cognetivy
description: Manage workflows, runs, and collections on Cognetivy Cloud via the CLI. Use when the user asks to start/complete a run, execute workflow nodes, or read/write structured data. Sign in with cognetivy auth login; project root may contain .cognetivy/ for skills and default workflow pointer.
---

# Cognetivy

Workflows, runs, and collections on **Cognetivy Cloud**. Run commands from **project root** with `COGNETIVY_API_KEY` set (`cognetivy auth login`). Full CLI reference: [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections", or ".cognetivy/".

---

## Quick start (minimal run)

**Four commands.** Every response includes `COGNETIVY_NEXT_STEP=...` (JSON with `run_id`, `status`, `next_step`, and `current_node_id` when a node is in progress). **Do what the hint says**; no guessing. The next node is chosen by DAG (topological) order so dependencies run before consumers.

1. **Start:** `cognetivy run start --workflow <workflow_id> --input <path>|--input -|--input-inline '{"key":"value"}' --name "Short name"`
   - Always pass `--workflow <id>` (no "selected" workflow). Input can be file path, `-` for stdin, or `--input-inline` JSON. Prints `run_id` and `COGNETIVY_NEXT_STEP=...`. Parse `next_step`; usually `action: "run_node"`, `node_id`, `hint` (do work for that node, then run step with payload).

2. **Status (optional):** `cognetivy run status --run <run_id> [--json]`
   - Shows run state, `current_node_id` (in progress) when a node is started but not completed, and `next_step`.

3. **Step (repeat until done):**
   - When `next_step.action` is `run_nodes_parallel` (`runnable_node_ids` has more than one node): **you must spawn one sub-agent per node** unless the user says otherwise. First run `cognetivy run step --run <run_id>` (no `--node`) so the CLI marks all those nodes in progress; then each sub-agent does the work and completes with `run step --run <id> --node <node_id> --collection-kind <kind>` and payload (no need to "start" first).
   - **Start next node:** `cognetivy run step --run <run_id>` (no `--node`). For a single runnable node this starts it; for multiple runnable it starts all (then spawn sub-agents). Then do the work for the node(s).
   - **Complete node with output:** Prefer `cognetivy run step --run <run_id> --node <node_id> --collection-kind <kind> --collection-file <path>` (write payload to file first; avoids shell prompts). Or payload on stdin (single object = append, array = set). Or without `--collection-kind` to mark node completed with no collection.
   - Each call prints `COGNETIVY_NEXT_STEP=...`. When `action` is `complete_run`, follow the hint (event append run_completed + run complete).

4. **End the run:** When `next_step.action` is `complete_run`: `cognetivy run complete --run <run_id>` (no separate event append).

---

## Workflow

**Get by id:** `workflow get --workflow <id> [--version <version_id>]` — always pass `--workflow` explicitly (no "selected" workflow for agents). **Create:** `workflow create` (--name or --file/stdin). **Update version:** `workflow set --file <path>` or stdin. **List/search:** Use `workflow search [--q <query>]` or `workflow list [--q <query>]` **only when the user explicitly asks to list or search workflows**; output is id, name, description only. Versions have nodes (collection→node→collection).

**Workflow structure (required):**
- **Single connected graph:** Do not create two or more disconnected subgraphs. All nodes must be part of one dataflow (every node reachable via input/output collections from the rest).
- **No cycles:** The dataflow must be acyclic. No node may depend (directly or indirectly) on a collection produced by a node that depends on it. Saving a workflow with a cycle will fail validation.

**Node prompts and output:** Node prompts work best when **long and specific**: include the goal, constraints (e.g. source discipline, output format), and examples if helpful. Prefer detailed prompts over short one-liners. If a node has `minimum_rows`, produce at least that many items for its output collection(s).

**Per-node skills and MCPs:** Each node can declare `required_skills` (array of skill names, e.g. `["cognetivy", "tavily"]`) and `required_mcps` (array of MCP server names, e.g. `["user-context7", "cursor-ide-browser"]`). Use these field names in workflow JSON - **not** `skills` (use `required_skills`). Run `workflow get` to see the default workflow example.

## Agent surface (minimal)

**Workflow:** `workflow get --workflow <id>`, `workflow create`, `workflow set` (file or stdin), `workflow search [--q]` (only when user asks to list/search). **Run:** `run start` (with `--workflow`, `--input` or `--input-inline`), `run status --run <id>`, `run step --run <id> [--node N] [--collection-kind K] [--collection-file <path>]` (payload from file or stdin; prefer file in agents), `run complete --run <id>`. Every run response includes `COGNETIVY_NEXT_STEP`; follow the hint. Prefer YAML for payloads (fewer tokens); JSON is accepted.

**Low-level (scripts / debugging only):** `event append`, `collection-schema get/set`, `collection list/get`, `node start`. Prefer `run step` to complete nodes with output.

**Traceability (enforced by schema):** Every kind (except `run_input`) has optional `citations`, `derived_from`, and `reasoning`. **Always populate these** so outputs are traceable:
- **citations:** Array of sources: `{ url?, title?, excerpt? }` for external URLs (only verified), or `{ item_ref: { kind, item_id } }` for another collection item (e.g. a `sources` item). Enables "where did this come from?"
- **derived_from:** Array of `{ kind, item_id }`  -  which collection items this was derived from (chain of thinking). Enables "why did we decide this?"
- **reasoning:** Optional string explaining the conclusion or chain of thought.

**Every collection item must have a `name` field (mandatory).** The API and CLI enforce this: payloads without `name` are rejected. Use a short, human-readable title (e.g. `"Q1 competitor overview"`, `"Atlassian Jira docs"`). The Studio shows `name` as the item title. For `run_input`, omit `name` and the system will default it to `"Run input"`.

**Payload:** Must match `item_schema` for the kind; do not include `created_at`, `created_by_node_id` - cognetivy adds them. For kinds like `sources` that have a `url` field: only include URLs you have verified (retrieved or opened); do not invent URLs.

---

## Node runner pattern

`workflow get --workflow <id>` once → then `run start` with that workflow id → for each node: do work → `run step --run <id> --node <node_id> --collection-kind <kind> --collection-file <path>` (prefer file; or payload on stdin). Omit `--collection-kind` to complete with no output. If a node has `minimum_rows`, produce at least that many items. **You must spawn sub-agents when** `next_step.action === "run_nodes_parallel"` and `runnable_node_ids` has multiple nodes: one sub-agent per node, unless the user says otherwise.

## Important

- **Parallel same-layer:** When `next_step.action` is `run_nodes_parallel`, you **must** spawn one sub-agent per node in `runnable_node_ids` unless the user says otherwise.
- **Always end runs:** `cognetivy run complete --run <id>` (no separate event append).
- **Workflow id:** Pass `--workflow <id>` on every command; do not rely on a "selected" workflow.
- **Version suggestions:** When discussing dependencies, tools, or libraries, proactively check for and suggest newer versions (e.g. via web search or docs) and mention upgrade paths when relevant.

## Source discipline and traceability

- **Rely only on real information:** Use (a) run input/collections, or (b) sources you actually retrieve via tools (e.g. web search, MCP, browser). Do not invent or guess URLs, quotes, or facts.
- **When writing to a `sources` (or similar) collection:** Only include URLs you have verified (e.g. fetched or opened). Do not fabricate URLs; if a URL is unverified, omit it or mark it clearly as unverified.
- **Trace every output:** When writing any collection item (except `run_input`), include `citations` (sources: URLs or `item_ref` to other items) and/or `derived_from` (items this was derived from) so the chain of thinking and sources are always traceable.

## Performance

- **Smaller context:** Per-item extraction (e.g. per-video) over all-at-once when a node maps over a list.
- **Parallel sub-agents (required when same-layer):** When `run_nodes_parallel` and `runnable_node_ids` has multiple nodes, you **must** spawn one sub-agent per node unless the user says otherwise. For data-parallel nodes (e.g. many items), spawning one agent per item in parallel can yield large speedup.
- **Structured output:** Future extensions may enforce "output must match this schema" so the agent skips manual schema-checking.
