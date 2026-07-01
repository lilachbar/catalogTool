// Typed chat-session logic extracted from the legacy src/chat-client.jsx
// monolith. Covers session persistence, attachment handling, token/budget
// estimation, per-message chat-mode mapping, and the useCatalogChatSession
// hook (transport + useChat + cross-window BroadcastChannel sync).
//
// Behavior is preserved 1:1. Note: the previous code passed `initialMessages`
// to useChat, which is not a valid AI SDK v5 option and was silently ignored;
// it is intentionally omitted here to keep runtime behavior identical.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

import {
  CHAT_MODES,
  extractMessageFileParts,
  extractMessageText,
  type MessageFilePart,
} from "./primitives";

type ChatHelpers = ReturnType<typeof useChat>;
type SendMessageArg = Parameters<ChatHelpers["sendMessage"]>[0];

export type WindowRole = "main" | "popup" | "mirror";

export interface ChatAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  mimeType?: string;
  data?: string;
  text?: string;
  previewUrl?: string;
}

export interface SavedChatSession {
  messages?: UIMessage[];
  selectedModel?: string;
  selectedMode?: string;
  status?: string;
  messageModes?: Record<string, string>;
}

const CHAT_SESSION_STORAGE_KEY = "catalogTool.chatSession";

const CONTEXT_TOKEN_BUDGET_DEFAULT = 128000;

const MODEL_CONTEXT_BUDGETS: Array<{ match: RegExp; budget: number }> = [
  { match: /composer|gpt-4\.1|gpt-5|o3|o4/i, budget: 200000 },
  { match: /sonnet|opus|haiku|claude/i, budget: 200000 },
  { match: /gpt-4o/i, budget: 128000 },
  { match: /mini|flash|haiku/i, budget: 128000 },
];

export function resolveContextBudget(
  selectedModel: string,
  defaultModel: string | null | undefined,
): number {
  const modelId = selectedModel === "auto" ? defaultModel : selectedModel;
  if (!modelId) {
    return CONTEXT_TOKEN_BUDGET_DEFAULT;
  }
  for (const entry of MODEL_CONTEXT_BUDGETS) {
    if (entry.match.test(modelId)) {
      return entry.budget;
    }
  }
  return CONTEXT_TOKEN_BUDGET_DEFAULT;
}

export const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".log", ".py", ".js", ".ts", ".jsx", ".tsx",
]);
const ATTACHMENT_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
]);
const IMAGE_EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** crypto.randomUUID() is only available in secure contexts (HTTPS / localhost). */
function newAttachmentId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileExtension(name: string | undefined): string {
  if (!name?.includes(".")) {
    return "";
  }
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function isImageAttachment(file: File): boolean {
  if (file.type?.startsWith("image/")) {
    return true;
  }
  return ATTACHMENT_IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

function imageMimeType(file: File): string {
  if (file.type?.startsWith("image/")) {
    return file.type;
  }
  return IMAGE_EXTENSION_MIME_TYPES[fileExtension(file.name)] || "application/octet-stream";
}

export function estimateTokenCount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(String(text).length / 4);
}

export function attachmentToFilePart(attachment: ChatAttachment): MessageFilePart {
  if (attachment.kind === "image") {
    const url =
      attachment.previewUrl ||
      `data:${attachment.mimeType || "image/png"};base64,${attachment.data || ""}`;
    return {
      type: "file",
      mediaType: attachment.mimeType || "image/png",
      filename: attachment.name,
      url,
    };
  }

  const text = attachment.text || "";
  const encoded = typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(text))) : "";
  return {
    type: "file",
    mediaType: attachment.mimeType || "text/plain",
    filename: attachment.name,
    url: encoded
      ? `data:text/plain;base64,${encoded}`
      : `data:text/plain,${encodeURIComponent(text)}`,
  };
}

