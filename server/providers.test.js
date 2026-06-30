import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  CURSOR_KEY_SETUP_INSTRUCTIONS,
  isValidOpenAiKeyFormat,
  normalizeApiKey,
  validateChatProviderKey,
  validateProviderCredentials,
} from "./providers.js";

const ENV_KEYS = [
  "CHAT_PROVIDER",
  "CURSOR_API_KEY",
  "OPENAI_API_KEY",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

const FAKE_OPENAI_PROJ_KEY =
  "sk-proj-test_key_for_unit_tests_only_1234567890abcdefghijklmnopqrst";

describe("validateChatProviderKey", () => {
  let envSnapshot;

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("reports missing provider when no keys are set", async () => {
    envSnapshot = snapshotEnv();
    delete process.env.CHAT_PROVIDER;
    delete process.env.CURSOR_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await validateChatProviderKey({ remote: false });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_configured");
    assert.match(result.setupInstructions, /CURSOR_API_KEY/);
  });

  it("reports missing CURSOR_API_KEY when provider is cursor", async () => {
    envSnapshot = snapshotEnv();
    process.env.CHAT_PROVIDER = "cursor";
    delete process.env.CURSOR_API_KEY;

    const result = await validateChatProviderKey({ remote: false });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing");
    assert.equal(result.setupInstructions, CURSOR_KEY_SETUP_INSTRUCTIONS);
  });

  it("reports invalid CURSOR_API_KEY format", async () => {
    envSnapshot = snapshotEnv();
    process.env.CHAT_PROVIDER = "cursor";
    process.env.CURSOR_API_KEY = "not-a-cursor-key";

    const result = await validateChatProviderKey({ remote: false });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_format");
    assert.match(result.setupInstructions, /crsr_/);
  });

  it("accepts well-formed CURSOR_API_KEY without remote check", async () => {
    envSnapshot = snapshotEnv();
    process.env.CHAT_PROVIDER = "cursor";
    process.env.CURSOR_API_KEY = "crsr_test_key_for_unit_tests_only";

    const result = await validateChatProviderKey({ remote: false });
    assert.equal(result.ok, true);
    assert.equal(result.provider, "cursor");
  });
});

describe("normalizeApiKey", () => {
  it("strips BOM and whitespace from pasted keys", () => {
    assert.equal(normalizeApiKey("\uFEFF sk-proj-test_key"), "sk-proj-test_key");
  });
});

describe("isValidOpenAiKeyFormat", () => {
  it("accepts sk-proj project keys", () => {
    assert.equal(isValidOpenAiKeyFormat(FAKE_OPENAI_PROJ_KEY), true);
  });

  it("accepts legacy sk- keys", () => {
    assert.equal(isValidOpenAiKeyFormat("sk-1234567890abcdefghijklmnopqrst"), true);
  });

  it("rejects anthropic keys for openai validation", () => {
    assert.equal(isValidOpenAiKeyFormat("sk-ant-api03-test_key_for_unit_tests"), false);
  });
});

describe("validateProviderCredentials", () => {
  let envSnapshot;

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("accepts openai project keys before remote validation", async () => {
    envSnapshot = snapshotEnv();
    process.env.CHAT_PROVIDER = "cursor";
    process.env.CURSOR_API_KEY = "crsr_test_key_for_unit_tests_only";

    const result = await validateProviderCredentials(
      "openai",
      FAKE_OPENAI_PROJ_KEY,
      { remote: false },
    );
    assert.equal(result.ok, true);
    assert.equal(result.provider, "openai");
  });
});
