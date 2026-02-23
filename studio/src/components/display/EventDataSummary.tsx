interface EventDataSummaryProps {
  data: Record<string, unknown>;
}

export function EventDataSummary({ data }: EventDataSummaryProps) {
  const keys = Object.keys(data);
  if (keys.length === 0) return <span className="text-muted-foreground italic">—</span>;
  const parts: string[] = [];
  if (data.step != null) parts.push(`step: ${String(data.step)}`);
  if (data.status != null) parts.push(String(data.status));
  if (data.message != null) parts.push(String(data.message).slice(0, 60));
  const rest = keys.filter((k) => !["step", "status", "message"].includes(k));
  if (rest.length > 0) parts.push(`${rest.join(", ")}`);
  return <span className="text-sm">{parts.join(" · ") || keys.join(", ")}</span>;
}
