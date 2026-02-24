---
name: cognetivy
description: Manage reasoning workflows, runs, step events, and schema-backed collections in this project. Use when the user asks to start or complete a run, execute workflow steps, log step_started/step_completed events, or read/write structured data (ideas, sources, resource_pack). All operations run via the cognetivy CLI from the project root that contains .cognetivy/
---

# Cognetivy

This skill lets you operate on a cognetivy workspace: workflows (nodes, edges), runs, append-only events, and collections (schema-backed stores per run). Run all commands from the **project root** (the directory that contains `.cognetivy/`).

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

2. **Inspect the workflow**:
   ```bash
   cognetivy workflow get
   ```
   Note `nodes` (step ids) and `suggested_collection_kinds` (e.g. ideas, sources).

3. **Ensure collection schema** has kinds for those outputs:
   ```bash
   cognetivy collection-schema get
   ```
   If a kind is missing, add it by editing `.cognetivy/collection-schema.json` (add under `kinds`: `description`, `required` array, optional `properties`).

4. **For each workflow step**:  
   - Append `step_started`: write a JSON file with `{"type":"step_started","data":{"step":"<node_id>"}}` (use the node `id` from workflow get), then `cognetivy event append --run <run_id> --file that.json`.  
   - Do the step work (e.g. research, synthesis).  
   - Write step outputs to collections: `cognetivy collection set --run <run_id> --kind <kind> --file items.json` or `collection append` for a single item.  
   - Append `step_completed`: same as step_started but `"type":"step_completed"`.

5. **End the run**:
   - Append `run_completed`: `{"type":"run_completed","data":{}}` then `cognetivy event append --run <run_id> --file run_completed.json`.
   - Mark run complete: `cognetivy run complete --run <run_id>`.

---

## Workflow

- **Get current workflow** (nodes, edges, suggested_collection_kinds):  
  `cognetivy workflow get`
- **Set workflow** from a JSON file (creates new version):  
  `cognetivy workflow set --file <path>`

---

## Runs

- **Start**: `cognetivy run start --input <path> --name "<name>"` → prints `run_id`.
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

## Collections (schema-backed)

- **Schema**: `cognetivy collection-schema get` / `collection-schema set --file <path>`. Each kind has `description`, `required` (array of field names), optional `properties`.
- **List kinds** that have data for a run: `cognetivy collection list --run <run_id>`.
- **Get items**: `cognetivy collection get --run <run_id> --kind <kind>`.
- **Replace all items** of a kind: `cognetivy collection set --run <run_id> --kind <kind> --file <path>` (file = JSON array).
- **Append one item**: `cognetivy collection append --run <run_id> --kind <kind> --file <path>`.

Use **Markdown** in long text fields (summaries, theses, descriptions) so Studio renders them as rich text.

---

## Examples

**Event files** (save to a temp file, then `event append --run <run_id> --file <path>`):

- Step started: `{"type":"step_started","data":{"step":"synthesize"}}`
- Step completed: `{"type":"step_completed","data":{"step":"synthesize"}}`
- Run completed: `{"type":"run_completed","data":{}}`

**Collection item** (for `collection append` or as element in array for `collection set`): must include all `required` fields from the kind in `collection-schema get`. Example for kind `ideas` with required `idea_summary`: `{"idea_summary":"Use AI to automate audits."}`.

---

## Important

- **Schema first**: Before `collection set` or `collection append`, ensure the kind exists in the schema (`collection-schema get`); add it via `collection-schema set` or by editing `.cognetivy/collection-schema.json` if missing.
- **Step events**: Always set `data.step` (or `step_id`) to the workflow node id so Studio shows step progress.
- **Never leave runs running**: After the last step, append `run_completed` and call `cognetivy run complete --run <run_id>`.
