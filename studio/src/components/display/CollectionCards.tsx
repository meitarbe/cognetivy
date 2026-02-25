import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CollectionItem } from "@/api";

interface CollectionCardsProps {
  kind: string;
  items: CollectionItem[];
}

function SourceCard({ item }: { item: CollectionItem }) {
  const url = (item.url as string) ?? "";
  const title = (item.title as string) ?? url;
  const snippet = (item.snippet as string) ?? "";
  const type = (item.type as string) ?? "";
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline text-sm truncate max-w-full"
          >
            {title || url || "-"}
          </a>
          {type && <Badge variant="secondary">{type}</Badge>}
        </div>
      </CardHeader>
      {snippet && (
        <CardContent className="py-1 px-3 text-xs text-muted-foreground line-clamp-2">
          {snippet}
        </CardContent>
      )}
    </Card>
  );
}

function CollectedCard({ item }: { item: CollectionItem }) {
  const themes = (item.themes as string[] | undefined) ?? [];
  const signals = (item.signals as Record<string, unknown> | undefined) ?? {};
  const raw = (item.raw as string[] | undefined) ?? [];
  return (
    <Card>
      <CardContent className="p-3 space-y-2 text-sm">
        {themes.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium">Themes: </span>
            <span>{themes.join(", ")}</span>
          </div>
        )}
        {Object.keys(signals).length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium">Signals: </span>
            <ul className="list-disc list-inside mt-0.5">
              {Object.entries(signals).map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{k}:</span> {String(v)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {raw.length > 0 && (
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            {raw.slice(0, 5).map((r, i) => (
              <li key={i}>{String(r).slice(0, 120)}{String(r).length > 120 ? "…" : ""}</li>
            ))}
            {raw.length > 5 && <li>… +{raw.length - 5} more</li>}
          </ul>
        )}
        {themes.length === 0 && Object.keys(signals).length === 0 && raw.length === 0 && (
          <span className="text-muted-foreground italic">No content</span>
        )}
      </CardContent>
    </Card>
  );
}

function IdeaCard({ item }: { item: CollectionItem }) {
  const name = (item.name as string) ?? "-";
  const whyNow = (item.why_now as string) ?? "";
  const description = (item.description as string) ?? "";
  const targetSegment = (item.target_segment as string) ?? "";
  const firstSteps = (item.first_steps as string[] | undefined) ?? [];
  const signals = (item.signals as string[] | undefined) ?? [];
  return (
    <Card>
      <CardHeader className="pb-1">
        <h4 className="font-semibold text-base">{name}</h4>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {whyNow && (
          <div>
            <span className="text-muted-foreground font-medium">Why now: </span>
            <span>{whyNow}</span>
          </div>
        )}
        {description && (
          <div>
            <span className="text-muted-foreground font-medium">Description: </span>
            <p className="mt-0.5">{description}</p>
          </div>
        )}
        {targetSegment && (
          <div>
            <span className="text-muted-foreground font-medium">Target: </span>
            <span>{targetSegment}</span>
          </div>
        )}
        {firstSteps.length > 0 && (
          <div>
            <span className="text-muted-foreground font-medium">First steps: </span>
            <ul className="list-disc list-inside mt-0.5">
              {firstSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {signals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {signals.map((s, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CollectionCards({ kind, items }: CollectionCardsProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No {kind} yet.</p>;
  }
  const CardComponent =
    kind === "sources"
      ? SourceCard
      : kind === "collected"
        ? CollectedCard
        : kind === "ideas"
          ? IdeaCard
          : GenericCard;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <CardComponent key={(item.id as string) ?? i} item={item} />
      ))}
    </div>
  );
}

function GenericCard({ item }: { item: CollectionItem }) {
  const { id, created_at, ...rest } = item;
  const entries = Object.entries(rest).filter(
    ([_, v]) => v !== undefined && v !== null && v !== ""
  );
  return (
    <Card>
      <CardContent className="p-3 space-y-1.5 text-sm">
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className="text-muted-foreground font-medium">{k}: </span>
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
