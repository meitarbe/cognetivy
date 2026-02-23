import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { api, type CollectionSchemaConfig } from "@/api";
import {
  ChevronDown,
  ChevronRight,
  PlayCircle,
  GitBranch,
  Database,
  FolderOpen,
  FileCode,
  Lightbulb,
  FileText,
  type LucideIcon,
} from "lucide-react";

const staticNavItems: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/runs", label: "Runs", icon: PlayCircle },
  { to: "/", label: "Workflow", icon: GitBranch },
  { to: "/collections", label: "Collections", icon: Database },
  { to: "/collection-schema", label: "Collection schema", icon: FileCode },
];

const KIND_ICONS: Record<string, LucideIcon> = {
  ideas: Lightbulb,
  sources: FileText,
};

function getKindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? FileText;
}

export function AppLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [dataExpanded, setDataExpanded] = useState(true);

  useEffect(() => {
    api.getCollectionSchema().then(setSchema).catch(() => setSchema({ kinds: {} }));
  }, []);

  const entityKinds = schema ? Object.keys(schema.kinds) : [];

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-48 border-r border-border flex flex-col bg-sidebar">
        <div className="p-2.5 border-b border-border">
          <h1 className="font-semibold text-sm">Cognetivy Studio</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">Read-only</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-xs text-muted-foreground">Dark</span>
            <Switch
              checked={theme === "light"}
              onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
            />
            <span className="text-xs text-muted-foreground">Light</span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-1.5 space-y-0.5">
            {staticNavItems.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to))
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
            {entityKinds.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setDataExpanded((e) => !e)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                >
                  {dataExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                  <FolderOpen className="size-3.5 shrink-0" />
                  Data
                </button>
                {dataExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {entityKinds.map((kind) => {
                      const KindIcon = getKindIcon(kind);
                      return (
                        <Link
                          key={kind}
                          to={`/data/${encodeURIComponent(kind)}`}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                            location.pathname === `/data/${kind}`
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                        >
                          <KindIcon className="size-3.5 shrink-0" />
                          {kind}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {staticNavItems.slice(3).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to))
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
