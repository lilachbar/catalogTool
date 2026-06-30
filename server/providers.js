/**
 * Resolve which LLM backend powers /api/chat.
 */
import { Cursor } from "@cursor/sdk";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export const OPENAI_MODEL_OPTIONS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "o3-mini",
];

export const ANTHROPIC_MODEL_OPTIONS = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
  "claude-3-5-haiku-latest",
];

export const CURSOR_MODEL_DEFAULT = "composer-2.5";

export const CURSOR_KEY_SETUP_INSTRUCTIONS = `CURSOR_API_KEY is not set.

1. Open https://cursor.com/dashboard/integrations
2. Create an API key (format: crsr_…)
3. Add it to the project .env file:
   CURSOR_API_KEY=crsr_your_key_here
4. Restart: ./run_web.sh`;

export const CURSOR_KEY_INVALID_FORMAT = `CURSOR_API_KEY has an invalid format (expected crsr_…).

Create a new key at https://cursor.com/dashboard/integrations and set it in .env, then restart ./run_web.sh.`;

export const OPENAI_KEY_SETUP_INSTRUCTIONS = `OPENAI_API_KEY is not set.

1. Create a key at https://platform.openai.com/api-keys
2. Add to .env:
   CHAT_PROVIDER=openai
   OPENAI_API_KEY=sk-…
3. Restart: ./run_web.sh`;

export const ANTHROPIC_KEY_SETUP_INSTRUCTIONS = `ANTHROPIC_API_KEY is not set.

1. Create a key at https://console.anthropic.com/settings/keys
2. Add to .env:
   CHAT_PROVIDER=claude
   ANTHROPIC_API_KEY=sk-ant-…
3. Restart: ./run_web.sh`;

export const CHAT_PROVIDER_OPTIONS = [
  {
    id: "cursor",
    label: "Cursor",
    apiKeyEnv: "CURSOR_API_KEY",
    modelEnv: "CURSOR_MODEL",
    defaultModel: CURSOR_MODEL_DEFAULT,
    keyHint: "crsr_… from cursor.com/dashboard/integrations",
    keyPrefix: "crsr_",
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    keyHint: "sk-… or sk-proj-… from platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
  {
    id: "claude",
    label: "Claude",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-20250514",
    keyHint: "sk-ant-… from console.anthropic.com",
    keyPrefix: "sk-ant-",
  },
];

/** Strip BOM, quotes, and whitespace from pasted API keys. */
export function normalizeApiKey(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
}

export function isValidCursorKeyFormat(key) {
  const normalized = normalizeApiKey(key);
  return normalized.startsWith("crsr_") && normalized.length > 10;
}

export function isValidOpenAiKeyFormat(key) {
  const normalized = normalizeApiKey(key);
  // Accept legacy sk-… keys and project keys such as sk-proj-… / sk-live-…
  return /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/.test(normalized);
}

export function isValidAnthropicKeyFormat(key) {
  const normalized = normalizeApiKey(key);
  return normalized.startsWith("sk-ant-") && normalized.length > 16;
}

export function isValidProviderKeyFormat(providerId, key) {
  if (providerId === "cursor") {
    return isValidCursorKeyFormat(key);
  }
  if (providerId === "openai") {
    return isValidOpenAiKeyFormat(key);
  }
  if (providerId === "claude") {
    return isValidAnthropicKeyFormat(key);
  }
  return false;
}

export function resolveChatProvider() {
  const explicit = (process.env.CHAT_PROVIDER || "").trim().toLowerCase();

  if (explicit === "none") {
    return null;
  }
  if (explicit === "cursor") {
    return "cursor";
  }
  if (explicit === "openai") {
    return "openai";
  }
  if (explicit === "claude" || explicit === "anthropic") {
    return "claude";
  }

  if (process.env.CURSOR_API_KEY) {
    return "cursor";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }

  return null;
}

function readApiKey(provider) {
  if (provider === "cursor") {
    return normalizeApiKey(process.env.CURSOR_API_KEY);
  }
  if (provider === "openai") {
    return normalizeApiKey(process.env.OPENAI_API_KEY);
  }
  if (provider === "claude") {
    return normalizeApiKey(process.env.ANTHROPIC_API_KEY);
  }
  return "";
}

function defaultModelForProvider(provider) {
  if (provider === "cursor") {
    return process.env.CURSOR_MODEL || CURSOR_MODEL_DEFAULT;
  }
  if (provider === "openai") {
    return process.env.OPENAI_MODEL || "gpt-4o-mini";
  }
  if (provider === "claude") {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  }
  return null;
}

export function resolveModelId(requestedModel, provider = resolveChatProvider()) {
  const trimmed = (requestedModel || "").trim();
  if (!trimmed || trimmed === "auto") {
    return defaultModelForProvider(provider);
  }
  return trimmed;
}

export function getProviderStatus() {
  const provider = resolveChatProvider();

  if (provider === "cursor") {
    const apiKey = readApiKey("cursor");
    return {
      provider: "cursor",
      model: process.env.CURSOR_MODEL || "composer-2.5",
      hasApiKey: Boolean(apiKey),
      keyFormatValid: isValidCursorKeyFormat(apiKey),
    };
  }

  if (provider === "openai") {
    const apiKey = readApiKey("openai");
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      hasApiKey: Boolean(apiKey),
      keyFormatValid: isValidOpenAiKeyFormat(apiKey),
    };
  }

  if (provider === "claude") {
    const apiKey = readApiKey("claude");
    return {
      provider: "claude",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      hasApiKey: Boolean(apiKey),
      keyFormatValid: isValidAnthropicKeyFormat(apiKey),
    };
  }

  return {
    provider: null,
    model: null,
    hasApiKey: false,
    keyFormatValid: false,
  };
}

