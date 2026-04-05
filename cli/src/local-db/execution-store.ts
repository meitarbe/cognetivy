/**
 * Local SQLite persistence for executor logs and metadata (not synced to cloud).
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getCredentialsDir } from "../credentials.js";

export class ExecutionStore {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const dir = getCredentialsDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = dbPath ?? path.join(dir, "executor-local.sqlite");
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_runs (
        run_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS node_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        exit_code INTEGER
      );
      CREATE TABLE IF NOT EXISTS log_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        node_id TEXT,
        stream TEXT,
        chunk TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        node_id TEXT,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  insertExecutionRun(runId: string, workflowId: string, status: string): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO execution_runs (run_id, workflow_id, status, created_at) VALUES (?, ?, ?, ?)`
    );
    stmt.run(runId, workflowId, status, new Date().toISOString());
  }

  updateRunStatus(runId: string, status: string): void {
    this.db.prepare(`UPDATE execution_runs SET status = ? WHERE run_id = ?`).run(status, runId);
  }

  insertNodeExecution(
    runId: string,
    nodeId: string,
    phase: string,
    startedAt: string | null,
    finishedAt: string | null,
    exitCode: number | null
  ): void {
    this.db
      .prepare(
        `INSERT INTO node_executions (run_id, node_id, phase, started_at, finished_at, exit_code) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(runId, nodeId, phase, startedAt, finishedAt, exitCode);
  }

  appendLogChunk(runId: string, nodeId: string | undefined, stream: string | undefined, chunk: string): void {
    this.db
      .prepare(
        `INSERT INTO log_chunks (run_id, node_id, stream, chunk, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run(runId, nodeId ?? null, stream ?? null, chunk, new Date().toISOString());
  }

  saveArtifact(runId: string, nodeId: string | undefined, kind: string, body: string): void {
    this.db
      .prepare(`INSERT INTO artifacts (run_id, node_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(runId, nodeId ?? null, kind, body, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}
