import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;

function loadStoredWidth(storageKey: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const n = Number(stored);
      if (!Number.isNaN(n) && n >= min && n <= max) return n;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function saveStoredWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(storageKey, String(width));
  } catch {
    // ignore
  }
}

interface ResizablePanelProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** If provided, width is persisted to localStorage under this key */
  storageKey?: string;
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}

export function ResizablePanel({
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  storageKey,
  left,
  right,
  className,
}: ResizablePanelProps) {
  const initialWidth = storageKey
    ? loadStoredWidth(storageKey, defaultWidth, minWidth, maxWidth)
    : defaultWidth;
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const clamped = Math.min(maxWidth, Math.max(minWidth, newWidth));
      widthRef.current = clamped;
      setWidth(clamped);
    }

    function handleMouseUp() {
      if (storageKey) saveStoredWidth(storageKey, widthRef.current);
      setIsDragging(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, minWidth, maxWidth, storageKey]);

  return (
    <div ref={containerRef} className={cn("flex h-full min-h-0", className)}>
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: `${width}px` }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors flex items-center justify-center group",
          isDragging && "bg-primary/50"
        )}
      >
        <div
          className={cn(
            "w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors",
            isDragging && "bg-primary"
          )}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">{right}</div>
    </div>
  );
}
