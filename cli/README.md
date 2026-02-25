# Cognetivy

![Cognetivy Studio: workflow canvas, run details, and data collected](studio_example.jpg)

Cognetivy is an open-source state layer for AI-assisted development: define workflows, track runs and events, and store structured collections in a local `.cognetivy/` workspace. No LLMs inside - just the data and tools your editor's agent uses via [Skills](https://agentskills.io/) and [MCP](https://agentskills.io/). Works with **Cursor**, **Claude Code**, **OpenClaw**, and other MCP-compatible clients.

## Requirements

- **Node.js** ≥ 18
- A project directory (or an empty folder) to create a workspace in
- A coding agent (Cursor, Claude Code, OpenClaw, etc.) working on that directory

---

## Install

Run once with npx (no global install):

```bash
npx cognetivy
```

Or install globally for use from any directory and for MCP:

```bash
npm install -g cognetivy
```

---

## Step-by-step

### Step 1 - Run cognetivy

Open a terminal in your project folder (or an empty folder) and run, an installer will open in the terminal:

```bash
npx cognetivy
```

---

### Step 2 - Use the installer

1. In the installer, choose your coding agent (Claude Code, Cursor, OpenClaw, etc.)
2. Cognetivy will create a `.cognetivy/` workspace in the current folder.
3. Cognetivy will install its skills into the workspace.

---

### Step 3 - Studio opens

When the installer finishes, Cognetivy Studio opens in your browser.

- You’ll see the read-only UI: workflow, runs, and collections.

---

### Step 4 - Ask your agent to create a workflow and run it

In another chat window, ask your agent to create a workflow and run it.

- "Create a workflow with three nodes: one that gathers requirements, one that writes a plan, and one that writes a summary. Save it as the current workflow."
- "Start a run for the current workflow with input with the topic 'user onboarding'."

## Connect your agent (MCP)

Cognetivy works best with **agent skills**, but you can connect via **MCP** so cognetivy tools appear in chat.

### Cursor

1. Open **Settings** → **Tools & MCP** (or **Features** → **MCP**).
2. Click **Add new MCP server**.
3. Set **Name** to `cognetivy`.
4. Set **Command** to `cognetivy` (or the full path if not on PATH).
5. Set **Arguments** to `mcp`. If your project root is not the folder that contains `.cognetivy/`, add `--workspace` and the path to that folder (e.g. `--workspace ./example-usage`).
6. Save and restart Cursor.

Cognetivy tools (workflow, run, event, collection, node, etc.) will then be available in chat.

**Optional — config file:** You can instead add the server to `~/.cursor/mcp.json` (or your project’s `.cursor/mcp.json`):

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

Use `"args": ["mcp", "--workspace", "/path/to/folder/with/.cognetivy"]` if the workspace is not your current project root.

## Commands

| Command | Description |
|--------|-------------|
| `npx cognetivy` | Run installer and open Studio (first time) or open Studio |
| `cognetivy workflow get` | Print current workflow |
| `cognetivy run start --input <file>` | Start a run |
| `cognetivy studio` | Open Studio in the browser |
| `cognetivy mcp` | Start MCP server (for your editor) |
| `cognetivy install cursor` | Install skills into Cursor (`claude`, `openclaw`, `workspace` also supported) |

---

## License

MIT
