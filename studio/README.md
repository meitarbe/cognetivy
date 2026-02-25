# Cognetivy Studio

Read-only React UI for the Cognetivy workspace: workflow DAG, runs, events, artifacts, mutations, and artifact schema.

## Development (hot reload)

To run the Studio in **dev mode** with a **selected workspace folder**:

1. **Terminal 1 - start the Studio API** (from repo root or any directory):
   ```bash
   cognetivy studio --api-only --workspace <path-to-workspace>
   ```
   Example:
   ```bash
   cognetivy studio --api-only --workspace ../example-usage
   ```
   Uses port **3742** by default. Leave this running.

2. **Terminal 2 - start Vite dev server**:
   ```bash
   npm run dev
   ```
   Open **http://localhost:5173**. The app proxies `/api` to the API server, so the UI shows data from the workspace you passed in step 1.

If you run the API on a different port (e.g. `cognetivy studio --api-only --port 3750`), set the same port in `vite.config.ts` under `server.proxy["/api"].target`.

## Build

```bash
npm run build
```

The built output is intended to be copied into `cli/dist/studio` via `cd cli && npm run build:full` so that `cognetivy studio` serves the app without running Vite.
