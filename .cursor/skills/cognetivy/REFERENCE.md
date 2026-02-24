# Cognetivy CLI reference

Full command reference. Use from project root (directory containing `.cognetivy/`).

## workflow
- `cognetivy workflow list` — list workflows.
- `cognetivy workflow create --name <string> [--id <string>] [--description <string>]` — create a workflow (creates v1 and default schema).
- `cognetivy workflow select --workflow <workflow_id>` — select current workflow.
- `cognetivy workflow versions [--workflow <workflow_id>]` — list versions for a workflow.
- `cognetivy workflow get [--workflow <workflow_id>] [--version <version_id>]` — print a workflow version JSON.
- `cognetivy workflow set --file <path> [--workflow <workflow_id>] [--name <string>]` — set workflow version from JSON file (creates new version and sets it current).

## run
- `cognetivy run start --input <path> [--name <string>] [--by <string>] [--workflow <workflow_id>] [--version <version_id>]` — start run; prints run_id (also seeds run_input + __system__ node-result).
- `cognetivy run complete --run <run_id>` — mark run completed.
- `cognetivy run set-name --run <run_id> --name <string>` — set human-readable name.

## event
- `cognetivy event append --run <run_id> --file <path> [--by <string>]` — append one event (JSON: type, data; optional ts, by). Step events need data.step = workflow node id.

## collection-schema
- `cognetivy collection-schema get [--workflow <workflow_id>]` — print workflow-scoped schema (kinds, item_schema, references).
- `cognetivy collection-schema set --file <path> [--workflow <workflow_id>]` — set schema from JSON.

## collection
- `cognetivy collection list --run <run_id>` — list kinds that have data for run.
- `cognetivy collection get --run <run_id> --kind <kind>` — get all items of kind.
- `cognetivy collection set --run <run_id> --kind <kind> --file <path> --node <node_id> --node-result <node_result_id>` — replace items (file = JSON array; provenance required).
- `cognetivy collection append --run <run_id> --kind <kind> --file <path> --node <node_id> --node-result <node_result_id> [--id <id>]` — append one item (file = single JSON object; provenance required).

## node-result
- `cognetivy node-result list --run <run_id>` — list node results for run.
- `cognetivy node-result get --run <run_id> --node <node_id>` — get node result.
- `cognetivy node-result set --run <run_id> --node <node_id> --status <started|completed|failed|needs_human> [--id <node_result_id>] [--output-file <path> | --output <string>]` — set node result.

## studio
- `cognetivy studio [--workspace <path>] [--port <port>]` — open read-only Studio (workflow, runs, events, collections) in browser.
