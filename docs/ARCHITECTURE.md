# Architecture

High-level overview for contributors and maintainers.

## Repo layout

- **`cli/`** — Published npm package **cognetivy**
  - **CLI** (`dist/cli.js`): Commands (workflow, run, event, collection, studio, mcp, install).
  - **MCP server** (`dist/mcp.js`): Exposed via `cognetivy mcp`; tools for workflows, runs, events, collections, nodes.
  - **Studio server** (`dist/studio-server.js`): HTTP API + static file server for the Studio UI (used by `cognetivy studio`).
  - **Workspace** (`.cognetivy/`): All state lives under the project directory; see below.
- **`studio/`** — React SPA (Vite). Build output is copied to `cli/dist/studio/` so the CLI can serve it without running Vite.

## Data and API

- **Workspace** (`.cognetivy/` in the project root): workflow index, workflow records and versions, runs, events, collections, node results. No remote server; everything is local.
- **Studio API**: The CLI’s Studio server serves JSON over `/api/*` (workflows, runs, events, collections) and serves the built Studio app as static files. In dev, Vite proxies `/api` to the CLI’s `--api-only` server.

## Key modules (cli)

- **`workspace.js`** — Read/write for all `.cognetivy/` paths and file formats.
- **`config.js`** — Merged config (e.g. `default_by`) from workspace and env.
- **`validate.js`** — Workflow and run validation (e.g. Ajv).
- **`mcp.js`** — MCP server and tool handlers (call into workspace/config/validate).
- **`studio-server.js`** — HTTP server: API routes + static serve of `dist/studio`.
- **`skills.js`** — Listing and installing skills into Cursor/Claude/OpenClaw/workspace.

## Versioning and releases

- Only **`cli/`** is versioned and published to npm. Studio is private and bundled via `build:studio`.
- See [RELEASING.md](RELEASING.md) for the release process.
