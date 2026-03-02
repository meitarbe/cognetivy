# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Studio:** Fixed left sidebar overflow with large collection-kind lists by constraining the collections section in `AppLayout` and enabling independent vertical scrolling, preventing layout breakage when many collections exist.

## [0.1.9] - 2025-03-01

- **Tooling:** Repo pins npm via `packageManager` (npm@10.9.4) for consistent installs; CONTRIBUTING.md documents npm 7+ and optional Corepack. Lockfile and package version synced for open-source release.
- **Run engine:** New run-engine module computes the next step from run state and workflow DAG (topological order). CLI `run start` / `run status` / `run step` and MCP `run_start` / `run_status` / `run_step` return `next_step` (action: `run_node`, `run_nodes_parallel`, `complete_node`, `complete_run`, or `done`), `current_node_id`, and `current_node_ids`. Agent flow: follow the hint; no guessing.
- **Parallel nodes (deterministic in progress):** When multiple nodes are runnable at the same level, run-engine returns `run_nodes_parallel` with `runnable_node_ids`. Running `run step --run <id>` (no `--node`) causes the CLI and MCP to start all those nodes in one go (step_started + started node result per node), so every parallel node is in progress without relying on sub-agents to call start. Sub-agents do the work and complete with `run step --run <id> --node <node_id> --collection-kind <kind>` and payload. Skill and run-engine hint: you must spawn one sub-agent per node unless the user says otherwise.
- **Traceability:** Optional `citations`, `derived_from`, and `reasoning` are merged into every collection kind's item schema (except `run_input`) via traceability-schema. Default schema and kind-templates use it; skill and MCP describe traceability. Studio: `TraceabilityDisplay` and collection item detail/page show citations (external links and internal item refs), derived-from links, and reasoning; table and generic item view exclude these keys.
- **CLI/MCP:** `run step --run <id> --node <node_id>` with no payload starts that node only (step_started + started node result). MCP `run_step` tool aligned with CLI (start-all for parallel, `current_node_ids` in responses).
- **Agent behavior (skill + workflow + Studio):** Improved how agents act with Cognetivy: (1) Source discipline—skill and default workflow direct agents to rely only on given or retrieved sources and to verify URLs instead of inventing them. (2) Proactive version suggestions—skill instructs agents to suggest newer dependency/tool versions when relevant. (3) Long, specific prompts—skill and default node prompts encourage detailed prompts; Studio shows a hint in the node detail sheet. (4) Minimum rows—new optional `minimum_rows` node prop (validated as positive integer); default retrieve_sources node sets it to 5; skill and MCP describe it; Studio displays it in the workflow node sheet. (5) Default collection schema gains a `sources` kind (url, title, excerpt) with description that URLs must be verified.
- **Workflows:** Validate that workflow dataflow is acyclic (DAG). Saving or setting a workflow with a cycle in input/output collections now fails with a clear validation error. MCP and skills docs updated to require single connected DAG with no cycles.
- **Studio:** Node prompts and descriptions load on demand when opening a node in the workflow canvas (smaller initial payload, faster load). Run detail and workflow pages use the new behavior.
- **Workspace:** Version listing uses a `version_ids.json` manifest per workflow for faster listing; created or updated when listing or writing versions. Missing manifest falls back to directory listing.

## [0.1.6] - 2025-02-25

- Initial public release as open-source.
- CLI: installer, workflow, run, event, collection, and MCP server.
- Studio: read-only UI for workflow DAG, runs, events, and collections.
- Skills installation for Cursor, Claude Code, OpenClaw, and workspace.

[Unreleased]: https://github.com/meitarbe/cognetivy/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/meitarbe/cognetivy/compare/v0.1.6...v0.1.9
[0.1.6]: https://github.com/meitarbe/cognetivy/releases/tag/v0.1.6
