import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type MutationRecord } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PatchDisplay } from "@/components/display/PatchDisplay";

const POLL_MS = 3000;

export function MutationDetailPage() {
  const { mutationId } = useParams<{ mutationId: string }>();
  const [mutation, setMutation] = useState<MutationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mutationId) return;
    const load = async () => {
      try {
        const data = await api.getMutation(mutationId);
        setMutation(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [mutationId]);

  if (!mutationId || error) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "Missing mutation ID"}</p>
            <Link to="/mutations" className="text-primary text-sm mt-2 inline-block hover:underline">
              Back to mutations
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <Link to="/mutations" className="text-muted-foreground hover:text-foreground">
          Mutations
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono truncate max-w-md">{mutationId}</span>
      </div>

      {mutation && (
        <>
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm">Mutation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs py-2 px-3">
              <p>
                <span className="text-muted-foreground">Target:</span> {mutation.target.workflow_id} @{" "}
                {mutation.target.from_version}
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant={mutation.status === "applied" ? "default" : "secondary"}>
                  {mutation.status}
                </Badge>
              </p>
              {mutation.applied_to_version && (
                <p>
                  <span className="text-muted-foreground">Applied to version:</span>{" "}
                  {mutation.applied_to_version}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Reason:</span> {mutation.reason}
              </p>
              <p>
                <span className="text-muted-foreground">Created:</span> {mutation.created_at} by{" "}
                {mutation.created_by}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm">Patch</CardTitle>
              <p className="text-xs text-muted-foreground">add = new, remove = deleted, replace = changed</p>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <ScrollArea className="h-[240px]">
                <div className="p-2">
                  <PatchDisplay patch={Array.isArray(mutation.patch) ? mutation.patch : []} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
