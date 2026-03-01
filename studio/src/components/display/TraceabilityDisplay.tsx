import { Link } from "react-router-dom";
import type { CollectionItem, Citation, DerivedFrom } from "@/api";
import { RichText, shouldRenderRichText } from "./RichText";

function getCitations(item: CollectionItem): Citation[] {
  const raw = item.citations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Citation => c != null && typeof c === "object");
}

function getDerivedFrom(item: CollectionItem): DerivedFrom[] {
  const raw = item.derived_from;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is DerivedFrom =>
      d != null && typeof d === "object" && typeof (d as DerivedFrom).kind === "string" && typeof (d as DerivedFrom).item_id === "string"
  );
}

function getReasoning(item: CollectionItem): string | null {
  const r = item.reasoning;
  return typeof r === "string" && r.trim() ? r : null;
}

export function hasTraceability(item: CollectionItem): boolean {
  return getCitations(item).length > 0 || getDerivedFrom(item).length > 0 || getReasoning(item) != null;
}

interface TraceabilityDisplayProps {
  item: CollectionItem;
  /** When set, links to other items use run-scoped paths. */
  runId?: string | null;
  /** Section heading level: "h2" for page, "h3" for dialog. */
  headingLevel?: "h2" | "h3";
  className?: string;
}

function getItemUrl(refKind: string, refItemId: string, runId: string | null | undefined): string {
  if (runId) {
    return `/runs/${encodeURIComponent(runId)}/collections/${encodeURIComponent(refKind)}/items/${encodeURIComponent(refItemId)}`;
  }
  return `/data/${encodeURIComponent(refKind)}/items/${encodeURIComponent(refItemId)}`;
}

export function TraceabilityDisplay({
  item,
  runId,
  headingLevel: Level = "h2",
  className,
}: TraceabilityDisplayProps) {
  const citations = getCitations(item);
  const derivedFrom = getDerivedFrom(item);
  const reasoning = getReasoning(item);

  if (citations.length === 0 && derivedFrom.length === 0 && !reasoning) return null;

  return (
    <div className={className}>
      {citations.length > 0 && (
        <section className="space-y-2">
          <Level className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Citations
          </Level>
          <ul className="list-disc list-inside space-y-1.5 text-sm">
            {citations.map((c, i) => (
              <li key={i}>
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {c.title ?? c.url}
                  </a>
                ) : c.item_ref ? (
                  <Link
                    to={getItemUrl(c.item_ref.kind, c.item_ref.item_id, runId ?? undefined)}
                    className="text-primary hover:underline"
                  >
                    {c.item_ref.kind} #{c.item_ref.item_id}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {c.excerpt && (
                  <span className="block text-muted-foreground text-xs mt-0.5 pl-4 border-l border-border">
                    {c.excerpt}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {derivedFrom.length > 0 && (
        <section className="space-y-2">
          <Level className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Derived from
          </Level>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {derivedFrom.map((d, i) => (
              <li key={i}>
                <Link
                  to={getItemUrl(d.kind, d.item_id, runId ?? undefined)}
                  className="text-primary hover:underline"
                >
                  {d.kind} #{d.item_id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reasoning && (
        <section className="space-y-2">
          <Level className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reasoning
          </Level>
          {shouldRenderRichText("reasoning", reasoning) ? (
            <RichText content={reasoning} className="prose prose-sm dark:prose-invert max-w-none text-sm" />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{reasoning}</p>
          )}
        </section>
      )}
    </div>
  );
}
