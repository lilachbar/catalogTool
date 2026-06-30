/** Chat mode helpers shared by Cursor SDK and OpenAI/Claude providers. */

export const CHAT_MODES = ["agent", "plan", "ask"];

export const READ_ONLY_CATALOGONE_TOOLS = new Set([
  "login",
  "search_catalog",
  "find_reusable_entities",
  "search_business_requests",
  "get_business_request",
  "list_catalog_items",
  "get_entity_details",
  "get_entity_prices",
  "search_price_policies",
  "get_business_parameters",
  "list_entity_types",
  "validate_business_request",
]);

export function normalizeChatMode(mode) {
  const candidate = (mode || process.env.CHAT_MODE || "agent").trim().toLowerCase();
  return CHAT_MODES.includes(candidate) ? candidate : "agent";
}

export function modeAllowsWriteTools(mode) {
  return normalizeChatMode(mode) === "agent";
}

export function filterCatalogoneToolNames(names, mode) {
  if (modeAllowsWriteTools(mode)) {
    return names;
  }
  return names.filter((name) => READ_ONLY_CATALOGONE_TOOLS.has(name));
}

export function modeSystemNote(mode) {
  const normalized = normalizeChatMode(mode);
  if (normalized === "plan") {
    return [
      "You are in **Plan mode**.",
      "Use read-only CatalogOne tools to inspect the catalog when needed.",
      "Respond with a clear numbered plan (goal, prerequisites, steps, risks) before any changes.",
      "Do NOT create, update, publish, or delete catalog entities unless the user explicitly approves the plan and asks you to execute it.",
    ].join(" ");
  }
  if (normalized === "ask") {
    return [
      "You are in **Ask mode**.",
      "Answer questions directly using read-only CatalogOne inspection when live data helps.",
      "Do NOT create, update, publish, share, or delete anything.",
      "If the user wants changes, tell them to switch to Agent or Plan mode.",
    ].join(" ");
  }
  return "";
}

export function resolveCursorSdkMode(mode) {
  return normalizeChatMode(mode) === "plan" ? "plan" : "agent";
}
