/**
 * SQLite schema for local cognetivy workspace.
 * Single DB file per workspace: .cognetivy/cognetivy.db
 */

export const LOCAL_DB_FILENAME = "cognetivy.db";

export function getCreateTableStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      selected_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      nodes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      UNIQUE(workflow_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_index (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_collection_schemas (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT,
      item_schema TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      UNIQUE(workflow_id, kind)
    )`,
    `CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      workflow_version_id TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      input TEXT NOT NULL,
      final_answer TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (workflow_version_id) REFERENCES workflow_versions(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      by TEXT,
      data TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_run_events_run_ts ON run_events(run_id, ts)`,
    `CREATE TABLE IF NOT EXISTS node_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      output TEXT,
      writes TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
      UNIQUE(run_id, node_id)
    )`,
    `CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by_node_id TEXT NOT NULL,
      created_by_node_result_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_collection_items_run_kind ON collection_items(run_id, kind)`,
  ];
}
