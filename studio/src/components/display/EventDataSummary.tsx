import type { ReactNode } from "react";

interface EventDataSummaryProps {
  type: string;
  data: Record<string, unknown>;
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function StepCompletedSummary({ data }: { data: Record<string, unknown> }) {
  const themes = (data.themes as string[] | undefined) ?? [];
  const signals = (data.signals as Record<string, unknown> | undefined) ?? {};
  const ideasCount = data.ideas_count as number | undefined;
  const sourcesCount = data.sources_count as number | undefined;
  const learnings = (data.learnings as string[] | undefined) ?? [];
  const output = data.output as unknown;
  const storedIn = data.stored_in as string | undefined;
  const step = (data.step ?? data.step_id ?? data.node_id) as string | undefined;
  const status = data.status as string | undefined;

  const produced: string[] = [];
  if (ideasCount != null) produced.push(`${ideasCount} ideas`);
  if (sourcesCount != null) produced.push(`${sourcesCount} sources`);

  return (
    <div className="space-y-1.5 text-xs">
      {step && (
        <div>
          <span className="text-muted-foreground font-medium">Step:</span> {step}
          {status && status !== "step_completed" && (
            <span className="ml-1.5 text-muted-foreground">({status})</span>
          )}
        </div>
      )}
      {themes.length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium">Themes:</span> {themes.join(", ")}
        </div>
      )}
      {Object.keys(signals).length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium">Signals:</span>
          <ul className="list-disc list-inside mt-0.5 ml-1">
            {Object.entries(signals).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span> {formatValue(v)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {produced.length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium">Produced:</span> {produced.join(", ")}
        </div>
      )}
      {learnings.length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium">Learnings:</span>
          <ul className="list-disc list-inside mt-0.5 ml-1">
            {learnings.map((l, i) => (
              <li key={i}>{formatValue(l)}</li>
            ))}
          </ul>
        </div>
      )}
      {output !== undefined && output !== null && (
        <div>
          <span className="text-muted-foreground font-medium">Output:</span>{" "}
          {typeof output === "object" ? (
            <pre className="mt-0.5 p-1.5 bg-muted rounded text-[10px] overflow-x-auto max-h-24 overflow-y-auto">
              {JSON.stringify(output, null, 2)}
            </pre>
          ) : (
            formatValue(output)
          )}
        </div>
      )}
      {storedIn && (
        <div>
          <span className="text-muted-foreground font-medium">Stored in:</span> {storedIn}
        </div>
      )}
    </div>
  );
}

function StepStartedSummary({ data }: { data: Record<string, unknown> }) {
  const step = (data.step ?? data.step_id ?? data.node_id) as string | undefined;
  const constraint = data.constraint as string | undefined;
  const context = data.context as unknown;

  return (
    <div className="space-y-1 text-xs">
      {step && (
        <div>
          <span className="text-muted-foreground font-medium">Step:</span> {step}
        </div>
      )}
      {constraint && (
        <div>
          <span className="text-muted-foreground font-medium">Constraint:</span> {constraint}
        </div>
      )}
      {context !== undefined && context !== null && (
        <div>
          <span className="text-muted-foreground font-medium">Context:</span> {formatValue(context)}
        </div>
      )}
    </div>
  );
}

function RunStartedSummary({ data }: { data: Record<string, unknown> }) {
  const version = data.workflow_version as string | undefined;
  const input = data.input as Record<string, unknown> | undefined;

  return (
    <div className="space-y-1 text-xs">
      {version && (
        <div>
          <span className="text-muted-foreground font-medium">Version:</span> {version}
        </div>
      )}
      {input && Object.keys(input).length > 0 && (
        <div>
          <span className="text-muted-foreground font-medium">Input:</span>{" "}
          {Object.entries(input)
            .map(([k, v]) => `${k}: ${formatValue(v)}`)
            .join("; ")}
        </div>
      )}
    </div>
  );
}

function RunCompletedSummary({ data }: { data: Record<string, unknown> }) {
  const ideasCount = data.ideas_count as number | undefined;
  const status = data.status as string | undefined;
  const message = data.message as string | undefined;

  return (
    <div className="space-y-1 text-xs">
      {status && (
        <div>
          <span className="text-muted-foreground font-medium">Status:</span> {status}
        </div>
      )}
      {ideasCount != null && (
        <div>
          <span className="text-muted-foreground font-medium">Ideas:</span> {ideasCount}
        </div>
      )}
      {message && (
        <div>
          <span className="text-muted-foreground font-medium">Message:</span> {message}
        </div>
      )}
    </div>
  );
}

function GenericSummary({ data }: { data: Record<string, unknown> }) {
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-muted-foreground italic">—</span>;
  const parts: string[] = [];
  const step = data.step ?? data.step_id ?? data.node_id;
  if (step != null) parts.push(`step: ${String(step)}`);
  if (data.status != null) parts.push(String(data.status));
  if (data.message != null) parts.push(String(data.message).slice(0, 60));
  const rest = keys.filter((k) => !["step", "step_id", "node_id", "status", "message"].includes(k));
  if (rest.length > 0) parts.push(rest.join(", "));
  return <span className="text-sm">{parts.join(" · ") || keys.join(", ")}</span>;
}

export function EventDataSummary({ type, data }: EventDataSummaryProps) {
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-muted-foreground italic">—</span>;

  let content: ReactNode;
  switch (type) {
    case "step_completed":
      content = <StepCompletedSummary data={data} />;
      break;
    case "step_started":
      content = <StepStartedSummary data={data} />;
      break;
    case "run_started":
      content = <RunStartedSummary data={data} />;
      break;
    case "run_completed":
      content = <RunCompletedSummary data={data} />;
      break;
    default:
      content = <GenericSummary data={data} />;
  }

  return (
    <div className="space-y-1">
      {content}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-0.5">
          Raw data
        </summary>
        <pre className="mt-0.5 p-1.5 bg-muted rounded text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
