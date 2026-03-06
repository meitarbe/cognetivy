<p align="center">
  <img src="studio/public/favicon.png" alt="Cognetivy" width="96" height="96" />
</p>

# Cognetivy

[![npm version](https://img.shields.io/npm/v/cognetivy.svg)](https://www.npmjs.com/package/cognetivy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Website:** [cognetivy.com](https://cognetivy.com)

🎬 **Quick product video (top):**

<video src="docs/media/readme/studio-walkthrough.mp4" controls playsinline width="100%"></video>

If video embed doesn't render on your viewer, open directly:
- [MP4](docs/media/readme/studio-walkthrough.mp4)
- [WEBM](docs/media/readme/studio-walkthrough.webm)

Cognetivy is an open-source orchestration + memory layer for AI agents.
It gives your agent a structured local workspace (`.cognetivy/`) to manage:

- **Workflows** (how work should happen)
- **Runs** (what happened each execution)
- **Events** (timeline + state transitions)
- **Collections** (structured outputs with schema)

It works with Claude Code, Cursor, OpenClaw, and other MCP/Skills-compatible clients.

---

## Why teams use Cognetivy

Without Cognetivy, important agent context gets lost in chat logs.
With Cognetivy, work becomes **traceable, repeatable, and inspectable**.

- ✅ Re-run the same process with new input
- ✅ Audit decisions and generated artifacts
- ✅ Keep outputs structured and queryable
- ✅ Make agent workflows easier to debug and improve

---

## Product tour (captured with Playwright)

### Workflow view
![Workflow page](docs/media/readme/studio-workflow.png)

### Runs list
![Runs page](docs/media/readme/studio-runs.png)

### Run detail
![Run detail page](docs/media/readme/studio-run-detail.png)

### Collections/data
![Collections page](docs/media/readme/studio-collections.png)

🎬 **Walkthrough video:** [Open studio walkthrough (webm)](docs/media/readme/studio-walkthrough.webm)

---

## Install

### Option A — one-shot (recommended)

```bash
npx cognetivy
```

This starts the interactive installer and opens Studio.

### Option B — global

```bash
npm install -g cognetivy
```

---

## 2-minute quick start

1. Open your project folder
2. Run:

```bash
npx cognetivy
```

3. In the installer:
   - choose your tool(s): OpenClaw / Claude Code / Cursor / etc.
   - choose a workflow template (interactive)
4. Studio opens automatically

That’s it — you now have a working `.cognetivy/` workspace.

---

## Templates

Cognetivy ships practical templates (product, ops, sales, marketing, research, people-ops, and more).

```bash
# interactive template picker + apply
cognetivy workflow templates

# list templates as JSON
cognetivy workflow templates --list

# apply specific template directly
cognetivy workflow apply-template --id bug-triage-and-fix
```

Applying a template creates a workflow, sets it current, and creates needed collection schema kinds.

See full gallery: [docs/TEMPLATES.md](docs/TEMPLATES.md)

### Example use case: Competitor analysis (real companies, publicly listed pages)

Below is a realistic competitor snapshot (from public company/pricing pages, March 2026).

| competitor | site | public pricing page | listed starting price* | model |
|---|---|---|---:|---|
| Asana | <https://asana.com> | <https://asana.com/pricing> | $13.49/user/mo | seat-based |
| Monday.com | <https://monday.com> | <https://monday.com/pricing> | ~$9/user/mo | seat-based |
| ClickUp | <https://clickup.com> | <https://clickup.com/pricing> | $10/user/mo | seat-based |
| Notion | <https://www.notion.so> | <https://www.notion.so/pricing> | $10/user/mo | seat-based |
| Linear | <https://linear.app> | <https://linear.app/pricing> | $8/user/mo | seat-based |
| Jira | <https://www.atlassian.com/software/jira> | <https://www.atlassian.com/software/jira/pricing> | ~$8.60/user/mo | seat-based |

\*Pricing can change by region, billing cycle, and plan changes.

**Example structured insight:**
- Most competitors anchor on seat-based entry tiers between roughly $8–$14/user/mo.
- Teams comparing tools care strongly about onboarding speed + integration depth, not just task boards.
- Positioning opportunity: emphasize traceability/auditability for AI-agent workflows, where generic PM tools are weaker.

---

## Core commands

```bash
# open Studio
cognetivy studio

# show current workflow
cognetivy workflow get

# start a run
cognetivy run start --input input.json --name "My run"

# check next step / status
cognetivy run status --run <run_id>

# run as MCP server
cognetivy mcp
```

---

## Use with Cursor (MCP)

1. Cursor → Settings → Tools & MCP
2. Add MCP server:
   - **Name:** `cognetivy`
   - **Command:** `cognetivy`
   - **Args:** `mcp`

If your `.cognetivy/` is in another folder, pass `--workspace <path>` in args.

---

## Who this is for

- Solo builders using coding agents daily
- Teams needing auditability of agent output
- Projects that require repeatable agent workflows
- Anyone tired of losing context across sessions

---

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Issues](https://github.com/meitarbe/cognetivy/issues)

## License

[MIT](LICENSE)
