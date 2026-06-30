/**
 * Reload chat-related variables from .env into process.env.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHAT_ENV_KEYS = [
  "CHAT_PROVIDER",
  "CURSOR_API_KEY",
  "CURSOR_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
];

export function reloadChatEnvFromFile() {
  const result = dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), override: true });
  const loaded = {};
  for (const key of CHAT_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      loaded[key] = key.includes("KEY") ? "[redacted]" : process.env[key];
    }
  }
  return { ok: !result.error, loaded, error: result.error?.message || null };
}
