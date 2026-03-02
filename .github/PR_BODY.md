## Description

- **Per-node required skills and MCPs:** Workflow nodes can declare `required_skills` (array of skill names) and `required_mcps` (array of MCP server names). Stored in workflow version JSON, validated by the CLI, exposed by the studio-server node prompt API, and shown in Studio on node cards and in the node detail drawer (Skills first, then MCPs). Default workflow and skill/MCP instructions updated so agents see the correct field names (`required_skills` not `skills`).
- **Studio workflow node redesign:** Node cards show full input/output and Skills/MCPs with no ellipsis; clearer header (title + type badge), spacing, and step status styling.
- **Studio layout:** Increased node width/height and horizontal/vertical gaps so the DAG is less cramped and edges are clearer.
- **Studio version diff:** Workflow page adds a "Show changes" switch that compares the selected version to the previous one; added nodes (green), changed nodes (amber), and removed nodes (red dashed, shown as ghosts on the canvas) are highlighted.

## Checklist

- [x] `npm run build` passes in `cli/`
- [ ] `npm test` passes in `cli/`
- [x] CHANGELOG updated if this is a user-facing change (see [docs/RELEASING.md](docs/RELEASING.md))

## Notes

- No breaking changes. New node fields are optional; existing workflow JSON remains valid.
- GitHub CLI (`gh`) was not used; create the PR from the GitHub UI and paste this body (or the contents of `.github/PR_BODY.md`) into the description.
