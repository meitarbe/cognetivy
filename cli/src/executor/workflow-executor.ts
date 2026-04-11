/**
 * Drives a cloud run via REST (same contract as agent + CLI) until completion or error.
 */
import type { WorkflowNode } from "../core/index.js";
import { WorkflowNodeType } from "../core/index.js";
import {
  cloudCreateRun,
  cloudGetNext,
  cloudGetRunDetail,
  cloudStartNode,
  type CloudRunDetail,
} from "../cloud-client.js";
import type { ExecutionStore } from "../local-db/execution-store.js";
import type { HitlCoordinator } from "../local-server/hitl-coordinator.js";
import type { WsServerMessage } from "../local-server/ws-protocol.js";
import type { ExecutorAgentKind } from "./agent-node-runner.js";
import { mergeAbortSignals } from "./abort-signals.js";
import { prepareIsolatedNodeWorkspace } from "./node-workspace-isolation.js";
import { runWorkflowExecutorNode } from "./workflow-node-execution.js";

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

function isParallelizablePromptNode(nodes: WorkflowNode[], nodeId: string): boolean {
  const n = findNode(nodes, nodeId);
  if (!n || n.type !== WorkflowNodeType.Prompt) {
    return false;
  }
  const outs = n.output_collections ?? [];
  return outs.length <= 1;
}

function buildNodeContext(
  params: Pick<
    ExecuteWorkflowParams,
    "store" | "hitl" | "emit" | "log" | "agent" | "abortSignal"
  > & {
    runId: string;
    workflowId: string;
    nodes: WorkflowNode[];
    checkAbort: () => void;
  }
) {
  const { store, hitl, emit, log, agent, abortSignal, runId, workflowId, nodes, checkAbort } = params;
  return {
    store,
    hitl,
    emit,
    log,
    agent,
    abortSignal,
    checkAbort,
    runId,
    workflowId,
    nodes,
  };
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
      executorAgent: agent === "codex" ? "CODEX" : agent === "claude" ? "CLAUDE_CODE" : undefined,
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

        const hint = next_step.hint;
        const ctxBase = buildNodeContext({
          store,
          hitl,
          emit,
          log,
          agent,
          abortSignal,
          runId,
          workflowId: detail.workflowId,
          nodes,
          checkAbort,
        });

        const allPromptParallel =
          ids.length > 1 && ids.every((id) => isParallelizablePromptNode(nodes, id));

        if (allPromptParallel) {
          const batchAborter = new AbortController();
          const combinedSignal = mergeAbortSignals(abortSignal, batchAborter.signal);
          const checkParallelAbort = () => {
            if (combinedSignal.aborted) {
              throw new Error("Run cancelled");
            }
          };
          try {
            await Promise.all(
              ids.map(async (nodeId) => {
                const agentCwd = await prepareIsolatedNodeWorkspace(cwd, runId, nodeId);
                await runWorkflowExecutorNode({
                  ...ctxBase,
                  abortSignal: combinedSignal,
                  checkAbort: checkParallelAbort,
                  nodeId,
                  hint,
                  agentCwd,
                  serverStart: "parallel_branch",
                });
              })
            );
          } catch (err) {
            batchAborter.abort();
            throw err;
          }
        } else {
          if (ids.length > 1) {
            emit({
              v: 1,
              type: "run.event",
              phase: "parallel_serial_fallback",
              runId,
              payload: {
                reason: "Only PROMPT nodes with a single output kind run in parallel; executing branches one by one.",
                nodeIds: ids,
              },
            });
          }
          for (const nodeId of ids) {
            checkAbort();
            await runWorkflowExecutorNode({
              ...ctxBase,
              nodeId,
              hint,
              agentCwd: cwd,
              serverStart: "parallel_branch",
            });
          }
        }
        continue;
      }

      if (action === "execute_node" && next_step.node_id) {
        const nodeId = next_step.node_id;
        const alreadyStarted = current_node_id === nodeId;
        const ctxBase = buildNodeContext({
          store,
          hitl,
          emit,
          log,
          agent,
          abortSignal,
          runId,
          workflowId: detail.workflowId,
          nodes,
          checkAbort,
        });

        await runWorkflowExecutorNode({
          ...ctxBase,
          nodeId,
          hint: next_step.hint,
          agentCwd: cwd,
          serverStart: alreadyStarted ? "resume" : "full",
        });
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
