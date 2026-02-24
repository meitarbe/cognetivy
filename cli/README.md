# cognetivy

Reasoning orchestration state: workflow structure, run logs, versioned mutations, and **structured artifacts**. **No LLMs** — cognetivy stores workflow definitions, run metadata, append-only event logs (NDJSON), workflow mutations (JSON Patch), and schema-backed artifact entities (sources, collected data, ideas) that agents can read and write with a known, modifiable schema.

- **Global CLI**: install once, use in any folder. All project state lives in a folder-local workspace (`.cognetivy/`).
- **Config**: user-level defaults in `~/.config/cognetivy/config.json` (via [env-paths](https://www.npmjs.com/package/env-paths)); local overrides in `.cognetivy/config.json`.
- **MCP server**: same operations exposed as tools for Cursor/agents via `cognetivy mcp [--workspace <path>]`.
- **Studio**: read-only browser UI for workflow, runs, events, artifacts, and mutations via `cognetivy studio [--workspace <path>] [--port <port>]`.

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
  artifact-schema.json        # entity kinds and schema (agent-defined; empty by default)
  workflow.versions/
    wf_v1.json               # immutable workflow version files
  runs/
    <run_id>.json            # run metadata
  events/
    <run_id>.ndjson          # append-only event log per run
  mutations/
    <mutation_id>.json       # proposed mutation patches + status
  artifacts/
    <run_id>/
      <kind>.json            # per-run artifact data (when kind has global: false)
  data/
    <kind>.json              # cross-run entity data (when kind has global: true)
```

By default, `cognetivy init` adds a `.gitignore` snippet so `runs/`, `events/`, `mutations/`, and `artifacts/` are ignored; `workflow.versions/` and `artifact-schema.json` are intended to be committed. Use `--no-gitignore` to skip.

## CLI commands

| Command | Description |
|--------|--------------|
| `cognetivy init` | Create `.cognetivy/` and default workflow. Options: `--no-gitignore`, `--force` |
| `cognetivy workflow get` | Print current workflow version JSON to stdout |
| `cognetivy workflow set --file <path>` | Set workflow from JSON file (creates new version, updates pointer) |
| `cognetivy run start --input <path> [--name <string>] [--by <string>]` | Start a run; prints `run_id` |
| `cognetivy run set-name --run <run_id> --name <string>` | Set human-readable name for an existing run |
| `cognetivy event append --run <run_id> --file <path> [--by <string>]` | Append one event (JSON) to run's NDJSON log |
| `cognetivy mutate propose --patch <path> --reason "<text>" [--by <string>]` | Propose a mutation (JSON Patch); prints `mutation_id` |
| `cognetivy mutate apply <mutation_id> [--by <string>]` | Apply a proposed mutation (new version, update pointer) |
| `cognetivy artifact-schema get` | Print artifact schema (kinds + required fields) to stdout |
| `cognetivy artifact-schema set --file <path>` | Set artifact schema from JSON file |
| `cognetivy artifact list --run <run_id>` | List artifact kinds that have data for a run |
| `cognetivy artifact get --run <run_id> --kind <kind>` | Get all artifacts of a kind for a run |
| `cognetivy artifact set --run <run_id> --kind <kind> --file <path>` | Replace artifacts of a kind (JSON array) |
| `cognetivy artifact append --run <run_id> --kind <kind> --file <path> [--id <id>]` | Append one artifact item (validated) |
| `cognetivy install claude \| openclaw \| workspace [--force]` | Install skills from current directory (SKILL.md or skills/*) into target |
| `cognetivy skills list [--source <agent\|openclaw\|workspace>] [--eligible]` | List skills from configured sources |
| `cognetivy skills info <name>` | Show one skill (path, frontmatter, body preview) |
| `cognetivy skills check [path]` | Validate SKILL.md (path = skill dir; omit to check all) |
| `cognetivy skills paths` | Print discovery and install target paths |
| `cognetivy skills install [source] [--target agent\|openclaw\|workspace] [--force]` | Install from local path or git URL (omit source = current directory) |
| `cognetivy skills update [name] [--target <target>] [--all] [--dry-run]` | Update skill(s) from recorded origin |
| `cognetivy mcp [--workspace <path>]` | Start MCP server over stdio for Cursor/agents |
| `cognetivy studio [--workspace <path>] [--port <port>]` | Start read-only Studio and open in browser |
| `cognetivy studio --api-only [--workspace <path>] [--port <port>]` | Serve only the Studio API (for dev with Vite; see Studio dev mode below) |

## Skills (Agent skills and OpenClaw skills)

cognetivy supports the **SKILL.md** format (Agent skills / OpenClaw skills): a directory containing `SKILL.md` with YAML frontmatter (`name`, `description`, optional `license`, `compatibility`, `metadata`, `allowed-tools`) and markdown instructions. You can manage skills **without using MCP** — install, update, list, and validate from the CLI so that agents (e.g. OpenClaw, Cursor, and other compatible tools) load them from disk.

- **Discovery sources**: `agent` (e.g. `~/.cursor/skills`, `.cursor/skills`), `openclaw` (`~/.openclaw/workspace/skills` and `skills.load.extraDirs` from `~/.openclaw/openclaw.json`), `workspace` (`.cognetivy/skills` and user config dir).
- **Install (target-specific)**: From the current directory, run `cognetivy install claude`, `cognetivy install openclaw`, or `cognetivy install workspace`. Supports two folder layouts: a single skill with `SKILL.md` in the current directory, or a pack with `skills/<skill-name>/SKILL.md` for each skill. Installs into the standard dirs for that target (e.g. claude → `~/.claude/skills` and `.claude/skills`; openclaw → `~/.openclaw/workspace/skills`).
- **Install (skills subcommand)**: `cognetivy skills install` (or with a path/git URL) installs from current directory or source; use `--target` or default `workspace`. Same folder layout (SKILL.md in cwd or `skills/*/SKILL.md`). Origin is recorded for `skills update`.
- **Config** (in `~/.config/cognetivy/config.json` or `.cognetivy/config.json`):
  - `skills.sources` — which sources to scan when listing (default: all).
  - `skills.extraDirs` — extra directories to scan.
  - `skills.default_install_target` — default for `install` / `update` when `--target` is omitted.

When using the cognetivy MCP server (e.g. in Cursor), the tools **skills_list** and **skills_get** let the agent discover and load skill content on demand.

## MCP tools (1:1 with CLI)

- `workflow_get()` — get current workflow JSON
- `workflow_set(workflow_json)` — set workflow (new version)
- `run_start(input_json, name?, by?)` — start run; returns `run_id`
- `event_append(run_id, event_json, by?)` — append event to run
- `mutate_propose(patch_json, reason, by?)` — propose mutation; returns `mutation_id`
- `mutate_apply(mutation_id, by?)` — apply mutation
- `artifact_schema_get()` — get artifact schema (kinds and required fields)
- `artifact_schema_set(schema_json)` — set artifact schema (agent defines kinds; use `global: true` for cross-run kinds)
- `artifact_list(run_id)` — list artifact kinds with data for run
- `artifact_get(run_id, kind)` — get structured artifacts for a kind
- `artifact_set(run_id, kind, items)` — replace all items for a kind (schema-validated)
- `artifact_append(run_id, kind, payload, id?)` — append one item (schema-validated); returns item with `id`, `created_at`
- `skills_list(sources?)` — list Agent/OpenClaw skills (name, description, path, source)
- `skills_get(name)` — get full SKILL.md content for a skill by name

If the workspace is missing, the MCP server exits with a message to run `cognetivy init`.

## Connecting Cursor to cognetivy MCP

So Cursor (or another MCP client) can call cognetivy tools:

1. **Install cognetivy** (if not already):  
   `npm i -g cognetivy` or from this repo: `npm i -g ./cli`

2. **Add the MCP server** in Cursor:

   - **Settings → Tools & MCP → Add new MCP server**, then:
     - **Name**: `cognetivy`
     - **Type**: `command`
     - **Command**: `cognetivy` (or full path to the CLI)
     - **Args**: `mcp` — or `mcp`, `--workspace`, `/path/to/your/project` if the project with `.cognetivy/` is not the current folder.

   - **Or** put a config file in your project (the one that has `.cognetivy/`):

     **Project-level** — in the project root (e.g. `example-usage/.cursor/mcp.json`):

     ```json
     {
       "mcpServers": {
         "cognetivy": {
           "command": "cognetivy",
           "args": ["mcp"]
         }
       }
     }
     ```

     Cursor usually starts the server with the project root as cwd, so `cognetivy mcp` will use that project’s `.cognetivy/`.

   - **Or** use a **global** config at `~/.cursor/mcp.json` with the same `mcpServers.cognetivy` entry. Then the workspace is the folder you have open in Cursor; if your repo root is not the folder with `.cognetivy/`, use:

     ```json
     "args": ["mcp", "--workspace", "/absolute/path/to/folder/with/.cognetivy"]
     ```

3. **Restart Cursor** so it picks up the new MCP server.

4. In chat, the cognetivy tools (workflow, run, event, mutate, and **artifact** / **artifact_schema**) should appear and be callable by the agent.

In this repo, the root `.cursor/mcp.json` is set to `--workspace example-usage` so the agent uses the `example-usage` workspace when you have the cognetivy repo open.

## Studio (read-only visualization)

Run `cognetivy studio [--workspace <path>] [--port <port>]` to start a local HTTP server and open a browser to a read-only UI that shows the current workflow (DAG), runs, events, artifacts, mutations, and artifact schema. Default port is 3742. The server binds to 127.0.0.1. No write operations; the UI polls the API every few seconds for updates.

From the repo, build the CLI and Studio together so the Studio app is embedded: `cd cli && npm run build:full`. Then run `cognetivy studio --workspace example-usage` (or `node cli/dist/cli.js studio --workspace example-usage`).

### Studio dev mode (hot reload with a selected workspace)

To run the Studio UI in **development mode** (Vite hot reload) against a specific workspace:

1. **Terminal 1 — API only** (from repo root or any directory):
   ```bash
   cognetivy studio --api-only --workspace <path-to-workspace> [--port 3742]
   ```
   Example: `cognetivy studio --api-only --workspace example-usage`  
   Leave this running. Default port is 3742; if you use a different `--port`, update the proxy in `studio/vite.config.ts` to match.

2. **Terminal 2 — Vite dev server**:
   ```bash
   cd studio && npm run dev
   ```
   Then open **http://localhost:5173** in your browser. The app proxies `/api` to the API server, so the UI uses the workspace you started in terminal 1.

## Data formats

- **workflow.json**: `{ "workflow_id", "current_version" }`
- **workflow.versions/wf_vN.json**: `{ "workflow_id", "version", "nodes", "edges" }` (nodes have `id`, `type`, `contract`, optional `description`)
- **artifact-schema.json**: `{ "kinds": { "<kind>": { "description", "required": [], "properties": {} } } }` — modifiable; default kinds: `sources`, `collected`, `ideas`
- **artifacts/<run_id>/<kind>.json**: `{ "run_id", "kind", "updated_at", "items": [ { "id?", "created_at?", ...payload } ] }` — items validated against schema
- **runs/<run_id>.json**: `{ "run_id", optional "name", "workflow_id", "workflow_version", "status", "input", "created_at" }`
- **events/<run_id>.ndjson**: one JSON object per line (`ts`, `type`, `by`, `data`)
- **mutations/<mutation_id>.json**: RFC 6902 JSON Patch + `target`, `reason`, `status`, `applied_to_version` when applied

## Development

```bash
cd cli
npm install
npm run build
npm test
```

To build the CLI with the Studio app embedded (so `cognetivy studio` serves the UI): `npm run build:full` from the `cli` directory (builds the sibling `studio/` app and copies its output into `cli/dist/studio`).

Tests use Node's built-in test runner and cover: init structure, run start + event append, artifact schema/storage, and mutate apply (v2 + pointer update).

## License

MIT
