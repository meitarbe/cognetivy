import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";

const navItems = [
  { to: "/", label: "Workflow" },
  { to: "/runs", label: "Runs" },
  { to: "/mutations", label: "Mutations" },
  { to: "/artifact-schema", label: "Artifact schema" },
];

export function AppLayout() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

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
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "block px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                  location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to))
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
