export type DataflowVertexType = "node" | "collection";

export interface DataflowVertex {
  id: string;
  type: DataflowVertexType;
}

export interface DataflowEdge {
  from: string;
  to: string;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  row: number;
  colInRow: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const HORIZONTAL_GAP = 80;
/** Vertical space between rows (half of original 100 for tighter top-to-bottom). */
const VERTICAL_GAP = 50;

/**
 * Top-to-bottom layout for a generic DAG:
 * row 0 = roots (no incoming), row N = nodes whose predecessors are in row < N.
 * Within each row, nodes are spread horizontally.
 */
export function getDataflowLayout(input: {
  vertices: DataflowVertex[];
  edges: DataflowEdge[];
}): {
  positions: Map<string, NodePosition>;
  rows: string[][];
} {
  const nodeIds = new Set(input.vertices.map((v) => v.id));
  const inEdges: Record<string, string[]> = {};
  const outEdges: Record<string, string[]> = {};
  nodeIds.forEach((id) => {
    inEdges[id] = [];
    outEdges[id] = [];
  });
  input.edges.forEach((e: DataflowEdge) => {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      inEdges[e.to].push(e.from);
      outEdges[e.from].push(e.to);
    }
  });

  const rowByNode: Record<string, number> = {};
  [...nodeIds].forEach((id) => (rowByNode[id] = 0));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of nodeIds) {
      const preds = inEdges[id] ?? [];
      const predRows = preds.map((from) => rowByNode[from] ?? 0);
      const newRow = preds.length === 0 ? 0 : Math.max(...predRows) + 1;
      if (rowByNode[id] !== newRow) {
        rowByNode[id] = newRow;
        changed = true;
      }
    }
  }

  const rowToList: Record<number, string[]> = {};
  Object.entries(rowByNode).forEach(([id, r]) => {
    if (!rowToList[r]) rowToList[r] = [];
    rowToList[r].push(id);
  });
  const rows: string[][] = Object.keys(rowToList)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => {
      const list = rowToList[r];
      list.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
      return list;
    });

  const maxCols = Math.max(...rows.map((r) => r.length), 1);
  const maxRowWidth = maxCols * NODE_WIDTH + (maxCols - 1) * HORIZONTAL_GAP;
  const rowCenterX = maxRowWidth / 2;

  const positions = new Map<string, NodePosition>();
  rows.forEach((rowNodes, rowIndex) => {
    const rowSpan = (rowNodes.length - 1) * (NODE_WIDTH + HORIZONTAL_GAP);
    const firstCenterX = rowCenterX - rowSpan / 2;
    const centerY = rowIndex * (NODE_HEIGHT + VERTICAL_GAP) + NODE_HEIGHT / 2;
    rowNodes.forEach((id, colInRow) => {
      const x = firstCenterX + colInRow * (NODE_WIDTH + HORIZONTAL_GAP);
      positions.set(id, { id, x, y: centerY, row: rowIndex, colInRow });
    });
  });

  return { positions, rows };
}

export function getLayoutDimensions(input: { vertices: DataflowVertex[]; edges: DataflowEdge[] }): {
  width: number;
  height: number;
} {
  const { rows } = getDataflowLayout(input);
  if (rows.length === 0) return { width: 400, height: 300 };
  const maxCols = Math.max(...rows.map((r) => r.length));
  const width = maxCols * (NODE_WIDTH + HORIZONTAL_GAP) + 40;
  const height = rows.length * (NODE_HEIGHT + VERTICAL_GAP) + 40;
  return { width, height };
}

/**
 * Compute layer index for each workflow node from dataflow (collection ↔ node edges).
 * Node B is predecessor of node A when some collection C has B→C and C→A.
 */
