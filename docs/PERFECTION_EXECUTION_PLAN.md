# Cognetivy Perfection Execution Plan (v1)

Owner: Choko  
Date: 2026-03-05

## Goals

1. Make token usage highly efficient (especially output tokens).
2. Make UX and docs obvious for non-developers.
3. Ship demo videos and templates that make value instantly clear.
4. Upgrade reliability, realtime behavior, and API architecture.

---

## Delivery model (to reduce merge conflicts)

- **Main branch stays stable**; all work via small feature branches.
- **One PR per track** (docs, studio UX, run page, realtime, API server, templates).
- **Touch boundaries**:
  - `cli/` owners: CLI + API contracts.
  - `studio/` owners: UI/UX + ReactFlow + realtime rendering.
  - `docs/` owners: README, install, tutorials, videos.
- **PR size target**: ~300 LOC max when possible.
- **Daily rebase** on `main` for all active branches.
- **Feature flags** for risky changes (new API server, dropdown redesign).

---

## Architecture tracks

## Track A — Token efficiency (CLI/MCP + prompts + payloads)

### A1. Output token minimization mode
- Add compact default output for CLI/MCP tool responses.
- Add `--verbose` for expanded output; default concise.
- Eliminate redundant envelope fields where possible.

### A2. Prompt + schema compression
- Minimize repeated instructions in skill/tool output.
- Return IDs + summaries by default; lazy-load full details on demand.

### A3. Token telemetry
- Add per-command approximate input/output token counters.
- Show top expensive commands/runs in Studio.

---

## Track B — Onboarding/docs/install frictionless

### B1. README rewrite for non-dev clarity
- "What this does in 30 seconds" section.
- 3 role-based quick starts: maker, PM, engineer.

### B2. Install hardening
- Validate all install paths (npx/global/mcp integrations).
- Add OS-specific troubleshooting matrix.
- Add copy-paste tested commands only.

### B3. First-run success checklist
- Create a deterministic "hello workflow" with expected outputs/screens.

---

## Track C — Templates/use-cases

### C1. Template library expansion
- Add templates aligned with cognetivy.com use-cases.
- Include metadata: audience, difficulty, expected runtime.

### C2. Template selection rules
- If template selected, disable fallback "default" assumptions.
- Explicit workflow selection state required.

---

## Track D — Studio UX/UI quality

### D1. Responsive layout pass
- Mobile + small desktop breakpoints.
- Data-dense layout for large datasets.

### D2. Safe rendering pass
- Remove `[object Object]` by robust object formatter + schema-driven renderers.

### D3. Dropdown redesign
- Replace annoying dropdown interactions with keyboard-friendly command palette/select patterns.

### D4. ReactFlow auto-zoom improvements
- Smarter fitView with bounds padding, viewport persistence, and content-aware zoom.

---

## Track E — Workflow run page (monitoring and navigation)

### E1. Collection state visualization
- Collected collections turn green.
- Click opens inline details panel (not drawer).

### E2. Better run observability
- Sticky run timeline.
- Node status heatmap.
- Event stream with filters.
- "Where blocked" diagnostics.

### E3. Realtime updates
- Replace refresh-needed patterns with push (SSE/WebSocket) or efficient polling fallback.

---

## Track F — API server modernization

### F1. Express server foundation
- Introduce `api/` module with Express.
- Versioned routes (`/api/v1/...`).
- Validation + consistent error schema.

### F2. Contract and compatibility
- Keep compatibility adapters for current Studio calls.
- Add OpenAPI spec generation.

---

## Requested items mapping (1–14)

1) Token efficiency -> Track A  
2) Obvious docs + frictionless install -> Track B  
3) Videos -> Track B/C deliverables  
4) Many templates from use-cases -> Track C  
5) UI/UX perfection + no `[object Object]` -> Track D  
6) Realtime indications/no refresh -> Track E3  
7) Dropdown rethink -> Track D3  
8) Set current workflow -> Track C2/E (verify + improve UX)  
9) Prevent accidental context7/cursor MCP defaults; no implicit default when template chosen -> Track C2/F contracts  
10) Copy collection item as markdown/richtext -> Track D/E utilities  
11) Express API server -> Track F  
12) Run page collection green + click shows data inline -> Track E1  
13) More run-page monitoring ideas -> Track E2  
14) Better ReactFlow auto-zoom -> Track D4

---

## Execution phases

### Phase 0 (now): planning + backlog + branch scaffolding
- Create epic + child issues.
- Create labels and milestones.
- Prepare architecture notes and acceptance criteria.

### Phase 1: quick wins (1–2 days)
- Docs rewrite pass.
- `[object Object]` renderer fix.
- Copy-as-Markdown action for collection item.
- Current workflow selection UX improvements.

### Phase 2: core platform (3–7 days)
- Realtime run page + collection state behavior.
- Dropdown redesign.
- ReactFlow auto-zoom revamp.

### Phase 3: architecture (1–2 weeks)
- Express API layer with compatibility bridge.
- Token telemetry and token-min output mode.
- Template marketplace expansion.

### Phase 4: growth assets
- Record demo videos (3 short flows).
- Publish tutorials and template gallery docs.

---

## Continuation protocol (if token/time budget is hit)

- Keep a machine-readable checkpoint in `docs/EXECUTION_STATUS.md` with:
  - active branch
  - current issue
  - next command
  - blockers
- Every completed chunk ends with:
  - committed code
  - issue update
  - short progress note to Meitar
- No dangling changes without commit message indicating resumable next step.

---

## Progress update cadence to Meitar

- Update at least at:
  1. plan + backlog complete
  2. each merged PR
  3. any blocker requiring decision
