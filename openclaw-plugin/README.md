# Cognetivy OpenClaw Plugin

OpenClaw plugin that exposes Cognetivy workflow, runs, and collections as **agent tools**. The agent can call `cognetivy_run_start`, `cognetivy_workflow_get`, and the rest without using the exec tool or MCP.

**Easiest:** Choose **OpenClaw** in the Cognetivy installer (`npx cognetivy` or `cognetivy install openclaw`). The installer will install this plugin and update your OpenClaw config automatically.

## Manual install

If you prefer to install the plugin yourself (or the installer could not run `openclaw plugins install`):

From the Cognetivy repo after building:

```bash
cd openclaw-plugin
npm install
npm run build
openclaw plugins install .
```

When you install Cognetivy from npm, the plugin is bundled; use the path to the bundled plugin (e.g. `node_modules/cognetivy/dist/openclaw-plugin`) or run the Cognetivy installer and select OpenClaw.

## Enable and configure

1. Restart the OpenClaw Gateway after installing the plugin.

2. In `~/.openclaw/openclaw.json`, enable the plugin and allow its tools for your agent:

```json5
{
  "plugins": {
    "allow": ["cognetivy-openclaw-plugin"],
    "entries": {
      "cognetivy-openclaw-plugin": {
        "enabled": true,
        "config": {
          "workspace": "/path/to/your/project"
        }
      }
    }
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": ["cognetivy-openclaw-plugin"]
        }
      }
    ]
  }
}
```

3. **Workspace:** If your OpenClaw agent workspace is not the project that contains `.cognetivy/`, set `plugins.entries.cognetivy-openclaw-plugin.config.workspace` to that project path. If unset, the plugin uses the agent workspace or `process.cwd()`.

## Tools

The plugin registers one tool per Cognetivy operation, with the `cognetivy_` prefix:

- `cognetivy_workflow_get`, `cognetivy_workflow_set`
- `cognetivy_run_start`, `cognetivy_run_step`, `cognetivy_run_status`, `cognetivy_run_complete`
- `cognetivy_event_append`
- `cognetivy_collection_schema_get`, `cognetivy_collection_schema_set`, `cognetivy_collection_schema_add_kind`
- `cognetivy_collection_list`, `cognetivy_collection_get`, `cognetivy_collection_set`, `cognetivy_collection_append`
- `cognetivy_skills_list`, `cognetivy_skills_get`
- `cognetivy_node_start`, `cognetivy_node_complete`

Parameters and behavior match the [Cognetivy MCP tools](https://github.com/meitarbe/cognetivy#connect-your-agent-mcp).

## Local development

The plugin depends on the local `cli` package via `file:../cli`. Build the CLI first (`cd ../cli && npm run build`), then install and build the plugin.
