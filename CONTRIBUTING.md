# Contributing to Cognetivy

Thank you for your interest in contributing. This document explains how to get set up, run tests, and submit changes.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Getting started

### Prerequisites

- **Node.js** ≥ 18
- Git

### Development setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/meitarbe/cognetivy.git
   cd cognetivy
   ```

2. **CLI (main package)**
   ```bash
   cd cli
   npm install
   npm run build
   npm test
   ```

3. **Studio (React UI)** — optional for CLI-only work
   ```bash
   cd studio
   npm install
   npm run build
   ```
   To develop the Studio with hot reload, see [studio/README.md](studio/README.md).

4. **Full build** (CLI + Studio, from `cli/`)
   ```bash
   cd cli
   npm run build:full
   ```

## Running tests

- From `cli/`: `npm test` (builds and runs Node test runner).
- Tests live in `cli/test/` (e.g. `init.test.mjs`, `run-events.test.mjs`, `collections.test.mjs`).

## Submitting changes

1. **Fork** the repo and create a branch from `main` (e.g. `fix/thing` or `feat/thing`).
2. Make your changes. Keep the scope focused; prefer smaller PRs.
3. Ensure `npm run build` and `npm test` pass in `cli/`.
4. Open a **Pull Request** against `main` with a clear description and, if applicable, a link to the related issue.
5. Address any review feedback.

We welcome first-time contributors. Look for issues labeled **good first issue** if you want a suggested starting point.

## Reporting issues

- **Bugs:** Use the [Bug report](https://github.com/meitarbe/cognetivy/issues/new?template=bug_report.md) template.
- **Feature ideas:** Use the [Feature request](https://github.com/meitarbe/cognetivy/issues/new?template=feature_request.md) template.
- **Questions:** Open a [Discussion](https://github.com/meitarbe/cognetivy/discussions) or an issue with the "Question" label.

## Project layout

- **`cli/`** — Published npm package: CLI, MCP server, and Studio server. Entry: `dist/cli.js`, `dist/mcp.js`, etc.
- **`studio/`** — React UI (workflow canvas, runs, collections). Built output is copied into `cli/dist/studio/` for `cognetivy studio`.
- **`docs/`** — Contributor and maintainer docs (architecture, releasing).

## Release process

See [docs/RELEASING.md](docs/RELEASING.md) for how we version and publish releases.
