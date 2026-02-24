import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const COPIED_DURATION_MS = 2000;

interface CopyableIdProps {
  value: string;
  className?: string;
  /** Optional truncate length; 0 or undefined = no truncate */
  truncateLength?: number;
}

export function CopyableId({ value, className, truncateLength }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_DURATION_MS);
    });
  }, [value]);

  const displayValue =
    truncateLength && value.length > truncateLength
      ? `${value.slice(0, truncateLength)}…`
      : value;

  return (
    <span
      className={cn("inline-flex items-center gap-1 min-w-0", className)}
      title={value}
    >
      <span className="truncate font-mono text-inherit">{displayValue}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={copied ? "Copied" : "Copy ID"}
        title={copied ? "Copied" : "Copy ID"}
      >
        {copied ? (
          <Check className="size-3.5 text-green-600 dark:text-green-400" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </span>
  );
}
