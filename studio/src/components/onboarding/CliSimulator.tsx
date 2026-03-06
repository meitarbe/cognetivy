import { useEffect, useState } from "react";

const YOU_LABEL = "You: ";
const AI_LABEL = "Coding Agent: ";

const SCRIPT: Array<{ type: "you"; text: string } | { type: "thinking" } | { type: "ai"; text: string }> = [
  { type: "you", text: "Create a workflow for competitor analysis: research from external sources, extract key points, then write a comparison report." },
  { type: "thinking" },
  {
    type: "ai",
    text: "I've created the workflow and set it as current. You'll see it in the Workflow tab in Studio.",
  },
  { type: "you", text: "Start a run with input topic 'SaaS productivity tools'." },
  { type: "thinking" },
  {
    type: "ai",
    text: "Run started. Check the Runs tab in Studio to watch progress.",
  },
  { type: "you", text: "Add a new version of this workflow that includes a code review step." },
  { type: "thinking" },
  {
    type: "ai",
    text: "New version is ready with the code review step. Would you like me to run it?",
  },
];

const CHAR_DELAY_MS = 35;
const PAUSE_AFTER_LINE_MS = 400;
const THINKING_DURATION_MS = 1200;
const CURSOR_BLINK_MS = 530;

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export function CliSimulator() {
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  const segment = SCRIPT[segmentIndex];
  const isTyping = segment && (segment.type === "you" || segment.type === "ai");
  const fullText = isTyping ? (segment.type === "you" ? YOU_LABEL : AI_LABEL) + segment.text : "";
  const typingComplete = isTyping && visibleLength >= fullText.length;

  useEffect(
    function runSequence() {
      if (!segment) return;

      if (segment.type === "thinking") {
        const t = setTimeout(() => {
          setSegmentIndex((i) => i + 1);
          setVisibleLength(0);
        }, THINKING_DURATION_MS);
        return () => clearTimeout(t);
      }

      if (segment.type === "you" || segment.type === "ai") {
        const full = (segment.type === "you" ? YOU_LABEL : AI_LABEL) + segment.text;
        if (visibleLength < full.length) {
          const t = setTimeout(() => setVisibleLength((n) => n + 1), CHAR_DELAY_MS);
          return () => clearTimeout(t);
        }
        const t = setTimeout(() => {
          setSegmentIndex((i) => i + 1);
          setVisibleLength(0);
        }, PAUSE_AFTER_LINE_MS);
        return () => clearTimeout(t);
      }

      return undefined;
    },
    [segmentIndex, visibleLength, segment]
  );

  useEffect(function blinkCursor() {
    const id = setInterval(() => setCursorVisible((v) => !v), CURSOR_BLINK_MS);
    return () => clearInterval(id);
  }, []);

  const completedSegments = SCRIPT.slice(0, segmentIndex).filter((seg) => seg.type !== "thinking");
  const currentSegment = SCRIPT[segmentIndex];
  const currentIsTyping =
    currentSegment && (currentSegment.type === "you" || currentSegment.type === "ai");

  return (
    <div
      className="rounded-lg border border-border/80 bg-[#0d1117] overflow-hidden shadow-inner"
      role="img"
      aria-label="Simulated chat: you ask your coding agent to create a workflow, run it, and add a new version; the agent responds in plain language; workflows and runs appear in Studio."
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b-2 border-amber-500/50 bg-amber-500/20">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
        <span className="size-2.5 rounded-full bg-[#febc2e]" aria-hidden />
        <span className="size-2.5 rounded-full bg-[#28c840]" aria-hidden />
        <span className="text-xs font-bold uppercase tracking-wide text-amber-200/95 ml-1">Simulation</span>
        <span className="text-xs font-medium text-amber-100/90">Do not type here. Use your editor&apos;s chat to talk to your AI.</span>
      </div>
      <div className="p-5 min-h-[12rem] flex flex-col text-[13px] leading-relaxed font-sans">
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="space-y-4 overflow-y-auto overflow-x-auto flex-1 min-h-0">
            {completedSegments.map((seg, i) => {
              if (seg.type === "you") {
                return (
                  <div key={i} className="space-y-0.5">
                    <span className="text-blue-400/95 font-medium">You:</span>
                    <span className="text-zinc-300"> {seg.text}</span>
                  </div>
                );
              }
              if (seg.type === "ai") {
                return (
                  <div key={i} className="space-y-0.5">
                    <span className="text-emerald-400/95 font-medium">Coding Agent:</span>
                    <span className="text-zinc-300"> {seg.text}</span>
                  </div>
                );
              }
              return null;
            })}
            {currentIsTyping && currentSegment && (() => {
              const label = currentSegment.type === "you" ? YOU_LABEL : AI_LABEL;
              const labelLen = label.length;
              const fullVisible = (currentSegment.type === "you" ? YOU_LABEL + currentSegment.text : AI_LABEL + currentSegment.text).slice(0, visibleLength);
              const messageVisible = visibleLength > labelLen ? fullVisible.slice(labelLen) : "";
              const labelVisible = visibleLength <= labelLen ? fullVisible : label;
              const labelDisplay = currentSegment.type === "you" ? "You:" : "Coding Agent:";
              const labelClass = currentSegment.type === "you" ? "text-blue-400/95" : "text-emerald-400/95";
              return (
                <div className="space-y-0.5">
                  <span className={`font-medium ${labelClass}`}>{visibleLength <= labelLen ? (labelVisible || label) : labelDisplay}</span>
                  {messageVisible && <span className="text-zinc-300"> {messageVisible}</span>}
                  {!typingComplete && (
                    <span
                      className={cursorVisible ? "inline-block w-0.5 h-4 align-middle bg-emerald-400/90 ml-0.5" : "inline-block w-0.5 h-4 align-middle bg-transparent ml-0.5"}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })()}
          </div>
          {currentSegment?.type === "thinking" && (
            <div className="flex items-center gap-2 text-zinc-500 text-xs pt-3 mt-2 border-t border-white/10 shrink-0">
              <ThinkingDots />
              <span>Thinking…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
