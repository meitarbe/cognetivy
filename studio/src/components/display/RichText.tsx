import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const RICH_TEXT_KEYS = new Set([
  "idea_summary",
  "why_now_thesis",
  "description",
  "excerpt",
  "reliability_reason",
  "importance_reason",
  "summary",
  "content",
  "body",
  "notes",
]);

export function isRichTextField(key: string): boolean {
  return RICH_TEXT_KEYS.has(key) || key.endsWith("_reason") || key.endsWith("_summary");
}

export interface SourceRef {
  id: string;
  url?: string;
  label?: string;
}

interface RichTextProps {
  content: string;
  className?: string;
  /** Optional source references; [1], [2] in content become clickable links to these refs (1-based index). */
  sourceRefs?: SourceRef[];
}

function applySourceRefs(content: string, sourceRefs: SourceRef[]): string {
  if (sourceRefs.length === 0) return content;
  return content.replace(/\[(\d+)\]/g, (_, numStr) => {
    const index = parseInt(numStr, 10);
    const ref = sourceRefs[index - 1];
    if (!ref) return `[${numStr}]`;
    const href = ref.url ?? `#source-${ref.id}`;
    const title = ref.label ? ` "${ref.label.replace(/"/g, "\\\"")}"` : "";
    return `[${numStr}](${href}${title})`;
  });
}

export function RichText({ content, className, sourceRefs = [] }: RichTextProps) {
  if (!content || typeof content !== "string") return null;

  const processedContent = sourceRefs.length > 0 ? applySourceRefs(content, sourceRefs) : content;

  return (
    <div className={cn("rich-text text-sm space-y-2", className)}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside my-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          h1: ({ children }) => <h1 className="font-semibold mt-4 mb-2 text-base first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="font-semibold mt-4 mb-2 text-base">{children}</h2>,
          h3: ({ children }) => <h3 className="font-semibold mt-3 mb-1.5 text-sm">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>,
          pre: ({ children }) => <pre className="bg-muted p-2 rounded overflow-x-auto text-xs my-2">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground">{children}</blockquote>,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel={href?.startsWith("#") ? undefined : "noopener noreferrer"}
              className="text-primary hover:underline source-ref"
            >
              {children}
            </a>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
