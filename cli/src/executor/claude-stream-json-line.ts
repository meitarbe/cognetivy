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
  if (t === "text_delta") {
    const text = delta.text;
    if (typeof text === "string" && text.length > 0) {
      return { text, thinking: false };
    }
  }
  if (t === "thinking_delta" || t === "reasoning_delta") {
    const thinking = delta.thinking ?? delta.text;
    if (typeof thinking === "string" && thinking.length > 0) {
      return { text: thinking, thinking: true };
    }
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

  if (topType === "stream_event" && o.event && typeof o.event === "object") {
    const ev = o.event as Record<string, unknown>;
    const delta = ev.delta;
    if (delta && typeof delta === "object") {
      const got = textFromDelta(delta as Record<string, unknown>);
      if (got) {
        const display = got.thinking ? `〈thinking〉\n${got.text}` : got.text;
        return { uiText: display, parseFragment: got.thinking ? null : got.text };
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
      return { uiText: `${msg}\n\n`, parseFragment: msg };
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
