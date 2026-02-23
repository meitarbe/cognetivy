import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type CollectionSchemaConfig, type CollectionItem } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const POLL_MS = 5000;

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => formatCellValue(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EntityPage() {
  const { kind } = useParams<{ kind: string }>();
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [runNames, setRunNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!kind) return;
    try {
      const [schemaData, itemsData] = await Promise.all([
        api.getCollectionSchema(),
        api.getEntityData(kind),
      ]);
      setSchema(schemaData);
      setItems(itemsData);
      setError(null);

      const runIds = [...new Set(itemsData.map((i) => i.run_id as string).filter(Boolean))];
      const names: Record<string, string> = {};
      await Promise.all(
        runIds.map(async (id) => {
          try {
            const run = await api.getRun(id);
            if (run.name) names[id] = run.name;
          } catch {
            // ignore
          }
        })
      );
      setRunNames(names);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!kind || error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "Missing entity kind"}</p>
            <Link to="/collection-schema" className="text-primary text-sm mt-2 inline-block hover:underline">
              Define entities in Collection schema
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kindSchema = schema?.kinds[kind];
  const columns = kindSchema?.properties
    ? Object.keys(kindSchema.properties)
    : items.length > 0
      ? Array.from(
          new Set(items.flatMap((i) => Object.keys(i).filter((k) => !["id", "created_at"].includes(k))))
        )
      : [];

  const displayColumns = ["run_id", ...columns].filter((c, i, a) => a.indexOf(c) === i);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <Link to="/collection-schema" className="text-muted-foreground hover:text-foreground">
          Collection schema
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{kind}</span>
      </div>

      {kindSchema && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Schema</CardTitle>
            <p className="text-xs text-muted-foreground">{kindSchema.description}</p>
            <div className="flex gap-2 mt-1">
              {kindSchema.global && <Badge variant="secondary">Cross-run</Badge>}
              <span className="text-xs text-muted-foreground">
                Required: {kindSchema.required?.join(", ") || "—"}
              </span>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Data ({items.length} items)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No data yet. Agent defines and populates entities via collection_schema_set and collection_set.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {displayColumns.map((col) => (
                    <TableHead key={col} className="capitalize">
                      {col === "run_id" ? "Run" : col.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={(item.id as string) ?? i}>
                    {displayColumns.map((col) => (
                      <TableCell key={col} className="text-sm max-w-[500px] whitespace-normal break-words align-top">
                        {col === "run_id" && item.run_id ? (
                          <Link
                            to={`/runs/${encodeURIComponent(String(item.run_id))}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {runNames[String(item.run_id)] ?? String(item.run_id)}
                          </Link>
                        ) : col === "url" && item[col] ? (
                          <a
                            href={item[col] as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all"
                          >
                            {formatCellValue(item[col])}
                          </a>
                        ) : (
                          formatCellValue(item[col])
                        )}
                      </TableCell>
                    ))}
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
