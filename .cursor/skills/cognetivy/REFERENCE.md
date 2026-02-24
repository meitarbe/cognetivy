# Cognetivy CLI reference

Full command reference. Use from project root (directory containing `.cognetivy/`).

## workflow
- `cognetivy workflow get` — print current workflow JSON (nodes, edges, suggested_collection_kinds).
- `cognetivy workflow set --file <path>` — set workflow from JSON file (creates new version).

## run
- `cognetivy run start --input <path> [--name <string>] [--by <string>]` — start run; prints run_id.
- `cognetivy run complete --run <run_id>` — mark run completed.
- `cognetivy run set-name --run <run_id> --name <string>` — set human-readable name.

## event
- `cognetivy event append --run <run_id> --file <path> [--by <string>]` — append one event (JSON: type, data; optional ts, by). Step events need data.step = workflow node id.

## collection-schema
- `cognetivy collection-schema get` — print schema (kinds, required, properties).
- `cognetivy collection-schema set --file <path>` — set schema from JSON.

## collection
- `cognetivy collection list --run <run_id>` — list kinds that have data for run.
- `cognetivy collection get --run <run_id> --kind <kind>` — get all items of kind.
- `cognetivy collection set --run <run_id> --kind <kind> --file <path>` — replace items (file = JSON array).
- `cognetivy collection append --run <run_id> --kind <kind> --file <path> [--id <id>]` — append one item (file = single JSON object).

## studio
- `cognetivy studio [--workspace <path>] [--port <port>]` — open read-only Studio (workflow, runs, events, collections) in browser.
