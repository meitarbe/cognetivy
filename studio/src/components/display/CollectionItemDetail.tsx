import { Link } from "react-router-dom";
import type { CollectionItem } from "@/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTimestamp } from "@/lib/utils";
import { RichText, isRichTextField } from "./RichText";

const EXCLUDE_KEYS = new Set(["id"]);

interface CollectionItemDetailProps {
  item: CollectionItem | null;
  kind: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CollectionItemDetail({ item, kind, open, onOpenChange }: CollectionItemDetailProps) {
  if (!item) return null;

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
                  <Link
                    to={`/runs/${encodeURIComponent(value)}`}
                    className="text-primary hover:underline"
                  >
                    {value}
                  </Link>
                ) : isRich ? (
                  <RichText content={value} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {formatValue(value)}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
