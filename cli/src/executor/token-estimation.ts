export interface EstimatedTokensResult {
  tokens: number;
  meta: { method: "chars_div_4"; charCount: number };
}

export function estimateTokensFromText(text: string): EstimatedTokensResult {
  const charCount = text.length;
  // Simple, explicit heuristic. We store metadata + disclaim as estimated in persistence/UI.
  const tokens = Math.max(0, Math.ceil(charCount / 4));
  return { tokens, meta: { method: "chars_div_4", charCount } };
}

