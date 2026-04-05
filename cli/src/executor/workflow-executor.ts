/**
 * Drives a cloud run via REST (same contract as agent + CLI) until completion or error.
 */
import type { WorkflowNode } from "../core/index.js";
import { WorkflowNodeType } from "../core/index.js";
import {
  cloudCompleteNode,
  cloudCreateRun,
  cloudGetCollectionItems,
  cloudGetNext,
  cloudGetRunDetail,
  cloudStartNode,
  type CloudRunDetail,
} from "../cloud-client.js";
import type { ExecutionStore } from "../local-db/execution-store.js";
import type { HitlCoordinator } from "../local-server/hitl-coordinator.js";
import type { WsServerMessage } from "../local-server/ws-protocol.js";
import {
  buildAgentSystemPromptSuffix,
  buildNoOutputPromptSuffix,
  runAgentForNode,
  runAgentForNodeRaw,
  type ExecutorAgentKind,
} from "./agent-node-runner.js";

export interface ExecuteWorkflowParams {
  store: ExecutionStore;
  hitl: HitlCoordinator;
  emit: (msg: WsServerMessage) => void;
  log: (runId: string, nodeId: string | undefined, stream: "stdout" | "stderr" | undefined, chunk: string) => void;
  agent: ExecutorAgentKind;
  cwd: string;
  workflowId: string;
  workflowVersionId?: string;
  name: string;
  input: Record<string, unknown>;
  abortSignal: AbortSignal;
  onRunCreated?: (runId: string) => void;
  onRunFinished?: (runId: string) => void;
}

function getNodesFromRun(detail: CloudRunDetail): WorkflowNode[] {
  const raw = detail.workflowVersion?.nodes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (n): n is WorkflowNode =>
      n != null && typeof n === "object" && typeof (n as WorkflowNode).id === "string"
  );
}

function findNode(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  return nodes.find((n) => n.id === nodeId);
}

async function buildPromptForPromptNode(
  runId: string,
  node: WorkflowNode,
  hint: string | undefined
): Promise<string> {
  const parts: string[] = [];
  parts.push(`You are executing workflow node "${node.id}".`);
  if (node.description) {
    parts.push(`Description: ${node.description}`);
  }
  if (node.prompt) {
    parts.push(`Instructions:\n${node.prompt}`);
  }
  const inputCols = node.input_collections ?? [];
  for (const kind of inputCols) {
    try {
      const pack = await cloudGetCollectionItems(runId, kind);
      const items = pack.items ?? [];
      parts.push(`\nInput collection "${kind}" (${items.length} items):\n${JSON.stringify(items, null, 2)}`);
    } catch {
      parts.push(`\n(Input collection "${kind}" could not be loaded.)`);
    }
  }
  if (hint?.trim()) {
    parts.push(`\nOrchestrator hint:\n${hint}`);
  }
  const outKinds = node.output_collections ?? [];
  if (outKinds.length > 1) {
    parts.push(
      `\nNote: This node has multiple output kinds (${outKinds.join(", ")}). Local executor v1 supports single-output nodes only; ask the team or split the workflow.`
    );
  }
  if (outKinds.length === 1) {
    parts.push(buildAgentSystemPromptSuffix(outKinds[0]));
  } else if (outKinds.length === 0) {
    parts.push(buildNoOutputPromptSuffix());
  }
  return parts.join("\n");
}

