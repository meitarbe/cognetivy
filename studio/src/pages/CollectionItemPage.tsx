import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type CollectionFieldReference, type CollectionItem } from "@/api";
import { useWorkflowSelection } from "@/contexts/WorkflowSelectionContext";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils";
import { RichText, isRichTextField, type SourceRef } from "@/components/display/RichText";
import { CopyableId } from "@/components/ui/CopyableId";
import { getCreatedByNodeId } from "@/components/display/CollectionTable";
import { downloadCollectionItemAsPdf } from "@/lib/collectionItemToPdf";
import { FileDown } from "lucide-react";

const EXCLUDE_KEYS = new Set(["id", "source_refs"]);

function getSourceRefs(item: CollectionItem): SourceRef[] {
  const refs = item.source_refs;
  if (!Array.isArray(refs)) return [];
  return refs.filter((r): r is SourceRef => r != null && typeof r === "object" && typeof (r as SourceRef).id === "string");
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CollectionItemPage() {
  const params = useParams<{ runId?: string; kind: string; itemId: string }>();
  const [searchParams] = useSearchParams();
  const runId = params.runId ?? searchParams.get("run_id") ?? null;
  const kind = params.kind ?? "";
  const itemId = params.itemId ?? "";
  const { selectedWorkflowId } = useWorkflowSelection();

  const [item, setItem] = useState<CollectionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, CollectionFieldReference>>({});

  const load = useCallback(async () => {
    if (!kind || !itemId) return;
    try {
      if (runId) {
        const store = await api.getCollections(runId, kind);
        const found =
          store.items.find((i) => (i.id as string) === itemId) ??
          store.items[parseInt(itemId, 10)];
        setItem(found ?? null);
        setError(found ? null : "Item not found");
      } else {
        const items = await api.getEntityData(kind);
        const found =
          items.find((i) => (i.id as string) === itemId) ?? items[parseInt(itemId, 10)];
        setItem(found ?? null);
        setError(found ? null : "Item not found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItem(null);
    }
  }, [kind, itemId, runId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function loadRefs() {
      if (!kind) return;
      try {
        if (runId) {
          const run = await api.getRun(runId);
          const schema = await api.getCollectionSchema(run.workflow_id);
          setReferences(schema.kinds[kind]?.references ?? {});
        } else if (selectedWorkflowId) {
          const schema = await api.getCollectionSchema(selectedWorkflowId);
          setReferences(schema.kinds[kind]?.references ?? {});
        } else {
          setReferences({});
        }
      } catch {
        setReferences({});
      }
    }
    loadRefs().catch(() => setReferences({}));
  }, [kind, runId, selectedWorkflowId]);

  if (error || !kind) {
    return (
      <div className="p-3">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error ?? "Missing kind or item"}</p>
            <Link to={runId ? `/runs/${runId}` : "/collections"} className="text-sm text-primary hover:underline mt-2 inline-block">
              Back
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-3">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const displayKind = kind.replace(/_/g, " ");
  const step = getCreatedByNodeId(item);
  const sourceRefs = getSourceRefs(item);
  const breadcrumbItems = runId
    ? [
        { label: "Runs", to: "/runs" as const },
        { label: runId, to: `/runs/${runId}` as const },
        { label: displayKind, to: `/runs/${runId}?tab=${kind}` as const },
        { label: item.id ? String(item.id) : "Item" },
      ]
    : [
        { label: "Collections", to: "/collections" as const },
        { label: displayKind, to: `/data/${kind}` as const },
        { label: item.id ? String(item.id) : "Item" },
      ];

  return (
    <div className="p-3 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 mt-2">
        <Breadcrumbs items={breadcrumbItems} />
        <button
          type="button"
          onClick={() => item && downloadCollectionItemAsPdf(item, kind)}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted"
          title="Download as PDF"
        >
          <FileDown className="size-3.5" />
          Download PDF
        </button>
      </div>
      <article className="mt-6 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{displayKind}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
            {item.created_at && (
              <span>Added {formatTimestamp(item.created_at as string)}</span>
            )}
            {runId && (
              <span className="inline-flex items-center gap-1">
                <CopyableId value={runId} truncateLength={16} />
                <Link to={`/runs/${runId}`} className="text-primary hover:underline">
                  View run
                </Link>
              </span>
            )}
            {step && (
              <span>
                Created by node:{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{step.replace(/_/g, " ")}</code>
              </span>
            )}
          </div>
        </header>
        <div className="space-y-8">
          {Object.entries(item)
            .filter(([k]) => !EXCLUDE_KEYS.has(k))
            .map(([key, value]) => {
              if (value === undefined || value === null) return null;
              const label = key.replace(/_/g, " ");
              const isRich = isRichTextField(key) && typeof value === "string";
              const ref = references[key];
              return (
                <section key={key}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {label}
                  </h2>
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
                      <Link to={`/runs/${encodeURIComponent(value)}`} className="text-primary hover:underline text-sm">
                        View run
                      </Link>
                    </span>
                  ) : ref ? (
                    Array.isArray(value) ? (
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {(value as unknown[]).map((v, i) => {
                          const id = String(v);
                          return (
                            <li key={`${key}-${id}-${i}`}>
                              <Link
                                to={`/data/${encodeURIComponent(ref.kind)}/items/${encodeURIComponent(id)}${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`}
                                className="text-primary hover:underline break-all"
                              >
                                {id}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <Link
                        to={`/data/${encodeURIComponent(ref.kind)}/items/${encodeURIComponent(String(value))}${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`}
                        className="text-primary hover:underline break-all"
                      >
                        {String(value)}
                      </Link>
                    )
                  ) : isRich ? (
                    <RichText content={value} sourceRefs={sourceRefs} className="prose prose-sm dark:prose-invert max-w-none" />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{formatValue(value)}</p>
                  )}
                </section>
              );
            })}
          {sourceRefs.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Sources
              </h2>
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
      </article>
    </div>
  );
}
