/**
 * Resolves HUMAN_IN_THE_LOOP steps when the UI sends hitl.response over WebSocket.
 */

export interface HitlPending {
  runId: string;
  nodeId: string;
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

export class HitlCoordinator {
  private readonly pending = new Map<string, HitlPending>();

  private key(runId: string, nodeId: string): string {
    return `${runId}:${nodeId}`;
  }

  waitForResponse(runId: string, nodeId: string): Promise<Record<string, unknown>> {
    const k = this.key(runId, nodeId);
    return new Promise((resolve, reject) => {
      this.pending.set(k, { runId, nodeId, resolve, reject });
    });
  }

  respond(runId: string, nodeId: string, payload: Record<string, unknown>): boolean {
    const k = this.key(runId, nodeId);
    const p = this.pending.get(k);
    if (!p) return false;
    this.pending.delete(k);
    p.resolve(payload);
    return true;
  }

  cancelRun(runId: string): void {
    for (const [k, p] of this.pending) {
      if (p.runId === runId) {
        this.pending.delete(k);
        p.reject(new Error("Run cancelled"));
      }
    }
  }
}
