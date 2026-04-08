/**
 * Parse `codex exec --json` stdout (one JSON object per line) for incremental UI + combined agent text.
 */

export interface CodexJsonlLineResult {
  /** Text to append to the Studio chat (null = skip) */
  uiText: string | null;
  /** Text that belongs in combined agent output (for COGNETIVY_* markers), null if none */
  parseFragment: string | null;
}

function summarizeCodexCompletedItem(item: Record<string, unknown>): string | null {
  const itemType = String(item.type ?? "item");
  const cmd = item.command;
  if (typeof cmd === "string" && cmd.trim()) {
    return `· ${itemType}: ${cmd.trim()}\n`;
  }
  const name = item.name;
  if (typeof name === "string" && name.trim()) {
    return `· ${itemType}: ${name.trim()}\n`;
  }
  return null;
}

function extractTextFromEvent(o: Record<string, unknown>): string | null {
  // Try common text-bearing fields in streaming/delta events
  for (const key of ["delta", "text", "content", "output"]) {
    const v = o[key];
    if (typeof v === "string" && v) {
      return v;
    }
  }
  return null;
}

/**
 * Maps one JSONL line from Codex `--json` stdout to UI + parse fragments.
 */
export function processCodexJsonlLine(line: string): CodexJsonlLineResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return { uiText: null, parseFragment: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Non-JSON line — forward as-is (e.g. Codex startup header lines)
    return {
      uiText: `${trimmed}\n`,
      parseFragment: `${trimmed}\n`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { uiText: null, parseFragment: null };
  }

  const o = parsed as Record<string, unknown>;
  const eventType = String(o.type ?? "");

  // ── Lifecycle events ──────────────────────────────────────────────────────

  if (eventType === "thread.started") {
    return { uiText: null, parseFragment: null };
  }

  if (eventType === "turn.started") {
    return { uiText: "[model started]\n", parseFragment: null };
  }

  if (eventType === "turn.completed") {
    const usage = o.usage;
    if (usage && typeof usage === "object") {
      const u = usage as Record<string, unknown>;
      const inp = typeof u.input_tokens === "number" ? u.input_tokens : null;
      const out = typeof u.output_tokens === "number" ? u.output_tokens : null;
      const parts: string[] = [];
      if (inp != null) parts.push(`in ${inp}`);
      if (out != null) parts.push(`out ${out}`);
      if (parts.length > 0) {
        return { uiText: `[turn done · tokens: ${parts.join(", ")}]\n`, parseFragment: null };
      }
    }
    return { uiText: "[turn done]\n", parseFragment: null };
  }

  // ── Streaming delta events (emitted while the model generates) ────────────
  // Codex may emit these under various names; capture any text-bearing delta.

  if (eventType.includes("delta") || eventType.includes("streaming") || eventType === "item.delta") {
    // Check top-level delta/text fields
    const topText = extractTextFromEvent(o);
    if (topText) {
      return { uiText: topText, parseFragment: topText };
    }
    // Check nested item/delta object
    const nested = o.item ?? o.delta_item ?? o.output;
    if (nested && typeof nested === "object") {
      const nestedText = extractTextFromEvent(nested as Record<string, unknown>);
      if (nestedText) {
        return { uiText: nestedText, parseFragment: nestedText };
      }
    }
    return { uiText: null, parseFragment: null };
  }

  // ── Item completion events ────────────────────────────────────────────────

  if (eventType === "item.completed" && o.item && typeof o.item === "object") {
    const item = o.item as Record<string, unknown>;
    const itemType = String(item.type ?? "");
    const text = item.text;

    if (typeof text === "string" && text.length > 0) {
      const isModelMessage =
        itemType === "agent_message" ||
        itemType === "message" ||
        itemType === "assistant_message" ||
        itemType === "model_message";
      if (isModelMessage) {
        return { uiText: `${text}\n\n`, parseFragment: text };
      }
      if (itemType === "reasoning" || itemType === "thinking") {
        return { uiText: `〈${itemType}〉\n${text}\n\n`, parseFragment: null };
      }
      // Any other item type with text — show it
      return { uiText: `${text}\n`, parseFragment: null };
    }

    const summary = summarizeCodexCompletedItem(item);
    return { uiText: summary, parseFragment: null };
  }

  // ── Item started — show a label so users see something immediately ─────────

  if (eventType === "item.started" && o.item && typeof o.item === "object") {
    const item = o.item as Record<string, unknown>;
    const itemType = String(item.type ?? "");
    if (itemType === "reasoning" || itemType === "thinking") {
      return { uiText: `〈${itemType} started…〉\n`, parseFragment: null };
    }
    if (itemType && itemType !== "message" && itemType !== "agent_message") {
      return { uiText: `· ${itemType} started\n`, parseFragment: null };
    }
    return { uiText: null, parseFragment: null };
  }

  // Drop all other events silently
  return { uiText: null, parseFragment: null };
}
