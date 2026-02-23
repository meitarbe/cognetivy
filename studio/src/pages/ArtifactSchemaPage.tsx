import { useEffect, useState } from "react";
import { api, type ArtifactSchemaConfig } from "@/api";
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

const POLL_MS = 3000;

export function ArtifactSchemaPage() {
  const [schema, setSchema] = useState<ArtifactSchemaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getArtifactSchema();
        setSchema(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

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
      <h2 className="text-base font-semibold mb-2">Artifact schema</h2>
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Kinds</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kinds.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No kinds defined
                  </TableCell>
                </TableRow>
              )}
              {kinds.map(([kind, def]) => (
                <TableRow key={kind}>
                  <TableCell className="font-medium">{kind}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{def.description}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {def.required?.map((r) => (
                        <Badge key={r} variant="outline">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
