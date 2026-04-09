/**
 * Execute one workflow node (HITL or PROMPT) for the local cloud-driven executor.
 */
import type { WorkflowNode } from "../core/index.js";
import { WorkflowNodeType } from "../core/index.js";
import { cloudCompleteNode, cloudStartNode } from "../cloud-client.js";
import { validateCollectionItemsPayload } from "../core/collection-validate.js";
import {
  formatAgentValidationFeedback,
  isCloudCollectionValidationError,
  loadCollectionPromptSpec,
  normalizeToCollectionItems,
  type CollectionPromptSpec,
} from "./collection-output-helpers.js";
import type { ExecutionStore } from "../local-db/execution-store.js";
import type { HitlCoordinator } from "../local-server/hitl-coordinator.js";
import type { WsServerMessage } from "../local-server/ws-protocol.js";
import { runAgentForNode, runAgentForNodeRaw, type ExecutorAgentKind } from "./agent-node-runner.js";
import { buildPromptForPromptNode } from "./prompt-for-node.js";

function findNode(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

/** How this node was marked started on the cloud run before local execution. */
export type ExecutorNodeServerStart = "full" | "resume" | "parallel_branch";

export interface RunWorkflowExecutorNodeParams {
  runId: string;
  workflowId: string;
  nodes: WorkflowNode[];
  nodeId: string;
  hint: string | undefined;
  agent: ExecutorAgentKind;
  /** Working directory for the agent subprocess (isolated copy when running in parallel). */
  agentCwd: string;
  /**
   * full - emit node_start, cloudStartNode, persist started.
   * resume - same run loop tick as an in-progress node; no start API.
   * parallel_branch - cloudStart already done for the batch; emit node_start for UI only.
   */
  serverStart: ExecutorNodeServerStart;
  store: ExecutionStore;
  hitl: HitlCoordinator;
  emit: (msg: WsServerMessage) => void;
  log: (runId: string, nodeId: string | undefined, stream: "stdout" | "stderr" | undefined, chunk: string) => void;
  abortSignal: AbortSignal;
  checkAbort: () => void;
}

export async function runWorkflowExecutorNode(p: RunWorkflowExecutorNodeParams): Promise<void> {
  const {
    runId,
    workflowId,
    nodes,
    nodeId,
    hint,
    agent,
    agentCwd,
    serverStart,
    emit,
    log,
    store,
    hitl,
    abortSignal,
    checkAbort,
  } = p;

  const node = findNode(nodes, nodeId);
  if (!node) {
    throw new Error(`Workflow node "${nodeId}" not found in version.`);
  }

  if (serverStart === "full") {
    checkAbort();
    emit({ v: 1, type: "run.event", phase: "node_start", runId, nodeId, payload: {} });
    await cloudStartNode(runId, nodeId);
    store.insertNodeExecution(runId, nodeId, "started", new Date().toISOString(), null, null);
  } else if (serverStart === "parallel_branch") {
    emit({
      v: 1,
      type: "run.event",
      phase: "node_start",
      runId,
      nodeId,
      payload: { parallelBranch: true },
    });
  }

  if (node.type === WorkflowNodeType.HumanInTheLoop) {
    emit({
      v: 1,
      type: "hitl.request",
      runId,
      nodeId,
      title: `Human input: ${node.id}`,
      detail: node.description ?? node.prompt,
      expectedCollectionKind:
        node.output_collections?.length === 1 ? node.output_collections[0] : undefined,
    });
    const payload = await hitl.waitForResponse(runId, nodeId);
    checkAbort();
    const rawPayload = payload.collectionPayload ?? payload.items ?? payload;
    const outputFromUi =
      typeof payload.output === "string" && payload.output.trim() !== "" ? payload.output.trim() : undefined;
    const outKinds = node.output_collections ?? [];
    if (outKinds.length > 1) {
      throw new Error("Multi-output human nodes require a future protocol version.");
    }
    if (outKinds.length === 1) {
      const hitlSpec = await loadCollectionPromptSpec(workflowId, outKinds[0]);
      const items = normalizeToCollectionItems(rawPayload);
      validateCollectionItemsPayload(items, hitlSpec.itemSchemaRaw, outKinds[0]);
      await cloudCompleteNode(runId, nodeId, {
        collectionKind: outKinds[0],
        collectionPayload: rawPayload as object | object[],
        ...(outputFromUi ? { output: outputFromUi } : {}),
      });
    } else {
      await cloudCompleteNode(runId, nodeId, {
        output: typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload),
      });
    }
    store.insertNodeExecution(runId, nodeId, "completed", null, new Date().toISOString(), null);
    emit({ v: 1, type: "run.event", phase: "node_complete", runId, nodeId, payload: {} });
    return;
  }

  if (node.type !== WorkflowNodeType.Prompt) {
    throw new Error(`Node type ${node.type} is not supported by the local executor.`);
  }

  const outKinds = node.output_collections ?? [];
  if (outKinds.length > 1) {
    throw new Error(
      `Node "${nodeId}" has multiple output kinds; local executor supports single-output PROMPT nodes only.`
    );
  }

  checkAbort();
  const t0 = new Date().toISOString();
  let exitCode: number | null = null;

  if (outKinds.length === 1) {
    const baseSpec = await loadCollectionPromptSpec(workflowId, outKinds[0]);
    let validationFeedback: string | undefined;
    let nodeFinished = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      checkAbort();
      const collectionSpec: CollectionPromptSpec = { ...baseSpec, validationFeedback };
      const promptText = await buildPromptForPromptNode(runId, node, hint, collectionSpec);
      store.saveArtifact(runId, nodeId, "prompt", promptText);

      emit({
        v: 1,
        type: "run.event",
        phase: "agent_running",
        runId,
        nodeId,
        payload: { agent, attempt: attempt + 1, maxAttempts: 2 },
      });

      let agentResult: { exitCode: number | null; combinedLog: string; collectionPayload: unknown };
      try {
        agentResult = await runAgentForNode({
          cwd: agentCwd,
          agent,
          prompt: promptText,
          onChunk: (chunk, stream) => {
            log(runId, nodeId, stream, chunk);
          },
          signal: abortSignal,
        });
      } catch (agentErr) {
        store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
        throw agentErr;
      }

      exitCode = agentResult.exitCode;
      if (exitCode !== 0 && exitCode !== null) {
        store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
        throw new Error(`Agent exited with code ${exitCode}`);
      }
      store.saveArtifact(runId, nodeId, "agent_log_tail", agentResult.combinedLog.slice(-120_000));

      try {
        const items = normalizeToCollectionItems(agentResult.collectionPayload);
        const minRows = node.minimum_rows;
        if (typeof minRows === "number" && Number.isInteger(minRows) && minRows >= 1 && items.length < minRows) {
          throw new Error(
            `Collection item count below minimum_rows: need at least ${minRows} item(s), got ${items.length}. Output a JSON array with at least ${minRows} objects after COGNETIVY_COLLECTION_JSON=.`
          );
        }
        validateCollectionItemsPayload(items, baseSpec.itemSchemaRaw, baseSpec.kind);
      } catch (valErr) {
        validationFeedback = formatAgentValidationFeedback(valErr);
        if (attempt === 1) {
          store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
          throw valErr;
        }
        emit({
          v: 1,
          type: "run.event",
          phase: "agent_validation_retry",
          runId,
          nodeId,
          payload: { attempt: attempt + 1, reason: validationFeedback, source: "local" },
        });
        continue;
      }

      try {
        await cloudCompleteNode(runId, nodeId, {
          collectionKind: outKinds[0],
          collectionPayload: agentResult.collectionPayload as object | object[],
        });
      } catch (apiErr) {
        if (!isCloudCollectionValidationError(apiErr) || attempt === 1) {
          store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
          throw apiErr;
        }
        validationFeedback = apiErr instanceof Error ? apiErr.message : String(apiErr);
        emit({
          v: 1,
          type: "run.event",
          phase: "agent_validation_retry",
          runId,
          nodeId,
          payload: { attempt: attempt + 1, reason: validationFeedback, source: "api" },
        });
        continue;
      }

      store.insertNodeExecution(runId, nodeId, "completed", t0, new Date().toISOString(), exitCode);
      emit({
        v: 1,
        type: "run.event",
        phase: "node_complete",
        runId,
        nodeId,
        payload: { exitCode, attempts: attempt + 1 },
      });
      nodeFinished = true;
      break;
    }

    if (!nodeFinished) {
      throw new Error("Agent did not produce valid collection output after retries.");
    }
    return;
  }

  try {
    const promptText = await buildPromptForPromptNode(runId, node, hint);
    store.saveArtifact(runId, nodeId, "prompt", promptText);

    emit({ v: 1, type: "run.event", phase: "agent_running", runId, nodeId, payload: { agent } });

    const agentResult = await runAgentForNodeRaw({
      cwd: agentCwd,
      agent,
      prompt: promptText,
      codexJsonlStdout: agent === "codex",
      onChunk: (chunk, stream) => {
        log(runId, nodeId, stream, chunk);
      },
      signal: abortSignal,
    });
    exitCode = agentResult.exitCode;
    if (exitCode !== 0 && exitCode !== null) {
      throw new Error(`Agent exited with code ${exitCode}`);
    }
    store.saveArtifact(runId, nodeId, "agent_log_tail", agentResult.combinedLog.slice(-120_000));

    await cloudCompleteNode(runId, nodeId, {
      output: agentResult.combinedLog.trim().slice(-8000),
    });
    store.insertNodeExecution(runId, nodeId, "completed", t0, new Date().toISOString(), exitCode);
    emit({ v: 1, type: "run.event", phase: "node_complete", runId, nodeId, payload: { exitCode } });
  } catch (err) {
    store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
    throw err;
  }
}
