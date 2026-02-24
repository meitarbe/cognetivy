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
    const schema = await readCollectionSchema("wf_default", cwd);
    assert.ok(schema.kinds);
    assert.ok(Object.keys(schema.kinds).includes("run_input"));
  });

  it("collection_append validates and stores item; collection_get returns store", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeCollectionSchema(
      "wf_default",
      {
        workflow_id: "wf_default",
        kinds: {
          run_input: {
            description: "Run input",
            item_schema: { type: "object", additionalProperties: true },
          },
          sources: {
            description: "Sources",
            item_schema: {
              type: "object",
              properties: { url: { type: "string" }, title: { type: "string" } },
              required: ["url"],
              additionalProperties: true,
            },
          },
        },
      },
      cwd
    );
    const runId = "run_2025-01-01_col1";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version_id: "v1",
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
      { created_by_node_id: "retrieve_sources", created_by_node_result_id: "nr_1" },
      cwd
    );
    assert.ok(item.id);
    assert.ok(item.created_at);
    assert.strictEqual(item.created_by_node_id, "retrieve_sources");
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
      "wf_default",
      {
        workflow_id: "wf_default",
        kinds: {
          run_input: {
            description: "Run input",
            item_schema: { type: "object", additionalProperties: true },
          },
          sources: {
            description: "Sources",
            item_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: true },
          },
        },
      },
      cwd
    );
    const runId = "run_2025-01-01_col2";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version_id: "v1",
        status: "running",
        input: {},
        created_at: new Date().toISOString(),
      },
      cwd
    );

    await assert.rejects(
      () =>
        appendCollection(
          runId,
          "sources",
          { title: "No URL" },
          { created_by_node_id: "retrieve_sources", created_by_node_result_id: "nr_1" },
          cwd
        ),
      /schema validation/i
    );
  });

  it("collection_set replaces items and list returns kinds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-collection-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    await writeCollectionSchema(
      "wf_default",
      {
        workflow_id: "wf_default",
        kinds: {
          run_input: {
            description: "Run input",
            item_schema: { type: "object", additionalProperties: true },
          },
          ideas: {
            description: "Ideas",
            item_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: true },
          },
        },
      },
      cwd
    );
    const runId = "run_2025-01-01_col3";
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version_id: "v1",
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
      { created_by_node_id: "synthesize_summary", created_by_node_result_id: "nr_2" },
      cwd
    );

    const store = await readCollections(runId, "ideas", cwd);
    assert.strictEqual(store.items.length, 2);
    assert.strictEqual(store.items[0].name, "Idea A");

    const kinds = await listCollectionKindsForRun(runId, cwd);
    assert.ok(kinds.includes("ideas"));
  });
});
