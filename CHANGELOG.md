# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- (none)

### Changed

- (none)

### Removed

- (none)

### Fixed

- (none)

## [0.1.33] - 2025-03-08

### Added

- **CLI: expanded skill install targets.** `cognetivy install` and skills commands now support `agents`, `gemini`, `qwen`, `factory`, and `opencode` in addition to `claude`, `cursor`, `openclaw`, and `workspace`. README and CLI README updated.
- **CLI: top-level `cognetivy templates` command.** List templates as JSON with `--list`, or in TTY interactively pick a template to install and set as current workflow; on success opens Studio in the browser.
- **CLI: open Studio after template apply.** `workflow apply-template` and the templates picker open Studio at the default URL after a successful apply.
- **CLI: default collection schema.** Default workflow now gets `summary` and `approved_summary` collection kinds (in addition to existing kinds).
- **CLI: template apply and collection presets.** Applying a template auto-creates collection schema from all node input/output kinds. Added presets for many domain kinds (e.g. requirements, user_lens, solution_options, implementation_plan, release_notes, bug_scope, hypotheses, diagnostics, fix_plan, qa_report) with traceability fields.
- **CLI: new workflow templates.** Competitor analysis, Campaign brief to creative, Brand voice & messaging, Contract review, Compliance checklist. Template picker includes "Default workflow" as first option. Category order updated (Business, Engineering, Developer Experience, Product & Engineering, Marketing, Operations, etc., Legal).
- **CLI: Studio API current workflow fallback.** When `workflows/index.json` has no or invalid `current_workflow_id`, API returns the first workflow as current so the UI always has a valid selection.
- **CLI: workspace helpers.** `workspaceExists`; `ensureWorkspace` with `force` only refreshes default workflow files and no longer overwrites `workflows/index.json`. Removed automatic `.gitignore` snippet appending.
- **Studio: Workflow page.** "Go to runs of version X" link in header; schema drawer hides repeated traceability fields (citations, derived_from, reasoning) and shows a short note.
- **Studio: Entity page.** Empty state copy "Ask your agent to run the current workflow."; table shows a single empty row when there are no display columns and no data.
- **Studio: Runs page.** Empty state message: "No runs yet. Ask your agent to run the current workflow."

### Changed

- **CLI: install TUI.** Template picker is shown only on first-time init (when workspace did not exist before); for existing workspaces, install only updates skills and shows "Skills updated." Force is default true for skill install in TUI. Clearer error when skill already exists (tip to use `--force`). Client option hints show install paths (e.g. `.agents/skills`, `.gemini/skills`). Each installer client maps to the correct target (e.g. CCR→agent, Factory→factory, default→agents).
- **Studio: AppLayout sidebar.** Workflow selector label "Select a workflow"; removed workflow description below the selector.
- **Studio: Onboarding modal.** Shortened copy; editor order "Claude Code, Cursor, OpenClaw"; removed redundant paragraph about asking the AI to create a workflow.
- **Studio: Workflow canvas node drawer.** "Node result" section is only shown when node results are available (run context), avoiding "No node result yet" before a run.
- **Studio: Workflow selection context.** When loading workflows, prefer the server’s current workflow and persist it so CLI actions (e.g. `cognetivy templates`) are reflected in the UI; fallback when no current is set.
- **Studio: Workflow page layout.** Header padding and "Go to runs of version" moved into the same row as the version selector.

### Removed

- **Docs.** Removed `docs/ARCHITECTURE.md`, `docs/EXECUTION_STATE.md`, `docs/PERFECTION_EXECUTION_PLAN.md`, `docs/RELEASING.md`, and `docs/TEMPLATES.md`.

### Fixed

- (none)

## [0.1.31] - 2025-03-06

### Added

- **Studio: first-time onboarding modal.** On first visit, a modal explains that the Studio is read-only and that users should talk to their coding agent (in Cursor, Claude Code, etc.) to create workflows and start runs. Includes a "Don't show this again" checkbox (persisted in localStorage).
- **Studio: onboarding chat simulation.** The modal shows an animated simulation of a conversation: user asks for a competitor-analysis workflow (research from external sources, extract key points, comparison report), starts a run, then asks for a new workflow version; the "Coding Agent" responds in plain language (no CLI commands). Typing animation and a single "Thinking…" state in a fixed bottom bar; simulation is clearly labeled so users do not type in the modal.
- **Studio: onboarding copy and disclaimer.** Prominent note that "This app does not run the AI; it only displays what your AI does via Cognetivy"; simulation callout and header stress "Do not type here—use your editor's chat."
- **Studio: Checkbox component.** Radix-based checkbox in `components/ui/checkbox.tsx` for the onboarding "never show again" option.
- **Studio: `useOnboardingVisibility` hook.** Hook and localStorage key `cognetivy-onboarding-dismissed` to control one-time vs. permanent dismiss of the onboarding modal.

