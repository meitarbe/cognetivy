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

interface RichTextProps {
  content: string;
  className?: string;
}

export function RichText({ content, className }: RichTextProps) {
  if (!content || typeof content !== "string") return null;

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
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