export function estimateMessagesTokens(messageList: UIMessage[]): number {
  return messageList.reduce((total, message) => {
    let messageTokens = estimateTokenCount(extractMessageText(message));
    for (const part of extractMessageFileParts(message)) {
      if (part.mediaType?.startsWith("image/")) {
        const base64Length = part.url?.includes(",") ? part.url.split(",")[1]?.length || 0 : 0;
        messageTokens += Math.ceil(base64Length / 4);
      } else if (part.url?.startsWith("data:text/plain;base64,")) {
        messageTokens += Math.ceil((part.url.length - "data:text/plain;base64,".length) / 4);
      } else {
        messageTokens += estimateTokenCount(part.filename || "");
      }
    }
    return total + messageTokens;
  }, 0);
}

function normalizePastedFile(file: File): File {
  if (file.name) {
    return file;
  }

  const mimeType = file.type || "application/octet-stream";
  let extension = "bin";
  if (mimeType.startsWith("image/")) {
    extension = mimeType.slice("image/".length).split("+")[0] || "png";
    if (extension === "jpeg") {
      extension = "jpg";
    }
  } else if (mimeType === "text/plain") {
    extension = "txt";
  }

  const prefix = mimeType.startsWith("image/") ? "pasted-image" : "pasted-file";
  const name = `${prefix}-${Date.now()}.${extension}`;
  return new File([file], name, { type: mimeType, lastModified: file.lastModified });
}

export function extractPasteFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData?.items?.length) {
    return [];
  }

  const files: File[] = [];
  for (const item of clipboardData.items) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(normalizePastedFile(file));
    }
  }
  return files;
}

