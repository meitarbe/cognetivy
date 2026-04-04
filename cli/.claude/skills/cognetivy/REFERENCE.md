# Cognetivy CLI reference

Sign in: `cognetivy auth login`. Optional: `.cognetivy/workflows/index.json` stores default cloud workflow id.

## workflow
- `workflow list` / `workflow search [--q]`, `workflow get --workflow <id>`, `workflow create`, `workflow set --file`, `workflow versions`, `workflow select --workflow <id>`

## run
- `run start --workflow <id> --input ... --name ...`, `run status --run <id>`, `run step --run <id>`, `run complete --run <id>`

## collection-schema
- `collection-schema get`, `collection-schema set --file`

## collection
- `collection list --run <id>`, `collection get --run <id> --kind <kind>`

## event / node
- `event append --run <id>`, `node start --run <id> --node <id>`

Use the **Cognetivy web app** for full Studio (workflows, runs, collections UI).
