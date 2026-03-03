import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type CollectionFieldReference, type CollectionItem, TRACEABILITY_KEYS } from "@/api";
import { useWorkflowSelection } from "@/contexts/WorkflowSelectionContext";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils";
import { RichText, shouldRenderRichText, type SourceRef } from "@/components/display/RichText";
import { CopyableId } from "@/components/ui/CopyableId";
import { getCreatedByNodeId } from "@/components/display/CollectionTable";
import { TraceabilityDisplay } from "@/components/display/TraceabilityDisplay";
import { downloadCollectionItemAsPdf } from "@/lib/collectionItemToPdf";
import { FileDown } from "lucide-react";

const EXCLUDE_KEYS = new Set(["id", "source_refs", ...TRACEABILITY_KEYS]);
const TECHNICAL_FIELD_KEYS = new Set(["run_id", "created_at", "created_by_node_id", "created_by_node_result_id", "url"]);

const MOCK_COLLECTION_ITEM: CollectionItem = {
  id: "demo-item-001",
  run_id: "run_demo_ux_024",
  created_at: "2026-02-18T09:23:00.000Z",
  created_by_node_id: "synthesis_agent",
  created_by_node_result_id: "node_result_53",
  title: "Customer support quality is trending up after triage rewrite",
  summary:
    "The latest weekly support review indicates a measurable improvement in response quality and resolution confidence after introducing the new triage prompt.",
  content:
    "### Key finding\nAverage issue clarity improved from **3.1 → 4.2** in two weeks.\n\n### Why it matters\nClearer issue framing reduced back-and-forth and shortened average resolution time by 18%.\n\n### Suggested action\nRoll out the triage template to the onboarding queue and monitor escalation volume for two more cycles.",
  confidence_score: 0.83,
  citations: [
    {
      title: "Week 7 QA rubric",
      url: "https://example.com/qa-rubric/week-7",
      excerpt: "Issue clarity score rose in both billing and onboarding categories.",
    },
    {
      item_ref: {
        kind: "support_ticket",
        item_id: "ticket-1882",
        label: "Escalation thread: onboarding billing confusion",
      },
      excerpt: "Representative conversation showed fewer clarification loops.",
    },
  ],
  derived_from: [
    {
      kind: "support_ticket",
      item_id: "ticket-1882",
      title: "Escalation thread: onboarding billing confusion",
    },
    {
      kind: "weekly_metrics",
      item_id: "metrics-2026-w07",
      title: "Support quality metrics · Week 7",
    },
  ],
  reasoning:
    "The strongest signal is consistency across independent reviewers and cohorts, which lowers the chance that this is just sampling noise.",
};

function getSourceRefs(item: CollectionItem): SourceRef[] {
  const refs = item.source_refs;
  if (!Array.isArray(refs)) return [];
  return refs.filter((r): r is SourceRef => r != null && typeof r === "object" && typeof (r as SourceRef).id === "string");
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
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
  const useMockData = searchParams.get("mock") === "1";
  const kind = params.kind ?? "";
  const itemId = params.itemId ?? "";
  const { selectedWorkflowId } = useWorkflowSelection();

  const [item, setItem] = useState<CollectionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, CollectionFieldReference>>({});

  const load = useCallback(async () => {
    if (!kind || !itemId) return;
    if (useMockData) {
      setItem({ ...MOCK_COLLECTION_ITEM, id: itemId, run_id: runId ?? MOCK_COLLECTION_ITEM.run_id });
      setError(null);
      return;
    }
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
  }, [kind, itemId, runId, useMockData]);

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
  const orderedFields = Object.entries(item)
    .filter(([k]) => !EXCLUDE_KEYS.has(k))
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => {
      const rank = (key: string): number => {
        const lower = key.toLowerCase();
        if (lower === "title" || lower.endsWith("_title")) return 0;
        if (lower.includes("content") || lower.includes("summary") || lower.includes("description") || lower === "body") return 1;
        if (TECHNICAL_FIELD_KEYS.has(lower) || lower.endsWith("_id") || lower.endsWith("_at")) return 3;
        return 2;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b);
    });

  const primaryTitleField = orderedFields.find(([key]) => {
    const lower = key.toLowerCase();
    return lower === "title" || lower.endsWith("_title");
  });
  const primaryTitle = typeof primaryTitleField?.[1] === "string" ? (primaryTitleField[1] as string) : null;

  const mainContentFields = orderedFields.filter(([key]) => {
    const lower = key.toLowerCase();
    if (primaryTitleField && key === primaryTitleField[0]) return false;
    return !(TECHNICAL_FIELD_KEYS.has(lower) || lower.endsWith("_id") || lower.endsWith("_at"));
  });
  const technicalFields = orderedFields.filter(([key]) => {
    const lower = key.toLowerCase();
    return TECHNICAL_FIELD_KEYS.has(lower) || lower.endsWith("_id") || lower.endsWith("_at");
  });
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
    <div className="p-3 max-w-6xl mx-auto">
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
      <article className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-8">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {displayKind}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{primaryTitle ?? (item.id ? String(item.id) : "Untitled item")}</h1>
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
          {mainContentFields.map(([key, value]) => {
              const label = key.replace(/_/g, " ");
              const isRich = shouldRenderRichText(key, value);
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
          {technicalFields.length > 0 && (
            <section className="space-y-4 border-t border-border pt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Technical details
              </h2>
              <div className="space-y-4">
                {technicalFields.map(([key, value]) => {
                  const label = key.replace(/_/g, " ");
                  return (
                    <section key={key}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</h3>
                      <p className="text-sm whitespace-pre-wrap break-words">{formatValue(value)}</p>
                    </section>
                  );
                })}
              </div>
            </section>
          )}
        </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Evidence & Traceability</CardTitle>
            </CardHeader>
            <CardContent>
              <TraceabilityDisplay
                item={item}
                runId={runId ?? (item.run_id as string | undefined)}
                headingLevel="h3"
                className="space-y-5"
              />
            </CardContent>
          </Card>
          {sourceRefs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Sources</CardTitle>
              </CardHeader>
              <CardContent>
            <section>
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
              </CardContent>
            </Card>
          )}
        </aside>
      </article>
    </div>
  );
}
