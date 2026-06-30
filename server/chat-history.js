/** Build full conversation transcripts from UI messages (text + file attachments). */

const MAX_FILE_CHARS_IN_HISTORY = 32000;

function decodeDataUrlText(url) {
  if (!url || !url.startsWith("data:")) {
    return null;
  }
  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }
  const metadata = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  if (metadata.includes(";base64")) {
    try {
      return Buffer.from(payload, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function truncateFileText(text, filename) {
  if (!text || text.length <= MAX_FILE_CHARS_IN_HISTORY) {
    return text || "";
  }
  return `${text.slice(0, MAX_FILE_CHARS_IN_HISTORY)}\n… [truncated ${filename}; ${text.length - MAX_FILE_CHARS_IN_HISTORY} more characters omitted]`;
}

export function extractTextFromUiMessage(message) {
  if (!message) {
    return "";
  }

  let text = "";
  for (const part of message.parts ?? []) {
    if (part.type === "text" && part.text) {
      text += part.text;
    }
  }

  if (!text && typeof message.content === "string") {
    text = message.content;
  }

  return text.trim();
}

export function extractAttachmentsFromUiMessage(message) {
  const attachments = [];
  for (const part of message.parts ?? []) {
    if (part.type !== "file") {
      continue;
    }

    const name = part.filename || "attachment";
    if (part.mediaType?.startsWith("image/")) {
      attachments.push({
        kind: "image",
        name,
        mimeType: part.mediaType || "image/png",
        url: part.url,
      });
      continue;
    }

    const text = decodeDataUrlText(part.url);
    attachments.push({
      kind: "file",
      name,
      mimeType: part.mediaType || "text/plain",
      text: truncateFileText(text || "", name),
    });
  }
  return attachments;
}

function formatAttachmentBlock(attachment) {
  if (attachment.kind === "image") {
    return `[Attached image: ${attachment.name}]`;
  }
  if (attachment.text) {
    return `[Attached file: ${attachment.name}]\n\`\`\`\n${attachment.text}\n\`\`\``;
  }
  return `[Attached file: ${attachment.name}]`;
}

function formatUserTurn(message, extraAttachments = []) {
  const text = extractTextFromUiMessage(message);
  const attachments = [
    ...extractAttachmentsFromUiMessage(message),
    ...extraAttachments,
  ];

  const sections = [];
  if (text) {
    sections.push(text);
  } else if (attachments.length) {
    sections.push("(message with attachments)");
  }

  for (const attachment of attachments) {
    sections.push(formatAttachmentBlock(attachment));
  }

  return sections.join("\n\n").trim();
}

export function buildConversationTranscript(messages, latestExtraAttachments = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const blocks = [];
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const lastUserHasFileParts = lastUserIndex >= 0
    && extractAttachmentsFromUiMessage(messages[lastUserIndex]).length > 0;
  const pendingExtras = lastUserHasFileParts ? [] : latestExtraAttachments;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === "user") {
      const extras = index === lastUserIndex ? pendingExtras : [];
      const body = formatUserTurn(message, extras);
      if (body) {
        blocks.push(`User:\n${body}`);
      }
      continue;
    }

    if (message.role === "assistant") {
      const body = extractTextFromUiMessage(message);
      if (body) {
        blocks.push(`Assistant:\n${body}`);
      }
    }
  }

  return blocks.join("\n\n");
}

export function extractLatestTurnImages(messages, latestExtraAttachments = []) {
  const images = [];
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");

  if (lastUserIndex >= 0) {
    for (const attachment of extractAttachmentsFromUiMessage(messages[lastUserIndex])) {
      if (attachment.kind === "image" && attachment.url) {
        images.push(attachment);
      }
    }
  }

  for (const attachment of latestExtraAttachments) {
    if (attachment?.kind === "image" && attachment.data) {
      images.push({
        kind: "image",
        name: attachment.name,
        mimeType: attachment.mimeType || "image/png",
        data: attachment.data,
      });
    }
  }

  return images;
}

export function mergeAttachmentsIntoText(text, attachments = []) {
  let merged = text || "";
  for (const attachment of attachments) {
    if (attachment?.kind === "file" && attachment.text) {
      merged += `\n\n---\nAttachment: ${attachment.name}\n\`\`\`\n${truncateFileText(attachment.text, attachment.name)}\n\`\`\``;
    }
  }
  return merged;
}
