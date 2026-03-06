# Perfection Execution Plan (Monetization-Ready Foundation)

## Goals
Build a highly polished, understandable, realtime, token-efficient open-source product that can later monetize.

## Guiding principles
1. **Token efficiency first**: optimize output payload size, response verbosity controls, and streaming defaults.
2. **Clarity first**: non-developer friendly docs, zero-friction install, explicit UX copy.
3. **Realtime trust**: no stale states, no manual refresh requirements.
4. **UI/UX quality bar**: responsive, interactive, mobile-safe, large-data-safe.
5. **Safe architecture evolution**: modular changes to avoid conflicts.

## Workstreams (mapped to board)

### A. Platform/Core
- [ ] Token efficiency audit (prompt, output formats, truncation, compact payload mode)
- [ ] Express API hardening/expansion for manageability and front-end orchestration
- [ ] Template behavior rules: no implicit default template, and strict MCP/skills guardrails
- [ ] Current-workflow setter (single source of truth)

### B. Realtime and Run Monitoring
- [ ] End-to-end realtime consistency (server events + UI state reconciliation)
- [ ] Workflow run page: collection node turns green when collected
- [ ] Workflow run page click behavior: show collected data inline, no drawer hijack
- [x] Better run observability: filters, event timeline modes, node-state chips, lag indicator _(ticket 4fa36a43-6069-40ae-805e-3facbf304777 · run run_2026-03-06T10-42-18-339Z_l7o3w9)_
- [ ] React Flow auto-zoom improvements for dataset size and viewport

### C. UX and Interaction
- [ ] Dropdown redesign (predictable open/close, keyboard behavior, scroll-safe)
- [ ] Rendering hygiene pass to eliminate `[object Object]`
- [ ] Large dataset + small desktop + mobile layouts (virtualization + responsive breakpoints)
- [ ] Copy collection items as Markdown / Rich Text

### D. Docs / Adoption
- [ ] README rewrite for non-developers (what it does, who it helps, quick outcomes)
- [ ] Frictionless install paths (one-liners + verification step + troubleshooting)
- [ ] Template gallery from use-cases
- [ ] Product demo videos (short overview + deep workflow walkthrough)

## Architecture strategy (reduce merge conflicts)
- Create one branch per workstream subtask (`feat/token-efficiency`, `feat/realtime-sync`, etc.).
- Keep shared files protected:
  - route/API contracts in dedicated files with typed schemas
  - UI component boundaries (no broad cross-cutting edits)
  - central event contract versioning for realtime
- Merge order:
  1) API contracts + event schema
  2) backend emitters/listeners
  3) frontend store sync adapters
  4) UI components
  5) docs/videos/templates

## Token-overrun resilience
If context/token limit is hit mid-work:
1. Persist state to `docs/EXECUTION_STATE.md` (current branch, files touched, next exact steps).
2. Commit small coherent changes with explicit message.
3. Push branch frequently.
4. Resume from `EXECUTION_STATE.md` first, then continue the checklist.

## Suggested implementation sequence (fastest value)
1. Realtime consistency + run page visibility improvements
2. Token efficiency controls
3. Workflow/template correctness constraints
4. Dropdown + interaction polish
5. README/install + videos + templates pack

## Definition of done
- No manual refresh required for normal workflows.
- Token footprint reduced and measurable.
- First-time user can install and run in minutes from README only.
- Run page supports deep monitoring at a glance.
- Mobile/small-screen usability is acceptable and tested.
