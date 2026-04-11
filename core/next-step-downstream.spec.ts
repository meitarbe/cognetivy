/**
 * Run: npm run build && npm run test --prefix cognetivy/core
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { getDownstreamNodeIds } from "./next-step-engine.js";
import { WorkflowNodeType } from "./types.js";
import type { WorkflowNode } from "./types.js";

function node(
  id: string,
  input_collections: string[],
  output_collections: string[],
): WorkflowNode {
  return {
    id,
    type: WorkflowNodeType.Prompt,
    input_collections,
    output_collections,
  };
}

describe("getDownstreamNodeIds", () => {
  it("returns empty array when fromNodeId is not in the workflow", () => {
    const nodes = [node("A", [], ["kA"])];
    assert.deepEqual(getDownstreamNodeIds(nodes, "missing"), []);
  });

  it("linear chain: from A includes A, B, C", () => {
    const nodes = [
      node("A", [], ["kA"]),
      node("B", ["kA"], ["kB"]),
      node("C", ["kB"], ["kC"]),
    ];
    assert.deepEqual(getDownstreamNodeIds(nodes, "A"), ["A", "B", "C"]);
    assert.deepEqual(getDownstreamNodeIds(nodes, "B"), ["B", "C"]);
    assert.deepEqual(getDownstreamNodeIds(nodes, "C"), ["C"]);
  });

  it("parallel fork then join: from B clears B and D only, not sibling C", () => {
    const nodes = [
      node("A", [], ["kA"]),
      node("B", ["kA"], ["kB"]),
      node("C", ["kA"], ["kC"]),
      node("D", ["kB", "kC"], ["kD"]),
    ];
    assert.deepEqual(getDownstreamNodeIds(nodes, "B").sort(), ["B", "D"]);
    assert.deepEqual(getDownstreamNodeIds(nodes, "C").sort(), ["C", "D"]);
    assert.deepEqual(getDownstreamNodeIds(nodes, "A").sort(), ["A", "B", "C", "D"]);
  });

  it("supports upstream node id reference in input_collections", () => {
    const nodes = [
      node("A", [], ["outA"]),
      node("B", ["A"], ["outB"]),
    ];
    assert.deepEqual(getDownstreamNodeIds(nodes, "A"), ["A", "B"]);
  });
});