### Changed

- (none)

### Fixed

- (none)

## [0.1.30] - 2025-03-06

### Added

- **Execution planning docs:** Added `docs/PERFECTION_EXECUTION_PLAN.md` and `docs/EXECUTION_STATE.md` for architecture-first ticket sequencing, conflict-avoidance strategy, and token-overrun resume safety.
- **Template system expansion:** Added and expanded a practical workflow template catalog in CLI with richer use-cases.
- **Template parallel DAG lanes:** Every built-in template now includes at least one true parallel level (2 sibling runnable nodes) with valid acyclic fan-out/fan-in structure.
- **Interactive template apply (CLI):** Added `cognetivy workflow apply-template` with interactive picker (TTY) and non-interactive `--id` path.
- **Interactive templates command (CLI):** `cognetivy workflow templates` now opens interactive picker/apply UX by default in TTY; `--list` preserves JSON listing behavior.
- **Workflow page collection schema drawer:** Clicking collection nodes on Workflow page opens a right-side schema drawer.
- **Prompt drawer schema shortcuts:** Input/output collection chips in prompt-node drawer are now clickable and open collection schema drawer.

### Changed

- **Template install UX:** During install, template selection is now mandatory (removed skip option), and picker ordering is non-developer-first.
- **Template apply schema creation:** Applying a template now auto-creates collection schema kinds from all template node input/output collections (not just defaults).
- **Runs page interactions:**
  - Row click navigates directly to run details.
  - Removed icon/action column from runs table.
  - Run name column made bold.
- **Run detail UX:** Improved monitoring/navigation (signal/lag indicator, node-state summaries, event timeline modes, jump actions).
- **Run canvas behavior:**
  - Collected collections are visually marked (green/check).
  - Collection-node click can jump to inline collected data section (run page behavior).
  - Auto-fit zoom behavior improved for init/update.
- **Workflow/collection node affordance:** Removed textual click hints and moved to stronger visual affordance (larger node cards, clearer borders/rings, hover lift/scale/shadow).
- **Collection row spacing in graph:** Increased same-row collection horizontal spacing by ~75px.
- **Run detail side section layout:** Constrained details panel height with internal scroll so lower tables remain visible.
- **Schema drawer rendering:** Replaced raw JSON dump with formatted field UI (type/description + required/optional badges).
- **Tables behavior consolidation:** Runs/collections tables now share compact row behavior and explicit navigation patterns.
- **Table actions simplification:** In collection/entity tables, actions now keep only "Go to collection item".

### Fixed

- **Dropdown UX annoyances:** Improved Select positioning, collision handling, focus-close behavior, scrolling containment, and highlighted/selected states.
- **Collections table item page actions:** Added copy-as-markdown and copy-as-rich-text actions to collection item page.
- **Template flow bug:** Fixed missing collection schema kinds when creating workflows from templates.

### Notes

- Released to npm as `cognetivy@0.1.30`. Changes were compiled from branch diff `main..feat/perfection-master-plan`.

## [0.1.23] - 2025-03-03

- **Workflow nodes: required skills and MCPs:** Nodes can declare `required_skills` (array of skill names) and `required_mcps` (array of MCP server names). CLI: model, validation, studio-server API, default workflow example; skill and MCP instructions document the fields (use `required_skills` not `skills`). Studio: node cards and node detail drawer show Skills and MCPs; workflow node card redesigned (layout, spacing, no ellipsis on I/O and tools).
- **Studio: workflow layout:** Increased node spacing (width, height, gaps) so the DAG is less cramped; vertical spacing tuned for readability.
- **Studio: version diff:** Workflow page "Show changes" switch compares current version to the previous one; added/changed/removed nodes are highlighted (green/amber/red dashed); removed nodes appear as ghosts on the canvas.
- **Studio:** Fixed left sidebar overflow with large collection-kind lists by constraining the collections section in `AppLayout` and enabling independent vertical scrolling, preventing layout breakage when many collections exist.
- **Studio: organized item page layout** (from `codex/organize-item-page-layout`).
- **CLI: update-notifier.** On each run, check npm for a newer version and show the library’s built-in notification when available.
- **CLI: skills version tracking.** Record which CLI version was used when skills were installed (`.cognetivy/skills-version.json` and `.cognetivy-version` in each cognetivy skill dir). If the folder version differs from the current CLI, prompt to reinstall skills; after reinstall, launch Studio and keep the process running.
- **Released to npm** as `cognetivy@0.1.23`.

