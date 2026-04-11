import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextStep } from "../dist/core/next-step-engine.js";
import { WorkflowNodeType } from "../dist/core/types.js";

test("join node with upstream node ids in input_collections becomes runnable after parallel outputs exist", () => {
  const nodes = [
    {
      id: "gather_stock_data",
      type: WorkflowNodeType.Prompt,
      input_collections: ["run_input"],
      output_collections: ["stock_context"],
    },
    {
      id: "fundamentals_deep_dive",
      type: WorkflowNodeType.Prompt,
      input_collections: ["stock_context"],
      output_collections: ["equity_fundamentals"],
    },
    {
      id: "catalyst_research",
      type: WorkflowNodeType.Prompt,
      input_collections: ["stock_context"],
      output_collections: ["catalyst_notes"],
    },
    {
      id: "synthesize",
      type: WorkflowNodeType.Prompt,
      input_collections: ["fundamentals_deep_dive", "catalyst_research"],
      output_collections: ["report"],
    },
  ];

  const kindsAfterParallel = new Set(["run_input", "stock_context", "equity_fundamentals", "catalyst_notes"]);
  const done = new Set(["gather_stock_data", "fundamentals_deep_dive", "catalyst_research"]);

  const next = getNextStep({
    nodes,
    completedNodeIds: done,
    startedNodeIds: new Set(),
    kindsWithData: kindsAfterParallel,
  });

  assert.equal(next.next_step.action, "run_node");
  assert.equal(next.next_step.node_id, "synthesize");
});

test("strict collection kinds still required when input does not match a node id", () => {
  const nodes = [
    {
      id: "a",
      type: WorkflowNodeType.Prompt,
      input_collections: [],
      output_collections: ["ka"],
    },
    {
      id: "b",
      type: WorkflowNodeType.Prompt,
      input_collections: ["ka"],
      output_collections: ["kb"],
    },
    {
      id: "join",
      type: WorkflowNodeType.Prompt,
      input_collections: ["ka", "wrong_kind_name"],
      output_collections: ["out"],
    },
  ];

  const next = getNextStep({
    nodes,
    completedNodeIds: new Set(["a", "b"]),
    startedNodeIds: new Set(),
    kindsWithData: new Set(["ka", "kb"]),
  });

  assert.equal(next.next_step.action, "done");
  assert.match(next.next_step.hint ?? "", /No runnable node/);
});
