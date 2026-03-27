# Cognetivy CLI reference (cloud)

Use `--cloud` on commands (or rely on default when authenticated). No local `.cognetivy/` required.

## workflow
- `cognetivy workflow list --cloud`, `workflow get --workflow <id> --cloud`, `workflow create --cloud`, `workflow set --file <path> --cloud` (updates by creating a new version for the selected workflow; do not use workflow create for updates; if the workflow has no versions yet, workflow set creates the first version).
- `workflow versions --workflow <id> --cloud`, `workflow select --workflow <id> --cloud`.

## run
- `cognetivy run start --workflow <id> --input <path> [--name <string>] --cloud`
- `run status --run <id> --cloud`, `run step --run <id> [--node <id>] [--collection-kind <kind>] --cloud`, `run complete --run <id> --cloud`.

Resume/stop-continue rules:
- If the CLI response includes `current_node_id` (or `current_node_ids`), you must only follow `next_step.action === "complete_node"` and complete `next_step.node_id` (matching `current_node_id` when single). Do not start new nodes while one is in progress.
- Output kind matching: if `next_step.collection_kind` is set (or `next_step.output_collections.length === 1`), complete the node with `--collection-kind <next_step.collection_kind>` and provide matching payload. Never complete with the wrong output kind.

## collection
- `collection list --run <id> --cloud`, `collection get --run <id> --kind <kind> --cloud`, `collection set` / `append` with `--cloud`.

## studio
- `cognetivy studio` - open Cloud Studio in browser (or use app.cognetivy.com).