/** Local format + optional remote validation for chat API keys. */
export async function validateChatProviderKey({ remote = false } = {}) {
  const provider = resolveChatProvider();

  if (!provider) {
    return {
      ok: false,
      provider: null,
      reason: "not_configured",
      message:
        "No chat provider configured. Set CHAT_PROVIDER and the matching API key (CURSOR_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY) in .env.",
      setupInstructions: CURSOR_KEY_SETUP_INSTRUCTIONS,
    };
  }

  const apiKey = readApiKey(provider);

  if (!apiKey) {
    const setupByProvider = {
      cursor: CURSOR_KEY_SETUP_INSTRUCTIONS,
      openai: OPENAI_KEY_SETUP_INSTRUCTIONS,
      claude: ANTHROPIC_KEY_SETUP_INSTRUCTIONS,
    };
    const keyName = {
      cursor: "CURSOR_API_KEY",
      openai: "OPENAI_API_KEY",
      claude: "ANTHROPIC_API_KEY",
    };
    return {
      ok: false,
      provider,
      reason: "missing",
      message: `${keyName[provider]} is not set.`,
      setupInstructions: setupByProvider[provider],
    };
  }

  if (provider === "cursor" && !isValidCursorKeyFormat(apiKey)) {
    return {
      ok: false,
      provider,
      reason: "invalid_format",
      message: "CURSOR_API_KEY has an invalid format.",
      setupInstructions: CURSOR_KEY_INVALID_FORMAT,
    };
  }

  if (provider === "openai" && !isValidOpenAiKeyFormat(apiKey)) {
    return {
      ok: false,
      provider,
      reason: "invalid_format",
      message: "OPENAI_API_KEY has an invalid format (expected sk-…).",
      setupInstructions: OPENAI_KEY_SETUP_INSTRUCTIONS,
    };
  }

  if (provider === "claude" && !isValidAnthropicKeyFormat(apiKey)) {
    return {
      ok: false,
      provider,
      reason: "invalid_format",
      message: "ANTHROPIC_API_KEY has an invalid format (expected sk-ant-…).",
      setupInstructions: ANTHROPIC_KEY_SETUP_INSTRUCTIONS,
    };
  }

  if (!remote) {
    return { ok: true, provider, reason: "format_ok" };
  }

  if (provider === "cursor") {
    try {
      await Cursor.models.list({ apiKey });
      return { ok: true, provider, reason: "verified" };
    } catch (error) {
      const message = error?.message || String(error);
      const lower = message.toLowerCase();
      const invalid =
        lower.includes("invalid") ||
        lower.includes("unauthenticated") ||
        lower.includes("api key");
      return {
        ok: false,
        provider,
        reason: invalid ? "invalid" : "verify_failed",
        message: invalid
          ? "CURSOR_API_KEY is not valid or was rejected by Cursor."
          : `Could not verify CURSOR_API_KEY: ${message}`,
        setupInstructions: `${CURSOR_KEY_SETUP_INSTRUCTIONS}

If you already set a key, create a new one at https://cursor.com/dashboard/integrations and update .env.`,
      };
    }
  }

  if (provider === "claude") {
    return { ok: true, provider, reason: "format_ok" };
  }

  return { ok: true, provider, reason: "format_ok" };
}

