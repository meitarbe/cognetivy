# cognetivy

Monorepo for **cognetivy** — reasoning orchestration state (workflows, runs, events, mutations). No LLMs; file-based storage.

## Packages

- **[cli](./cli/)** — npm CLI, MCP server, and Studio (read-only browser UI). Install with `npm i -g ./cli` (or publish and `npm i -g cognetivy`).
- **[studio](./studio/)** — React+Vite+shadcn+React Flow app for Studio; built and bundled by the CLI when you run `npm run build:full` in `cli/`.

See [cli/README.md](./cli/README.md) for quickstart and usage.
