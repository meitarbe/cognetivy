# Releasing

Cognetivy follows [Semantic Versioning](https://semver.org/). Only the **cli** package is published to npm (as `cognetivy`). The **studio** package is private and its build is bundled into the CLI.

## Pre-release

1. **Update CHANGELOG**
   - Move items from `[Unreleased]` into a new version section (e.g. `## [0.1.7] - YYYY-MM-DD`).
   - Add a link for the new version at the bottom (e.g. `[0.1.7]: https://github.com/meitarbe/cognetivy/releases/tag/v0.1.7`).
   - Update the `[Unreleased]` link to compare `vX.Y.Z...HEAD`.

2. **Commit**
   - e.g. `git add CHANGELOG.md && git commit -m "changelog: release 0.1.7"`.

## Version and publish

3. **Bump version and publish** (from repo root):
   ```bash
   cd cli
   npm version patch   # or minor / major
   npm publish
   ```

   Or use the package scripts: `npm run release`, `npm run release:minor`, `npm run release:major`.

4. **Tag and push**
   ```bash
   git push origin main --follow-tags
   ```

## Post-release

5. **GitHub Release** (optional but recommended)
   - Open [Releases](https://github.com/meitarbe/cognetivy/releases) → “Draft a new release”.
   - Choose the new tag (e.g. `v0.1.7`).
   - Copy the relevant section from CHANGELOG into the release description.
   - Publish the release.

## When to bump major / minor / patch

- **Patch**: Bug fixes, docs, non-breaking tweaks.
- **Minor**: New features, new commands or MCP tools, backward-compatible changes.
- **Major**: Breaking changes (CLI flags, MCP protocol, workspace layout, or config).
