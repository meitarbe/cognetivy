interface KeyValueGridProps {
  data: Record<string, unknown>;
  className?: string;
}

export function KeyValueGrid({ data, className = "" }: KeyValueGridProps) {
  const entries = Object.entries(data).filter(
    ([_, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return null;
  return (
    <dl className={className}>
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 py-1.5 border-b border-border last:border-0">
          <dt className="text-muted-foreground font-medium min-w-[120px]">{key}</dt>
          <dd className="text-foreground break-words">
            {typeof value === "object" && value !== null && !Array.isArray(value) ? (
              <KeyValueGrid data={value as Record<string, unknown>} className="pl-0" />
            ) : Array.isArray(value) ? (
              <ul className="list-disc list-inside space-y-0.5">
                {value.map((item, i) => (
                  <li key={i}>
                    {typeof item === "object" && item !== null ? (
                      <KeyValueGrid data={item as Record<string, unknown>} />
                    ) : (
                      String(item)
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
