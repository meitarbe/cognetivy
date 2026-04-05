/**
 * Parse Claude Code CLI `--output-format stream-json` lines (NDJSON) for incremental UI
 * and for accumulating text that must contain COGNETIVY_COLLECTION_JSON= / markers.
 */

export interface ClaudeStreamJsonLineResult {
  /** Text to show in Studio (null = skip) */
  uiText: string | null;
  /** Text that belongs in combined agent output for marker parsing (null = UI-only noise) */
  parseFragment: string | null;
}

function textFromDelta(delta: Record<string, unknown>): { text: string; thinking: boolean } | null {
  const t = delta.type;
  if (t === "text_delta" || t === "textDelta") {
    const text = delta.text;
    if (typeof text === "string" && text.length > 0) {
      return { text, thinking: false };
    }
  }
  if (t === "thinking_delta" || t === "thinkingDelta" || t === "reasoning_delta" || t === "reasoningDelta") {
    const thinking = delta.thinking ?? delta.text;
    if (typeof thinking === "string" && thinking.length > 0) {
      return { text: thinking, thinking: true };
    }
  }
  return null;
}

function extractTextFromContentBlocks(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
      parts.push(b.text);
    }
  }
  const joined = parts.join("");
  return joined.length > 0 ? joined : null;
}

function streamEventPayload(o: Record<string, unknown>): Record<string, unknown> | null {
  const ev = o.event;
  if (ev && typeof ev === "object") {
    return ev as Record<string, unknown>;
  }
  const alt = o.stream_event;
  if (alt && typeof alt === "object") {
    return alt as Record<string, unknown>;
  }
  return null;
}

/**
 * Maps one JSON line from Claude Code stream-json stdout to UI + parse fragments.
 */
export function processClaudeStreamJsonLine(line: string): ClaudeStreamJsonLineResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return { uiText: null, parseFragment: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      uiText: `${trimmed}\n`,
      parseFragment: `${trimmed}\n`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { uiText: null, parseFragment: null };
  }

  const o = parsed as Record<string, unknown>;
  const topType = o.type;

  if (topType === "control_response") {
    return { uiText: null, parseFragment: null };
  }

  if (topType === "system") {
    const sub = o.subtype;
    if (sub === "init") {
      const model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : "";
      const line = model ? `〈session · ${model}〉\n` : "〈session ready〉\n";
      return { uiText: line, parseFragment: null };
    }
    return { uiText: null, parseFragment: null };
  }

  if (topType === "user") {
    return { uiText: null, parseFragment: null };
  }

  if (topType === "tool_use") {
    const tn = typeof o.tool_name === "string" ? o.tool_name.trim() : "";
    const nm = typeof o.name === "string" ? o.name.trim() : "";
    const rawName = tn || nm || "tool";
    return { uiText: `〈${rawName}〉\n`, parseFragment: null };
  }

  if (topType === "result") {
    const err = o.error;
    if (typeof err === "string" && err.trim()) {
      return { uiText: `〈error〉\n${err.trim()}\n`, parseFragment: null };
    }
    const res = o.result;
    if (typeof res === "string" && res.trim()) {
      const t = res.trim();
      return { uiText: `${t}\n`, parseFragment: t };
    }
    return { uiText: null, parseFragment: null };
  }

  const ev = streamEventPayload(o);
  if (topType === "stream_event" && ev) {
    const evType = ev.type;
    const delta = ev.delta;
    if (delta && typeof delta === "object") {
      const got = textFromDelta(delta as Record<string, unknown>);
      if (got) {
        const display = got.thinking ? `〈thinking〉\n${got.text}` : got.text;
        return { uiText: display, parseFragment: got.thinking ? null : got.text };
      }
    }
    if (evType === "message_start" && ev.message && typeof ev.message === "object") {
      const msg = ev.message as Record<string, unknown>;
      const fromContent = extractTextFromContentBlocks(msg.content);
      if (fromContent) {
        return { uiText: fromContent, parseFragment: fromContent };
      }
    }
    if (evType === "content_block_start" && ev.content_block && typeof ev.content_block === "object") {
      const cb = ev.content_block as Record<string, unknown>;
      const cbt = cb.type;
      if (cbt === "text" && typeof cb.text === "string" && cb.text.length > 0) {
        return { uiText: cb.text, parseFragment: cb.text };
      }
      if (cbt === "tool_use") {
        const name =
          (typeof cb.name === "string" && cb.name.trim()) ||
          (typeof cb.tool_name === "string" && cb.tool_name.trim()) ||
          "tool_use";
        return { uiText: `〈${name}〉\n`, parseFragment: null };
      }
    }
  }

  if (topType === "content_block_delta" && o.delta && typeof o.delta === "object") {
    const got = textFromDelta(o.delta as Record<string, unknown>);
    if (got) {
      const display = got.thinking ? `〈thinking〉\n${got.text}` : got.text;
      return { uiText: display, parseFragment: got.thinking ? null : got.text };
    }
  }

  if (topType === "assistant" || topType === "message") {
    const msg = o.message ?? o.content;
    if (typeof msg === "string" && msg.trim()) {
      const t = msg.trim();
      return { uiText: `${t}\n\n`, parseFragment: t };
    }
    if (msg && typeof msg === "object" && !Array.isArray(msg)) {
      const m = msg as Record<string, unknown>;
      const fromNested = extractTextFromContentBlocks(m.content);
      if (fromNested) {
        return { uiText: `${fromNested}\n\n`, parseFragment: fromNested };
      }
    }
    if (Array.isArray(msg)) {
      const parts: string[] = [];
      for (const block of msg) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        }
      }
      const joined = parts.join("");
      if (joined) {
        return { uiText: `${joined}\n\n`, parseFragment: joined };
      }
    }
  }

  return { uiText: null, parseFragment: null };
}