## [0.1.10] - 2025-03-02

- **Studio: polling and version selection:** Collection schema and workflow list now poll every 2s so schema and sidebar stay in sync with the server. Workflow version poll interval reduced from 3s to 2s. Version selection fixed: when loading a workflow, the selected version is set to the URL version or current version only if it exists in the version list; otherwise the first available version is used, avoiding invalid/stale version IDs.

## [0.1.9] - 2025-03-01

- **Tooling:** Repo pins npm via `packageManager` (npm@10.9.4) for consistent installs; CONTRIBUTING.md documents npm 7+ and optional Corepack. Lockfile and package version synced for open-source release.
- **Run engine:** New run-engine module computes the next step from run state and workflow DAG (topological order). CLI `run start` / `run status` / `run step` and MCP `run_start` / `run_status` / `run_step` return `next_step` (action: `run_node`, `run_nodes_parallel`, `complete_node`, `complete_run`, or `done`), `current_node_id`, and `current_node_ids`. Agent flow: follow the hint; no guessing.
- **Parallel nodes (deterministic in progress):** When multiple nodes are runnable at the same level, run-engine returns `run_nodes_parallel` with `runnable_node_ids`. Running `run step --run <id>` (no `--node`) causes the CLI and MCP to start all those nodes in one go (step_started + started node result per node), so every parallel node is in progress without relying on sub-agents to call start. Sub-agents do the work and complete with `run step --run <id> --node <node_id> --collection-kind <kind>` and payload. Skill and run-engine hint: you must spawn one sub-agent per node unless the user says otherwise.
- **Traceability:** Optional `citations`, `derived_from`, and `reasoning` are merged into every collection kind's item schema (except `run_input`) via traceability-schema. Default schema and kind-templates use it; skill and MCP describe traceability. Studio: `TraceabilityDisplay` and collection item detail/page show citations (external links and internal item refs), derived-from links, and reasoning; table and generic item view exclude these keys.
- **CLI/MCP:** `run step --run <id> --node <node_id>` with no payload starts that node only (step_started + started node result). MCP `run_step` tool aligned with CLI (start-all for parallel, `current_node_ids` in responses).
- **Agent behavior (skill + workflow + Studio):** Improved how agents act with Cognetivy: (1) Source discipline - skill and default workflow direct agents to rely only on given or retrieved sources and to verify URLs instead of inventing them. (2) Proactive version suggestions - skill instructs agents to suggest newer dependency/tool versions when relevant. (3) Long, specific prompts - skill and default node prompts encourage detailed prompts; Studio shows a hint in the node detail sheet. (4) Minimum rows - new optional `minimum_rows` node prop (validated as positive integer); default retrieve_sources node sets it to 5; skill and MCP describe it; Studio displays it in the workflow node sheet. (5) Default collection schema gains a `sources` kind (url, title, excerpt) with description that URLs must be verified.
- **Workflows:** Validate that workflow dataflow is acyclic (DAG). Saving or setting a workflow with a cycle in input/output collections now fails with a clear validation error. MCP and skills docs updated to require single connected DAG with no cycles.
- **Studio:** Node prompts and descriptions load on demand when opening a node in the workflow canvas (smaller initial payload, faster load). Run detail and workflow pages use the new behavior.
- **Workspace:** Version listing uses a `version_ids.json` manifest per workflow for faster listing; created or updated when listing or writing versions. Missing manifest falls back to directory listing.

## [0.1.6] - 2025-02-25

- Initial public release as open-source.
- CLI: installer, workflow, run, event, collection, and MCP server.
- Studio: read-only UI for workflow DAG, runs, events, and collections.
- Skills installation for Cursor, Claude Code, OpenClaw, and workspace.

[Unreleased]: https://github.com/meitarbe/cognetivy/compare/v0.1.33...HEAD
[0.1.33]: https://github.com/meitarbe/cognetivy/compare/v0.1.31...v0.1.33
[0.1.31]: https://github.com/meitarbe/cognetivy/compare/v0.1.30...v0.1.31
[0.1.30]: https://github.com/meitarbe/cognetivy/compare/v0.1.23...v0.1.30
[0.1.23]: https://github.com/meitarbe/cognetivy/compare/v0.1.10...v0.1.23
[0.1.10]: https://github.com/meitarbe/cognetivy/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/meitarbe/cognetivy/compare/v0.1.6...v0.1.9
[0.1.6]: https://github.com/meitarbe/cognetivy/releases/tag/v0.1.6