export async function readAttachmentFile(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB).`);
  }

  if (isImageAttachment(file)) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
    const commaIndex = dataUrl.indexOf(",");
    return {
      id: newAttachmentId(),
      kind: "image",
      name: file.name,
      mimeType: imageMimeType(file),
      data: commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl,
      previewUrl: dataUrl,
    };
  }

  const extension = fileExtension(file.name);
  if (!ATTACHMENT_TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`${file.name} is not a supported attachment type.`);
  }

  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });

  return {
    id: newAttachmentId(),
    kind: "file",
    name: file.name,
    mimeType: file.type || "text/plain",
    text,
  };
}

export function formatClientError(error: unknown): string {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  const err = error as {
    message?: unknown;
    errorText?: unknown;
    error?: { message?: unknown };
  };
  if (typeof err.message === "string" && err.message !== "[object Object]") {
    return err.message;
  }
  if (typeof err.errorText === "string") {
    return err.errorText;
  }
  if (err.error && typeof err.error.message === "string") {
    return err.error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Chat request failed.";
  }
}

export function composerPlaceholder(mode: string, chatBlocked: boolean): string {
  if (chatBlocked) {
    return "Configure an AI API key at sign-in or in .env";
  }
  if (mode === "plan") {
    return "Describe what you want to plan…";
  }
  if (mode === "ask") {
    return "Ask a question…";
  }
  return "Add a follow-up";
}

export function readChatSession(): SavedChatSession | null {
  try {
    const raw = sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as SavedChatSession;
  } catch {
    return null;
  }
}

export function writeChatSession(session: SavedChatSession): void {
  sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function formatChatModeLabel(modeId: string): string {
  const entry = CHAT_MODES.find((mode) => mode.id === modeId);
  return (entry?.label || "Agent").toUpperCase();
}

function normalizeChatModeId(mode: unknown): string | null {
  if (typeof mode === "string" && CHAT_MODES.some((entry) => entry.id === mode)) {
    return mode;
  }
  return null;
}

function metaChatMode(message: { metadata?: unknown }): string | null {
  const meta = message.metadata;
  if (meta && typeof meta === "object" && "chatMode" in meta) {
    return normalizeChatModeId((meta as { chatMode?: unknown }).chatMode);
  }
  return null;
}

function buildMessageChatModes(
  messages: UIMessage[],
  previousModes: Record<string, string> = {},
  pendingTurnModeRef: RefObject<string | null> | null = null,
): Record<string, string> {
  const modes: Record<string, string> = { ...previousModes };

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const metaMode = metaChatMode(message);
    if (metaMode) {
      modes[message.id] = metaMode;
    }
  }

  const lastUser = [...messages].reverse().find((entry) => entry.role === "user");
  if (lastUser) {
    const pendingMode = normalizeChatModeId(pendingTurnModeRef?.current);
    if (pendingMode && !modes[lastUser.id]) {
      modes[lastUser.id] = pendingMode;
    }
    const metaMode = metaChatMode(lastUser);
    if (metaMode) {
      modes[lastUser.id] = metaMode;
      if (pendingTurnModeRef && pendingTurnModeRef.current === metaMode) {
        pendingTurnModeRef.current = null;
      }
    }
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    let turnMode = "agent";
    for (let userIndex = index - 1; userIndex >= 0; userIndex -= 1) {
      if (messages[userIndex].role !== "user") {
        continue;
      }
      turnMode =
        modes[messages[userIndex].id] || metaChatMode(messages[userIndex]) || "agent";
      break;
    }
    modes[message.id] = turnMode;
  }

  return modes;
}

export function resolveMessageChatMode(
  message: UIMessage,
  messageChatModes: Record<string, string>,
): string {
  return messageChatModes[message.id] || metaChatMode(message) || "agent";
}

export interface UseCatalogChatSessionArgs {
  channelRef: RefObject<BroadcastChannel | null>;
  windowRole: WindowRole;
}

export interface CatalogChatSession {
  messages: UIMessage[];
  setMessages: ChatHelpers["setMessages"];
  sendMessage: (payload: SendMessageArg) => Promise<void>;
  status: ChatHelpers["status"];
  error: Error | undefined;
  isBusy: boolean;
  selectedModel: string;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  selectedMode: string;
  setSelectedMode: Dispatch<SetStateAction<string>>;
  setPendingAttachments: (attachments: ChatAttachment[]) => void;
  clearPendingAttachments: () => void;
  pendingTurnModeRef: RefObject<string | null>;
  messageChatModes: Record<string, string>;
  sendBlocked: boolean;
}

export function useCatalogChatSession({
  channelRef,
  windowRole,
}: UseCatalogChatSessionArgs): CatalogChatSession {
  const windowId = useId();
  const savedSession = useRef(readChatSession()).current;
  const [selectedModel, setSelectedModel] = useState<string>(savedSession?.selectedModel || "auto");
  const [selectedMode, setSelectedMode] = useState<string>(() => {
    const saved = savedSession?.selectedMode;
    return saved && CHAT_MODES.some((entry) => entry.id === saved) ? saved : "agent";
  });
  const pendingSendExtrasRef = useRef<{ attachments: ChatAttachment[] }>({ attachments: [] });
  const pendingTurnModeRef = useRef<string | null>(null);
  const remoteBusyRef = useRef(false);
  const mainWasBusyOnOpen = useRef(
    windowRole === "popup" &&
      (savedSession?.status === "streaming" || savedSession?.status === "submitted"),
  );
  const [sendBlocked, setSendBlocked] = useState(
    windowRole === "popup" && mainWasBusyOnOpen.current,
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          model: selectedModel === "auto" ? undefined : selectedModel,
          mode: selectedMode,
          attachments: pendingSendExtrasRef.current.attachments,
          pageContext:
            typeof (window as WindowWithCatalogTool).catalogTool?.getPageContext === "function"
              ? (window as WindowWithCatalogTool).catalogTool!.getPageContext!()
              : null,
        }),
      }),
    [selectedModel, selectedMode],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguredMode() {
      try {
        const response = await fetch("/api/chat/config");
        const data = await response.json();
        const configuredMode = data.chatMode;
        if (!cancelled && CHAT_MODES.some((entry) => entry.id === configuredMode)) {
          setSelectedMode(configuredMode);
        }
      } catch {
        // Best-effort sync from .env on load.
      }
    }

    loadConfiguredMode();
    return () => {
      cancelled = true;
    };
  }, []);

  const [messageChatModes, setMessageChatModes] = useState<Record<string, string>>(
    () => savedSession?.messageModes || {},
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({
    transport,
  });

  const isBusy = status === "streaming" || status === "submitted";

  useEffect(() => {
    setMessageChatModes((previous) => {
      const next = buildMessageChatModes(messages, previous, pendingTurnModeRef);
      return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
    });
  }, [messages]);

  useEffect(() => {
    writeChatSession({
      messages,
      selectedModel,
      selectedMode,
      status,
      messageModes: messageChatModes,
    });
    channelRef.current?.postMessage({
      type: "chat-sync",
      sender: windowId,
      messages,
      selectedModel,
      selectedMode,
      status,
      messageModes: messageChatModes,
      windowRole,
    });
  }, [channelRef, messageChatModes, messages, selectedModel, selectedMode, status, windowId, windowRole]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("catalogTool:chat-busy", { detail: { busy: isBusy } }));
    channelRef.current?.postMessage({ type: "chat-busy", busy: isBusy, sender: windowId });
  }, [channelRef, isBusy, windowId]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) {
      return undefined;
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.sender === windowId) {
        return;
      }

      if (data.type === "chat-sync") {
        if (windowRole === "mirror" || (windowRole === "main" && data.windowRole === "popup")) {
          if (Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
          if (data.messageModes && typeof data.messageModes === "object") {
            setMessageChatModes(data.messageModes);
          }
          if (data.selectedModel) {
            setSelectedModel(data.selectedModel);
          }
          if (data.selectedMode) {
            setSelectedMode(data.selectedMode);
          }
        }
        if (windowRole === "popup" && data.windowRole === "main" && isBusy) {
          if (Array.isArray(data.messages)) {
            setMessages(data.messages);
          }
          if (data.messageModes && typeof data.messageModes === "object") {
            setMessageChatModes(data.messageModes);
          }
        }
      }

      if (data.type === "chat-busy") {
        remoteBusyRef.current = Boolean(data.busy);
        if (windowRole === "popup") {
          setSendBlocked(Boolean(data.busy) || mainWasBusyOnOpen.current);
        }
      }

      if (data.type === "chat-handoff" && windowRole === "popup") {
        mainWasBusyOnOpen.current = false;
        setSendBlocked(false);
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        if (data.messageModes && typeof data.messageModes === "object") {
          setMessageChatModes(data.messageModes);
        }
        if (data.selectedModel) {
          setSelectedModel(data.selectedModel);
        }
        if (data.selectedMode) {
          setSelectedMode(data.selectedMode);
        }
      }
    };

    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, [channelRef, isBusy, setMessages, windowId, windowRole]);

  const guardedSendMessage = useCallback(
    async (payload: SendMessageArg) => {
      if (sendBlocked) {
        return;
      }
      await sendMessage(payload);
    },
    [sendBlocked, sendMessage],
  );

  const setPendingAttachments = useCallback((attachments: ChatAttachment[]) => {
    pendingSendExtrasRef.current.attachments = Array.isArray(attachments) ? attachments : [];
  }, []);

  const clearPendingAttachments = useCallback(() => {
    pendingSendExtrasRef.current.attachments = [];
  }, []);

  return {
    messages,
    setMessages,
    sendMessage: guardedSendMessage,
    status,
    error,
    isBusy,
    selectedModel,
    setSelectedModel,
    selectedMode,
    setSelectedMode,
    setPendingAttachments,
    clearPendingAttachments,
    pendingTurnModeRef,
    messageChatModes,
    sendBlocked,
  };
}

interface WindowWithCatalogTool extends Window {
  catalogTool?: {
    getPageContext?: () => unknown;
  };
}
