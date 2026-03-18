# Cognetivy CLI reference (cloud)

Use `--cloud` on commands (or rely on default when authenticated). No local `.cognetivy/` required.

## workflow
- `cognetivy workflow list --cloud`, `workflow get --workflow <id> --cloud`, `workflow create --cloud`, `workflow set --file <path> --cloud`.
- `workflow versions --workflow <id> --cloud`, `workflow select --workflow <id> --cloud`.

## run
- `cognetivy run start --workflow <id> --input <path> [--name <string>] --cloud`
- `run status --run <id> --cloud`, `run step --run <id> [--node <id>] [--collection-kind <kind>] --cloud`, `run complete --run <id> --cloud`.

## collection
- `collection list --run <id> --cloud`, `collection get --run <id> --kind <kind> --cloud`, `collection set` / `append` with `--cloud`.

## studio
- `cognetivy studio` - open Cloud Studio in browser (or use app.cognetivy.com).
