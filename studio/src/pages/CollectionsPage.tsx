import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CollectionSchemaConfig } from "@/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";
import { getCollectionColor } from "@/lib/utils";

export function CollectionsPage() {
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getCollectionSchema();
      setSchema(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const kinds = schema ? Object.entries(schema.kinds) : [];

  return (
    <div className="p-3">
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Collections" }]} />
        <p className="text-sm text-muted-foreground mt-1">
          Schema-backed stores per run. Open a kind to view entities across runs or within a run.
        </p>
      </div>
      {kinds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No collection kinds defined. Configure collection schema in your workspace.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map(([kind, kindSchema]) => (
            <Link
              key={kind}
              to={`/data/${encodeURIComponent(kind)}`}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 border-l-4 pl-2" style={{ borderLeftColor: getCollectionColor(kind) }}>
                    <Database className="size-4 text-muted-foreground shrink-0" aria-hidden />
                    <CardTitle className="text-base">{kind}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {kindSchema.description || `Collection kind: ${kind}`}
                  </p>
                  <span className="text-xs text-primary font-medium mt-2 inline-block">
                    View by kind →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
