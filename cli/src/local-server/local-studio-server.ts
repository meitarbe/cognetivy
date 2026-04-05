/**
 * HTTP static server + WebSocket for local studio and workflow executor.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { executeWorkflowRun } from "../executor/workflow-executor.js";
import { ExecutionStore } from "../local-db/execution-store.js";
import { HitlCoordinator } from "./hitl-coordinator.js";
import { resolveLocalStudioStaticRoot } from "./static-root.js";
import { serverMessage, WS_PROTOCOL_VERSION, type WsClientMessage, type WsServerMessage } from "./ws-protocol.js";

const DEFAULT_PORT = 3848;

export interface LocalStudioServerOptions {
  /** Workspace cwd for agent subprocesses (default process.cwd()) */
  workspaceCwd?: string;
  port?: number;
}

export interface LocalStudioServerHandle {
  readonly baseUrl: string;
  readonly port: number;
  readonly sessionToken: string;
  readonly openUrl: string;
  close(): Promise<void>;
}

interface RunJob {
  abortController: AbortController;
}

export function createLocalStudioServer(options: LocalStudioServerOptions = {}): Promise<LocalStudioServerHandle> {
  return new Promise((resolveListen, rejectListen) => {
    const sessionToken = randomBytes(24).toString("hex");
    const workspaceCwd = options.workspaceCwd ?? process.cwd();
    const port = options.port ?? (Number(process.env.COGNETIVY_LOCAL_PORT) || DEFAULT_PORT);

    const store = new ExecutionStore();
    const hitl = new HitlCoordinator();
    const clients = new Set<WebSocket>();
    const runJobs = new Map<string, RunJob>();

    function broadcast(msg: WsServerMessage): void {
      const raw = serverMessage(msg);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(raw);
        }
      }
    }

    const app = express();
    const staticRoot = resolveLocalStudioStaticRoot();

    app.get("/api/local/session", (_req, res) => {
      res.json({ ok: true, token: sessionToken, wsPath: "/ws", protocolVersion: WS_PROTOCOL_VERSION });
    });

    app.use(
      express.static(staticRoot, {
        index: false,
      })
    );

    app.get(/.*/, (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).end();
        return;
      }
      const indexPath = path.join(staticRoot, "index.html");
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, "utf-8");
        html = html.replace(/__COGNETIVY_LOCAL_SESSION__/g, sessionToken);
        res.type("html").send(html);
      } else {
        res.status(404).send("Local studio bundle missing. Run npm run build in cognetivy/cli.");
      }
    });

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (ws: WebSocket) => {
      let authed = false;

      ws.on("message", (data) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(data));
        } catch {
          ws.send(serverMessage({ v: 1, type: "error", code: "BAD_JSON", message: "Invalid JSON" }));
          return;
        }
        const body = parsed as Partial<WsClientMessage> & { v?: number; type?: string };
        if (body.v !== WS_PROTOCOL_VERSION) {
          ws.send(
            serverMessage({
              v: 1,
              type: "error",
              code: "BAD_VERSION",
              message: `Expected protocol v${WS_PROTOCOL_VERSION}`,
            })
          );
          return;
        }

        if (body.type === "hello") {
          const token = typeof body.token === "string" ? body.token : "";
          if (token !== sessionToken) {
            ws.send(serverMessage({ v: 1, type: "welcome", sessionOk: false }));
            ws.close();
            return;
          }
          authed = true;
          clients.add(ws);
          ws.send(serverMessage({ v: 1, type: "welcome", sessionOk: true }));
          return;
        }

        if (!authed) {
          ws.send(serverMessage({ v: 1, type: "error", code: "UNAUTHORIZED", message: "Send hello first" }));
          return;
        }

        if (body.type === "hitl.response") {
          const runId = body.runId as string;
          const nodeId = body.nodeId as string;
          const payload = body.payload as Record<string, unknown>;
          if (!runId || !nodeId || !payload) {
            ws.send(serverMessage({ v: 1, type: "error", code: "BAD_PAYLOAD", message: "hitl.response requires runId, nodeId, payload" }));
            return;
          }
          hitl.respond(runId, nodeId, payload);
          return;
        }

        if (body.type === "run.cancel") {
          const runId = body.runId as string;
          const job = runJobs.get(runId);
          if (job) {
            job.abortController.abort();
          }
          hitl.cancelRun(runId);
          broadcast({ v: 1, type: "run.event", phase: "cancel_requested", runId, payload: {} });
          return;
        }

        if (body.type === "run.start") {
          const workflowId = body.workflowId as string;
          const name = body.name as string;
          const input = (body.input as Record<string, unknown>) ?? {};
          const cwd = typeof body.cwd === "string" && body.cwd.trim() ? path.resolve(body.cwd) : workspaceCwd;
          const agent = body.agent === "codex" ? "codex" : "claude";
          if (!workflowId?.trim() || !name?.trim()) {
            ws.send(
              serverMessage({ v: 1, type: "error", code: "BAD_PAYLOAD", message: "run.start requires workflowId and name" })
            );
            return;
          }

          const abortController = new AbortController();
          void executeWorkflowRun({
            store,
            hitl,
            emit: broadcast,
            log: (runId, nodeId, stream, chunk) => {
              store.appendLogChunk(runId, nodeId, stream, chunk);
              broadcast({ v: 1, type: "log.append", runId, nodeId, chunk, stream });
            },
            agent,
            cwd,
            workflowId: workflowId.trim(),
            workflowVersionId: typeof body.workflowVersionId === "string" ? body.workflowVersionId : undefined,
            name: name.trim(),
            input,
            abortSignal: abortController.signal,
            onRunCreated: (rid) => {
              runJobs.set(rid, { abortController });
            },
            onRunFinished: (rid) => {
              runJobs.delete(rid);
            },
          }).catch(() => {
            /* errors emitted via broadcast */
          });

          ws.send(serverMessage({ v: 1, type: "run.event", phase: "accepted", runId: "", payload: { workflowId } }));
          return;
        }

        ws.send(serverMessage({ v: 1, type: "error", code: "UNKNOWN_TYPE", message: String(body.type) }));
      });

      ws.on("close", () => {
        clients.delete(ws);
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const baseUrl = `http://127.0.0.1:${port}`;
      const openUrl = `${baseUrl}/?session=${encodeURIComponent(sessionToken)}`;
      resolveListen({
        baseUrl,
        port,
        sessionToken,
        openUrl,
        close: () =>
          new Promise((resolveClose) => {
            wss.close(() => {
              server.close(() => {
                store.close();
                resolveClose();
              });
            });
            for (const ws of clients) {
              ws.close();
            }
          }),
      });
    });

    server.on("error", (err) => {
      rejectListen(err);
    });
  });
}
