import { test } from "node:test";
import assert from "node:assert/strict";
import { assertProseFieldsNotJsonLikeStrings } from "../dist/core/collection-validate.js";

const LONG_JSON_STRING = '{"a":1,"b":2,"c":3,"d":4}';

test("assertProseFieldsNotJsonLikeStrings rejects JSON-like string in prose field", () => {
  assert.throws(
    () =>
      assertProseFieldsNotJsonLikeStrings(
        { name: "x", reasoning: LONG_JSON_STRING },
        "report"
      ),
    /JSON object\/array in a string field/
  );
});

test("assertProseFieldsNotJsonLikeStrings allows Markdown prose", () => {
  assertProseFieldsNotJsonLikeStrings(
    { name: "x", reasoning: "## Summary\n\n- one\n- two\n" },
    "report"
  );
});

test("assertProseFieldsNotJsonLikeStrings skips run_input kind", () => {
  assertProseFieldsNotJsonLikeStrings({ task: LONG_JSON_STRING }, "run_input");
});

test("assertProseFieldsNotJsonLikeStrings ignores very short strings", () => {
  assertProseFieldsNotJsonLikeStrings({ name: "x", note: '{"a":1}' }, "report");
});
