# Cognetivy CLI reference

**Workspace:** Local state is a single SQLite database at `.cognetivy/cognetivy.db`. Run `cognetivy init --workspace-only` to create only the workspace (directory + DB); `cognetivy init` also runs the skill installer. Use all commands from the project root that contains `.cognetivy/`. If you have an API key set and want to use the local workspace only, pass `--local` on run/event/collection/workflow commands.

## workflow
- `cognetivy workflow list` - list workflows.
- `cognetivy workflow create --name <string> [--id <string>] [--description <string>]` - create a workflow (creates v1 and default schema).
- `cognetivy workflow create --file <path> [--cloud]` - **one-call create**: create workflow, first version (with nodes), and collection schema from a single JSON file. File shape: `{ "name": string, "description"?: string, "nodes"?: WorkflowNode[], "kinds"?: Record<string, CollectionKindConfig> }`. **Enforced:** when `nodes` references any collections (via input_collections/output_collections), `kinds` is required and must include an entry for every such collection (name, description, item_schema). CLI and API return an error if any are missing. Use `--cloud` when authenticated to create on server; otherwise creates locally in `.cognetivy/`.
- `cognetivy workflow select --workflow <workflow_id> [--cloud | --local]` - select current workflow. Use `--cloud` to set the default workflow for cloud (persisted in workspace; workflow must exist on server). Omit both to select from local workspace.
- `cognetivy workflow versions [--workflow <workflow_id>]` - list versions for a workflow.
- `cognetivy workflow get [--workflow <workflow_id>] [--version <version_id>]` - print a workflow version JSON.
- `cognetivy workflow set --file <path> [--workflow <workflow_id>] [--name <string>]` - set workflow version from JSON file (creates a new version and sets it current). **Do not use `workflow create` for updates; use `workflow set --file ... --workflow <workflow_id>` (it creates the first version if the workflow has no versions yet). Workflow must be one connected graph with no cycles.**

## run
- `cognetivy run start --input <path> [--name <string>] ...` - start run; prints run_id and COGNETIVY_NEXT_STEP.
- `cognetivy run status --run <run_id> [--json]` - run state, nodes, collections, next_step.
- `cognetivy run step --run <run_id> [--node <node_id>] [--collection-kind <kind>]` - start next node (no --node) or complete node (--node, optional payload via stdin); prints next_step.

**next_step fields (use for scoped fetch):** `action`, `node_id`, `runnable_node_ids`, `hint`, `output_collections`, `collection_kind`. When present: `input_collections` (single node — fetch only these kinds with collection get); `input_collections_by_node` (parallel — for each node_id, fetch only `input_collections_by_node[node_id]`).

Resume/stop-continue rules:
- If the CLI response includes `current_node_id` (or `current_node_ids`), you must only follow `next_step.action === "complete_node"` and complete `next_step.node_id` (which must match `current_node_id` when single).
- Output kind matching: if `next_step.collection_kind` is set (or `next_step.output_collections.length === 1`), complete the node with `--collection-kind <next_step.collection_kind>` and provide matching payload. Never complete with the wrong output kind.
- If `next_step.output_collections` is empty, you may complete the node without `--collection-kind`.
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
- `cognetivy collection list --run <run_id> [--cloud | --local]` - list collection kinds (cloud: workflow schema kinds; local: kinds that have data). Defaults to cloud when authenticated.
- `cognetivy collection get --run <run_id> --kind <kind> [--cloud | --local]` - get all items of kind. Defaults to cloud when authenticated.
- `cognetivy collection set --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id>` - replace items (omit --file for stdin).
- `cognetivy collection append --run <run_id> --kind <kind> [--file <path>] --node <node_id> --node-result <node_result_id> [--id <id>]` - append one item (omit --file for stdin).
- Traceability: every kind (except run_input) has `citations` (sources: url or item_ref), `derived_from` (item refs), `reasoning`; populate so outputs are traceable.

## node-result
- `cognetivy node-result list --run <run_id>` - list node results for run.
- `cognetivy node-result get --run <run_id> --node <node_id>` - get node result.
- `cognetivy node-result set --run <run_id> --node <node_id> --status <started|completed|failed|needs_human> [--id <node_result_id>] [--output-file <path> | --output <string>]` - set node result.

## studio
- `cognetivy studio [--workspace <path>] [--port <port>]` - open read-only Studio (workflow, runs, events, collections) in browser.
