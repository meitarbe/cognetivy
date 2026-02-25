import { Link } from "react-router-dom";
import type { CollectionItem } from "@/api";
import { CopyableId } from "@/components/ui/CopyableId";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/utils";
import { RichText, isRichTextField, type SourceRef } from "./RichText";

const EXCLUDE_KEYS = new Set(["id", "source_refs"]);

function getSourceRefs(item: CollectionItem): SourceRef[] {
  const refs = item.source_refs;
  if (!Array.isArray(refs)) return [];
  return refs.filter((r): r is SourceRef => r != null && typeof r === "object" && typeof (r as SourceRef).id === "string");
}

interface CollectionItemDetailProps {
  item: CollectionItem | null;
  kind: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CollectionItemDetail({ item, kind, open, onOpenChange }: CollectionItemDetailProps) {
  if (!item) return null;

  const sourceRefs = getSourceRefs(item);
  const entries = Object.entries(item).filter(([k]) => !EXCLUDE_KEYS.has(k));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {kind} {item.created_at && (
              <span className="text-muted-foreground font-normal text-sm ml-2">
                Added {formatTimestamp(item.created_at as string)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          {entries.map(([key, value]) => {
            if (value === undefined || value === null) return null;
            const label = key.replace(/_/g, " ");
            const isRich = isRichTextField(key) && typeof value === "string";

            return (
              <section key={key}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {label}
                </h3>
                {key === "url" && typeof value === "string" ? (
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {value}
                  </a>
                ) : key === "run_id" && typeof value === "string" ? (
                  <span className="inline-flex items-center gap-2">
                    <CopyableId value={value} />
                    <Link
                      to={`/runs/${encodeURIComponent(value)}`}
                      className="text-primary hover:underline text-sm"
                    >
                      View run
                    </Link>
                  </span>
                ) : isRich ? (
                  <RichText content={value} sourceRefs={sourceRefs} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {formatValue(value)}
                  </p>
                )}
              </section>
            );
          })}
          {sourceRefs.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Sources
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {sourceRefs.map((ref, i) => (
                  <li key={ref.id}>
                    {ref.url ? (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {ref.label ?? ref.id ?? `[${i + 1}]`}
                      </a>
                    ) : (
                      <span>{ref.label ?? ref.id ?? `[${i + 1}]`}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
