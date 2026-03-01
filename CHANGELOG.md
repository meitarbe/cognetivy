# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Agent behavior (skill + workflow + Studio):** Improved how agents act with Cognetivy: (1) Source discipline—skill and default workflow direct agents to rely only on given or retrieved sources and to verify URLs instead of inventing them. (2) Proactive version suggestions—skill instructs agents to suggest newer dependency/tool versions when relevant. (3) Long, specific prompts—skill and default node prompts encourage detailed prompts; Studio shows a hint in the node detail sheet. (4) Minimum rows—new optional `minimum_rows` node prop (validated as positive integer); default retrieve_sources node sets it to 5; skill and MCP describe it; Studio displays it in the workflow node sheet. (5) Default collection schema gains a `sources` kind (url, title, excerpt) with description that URLs must be verified.
- **Workflows:** Validate that workflow dataflow is acyclic (DAG). Saving or setting a workflow with a cycle in input/output collections now fails with a clear validation error. MCP and skills docs updated to require single connected DAG with no cycles.
- **Studio:** Node prompts and descriptions load on demand when opening a node in the workflow canvas (smaller initial payload, faster load). Run detail and workflow pages use the new behavior.
- **Workspace:** Version listing uses a `version_ids.json` manifest per workflow for faster listing; created or updated when listing or writing versions. Missing manifest falls back to directory listing.

## [0.1.6] - 2025-02-25

- Initial public release as open-source.
- CLI: installer, workflow, run, event, collection, and MCP server.
- Studio: read-only UI for workflow DAG, runs, events, and collections.
- Skills installation for Cursor, Claude Code, OpenClaw, and workspace.

[Unreleased]: https://github.com/meitarbe/cognetivy/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/meitarbe/cognetivy/releases/tag/v0.1.6
