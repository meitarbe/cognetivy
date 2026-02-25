# Cognetivy

![Cognetivy Studio: workflow canvas, run details, and data collected](studio_example.jpg)

**Workflow and reasoning state for your coding agent.** One command, then follow the steps. Your agent (Cursor, Claude Code, OpenClaw) can create workflows and run them from chat.

---

## Step-by-step

### Step 1 — Run cognetivy

Open a terminal in your project folder (or an empty folder) and run:

```bash
npx cognetivy
```

No install needed — npx runs it once.

---

### Step 2 — Use the installer

An installer opens in the terminal.

1. It creates a `.cognetivy/` workspace in the current folder.
2. It asks which tools you use (Cursor, Claude Code, OpenClaw, etc.).
3. Select yours (space to select, enter to continue). Cognetivy installs its skills there.

---

### Step 3 — Studio opens

When the installer finishes, Studio opens in your browser.

- You’ll see the read-only UI: workflow, runs, events, and collections.
- If you just created the workspace, it may be empty until your agent creates a workflow and runs it.

---

### Step 4 — Add cognetivy to your coding agent (MCP)

So your agent can create and run workflows from chat:

1. In your editor, open **Settings → Tools & MCP → Add new** (in Cursor; similar in Claude Code / OpenClaw).
2. Set:
   - **Command:** `cognetivy` (or `npx` if not installed globally)
   - **Args:** `mcp` (if using npx: `cognetivy`, `mcp`)
3. Save and **restart the editor**. Cognetivy tools will appear in chat.

*(Optional: install globally with `npm install -g cognetivy` so you can use `cognetivy` as the command without npx.)*

---

### Step 5 — Ask your agent (example questions)

In chat, you can ask your agent with concrete questions. For example:

- *"Create a workflow with two nodes: one that gathers requirements, one that writes a plan. Save it as the current workflow."*
- *"Start a run for the current workflow with input `{\"topic\": \"user onboarding\"}` and tell me the run id."*
- *"Show me the status of the latest run."*
- *"What’s in the collection `sources` for run &lt;run_id&gt;?"*
- *"Summarize what runs we have."*

Your agent uses cognetivy’s tools to define workflows, start runs, and store data — all in this project’s `.cognetivy/` workspace.

---

## What’s in the box

- **Workspace** — One `.cognetivy/` per project; workflow versions, runs, events, and collections live here.
- **Studio** — Browser UI: run `npx cognetivy` again or `cognetivy studio`.
- **Skills** — Installed in step 2; or run `cognetivy install cursor` (or `claude` / `openclaw`) anytime.
- **MCP** — Same operations as the CLI, so your agent drives everything from chat.

---

## Commands (when you need them)

| Command | What it does |
|--------|----------------|
| `npx cognetivy` | First time: installer + Studio. Next times: open Studio. |
| `cognetivy workflow get` | Show current workflow |
| `cognetivy run start --input <json>` | Start a run |
| `cognetivy studio` | Open Studio |
| `cognetivy mcp` | Start MCP server (for your editor) |
| `cognetivy install cursor` | Install skills into Cursor (same for `claude`, `openclaw`) |

---

## Development

```bash
cd cli && npm install && npm run build && npm test
```

**Publish:** From `cli`, with a clean tree: `npm run release` (patch), `npm run release:minor`, or `npm run release:major`, then `git push && git push --tags`.

---

## License

MIT
