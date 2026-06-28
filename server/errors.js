/**
 * Extract a human-readable message from AI SDK / OpenAI error shapes.
 */
export function formatChatError(error) {
  const candidates = [];

  const visit = (value, depth = 0) => {
    if (value == null || depth > 4) {
      return;
    }
    if (typeof value === "string") {
      candidates.push(value);
      return;
    }
    if (value instanceof Error) {
      if (value.message) {
        candidates.push(value.message);
      }
      if (value.cause) {
        visit(value.cause, depth + 1);
      }
      return;
    }
    if (typeof value === "object") {
      visit(value.message, depth + 1);
      visit(value.errorText, depth + 1);
      visit(value.error, depth + 1);
      visit(value.cause, depth + 1);
      visit(value.data, depth + 1);
      visit(value.responseBody, depth + 1);
    }
  };

  visit(error);

  const message = candidates.find((text) => text && text !== "[object Object]") || "Unknown chat error";
  const lower = message.toLowerCase();
  const code = [
    error?.code,
    error?.type,
    error?.error?.code,
    error?.error?.type,
    error?.error?.error?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    code.includes("insufficient_quota") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota")
  ) {
    return "OpenAI quota exceeded. Add billing credits at platform.openai.com/account/billing, or switch to Cursor: set CHAT_PROVIDER=cursor and CURSOR_API_KEY in .env.";
  }
  if (
    lower.includes("invalid user api key") ||
    code.includes("unauthenticated") ||
    lower.includes("invalid_api_key") ||
    lower.includes("incorrect api key")
  ) {
    return "Invalid API key. For Cursor: update CURSOR_API_KEY (starts with crsr_) from cursor.com/dashboard → API Keys. For OpenAI: update OPENAI_API_KEY in .env. Then restart ./run_web.sh.";
  }
  if (lower.includes("rate limit") || lower.includes("rate_limit")) {
    return "OpenAI rate limit reached. Wait a moment and try again.";
  }
  if (lower.includes("model") && lower.includes("not found")) {
    return `Model is unavailable for this API key. Set OPENAI_MODEL in .env to a model your account can use.`;
  }

  return message;
}
