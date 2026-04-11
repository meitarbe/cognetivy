/**
 * Strip a leading markdown code fence (``` or ```json) so JSON can be parsed.
 */
export function stripLeadingMarkdownFence(text: string): string {
  let s = text.trim();
  if (!s.startsWith("```")) {
    return s;
  }
  let rest = s.slice(3);
  const nl = rest.indexOf("\n");
  if (nl >= 0) {
    rest = rest.slice(nl + 1);
  } else {
    rest = rest.replace(/^[a-zA-Z0-9]*\s*/, "");
  }
  rest = rest.trimEnd();
  if (rest.endsWith("```")) {
    rest = rest.slice(0, -3).trimEnd();
  }
  return rest.trim();
}

function findFirstStructuralJsonStart(text: string): number {
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      return i;
    }
  }
  return -1;
}

/**
 * Extract one balanced JSON value starting at `start` (`{` or `[`), handling nested objects/arrays and strings.
 */
export function extractBalancedJsonValueAt(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") {
      depth += 1;
    } else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Extract the first top-level JSON object `{ ... }` from text (handles strings and escapes).
 * Used when the agent prints prose or duplicate blocks after the workflow marker.
 */
export function extractFirstJsonObjectFromText(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }
  return extractBalancedJsonValueAt(text, start);
}

/**
 * Extract the first top-level JSON array `[ ... ]` from text.
 */
export function extractFirstJsonArrayFromText(text: string): string | null {
  const start = text.indexOf("[");
  if (start < 0) {
    return null;
  }
  return extractBalancedJsonValueAt(text, start);
}

/**
 * Extract the first JSON value (`{...}` or `[...]`) after optional markdown fences and prose.
 */
export function extractFirstJsonValueFromText(text: string): string | null {
  const prepared = stripLeadingMarkdownFence(text);
  const start = findFirstStructuralJsonStart(prepared);
  if (start < 0) {
    return null;
  }
  return extractBalancedJsonValueAt(prepared, start);
}
