import { Badge } from "@/components/ui/badge";
import type { VersionDiff } from "@/lib/workflowDiff";

interface VersionDiffViewProps {
  diff: VersionDiff;
  fromVersion: string;
  toVersion: string;
}

export function VersionDiffView({ diff, fromVersion, toVersion }: VersionDiffViewProps) {
  const hasChanges =
    diff.nodesAdded.length > 0 ||
    diff.nodesRemoved.length > 0 ||
    diff.nodesChanged.length > 0 ||
    diff.edgesAdded.length > 0 ||
    diff.edgesRemoved.length > 0;
  if (!hasChanges) {
    return (
      <p className="text-sm text-muted-foreground">No structural changes from {fromVersion} to {toVersion}.</p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Changes from <strong>{fromVersion}</strong> → <strong>{toVersion}</strong>
      </p>
      <div className="flex flex-wrap gap-4">
        {diff.nodesAdded.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium block mb-1">Added nodes</span>
            <div className="flex flex-wrap gap-1">
              {diff.nodesAdded.map((id) => (
                <Badge key={id} className="bg-green-600 hover:bg-green-600 text-white">
                  + {id}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {diff.nodesRemoved.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium block mb-1">Removed nodes</span>
            <div className="flex flex-wrap gap-1">
              {diff.nodesRemoved.map((id) => (
                <Badge key={id} variant="destructive">
                  − {id}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {diff.nodesChanged.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium block mb-1">Changed nodes</span>
            <div className="flex flex-wrap gap-1">
              {diff.nodesChanged.map((id) => (
                <Badge key={id} className="bg-amber-600 hover:bg-amber-600 text-white">
                  ~ {id}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {diff.edgesAdded.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium block mb-1">Added edges</span>
            <div className="flex flex-wrap gap-1">
              {diff.edgesAdded.map((e, i) => (
                <Badge key={i} className="bg-green-600/80 hover:bg-green-600/80 text-white font-mono text-xs">
                  + {e.from} → {e.to}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {diff.edgesRemoved.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium block mb-1">Removed edges</span>
            <div className="flex flex-wrap gap-1">
              {diff.edgesRemoved.map((e, i) => (
                <Badge key={i} variant="destructive" className="font-mono text-xs">
                  − {e.from} → {e.to}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
