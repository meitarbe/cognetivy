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
  const text = item.text;
  if (typeof text === "string" && text.trim()) {
    const max = 8000;
    const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
    return `\n· ${itemType}\n${clipped}\n`;
  }
  const cmd = item.command;
  if (typeof cmd === "string" && cmd.trim()) {
    return `\n· ${itemType}: ${cmd.trim()}\n`;
  }
  const name = item.name;
  if (typeof name === "string" && name.trim()) {
    return `\n· ${itemType}: ${name.trim()}\n`;
  }
  try {
    const raw = JSON.stringify(item);
    const cap = 2000;
    return `\n· ${itemType}: ${raw.length > cap ? `${raw.slice(0, cap)}…` : raw}\n`;
  } catch {
    return `\n· ${itemType}\n`;
  }
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
    return {
      uiText: `${trimmed}\n`,
      parseFragment: `${trimmed}\n`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { uiText: null, parseFragment: null };
  }

  const o = parsed as Record<string, unknown>;
  const eventType = o.type;

  if (eventType === "thread.started") {
    return { uiText: null, parseFragment: null };
  }

  if (eventType === "turn.started") {
    return { uiText: null, parseFragment: null };
  }

  if (eventType === "turn.completed") {
    const usage = o.usage;
    if (usage && typeof usage === "object") {
      const u = usage as Record<string, unknown>;
      const out = typeof u.output_tokens === "number" ? u.output_tokens : null;
      const inp = typeof u.input_tokens === "number" ? u.input_tokens : null;
      const parts: string[] = [];
      if (inp != null) {
        parts.push(`in ${inp}`);
      }
      if (out != null) {
        parts.push(`out ${out}`);
      }
      if (parts.length > 0) {
        return { uiText: `\n— tokens: ${parts.join(", ")} —\n`, parseFragment: null };
      }
    }
    return { uiText: null, parseFragment: null };
  }

  if (eventType === "item.completed" && o.item && typeof o.item === "object") {
    const item = o.item as Record<string, unknown>;
    const itemType = item.type;
    const text = item.text;
    if (typeof text === "string" && text.length > 0) {
      const contributesToWorkflowJson =
        itemType === "agent_message" ||
        itemType === "message" ||
        itemType === "assistant_message" ||
        itemType === "model_message";
      if (contributesToWorkflowJson) {
        return {
          uiText: `${text}\n\n`,
          parseFragment: text,
        };
      }
      if (itemType === "reasoning" || itemType === "thinking") {
        return {
          uiText: `\n〈${String(itemType)}〉\n${text}\n\n`,
          parseFragment: null,
        };
      }
    }
    const summary = summarizeCodexCompletedItem(item);
    return { uiText: summary, parseFragment: null };
  }

  return { uiText: `\n[${String(eventType)}]\n`, parseFragment: null };
}
