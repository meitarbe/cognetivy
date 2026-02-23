# cognetivy

Reasoning orchestration state: workflow structure, run logs, and versioned mutations. **No LLMs** — cognetivy only stores workflow definitions, run metadata, append-only event logs (NDJSON), and workflow mutations (JSON Patch).

- **Global CLI**: install once, use in any folder. All project state lives in a folder-local workspace (`.cognetivy/`).
- **Config**: user-level defaults in `~/.config/cognetivy/config.json` (via [env-paths](https://www.npmjs.com/package/env-paths)); local overrides in `.cognetivy/config.json`.
- **MCP server**: same operations exposed as tools for Cursor/agents via `cognetivy mcp [--workspace <path>]`.

## Quickstart

```bash
npm i -g .          # or: npm i -g cognetivy
cognetivy init
cognetivy workflow get
cognetivy run start --input sample_input.json
```

## Workspace layout (created by `cognetivy init`)

```
./.cognetivy/
  workflow.json              # pointer to current workflow version
  workflow.versions/
    wf_v1.json               # immutable workflow version files
  runs/
    <run_id>.json            # run metadata
  events/
    <run_id>.ndjson          # append-only event log per run
  mutations/
    <mutation_id>.json       # proposed mutation patches + status
```

By default, `cognetivy init` adds a `.gitignore` snippet so `runs/`, `events/`, and `mutations/` are ignored; `workflow.versions/` is intended to be committed. Use `--no-gitignore` to skip.

## CLI commands

| Command | Description |
|--------|--------------|
| `cognetivy init` | Create `.cognetivy/` and default workflow. Options: `--no-gitignore`, `--force` |
| `cognetivy workflow get` | Print current workflow version JSON to stdout |
| `cognetivy workflow set --file <path>` | Set workflow from JSON file (creates new version, updates pointer) |
| `cognetivy run start --input <path> [--by <string>]` | Start a run; prints `run_id` |
| `cognetivy event append --run <run_id> --file <path> [--by <string>]` | Append one event (JSON) to run's NDJSON log |
| `cognetivy mutate propose --patch <path> --reason "<text>" [--by <string>]` | Propose a mutation (JSON Patch); prints `mutation_id` |
| `cognetivy mutate apply <mutation_id> [--by <string>]` | Apply a proposed mutation (new version, update pointer) |
| `cognetivy mcp [--workspace <path>]` | Start MCP server over stdio for Cursor/agents |

## MCP tools (1:1 with CLI)

- `workflow_get()` — get current workflow JSON
- `workflow_set(workflow_json)` — set workflow (new version)
- `run_start(input_json, by?)` — start run; returns `run_id`
- `event_append(run_id, event_json, by?)` — append event to run
- `mutate_propose(patch_json, reason, by?)` — propose mutation; returns `mutation_id`
- `mutate_apply(mutation_id, by?)` — apply mutation

If the workspace is missing, the MCP server exits with a message to run `cognetivy init`.

## Data formats

- **workflow.json**: `{ "workflow_id", "current_version" }`
- **workflow.versions/wf_vN.json**: `{ "workflow_id", "version", "nodes", "edges" }` (nodes have `id`, `type`, `contract`)
- **runs/<run_id>.json**: `{ "run_id", "workflow_id", "workflow_version", "status", "input", "created_at" }`
- **events/<run_id>.ndjson**: one JSON object per line (`ts`, `type`, `by`, `data`)
- **mutations/<mutation_id>.json**: RFC 6902 JSON Patch + `target`, `reason`, `status`, `applied_to_version` when applied

## Development

```bash
cd cli
npm install
npm run build
npm test
```

Tests use Node's built-in test runner and cover: init structure, run start + event append, and mutate apply (v2 + pointer update).

## License

MIT
