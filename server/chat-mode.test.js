import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeChatMode,
  modeAllowsWriteTools,
  modeSystemNote,
  resolveCursorSdkMode,
} from "./chat-mode.js";

test("normalizeChatMode falls back to agent", () => {
  assert.equal(normalizeChatMode("invalid"), "agent");
  assert.equal(normalizeChatMode("plan"), "plan");
});

test("modeAllowsWriteTools only for agent", () => {
  assert.equal(modeAllowsWriteTools("agent"), true);
  assert.equal(modeAllowsWriteTools("plan"), false);
  assert.equal(modeAllowsWriteTools("ask"), false);
});

test("resolveCursorSdkMode maps plan only", () => {
  assert.equal(resolveCursorSdkMode("plan"), "plan");
  assert.equal(resolveCursorSdkMode("ask"), "agent");
  assert.equal(resolveCursorSdkMode("agent"), "agent");
});

test("modeSystemNote describes plan and ask", () => {
  assert.match(modeSystemNote("plan"), /Plan mode/i);
  assert.match(modeSystemNote("ask"), /Ask mode/i);
  assert.equal(modeSystemNote("agent"), "");
});
