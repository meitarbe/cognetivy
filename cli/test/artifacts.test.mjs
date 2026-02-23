import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureWorkspace,
  writeRunFile,
  readArtifactSchema,
  writeArtifactSchema,
  readArtifacts,
  writeArtifacts,
  appendArtifact,
  listArtifactKindsForRun,
} from "../dist/workspace.js";

describe("artifact schema and storage", () => {
  it("init creates artifact-schema.json and read returns default kinds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-artifact-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const schema = await readArtifactSchema(cwd);
    assert.ok(schema.kinds);
    assert.ok(schema.kinds.sources);
    assert.ok(schema.kinds.collected);
    assert.ok(schema.kinds.ideas);
    assert.deepStrictEqual(schema.kinds.sources.required, ["url"]);
    assert.deepStrictEqual(schema.kinds.ideas.required, ["name"]);
  });

  it("artifact_append validates and stores item; artifact_get returns store", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-artifact-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const runId = "run_2025-01-01_art1";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version: "v1",
        status: "running",
        input: {},
        created_at: new Date().toISOString(),
      },
      cwd
    );

    const item = await appendArtifact(
      runId,
      "sources",
      { url: "https://example.com", title: "Example" },
      {},
      cwd
    );
    assert.ok(item.id);
    assert.ok(item.created_at);
    assert.strictEqual(item.url, "https://example.com");
    assert.strictEqual(item.title, "Example");

    const store = await readArtifacts(runId, "sources", cwd);
    assert.strictEqual(store.run_id, runId);
    assert.strictEqual(store.kind, "sources");
    assert.ok(store.updated_at);
    assert.strictEqual(store.items.length, 1);
    assert.strictEqual(store.items[0].url, "https://example.com");
  });

  it("artifact_append rejects payload missing required fields", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-artifact-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const runId = "run_2025-01-01_art2";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version: "v1",
        status: "running",
        input: {},
        created_at: new Date().toISOString(),
      },
      cwd
    );

    await assert.rejects(
      () => appendArtifact(runId, "sources", { title: "No URL" }, {}, cwd),
      /required|Missing/
    );
  });

  it("artifact_set replaces items and list returns kinds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-artifact-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const runId = "run_2025-01-01_art3";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version: "v1",
        status: "running",
        input: {},
        created_at: new Date().toISOString(),
      },
      cwd
    );

    await writeArtifacts(
      runId,
      "ideas",
      [
        { name: "Idea A", why_now: "Because now" },
        { name: "Idea B", description: "Second" },
      ],
      cwd
    );

    const store = await readArtifacts(runId, "ideas", cwd);
    assert.strictEqual(store.items.length, 2);
    assert.strictEqual(store.items[0].name, "Idea A");

    const kinds = await listArtifactKindsForRun(runId, cwd);
    assert.ok(kinds.includes("ideas"));
  });
});
