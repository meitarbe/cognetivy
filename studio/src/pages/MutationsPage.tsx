import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MutationRecord } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
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

export function MutationsPage() {
  const [mutations, setMutations] = useState<MutationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getMutations();
        setMutations(data);
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
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3">
      <h2 className="text-base font-semibold mb-2">Mutations</h2>
      <Card>
        <CardContent className="p-0 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mutation ID</TableHead>
                <TableHead>From version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mutations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No mutations yet
                  </TableCell>
                </TableRow>
              )}
              {mutations.map((m) => (
                <TableRow key={m.mutation_id}>
                  <TableCell>
                    <Link
                      to={`/mutations/${encodeURIComponent(m.mutation_id)}`}
                      className="text-primary hover:underline font-mono text-sm"
                    >
                      {m.mutation_id}
                    </Link>
                  </TableCell>
                  <TableCell>{m.target.from_version}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "applied" ? "default" : "secondary"}>
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{m.reason}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{m.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
