import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureWorkspace,
  writeRunFile,
  readCollectionSchema,
  writeCollectionSchema,
  readCollections,
  writeCollections,
  appendCollection,
  listCollectionKindsForRun,
} from "../dist/workspace.js";

describe("collection schema and storage", () => {
  it("init creates collection-schema.json and read returns default kinds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const schema = await readCollectionSchema(cwd);
    assert.ok(schema.kinds);
    assert.strictEqual(Object.keys(schema.kinds).length, 0);
  });

  it("collection_append validates and stores item; collection_get returns store", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeCollectionSchema(
      { kinds: { sources: { description: "Sources", required: ["url"], properties: {} } } },
      cwd
    );
    const runId = "run_2025-01-01_col1";
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

    const item = await appendCollection(
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

    const store = await readCollections(runId, "sources", cwd);
    assert.strictEqual(store.run_id, runId);
    assert.strictEqual(store.kind, "sources");
    assert.ok(store.updated_at);
    assert.strictEqual(store.items.length, 1);
    assert.strictEqual(store.items[0].url, "https://example.com");
  });

  it("collection_append rejects payload missing required fields", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeCollectionSchema(
      { kinds: { sources: { description: "Sources", required: ["url"], properties: {} } } },
      cwd
    );
    const runId = "run_2025-01-01_col2";
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
      () => appendCollection(runId, "sources", { title: "No URL" }, {}, cwd),
      /required|Missing/
    );
  });

  it("collection_set replaces items and list returns kinds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeCollectionSchema(
      { kinds: { ideas: { description: "Ideas", required: ["name"], properties: {} } } },
      cwd
    );
    const runId = "run_2025-01-01_col3";
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

    await writeCollections(
      runId,
      "ideas",
      [
        { name: "Idea A", why_now: "Because now" },
        { name: "Idea B", description: "Second" },
      ],
      cwd
    );

    const store = await readCollections(runId, "ideas", cwd);
    assert.strictEqual(store.items.length, 2);
    assert.strictEqual(store.items[0].name, "Idea A");

    const kinds = await listCollectionKindsForRun(runId, cwd);
    assert.ok(kinds.includes("ideas"));
  });
});
