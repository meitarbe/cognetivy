import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { cn, getCollectionColor } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { api, type CollectionSchemaConfig, type RunRecord, type WorkspaceInfo } from "@/api";
import { useWorkflowSelection } from "@/contexts/WorkflowSelectionContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  GitBranch,
  Database,
  type LucideIcon,
} from "lucide-react";

const SIDEBAR_OPEN_KEY = "cognetivy-sidebar-open";

const staticNavItems: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/", label: "Workflow", icon: GitBranch },
  { to: "/runs", label: "Runs", icon: PlayCircle },
];

function readSidebarOpen(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

function setSidebarOpenStored(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
  } catch {
    // ignore
  }
}

export function AppLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { workflows, selectedWorkflowId, setSelectedWorkflowId, selectedWorkflow } = useWorkflowSelection();
  const [schema, setSchema] = useState<CollectionSchemaConfig | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [collectionExpanded, setCollectionExpanded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);

  const runningCount = runs.filter((r) => r.status === "running").length;

  useEffect(() => {
    api.getWorkspace().then(setWorkspace).catch(() => setWorkspace(null));
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) {
      setSchema(null);
      return;
    }
    api
      .getCollectionSchema(selectedWorkflowId)
      .then(setSchema)
      .catch(() => setSchema(null));
  }, [selectedWorkflowId]);

  useEffect(() => {
    function loadRuns() {
      api.getRuns().then(setRuns).catch(() => setRuns([]));
    }
    loadRuns();
    const t = setInterval(loadRuns, 5000);
    return () => clearInterval(t);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      setSidebarOpenStored(next);
      return next;
    });
  }

  const entityKinds = useMemo(() => (schema ? Object.keys(schema.kinds) : []), [schema]);

  function handleThemeToggle(checked: boolean) {
    setTheme(checked ? "light" : "dark");
  }

  function handleWorkflowChange(workflowId: string) {
    setSelectedWorkflowId(workflowId);
  }

  function handleToggleCollectionsExpanded() {
    setCollectionExpanded((e) => !e);
  }

  function renderStaticNavItem(item: { to: string; label: string; icon: LucideIcon }) {
    const Icon = item.icon;
    const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
    const showRunning = item.to === "/runs" && runningCount > 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        title={item.label + (showRunning ? ` (${runningCount} running)` : "")}
        className={cn(
          "flex items-center rounded-md text-xs font-medium transition-colors",
          sidebarOpen ? "gap-2 px-2.5 py-1.5 w-full" : "p-2 justify-center",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        {sidebarOpen && (
          <>
            {item.label}
            {showRunning && (
              <span className="ml-auto text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <span className="size-1 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                {runningCount}
              </span>
            )}
          </>
        )}
      </Link>
    );
  }

  function renderEntityKindLink(kind: string) {
    return (
      <Link
        key={kind}
        to={`/data/${encodeURIComponent(kind)}`}
        className={cn(
          "block px-2 py-1 rounded-md text-xs font-medium transition-colors border-l-4",
          location.pathname === `/data/${kind}`
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
        style={{ borderLeftColor: getCollectionColor(kind) }}
      >
        {kind}
      </Link>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          "border-r border-border flex flex-col bg-sidebar shrink-0 transition-[width] duration-200",
          sidebarOpen ? "w-48" : "w-14"
        )}
      >
        <div className="p-2.5 border-b border-border flex items-center gap-2 min-w-0">
          {sidebarOpen ? (
            <>
              <img src="/favicon.png" alt="" className="h-10 w-10 rounded object-contain shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold text-sm truncate">Cognetivy Studio</h1>
                <p className="text-[10px] text-muted-foreground">Read-only</p>
                {workspace?.path && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={workspace.path}>
                    {workspace.path.split("/").slice(-2).join("/") || workspace.path}
                  </p>
                )}
              </div>
            </>
          ) : (
            <img src="/icon.jpg" alt="Cognetivy" className="h-8 w-8 rounded object-contain mx-auto" aria-hidden />
          )}
        </div>
        {sidebarOpen && (
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Dark</span>
            <Switch
              checked={theme === "light"}
              onCheckedChange={handleThemeToggle}
            />
            <span className="text-xs text-muted-foreground">Light</span>
          </div>
        )}
        {sidebarOpen && workflows.length > 0 && (
          <div className="px-2.5 py-2 border-b border-border">
            <div className="text-[10px] text-muted-foreground mb-1">Workflow</div>
            <Select value={selectedWorkflowId ?? ""} onValueChange={handleWorkflowChange}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.workflow_id} value={w.workflow_id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWorkflow?.description && (
              <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                {selectedWorkflow.description}
              </p>
            )}
          </div>
        )}
        <ScrollArea className="flex-1">
          <nav className={cn("p-1.5 space-y-0.5", !sidebarOpen && "flex flex-col items-center gap-1")}>
            {staticNavItems.map(renderStaticNavItem)}
            {entityKinds.length > 0 && (
              <div className={cn("pt-1", !sidebarOpen && "w-full flex flex-col items-center")}>
                {sidebarOpen ? (
                  <>
                    <div className="flex items-center gap-0.5 w-full">
                      <button
                        type="button"
                        onClick={handleToggleCollectionsExpanded}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        aria-label={collectionExpanded ? "Collapse collections" : "Expand collections"}
                      >
                        {collectionExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                      </button>
                      <Link
                        to="/collections"
                        className={cn(
                          "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                          (location.pathname === "/collections" || location.pathname.startsWith("/data/"))
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <Database className="size-3.5 shrink-0" />
                        Collections
                      </Link>
                    </div>
                    {collectionExpanded && (
                      <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                        {entityKinds.map(renderEntityKindLink)}
                      </div>
                    )}
                  </>
                ) : (
                  entityKinds.length > 0 && (
                    <Link
                      to="/collections"
                      title="Collections"
                      className={cn(
                        "p-2 rounded-md flex justify-center text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        (location.pathname === "/collections" || location.pathname.startsWith("/data/")) && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Database className="size-3.5" />
                    </Link>
                  )
                )}
              </div>
            )}
          </nav>
        </ScrollArea>
        <button
          type="button"
          onClick={toggleSidebar}
          className="p-2 border-t border-border flex items-center justify-center text-muted-foreground hover:bg-accent/50 hover:text-foreground rounded-none w-full"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </aside>
      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
