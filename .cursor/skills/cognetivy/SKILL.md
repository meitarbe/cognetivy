---
name: cognetivy
description: Manage workflows, workflow versions, runs, step events, node results, and strict schema-backed collections in this project. Use when the user asks to start/complete a run, execute workflow nodes, log step_started/step_completed events, persist node results, or read/write structured data in collections. All operations run via the cognetivy CLI from the project root that contains .cognetivy/
---

# Cognetivy

This skill lets you operate on a cognetivy workspace: **multiple workflows**, **workflow versions**, runs, append-only events, **node results**, and strict schema-backed collections (per run). Run all commands from the **project root** (the directory that contains `.cognetivy/`).

For a full CLI reference (every command and option), see [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to "start a run", "run the workflow", "track steps", "log an event", "save ideas/sources", "complete the run".
- User refers to "cognetivy", "workflow", "run", "collections", or ".cognetivy/".
- You need to persist structured outputs (e.g. research ideas, sources) in a schema-validated store.

---

## Quick start (minimal run)

1. **Start a run** (from project root):
   ```bash
   cognetivy run start --input input.json --name "Short descriptive name"
   ```
   Capture the printed `run_id`; use it for all following commands.

2. **Inspect the workflow version (collection→node→collection)**:
   ```bash
   cognetivy workflow get
   ```
   Note `nodes[].id`, `nodes[].input_collections`, and `nodes[].output_collections`.

3. **Ensure collection schema** has kinds for collections used by nodes:
   ```bash
   cognetivy collection-schema get
   ```
   Schema is strict **JSON Schema** and is workflow-scoped (stored under `.cognetivy/workflows/<workflowId>/collections/schema.json`). If a kind is missing, update the schema with `collection-schema set`.

4. **For each workflow node**:
   - Append `step_started` (Studio progress):
     - Event JSON: `{"type":"step_started","data":{"step":"<node_id>"}}`
     - Command: `cognetivy event append --run <run_id> --file step_started.json`
   - Do the node work (prompt/tool/human-in-loop).
   - Write a **node result** (required for traceability):
     ```bash
     cognetivy node-result set --run <run_id> --node <node_id> --status completed --output-file output.md
     ```
     Capture `node_result_id` from the JSON output.
   - Write items to **output collections**. Provenance is required on every write:
     - Replace all items:
       ```bash
       cognetivy collection set --run <run_id> --kind <kind> --file items.json --node <node_id> --node-result <node_result_id>
       ```
     - Append one item:
       ```bash
       cognetivy collection append --run <run_id> --kind <kind> --file item.json --node <node_id> --node-result <node_result_id>
       ```
   - Append `step_completed`:
     - Event JSON: `{"type":"step_completed","data":{"step":"<node_id>"}}`
     - Command: `cognetivy event append --run <run_id> --file step_completed.json`

5. **End the run**:
   - Append `run_completed`: `{"type":"run_completed","data":{}}` then `cognetivy event append --run <run_id> --file run_completed.json`.
   - Mark run complete: `cognetivy run complete --run <run_id>`.

---

## Workflow

Workflows are first-class. Versions contain nodes (collection→node→collection flow).

- **List workflows**: `cognetivy workflow list`
- **Select current workflow**: `cognetivy workflow select --workflow <workflow_id>`
- **List versions**: `cognetivy workflow versions [--workflow <workflow_id>]`
- **Get a workflow version**: `cognetivy workflow get [--workflow <workflow_id>] [--version <version_id>]`
- **Set workflow version** from a JSON file (creates new version and sets it current):
  `cognetivy workflow set --file <path> [--workflow <workflow_id>] [--name <version_name>]`

---

## Runs

- **Start**: `cognetivy run start --input <path> --name "<name>" [--workflow <workflow_id>] [--version <version_id>]` → prints `run_id`.
  - Automatically seeds `run_input` collection and a `__system__` node-result.
- **Complete**: `cognetivy run complete --run <run_id>` — always call after appending `run_completed`.
- **Rename**: `cognetivy run set-name --run <run_id> --name "<name>"`.

---

## Events

Append one event per call; event is a JSON object with `type`, `data` (and optional `ts`, `by`).

- **Step progress** (required for Studio): `data.step` or `data.step_id` must be the workflow node id.  
  Example: `{"type":"step_started","data":{"step":"expand_domain"}}`, `{"type":"step_completed","data":{"step":"expand_domain"}}`.
- **Run completed**: `{"type":"run_completed","data":{}}` — then run `cognetivy run complete --run <run_id>`.

Command: `cognetivy event append --run <run_id> --file <path>`.

---

## Node results

Node results capture the output/summary of running a node (and are shown in Studio).

- **List**: `cognetivy node-result list --run <run_id>`
- **Get**: `cognetivy node-result get --run <run_id> --node <node_id>`
- **Set**: `cognetivy node-result set --run <run_id> --node <node_id> --status <started|completed|failed|needs_human> [--output-file <path> | --output <text>]`

---

## Collections (strict schema-backed)

- **Schema**: `cognetivy collection-schema get [--workflow <workflow_id>]` / `collection-schema set --file <path> [--workflow <workflow_id>]`
  - Each kind has `description` and `item_schema` (JSON Schema).
  - Optional `references` allows Studio to link fields to other kinds.
- **List kinds** that have data for a run: `cognetivy collection list --run <run_id>`.
- **Get items**: `cognetivy collection get --run <run_id> --kind <kind>`.
- **Replace all items** of a kind:
  `cognetivy collection set --run <run_id> --kind <kind> --file <path> --node <node_id> --node-result <node_result_id>`
- **Append one item**:
  `cognetivy collection append --run <run_id> --kind <kind> --file <path> --node <node_id> --node-result <node_result_id>`

Use **Markdown** in long text fields (summaries, theses, descriptions) so Studio renders them as rich text.

---

## Examples

**Event files** (save to a temp file, then `event append --run <run_id> --file <path>`):

- Step started: `{"type":"step_started","data":{"step":"synthesize"}}`
- Step completed: `{"type":"step_completed","data":{"step":"synthesize"}}`
- Run completed: `{"type":"run_completed","data":{}}`

**Collection item payload** (for `collection append` or as element in array for `collection set`): must satisfy the JSON Schema under `item_schema` for that kind. Do NOT include provenance keys (`created_at`, `created_by_node_id`, etc.) — cognetivy writes those automatically.

---

## Important

- **Schema first**: Before `collection set` / `append`, ensure the kind exists and its `item_schema` matches what you’re writing (`collection-schema get`).
- **Step events**: Always set `data.step` (or `step_id`) to the workflow node id so Studio shows step progress.
- **Node results + provenance are required**: Always create a node result and pass `--node` + `--node-result` when writing collections.
- **Never leave runs running**: After the last step, append `run_completed` and call `cognetivy run complete --run <run_id>`.