export function getNodeRowsFromDataflow(input: {
  nodeIds: Set<string>;
  edges: DataflowEdge[];
}): Record<string, number> {
  const { nodeIds, edges } = input;
  const inEdges: Record<string, string[]> = {};
  nodeIds.forEach((id) => (inEdges[id] = []));
  const collectionToNodes: Record<string, string[]> = {};
  const nodeToCollections: Record<string, string[]> = {};
  edges.forEach((e) => {
    if (e.from.startsWith("node:") && nodeIds.has(e.from)) {
      if (!nodeToCollections[e.from]) nodeToCollections[e.from] = [];
      nodeToCollections[e.from].push(e.to);
    }
    if (e.to.startsWith("node:") && nodeIds.has(e.to)) {
      if (!collectionToNodes[e.from]) collectionToNodes[e.from] = [];
      collectionToNodes[e.from].push(e.to);
    }
  });
  Object.keys(collectionToNodes).forEach((collId) => {
    const consumers = collectionToNodes[collId];
    const producers = Object.entries(nodeToCollections)
      .filter(([, cols]) => cols.includes(collId))
      .map(([n]) => n);
    producers.forEach((from) => {
      consumers.forEach((to) => {
        if (from !== to) inEdges[to].push(from);
      });
    });
  });
  const rowByNode: Record<string, number> = {};
  [...nodeIds].forEach((id) => (rowByNode[id] = 0));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of nodeIds) {
      const preds = inEdges[id] ?? [];
      const predRows = preds.map((from) => rowByNode[from] ?? 0);
      const newRow = preds.length === 0 ? 0 : Math.max(...predRows) + 1;
      if (rowByNode[id] !== newRow) {
        rowByNode[id] = newRow;
        changed = true;
      }
    }
  }
  return rowByNode;
}

/**
 * Assign x,y when each vertex has a pre-assigned row (e.g. layer-based layout).
 * Collection-only rows use a smaller horizontal gap so collections sit closer left-to-right.
 */
export function getLayoutWithPreassignedRows(input: {
  vertices: DataflowVertex[];
  rowByVertex: Record<string, number>;
}): { positions: Map<string, NodePosition>; rows: string[][] } {
  const { vertices, rowByVertex } = input;
  const vertexById = new Map(vertices.map((v) => [v.id, v]));
  const rowToList: Record<number, string[]> = {};
  vertices.forEach((v) => {
    const r = rowByVertex[v.id] ?? 0;
    if (!rowToList[r]) rowToList[r] = [];
    rowToList[r].push(v.id);
  });
  const rows: string[][] = Object.keys(rowToList)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => {
      const list = rowToList[r];
      list.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
      return list;
    });
  const maxCols = Math.max(...rows.map((r) => r.length), 1);
  const maxRowWidth = maxCols * NODE_WIDTH + (maxCols - 1) * HORIZONTAL_GAP;
  const rowCenterX = maxRowWidth / 2;
  const positions = new Map<string, NodePosition>();
  rows.forEach((rowNodes, rowIndex) => {
    const isCollectionRow = rowNodes.every((id) => vertexById.get(id)?.type === "collection");
    const slotWidth = isCollectionRow
      ? COLLECTION_NODE_WIDTH + COLLECTION_HORIZONTAL_GAP
      : NODE_WIDTH + HORIZONTAL_GAP;
    const rowSpan = (rowNodes.length - 1) * slotWidth;
    const firstCenterX = rowCenterX - rowSpan / 2;
    const centerY = rowIndex * (NODE_HEIGHT + VERTICAL_GAP) + NODE_HEIGHT / 2;
    rowNodes.forEach((id, colInRow) => {
      const x = firstCenterX + colInRow * slotWidth;
      positions.set(id, { id, x, y: centerY, row: rowIndex, colInRow });
    });
  });
  return { positions, rows };
}

const COLLECTION_NODE_WIDTH = 100;
const COLLECTION_NODE_HEIGHT = 44;
const COLLECTION_HORIZONTAL_GAP = 44;

export { NODE_WIDTH, NODE_HEIGHT, HORIZONTAL_GAP, VERTICAL_GAP, COLLECTION_NODE_WIDTH, COLLECTION_NODE_HEIGHT, COLLECTION_HORIZONTAL_GAP };
