import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const POLL_MS = 5000;

interface CollectionRow {
  runId: string;
  runName?: string;
  kind: string;
  itemsCount: number;
  updatedAt: string;
}

export function CollectionsPage() {
  const [searchParams] = useSearchParams();
  const kindFilter = searchParams.get("kind");
  const [collectionData, setCollectionData] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const runsData = await api.getRuns();
      setError(null);
      const rows: CollectionRow[] = [];
      for (const run of runsData) {
        try {
          const kinds = await api.getCollectionKinds(run.run_id);
          for (const kind of kinds) {
            const store = await api.getCollections(run.run_id, kind);
            rows.push({
              runId: run.run_id,
              runName: run.name,
              kind,
              itemsCount: store.items?.length ?? 0,
              updatedAt: store.updated_at ?? "",
            });
          }
        } catch {
          // Skip run if collection fetch fails
        }
      }
      setCollectionData(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!kindFilter) return collectionData;
    return collectionData.filter((r) => r.kind === kindFilter);
  }, [collectionData, kindFilter]);

  if (error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold">Collections</h2>
        {kindFilter && (
          <span className="text-xs text-muted-foreground">
            Filtered by kind: {kindFilter}
            <Link to="/collections" className="ml-2 text-primary hover:underline">
              Clear
            </Link>
          </span>
        )}
      </div>
      <Card>
        <CardContent className="p-0 text-sm">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No collections yet
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((row, i) => (
                  <TableRow key={`${row.runId}-${row.kind}-${i}`}>
                    <TableCell>
                      <Link
                        to={`/runs/${encodeURIComponent(row.runId)}?tab=${encodeURIComponent(row.kind)}`}
                        className="text-primary hover:underline"
                      >
                        {row.runName ?? row.runId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/data/${encodeURIComponent(row.kind)}`}
                        className="text-primary hover:underline"
                      >
                        {row.kind}
                      </Link>
                    </TableCell>
                    <TableCell>{row.itemsCount}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.updatedAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