export async function executeWorkflowRun(params: ExecuteWorkflowParams): Promise<void> {
  const {
    store,
    hitl,
    emit,
    log,
    agent,
    cwd,
    workflowId,
    workflowVersionId,
    name,
    input,
    abortSignal,
    onRunCreated,
    onRunFinished,
  } = params;

  let runId = "";
  const checkAbort = () => {
    if (abortSignal.aborted) {
      throw new Error("Run cancelled");
    }
  };

  try {
    emit({ v: 1, type: "run.event", phase: "creating", runId: "", payload: { workflowId } });

    const created = await cloudCreateRun({
      workflowId,
      workflowVersionId,
      name,
      input,
    });
    runId = created.run_id;
    onRunCreated?.(runId);
    store.insertExecutionRun(runId, workflowId, "RUNNING");
    emit({ v: 1, type: "run.event", phase: "created", runId, payload: { workflowId } });

    let detail = await cloudGetRunDetail(runId);
    let nodes = getNodesFromRun(detail);

    while (true) {
      checkAbort();
      detail = await cloudGetRunDetail(runId);
      if (detail.status !== "RUNNING") {
        break;
      }
      nodes = getNodesFromRun(detail);

      const nextPack = await cloudGetNext(runId);
      const { next_step, current_node_id } = nextPack;
      const action = next_step.action;

      if (action === "wait") {
        emit({ v: 1, type: "run.event", phase: "wait", runId, payload: { hint: next_step.hint } });
        break;
      }

      if (action === "complete_run") {
        emit({ v: 1, type: "run.event", phase: "complete", runId, payload: {} });
        store.updateRunStatus(runId, "COMPLETED");
        break;
      }

      if (action === "execute_nodes_parallel") {
        const ids = next_step.runnable_node_ids ?? [];
        emit({ v: 1, type: "run.event", phase: "parallel_start", runId, payload: { nodeIds: ids } });
        for (const nodeId of ids) {
          checkAbort();
          await cloudStartNode(runId, nodeId);
          store.insertNodeExecution(runId, nodeId, "started", new Date().toISOString(), null, null);
        }
        continue;
      }

      if (action === "execute_node" && next_step.node_id) {
        const nodeId = next_step.node_id;
        const alreadyStarted = current_node_id === nodeId;
        if (!alreadyStarted) {
          checkAbort();
          emit({ v: 1, type: "run.event", phase: "node_start", runId, nodeId, payload: {} });
          await cloudStartNode(runId, nodeId);
          store.insertNodeExecution(runId, nodeId, "started", new Date().toISOString(), null, null);
        }

        const node = findNode(nodes, nodeId);
        if (!node) {
          throw new Error(`Workflow node "${nodeId}" not found in version.`);
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
          const outKinds = node.output_collections ?? [];
          if (outKinds.length > 1) {
            throw new Error("Multi-output human nodes require a future protocol version.");
          }
          if (outKinds.length === 1) {
            await cloudCompleteNode(runId, nodeId, {
              collectionKind: outKinds[0],
              collectionPayload: rawPayload as object | object[],
            });
          } else {
            await cloudCompleteNode(runId, nodeId, {
              output: typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload),
            });
          }
          store.insertNodeExecution(runId, nodeId, "completed", null, new Date().toISOString(), null);
          emit({ v: 1, type: "run.event", phase: "node_complete", runId, nodeId, payload: {} });
          continue;
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
        const promptText = await buildPromptForPromptNode(runId, node, next_step.hint);
        store.saveArtifact(runId, nodeId, "prompt", promptText);

        emit({ v: 1, type: "run.event", phase: "agent_running", runId, nodeId, payload: { agent } });
        const t0 = new Date().toISOString();
        let exitCode: number | null = null;
        try {
          let agentResult: { exitCode: number | null; combinedLog: string; collectionPayload?: unknown };
          if (outKinds.length === 0) {
            agentResult = await runAgentForNodeRaw({
              cwd,
              agent,
              prompt: promptText,
              onChunk: (chunk, stream) => {
                log(runId, nodeId, stream, chunk);
              },
              signal: abortSignal,
            });
          } else {
            const withPayload = await runAgentForNode({
              cwd,
              agent,
              prompt: promptText,
              onChunk: (chunk, stream) => {
                log(runId, nodeId, stream, chunk);
              },
              signal: abortSignal,
            });
            agentResult = withPayload;
          }
          exitCode = agentResult.exitCode;
          if (exitCode !== 0 && exitCode !== null) {
            throw new Error(`Agent exited with code ${exitCode}`);
          }
          store.saveArtifact(runId, nodeId, "agent_log_tail", agentResult.combinedLog.slice(-120_000));

          if (outKinds.length === 1) {
            await cloudCompleteNode(runId, nodeId, {
              collectionKind: outKinds[0],
              collectionPayload: (agentResult as { collectionPayload: unknown }).collectionPayload as object | object[],
            });
          } else {
            await cloudCompleteNode(runId, nodeId, {
              output: agentResult.combinedLog.trim().slice(-8000),
            });
          }
          store.insertNodeExecution(runId, nodeId, "completed", t0, new Date().toISOString(), exitCode);
          emit({ v: 1, type: "run.event", phase: "node_complete", runId, nodeId, payload: { exitCode } });
        } catch (err) {
          store.insertNodeExecution(runId, nodeId, "error", t0, new Date().toISOString(), exitCode);
          throw err;
        }
        continue;
      }

      emit({
        v: 1,
        type: "run.event",
        phase: "unhandled_next",
        runId,
        payload: { action, next_step },
      });
      break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      store.updateRunStatus(runId, "ERROR");
      hitl.cancelRun(runId);
      emit({
        v: 1,
        type: "error",
        code: "EXECUTION_FAILED",
        message,
        runId,
      });
      emit({ v: 1, type: "run.event", phase: "error", runId, payload: { message } });
    } else {
      emit({
        v: 1,
        type: "error",
        code: "EXECUTION_FAILED",
        message,
      });
    }
    throw err;
  } finally {
    if (runId) {
      onRunFinished?.(runId);
    }
  }
}