export async function listModelsForProvider(provider = resolveChatProvider()) {
  if (!provider) {
    return { provider: null, defaultModel: null, models: [] };
  }

  const defaultModel = defaultModelForProvider(provider);

  if (provider === "cursor") {
    const apiKey = readApiKey("cursor");
    if (!apiKey.startsWith("crsr_")) {
      return {
        provider,
        defaultModel,
        models: [{ id: defaultModel, label: defaultModel }],
      };
    }
    try {
      const response = await Cursor.models.list({ apiKey });
      const models = (response?.data || response?.models || response || [])
        .map((entry) => {
          const id = entry?.id || entry?.name || String(entry);
          return { id, label: id };
        })
        .filter((entry) => entry.id);
      if (models.length === 0) {
        return { provider, defaultModel, models: [{ id: defaultModel, label: defaultModel }] };
      }
      return { provider, defaultModel, models };
    } catch {
      return {
        provider,
        defaultModel,
        models: [{ id: defaultModel, label: defaultModel }],
      };
    }
  }

  if (provider === "openai") {
    return {
      provider,
      defaultModel,
      models: OPENAI_MODEL_OPTIONS.map((id) => ({ id, label: id })),
    };
  }

  if (provider === "claude") {
    return {
      provider,
      defaultModel,
      models: ANTHROPIC_MODEL_OPTIONS.map((id) => ({ id, label: id })),
    };
  }

  return { provider, defaultModel, models: [] };
}

export function getOpenAiModel(modelId) {
  return openai(resolveModelId(modelId, "openai"));
}

export function getClaudeModel(modelId) {
  return anthropic(resolveModelId(modelId, "claude"));
}

export function missingKeyMessage(provider) {
  if (provider === "cursor") {
    return CURSOR_KEY_SETUP_INSTRUCTIONS;
  }
  if (provider === "openai") {
    return OPENAI_KEY_SETUP_INSTRUCTIONS;
  }
  if (provider === "claude") {
    return ANTHROPIC_KEY_SETUP_INSTRUCTIONS;
  }
  return "No chat provider configured. Set CHAT_PROVIDER and the matching API key in .env.";
}

export function getProviderOption(providerId) {
  return CHAT_PROVIDER_OPTIONS.find((entry) => entry.id === providerId) || null;
}

/** Validate a provider + API key before persisting to .env (login flow). */
export async function validateProviderCredentials(providerId, apiKey, { remote = true } = {}) {
  const option = getProviderOption(providerId);
  if (!option) {
    return { ok: false, reason: "invalid_provider", message: "Unknown AI provider." };
  }

  const trimmedKey = normalizeApiKey(apiKey);
  if (!trimmedKey) {
    return { ok: false, reason: "missing", message: `${option.apiKeyEnv} is required.` };
  }
  if (!isValidProviderKeyFormat(providerId, trimmedKey)) {
    return {
      ok: false,
      reason: "invalid_format",
      message: `${option.apiKeyEnv} has an invalid format (expected ${option.keyHint}).`,
    };
  }

  const previous = {
    CHAT_PROVIDER: process.env.CHAT_PROVIDER,
    [option.apiKeyEnv]: process.env[option.apiKeyEnv],
  };
  process.env.CHAT_PROVIDER = providerId;
  process.env[option.apiKeyEnv] = trimmedKey;

  const result = await validateChatProviderKey({ remote });

  process.env.CHAT_PROVIDER = previous.CHAT_PROVIDER;
  process.env[option.apiKeyEnv] = previous[option.apiKeyEnv];

  return result;
}
