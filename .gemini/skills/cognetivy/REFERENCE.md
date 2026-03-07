# Cognetivy CLI reference

Full command reference. Use from project root (directory containing `.cognetivy/`).

## workflow
- `cognetivy workflow list` - list workflows.
- `cognetivy workflow create --name <string> [--id <string>] [--description <string>]` - create a workflow (creates v1 and default schema).
- `cognetivy workflow select --workflow <workflow_id>` - select current workflow.
- `cognetivy workflow versions [--workflow <workflow_id>]` - list versions for a workflow.
- `cognetivy workflow get [--workflow <workflow_id>] [--version <version_id>]` - print a workflow version JSON.
- `cognetivy workflow set --file <path> [--workflow <workflow_id>] [--name <string>]` - set workflow version from JSON file (creates new version and sets it current). **Workflow must be one connected graph with no cycles.**

## run
- `cognetivy run start --input <path> [--name <string>] ...` - start run; prints run_id and COGNETIVY_NEXT_STEP.
- `cognetivy run status --run <run_id> [--json]` - run state, nodes, collections, next_step.
- `cognetivy run step --run <run_id> [--node <node_id>] [--collection-kind <kind>]` - start next node (no --node) or complete node (--node, optional payload via stdin); prints next_step.
- `cognetivy run complete --run <run_id>`, `run set-name --run <run_id> --name <string>`.

## node
- `cognetivy node start --run <run_id> --node <node_id>` - step_started + started node result; prints COGNETIVY_NODE_RESULT_ID.
- `cognetivy node complete --run <run_id> --node <node_id> --status completed [--output ...] [--collection-kind <kind>]` - node result + optional collection (omit --collection-file to read from stdin) + step_completed.

## event
- `cognetivy event append --run <run_id> [--file <path>] [--by <string>]` - append event (omit --file to read from stdin). Step events: data.step = node id.

## collection-schema
- `cognetivy collection-schema get [--workflow <workflow_id>]` - print workflow-scoped schema (kinds, item_schema, references).
- `cognetivy collection-schema set --file <path> [--workflow <workflow_id>]` - set schema from JSON.

## collection
- `cognetivy collection list --run <run_id>` - list kinds that have data for run.
- `cognetivy collection get --run <run_id> --kind <kind>` - get all items of kind.
- `cognetivy collection set --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id>` - replace items (omit --file for stdin).
- `cognetivy collection append --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id> [--id <id>]` - append one item (omit --file for stdin).
- Traceability: every kind (except run_input) has `citations` (sources: url or item_ref), `derived_from` (item refs), `reasoning`; populate so outputs are traceable.

## node-result
- `cognetivy node-result list --run <run_id>` - list node results for run.
- `cognetivy node-result get --run <run_id> --node <node_id>` - get node result.
- `cognetivy node-result set --run <run_id> --node <node_id> --status <started|completed|failed|needs_human> [--id <node_result_id>] [--output-file <path> | --output <string>]` - set node result.

## studio
- `cognetivy studio [--workspace <path>] [--port <port>]` - open read-only Studio (workflow, runs, events, collections) in browser.
