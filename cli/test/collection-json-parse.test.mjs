/**
 * parseCollectionPayloadFromLog - markdown fences, arrays, trailing prose.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { parseCollectionPayloadFromLog } from "../dist/executor/agent-node-runner.js";

describe("parseCollectionPayloadFromLog", () => {
  it("parses a bare object after the marker", () => {
    const log = `prologue\nCOGNETIVY_COLLECTION_JSON={"x":1}`;
    const v = parseCollectionPayloadFromLog(log);
    assert.deepStrictEqual(v, { x: 1 });
  });

  it("parses markdown-fenced JSON object", () => {
    const log = `COGNETIVY_COLLECTION_JSON=\`\`\`json
{"items":[{"a":1}]}
\`\`\``;
    const v = parseCollectionPayloadFromLog(log);
    assert.deepStrictEqual(v, { items: [{ a: 1 }] });
  });

  it("parses a top-level JSON array (collection items)", () => {
    const log = 'COGNETIVY_COLLECTION_JSON=[{"id":"a"},{"id":"b"}]\n';
    const v = parseCollectionPayloadFromLog(log);
    assert.deepStrictEqual(v, [{ id: "a" }, { id: "b" }]);
  });

  it("extracts first balanced value when prose follows JSON", () => {
    const log = `COGNETIVY_COLLECTION_JSON={"ok":true}\n\nDone.`;
    const v = parseCollectionPayloadFromLog(log);
    assert.deepStrictEqual(v, { ok: true });
  });
});
