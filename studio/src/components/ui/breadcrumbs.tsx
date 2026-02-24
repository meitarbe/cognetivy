import { Link } from "react-router-dom";
import { cn, TABLE_LINK_CLASS } from "@/lib/utils";

export interface BreadcrumbItem {
  label: React.ReactNode;
  to?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && (
              <span className="shrink-0 text-muted-foreground/70" aria-hidden>
                /
              </span>
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className={cn(TABLE_LINK_CLASS, "truncate", "focus:outline-none focus:underline")}
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast && "font-medium text-foreground", "truncate")}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
