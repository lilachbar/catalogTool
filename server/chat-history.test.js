import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationTranscript,
  extractAttachmentsFromUiMessage,
  extractTextFromUiMessage,
} from "./chat-history.js";

test("extractTextFromUiMessage reads text parts", () => {
  assert.equal(
    extractTextFromUiMessage({
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    }),
    "hello",
  );
});

test("buildConversationTranscript includes prior turns and file attachments", () => {
  const textFile = Buffer.from("line one\nline two", "utf-8").toString("base64");
  const transcript = buildConversationTranscript([
    {
      role: "user",
      parts: [
        { type: "text", text: "Review this file" },
        {
          type: "file",
          filename: "sample.txt",
          mediaType: "text/plain",
          url: `data:text/plain;base64,${textFile}`,
        },
      ],
    },
    {
      role: "assistant",
      parts: [{ type: "text", text: "I see two lines in the file." }],
    },
    {
      role: "user",
      parts: [{ type: "text", text: "What was line two?" }],
    },
  ]);

  assert.match(transcript, /Review this file/);
  assert.match(transcript, /\[Attached file: sample\.txt\]/);
  assert.match(transcript, /line two/);
  assert.match(transcript, /Assistant:\nI see two lines/);
  assert.match(transcript, /What was line two\?/);
});

test("extractAttachmentsFromUiMessage decodes text files", () => {
  const encoded = Buffer.from("payload", "utf-8").toString("base64");
  const attachments = extractAttachmentsFromUiMessage({
    role: "user",
    parts: [{
      type: "file",
      filename: "payload.txt",
      mediaType: "text/plain",
      url: `data:text/plain;base64,${encoded}`,
    }],
  });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].text, "payload");
});
