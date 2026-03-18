---
name: cognetivy
description: Manage workflows, runs, and collections on Cognetivy Cloud. Use when the user asks to start/complete a run, execute workflow nodes, or read/write structured data. No local .cognetivy/ folder; use --cloud on CLI commands. Sign in with cognetivy login first.
---

# Cognetivy (Cloud)

Workflows, runs, and collections on **Cognetivy Cloud**. Run commands with `--cloud` (or rely on default when authenticated). Full reference: [REFERENCE.md](REFERENCE.md).

---

## When to use this skill

- User asks to start/complete a run, run the workflow, track steps, or persist ideas/sources/collections.
- User refers to "cognetivy", "workflow", "run", "collections" in a cloud context.

---

## Quick start (cloud run)

1. **Sign in:** `cognetivy login` (once per machine).
2. **Start:** `cognetivy run start --workflow <workflow_id> --input <path>|--input-inline '{"key":"value"}' --name "Short name" --cloud`
3. **Step:** `cognetivy run step --run <run_id> [--node <id>] [--collection-kind <kind>] --cloud` (payload via --collection-file or stdin).
4. **Complete:** `cognetivy run complete --run <run_id> --cloud`

Every response includes `COGNETIVY_NEXT_STEP`; follow the hint. Use `workflow get --workflow <id> --cloud` to load the workflow. Parallel nodes: spawn one sub-agent per node when `next_step.action === "run_nodes_parallel"`.

---

## Workflow (cloud)

`workflow list --cloud`, `workflow get --workflow <id> --cloud`, `workflow create --cloud`, `workflow set --file <path> --cloud`. Always pass `--workflow <id>` on run commands.

When creating a workflow from a file, the JSON must include a top-level `kinds` object with an entry for **every** collection referenced in nodes (including `run_input` and all node input/output collections). Each kind needs `name`, `description`, and `item_schema`. Omitting any referenced collection causes "Missing kinds for: ..."; add those kinds and retry.

---

## Traceability

Every collection kind (except `run_input`) has `citations`, `derived_from`, `reasoning`. Populate them. Every item must have a `name` field.
