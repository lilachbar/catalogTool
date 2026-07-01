import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CHAT_WIDTH_STORAGE_KEY = "catalogTool.chatPanelWidth";
const CHAT_DETACHED_LAYOUT_KEY = "catalogTool.detachedLayout";
const CHAT_SESSION_STORAGE_KEY = "catalogTool.chatSession";
const CHAT_POPUP_CHANNEL = "catalog-tool-chat";
const CHAT_POPUP_NAME = "catalogToolChatPopup";
const DETACHED_CHAT_WINDOW_TITLE = "Catalog Tool · Chat";
const CHAT_WIDTH_MIN = 320;
const CHAT_WIDTH_MAX = 900;
const CHAT_WIDTH_DEFAULT = 360;
const CHAT_DETACHED_HEIGHT_MIN = 320;
const CHAT_APP_TOP_CHROME = 28;
const CHAT_MODES = [
  { id: "agent", label: "Agent", hint: "Use MCP tools to act on CatalogOne" },
  { id: "plan", label: "Plan", hint: "Plan catalog changes before executing" },
  { id: "ask", label: "Ask", hint: "Answer questions without running tools" },
];
const CONTEXT_TOKEN_BUDGET_DEFAULT = 128000;

const MODEL_CONTEXT_BUDGETS = [
  { match: /composer|gpt-4\.1|gpt-5|o3|o4/i, budget: 200000 },
  { match: /sonnet|opus|haiku|claude/i, budget: 200000 },
  { match: /gpt-4o/i, budget: 128000 },
  { match: /mini|flash|haiku/i, budget: 128000 },
];

function resolveContextBudget(selectedModel, defaultModel) {
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
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".log", ".py", ".js", ".ts", ".jsx", ".tsx",
]);
const ATTACHMENT_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
]);
const IMAGE_EXTENSION_MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** crypto.randomUUID() is only available in secure contexts (HTTPS / localhost). */
function newAttachmentId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileExtension(name) {
  if (!name?.includes(".")) {
    return "";
  }
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function isImageAttachment(file) {
  if (file.type?.startsWith("image/")) {
    return true;
  }
  return ATTACHMENT_IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

function imageMimeType(file) {
  if (file.type?.startsWith("image/")) {
    return file.type;
  }
  return IMAGE_EXTENSION_MIME_TYPES[fileExtension(file.name)] || "application/octet-stream";
}

function clampChatWidth(width, viewportWidth = window.innerWidth) {
  const max = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, viewportWidth - 80));
  return Math.min(max, Math.max(CHAT_WIDTH_MIN, width));
}

function clampDetachedHeight(height) {
  const max = Math.max(CHAT_DETACHED_HEIGHT_MIN, window.screen.availHeight - 24);
  return Math.min(max, Math.max(CHAT_DETACHED_HEIGHT_MIN, height));
}

function readSavedChatWidth() {
  const layout = window.catalogToolLayoutCouple;
  if (layout) {
    return layout.readChatWidth();
  }
  const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    if (saved === 420) {
      localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(CHAT_WIDTH_DEFAULT));
      return clampChatWidth(CHAT_WIDTH_DEFAULT);
    }
    return clampChatWidth(saved);
  }
  return CHAT_WIDTH_DEFAULT;
}

function readCurrentChatPanelWidth() {
  const panel = document.querySelector("aside.chat-panel:not(.chat-panel-popup):not(.chat-panel-hidden)");
  if (panel?.offsetWidth) {
    return panel.offsetWidth;
  }
  return readSavedChatWidth();
}

function storeDetachedLayout(layout) {
  sessionStorage.setItem(CHAT_DETACHED_LAYOUT_KEY, JSON.stringify(layout));
}

function readDetachedLayout() {
  try {
    const raw = sessionStorage.getItem(CHAT_DETACHED_LAYOUT_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readChatSession() {
  try {
    const raw = sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeChatSession(session) {
  sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function readDetachedChatSize() {
  const width = readCurrentChatPanelWidth();
  const outerWidth = width;
  const topChrome = Math.max(CHAT_APP_TOP_CHROME, window.outerHeight - window.innerHeight);
  const outerHeight = clampDetachedHeight(window.innerHeight + topChrome);
  return { width, outerWidth, outerHeight };
}

async function requestDetachedWindowResize(layout) {
  if (!layout?.outerWidth || !layout?.outerHeight) {
    return;
  }
  try {
    await fetch("/api/chat/resize-window", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width: layout.outerWidth,
        height: layout.outerHeight,
        left: layout.left,
        top: layout.top,
      }),
    });
  } catch {
    // Server-side resize is best-effort (macOS only).
  }
}

async function persistChatModelSelection(model, defaultModel) {
  const response = await fetch("/api/chat/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      default_model: defaultModel || undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not save model selection.");
  }
  return payload;
}

async function persistChatModeSelection(mode) {
  const response = await fetch("/api/chat/mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not save chat mode.");
  }
  return payload;
}

function composerPlaceholder(mode, chatBlocked) {
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

function detachedWindowPlacement(outerWidth) {
  const left = Math.max(0, Math.round(window.screenX + window.outerWidth - outerWidth));
  const top = Math.max(0, Math.round(window.screenY));
  return { left, top };
}

function applyDetachedWindowLayout(layout) {
  if (!layout?.width) {
    return () => {};
  }

  document.documentElement.classList.add("chat-popup-root");
  document.documentElement.style.setProperty("--chat-panel-width", `${layout.width}px`);

  const targetOuterW = layout.outerWidth ?? layout.width;
  const targetOuterH = layout.outerHeight ?? layout.height;

  const apply = () => {
    try {
      window.resizeTo(targetOuterW, targetOuterH);
      if (Number.isFinite(layout.left) && Number.isFinite(layout.top)) {
        window.moveTo(layout.left, layout.top);
      }
    } catch {
      // resizeTo/moveTo may be blocked in some browser modes.
    }
  };

  apply();
  requestDetachedWindowResize(layout);
  const frameId = window.requestAnimationFrame(apply);
  const timeoutIds = [50, 150, 300, 600, 1000, 1500, 2500].map((delay) => window.setTimeout(() => {
    apply();
    if (delay >= 300) {
      requestDetachedWindowResize(layout);
    }
  }, delay));

  return () => {
    window.cancelAnimationFrame(frameId);
    timeoutIds.forEach((id) => window.clearTimeout(id));
  };
}

function estimateTokenCount(text) {
  if (!text) {
    return 0;
  }
  return Math.ceil(String(text).length / 4);
}

function attachmentToFilePart(attachment) {
  if (attachment.kind === "image") {
    const url = attachment.previewUrl || `data:${attachment.mimeType || "image/png"};base64,${attachment.data || ""}`;
    return {
      type: "file",
      mediaType: attachment.mimeType || "image/png",
      filename: attachment.name,
      url,
    };
  }

  const text = attachment.text || "";
  const encoded = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(text)))
    : "";
  return {
    type: "file",
    mediaType: attachment.mimeType || "text/plain",
    filename: attachment.name,
    url: encoded ? `data:text/plain;base64,${encoded}` : `data:text/plain,${encodeURIComponent(text)}`,
  };
}

function extractMessageFileParts(message) {
  return (message.parts ?? []).filter((part) => part.type === "file");
}

function estimateMessagesTokens(messageList) {
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

function normalizePastedFile(file) {
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

function extractPasteFiles(clipboardData) {
  if (!clipboardData?.items?.length) {
    return [];
  }

  const files = [];
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

async function readAttachmentFile(file) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB).`);
  }

  if (isImageAttachment(file)) {
    const dataUrl = await new Promise((resolve, reject) => {
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

  const text = await new Promise((resolve, reject) => {
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

function formatClientError(error) {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error.message === "string" && error.message !== "[object Object]") {
    return error.message;
  }
  if (typeof error.errorText === "string") {
    return error.errorText;
  }
  if (error.error?.message) {
    return error.error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Chat request failed.";
  }
}

function useChatHealth() {
  const [health, setHealth] = useState({
    loading: true,
    ready: false,
    message: "",
    provider: null,
    defaultModel: null,
    models: [],
    chatMode: "agent",
    contextBaselines: DEFAULT_CONTEXT_BASELINES,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch("/api/chat/health");
        const data = await response.json();
        if (cancelled) {
          return;
        }
        const reason = data.chatKey?.reason;
        let message =
          data.chatKey?.setupInstructions
          || data.chatKey?.message
          || (data.chatReady ? "" : "Chat is not configured.");

        if (reason === "missing") {
          message = data.chatKey?.setupInstructions || message;
        } else if (reason === "invalid_format" || reason === "invalid") {
          message = data.chatKey?.setupInstructions || data.chatKey?.message || message;
        }

        setHealth({
          loading: false,
          ready: Boolean(data.chatReady),
          message,
          provider: data.chatProvider?.provider || data.models?.provider || null,
          defaultModel: data.models?.defaultModel || data.chatProvider?.model || null,
          models: Array.isArray(data.models?.models) ? data.models.models : [],
          chatMode: CHAT_MODES.some((entry) => entry.id === data.chatMode) ? data.chatMode : "agent",
          contextBaselines: data.contextBaselines || DEFAULT_CONTEXT_BASELINES,
        });
      } catch {
        if (!cancelled) {
          setHealth({
            loading: false,
            ready: false,
            message: "Could not reach the chat server. Restart with ./run_web.sh",
            provider: null,
            defaultModel: null,
            models: [],
            chatMode: "agent",
            contextBaselines: DEFAULT_CONTEXT_BASELINES,
          });
        }
      }
    }

    loadHealth();
    const intervalId = window.setInterval(loadHealth, 60_000);
    const onFocus = () => loadHealth();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return health;
}

function useCatalogChatSession({ channelRef, windowRole }) {
  const windowId = useId();
  const savedSession = useRef(readChatSession()).current;
  const [selectedModel, setSelectedModel] = useState(savedSession?.selectedModel || "auto");
  const [selectedMode, setSelectedMode] = useState(() => {
    const saved = savedSession?.selectedMode;
    return CHAT_MODES.some((entry) => entry.id === saved) ? saved : "agent";
  });
  const pendingSendExtrasRef = useRef({ attachments: [] });
  const pendingTurnModeRef = useRef(null);
  const remoteBusyRef = useRef(false);
  const mainWasBusyOnOpen = useRef(
    windowRole === "popup"
    && (savedSession?.status === "streaming" || savedSession?.status === "submitted"),
  );
  const [sendBlocked, setSendBlocked] = useState(
    windowRole === "popup" && mainWasBusyOnOpen.current,
  );

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        model: selectedModel === "auto" ? undefined : selectedModel,
        mode: selectedMode,
        attachments: pendingSendExtrasRef.current.attachments,
        pageContext: typeof window.catalogTool?.getPageContext === "function"
          ? window.catalogTool.getPageContext()
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

  const [messageChatModes, setMessageChatModes] = useState(() => savedSession?.messageModes || {});

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport,
    initialMessages: savedSession?.messages ?? [],
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

    const onMessage = (event) => {
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
    async (payload) => {
      if (sendBlocked) {
        return;
      }
      await sendMessage(payload);
    },
    [sendBlocked, sendMessage],
  );

  const setPendingAttachments = useCallback((attachments) => {
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

function formatChatModeLabel(modeId) {
  const entry = CHAT_MODES.find((mode) => mode.id === modeId);
  return (entry?.label || "Agent").toUpperCase();
}

function normalizeChatModeId(mode) {
  if (mode && CHAT_MODES.some((entry) => entry.id === mode)) {
    return mode;
  }
  return null;
}

function buildMessageChatModes(messages, previousModes = {}, pendingTurnModeRef = null) {
  const modes = { ...previousModes };

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const metaMode = normalizeChatModeId(message.metadata?.chatMode);
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
    const metaMode = normalizeChatModeId(lastUser.metadata?.chatMode);
    if (metaMode) {
      modes[lastUser.id] = metaMode;
      if (pendingTurnModeRef?.current === metaMode) {
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
      turnMode = modes[messages[userIndex].id]
        || normalizeChatModeId(messages[userIndex].metadata?.chatMode)
        || "agent";
      break;
    }
    modes[message.id] = turnMode;
  }

  return modes;
}

function resolveMessageChatMode(message, messageChatModes) {
  return messageChatModes[message.id]
    || normalizeChatModeId(message.metadata?.chatMode)
    || "agent";
}

function extractMessageText(message) {
  let text = "";

  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      text += part.text;
    }
  }

  if (!text && typeof message.content === "string") {
    text = message.content;
  }

  return text;
}

function DetachIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
    </svg>
  );
}

function ChatIconButton({ label, title, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon chat-panel-action"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}

function ChatModeSelect({ selectedMode, onChange, disabled }) {
  const current = CHAT_MODES.find((mode) => mode.id === selectedMode) || CHAT_MODES[0];

  return (
    <label className="chat-composer-pill chat-composer-mode-pill" title={current.hint}>
      <span className="chat-composer-pill-icon" aria-hidden="true">∞</span>
      <span className="chat-composer-mode-label">{current.label}</span>
      <select
        className="chat-composer-select-overlay"
        value={selectedMode}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Chat mode"
      >
        {CHAT_MODES.map((mode) => (
          <option key={mode.id} value={mode.id}>{mode.label}</option>
        ))}
      </select>
      <span className="chat-composer-chevron" aria-hidden="true">▾</span>
    </label>
  );
}

function ChatModelSelect({
  selectedModel,
  onChange,
  models,
  defaultModel,
  disabled,
}) {
  const resolvedModel = selectedModel === "auto"
    ? (defaultModel || "Auto")
    : (models.find((entry) => entry.id === selectedModel)?.label || selectedModel);

  return (
    <label
      className="chat-composer-model"
      title={defaultModel ? `Automatic uses ${defaultModel}` : "Select AI model"}
    >
      <span className="chat-composer-model-label">{selectedModel === "auto" ? "Auto" : resolvedModel}</span>
      <select
        className="chat-composer-select-overlay"
        value={selectedModel}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="AI model"
      >
        <option value="auto">Auto</option>
        {models.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label || entry.id}</option>
        ))}
      </select>
      <span className="chat-composer-chevron" aria-hidden="true">▾</span>
    </label>
  );
}

const CONTEXT_USAGE_CATEGORIES = [
  { id: "systemPrompt", label: "System prompt", color: "#a1a1aa" },
  { id: "toolDefinitions", label: "Tool definitions", color: "#a855f7" },
  { id: "rules", label: "Rules", color: "#22c55e" },
  { id: "skills", label: "Skills", color: "#ca8a04" },
  { id: "mcp", label: "MCP", color: "#ec4899" },
  { id: "subagentDefinitions", label: "Subagent definitions", color: "#2563eb" },
  { id: "summarizedConversation", label: "Summarized conversation", color: "#ef4444" },
  { id: "conversation", label: "Conversation", color: "#06b6d4" },
];

const DEFAULT_CONTEXT_BASELINES = {
  systemPrompt: 462,
  toolDefinitions: 6700,
  rules: 0,
  skills: 0,
  mcp: 746,
  subagentDefinitions: 0,
  summarizedConversation: 0,
};

function formatCompactTokens(value) {
  const tokens = Math.max(0, Number(value) || 0);
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1000) {
    const compact = tokens / 1000;
    return compact >= 100
      ? `${Math.round(compact)}K`
      : `${compact.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return tokens.toLocaleString();
}

function buildContextUsageBreakdown({
  baselines = DEFAULT_CONTEXT_BASELINES,
  conversationTokens = 0,
  summarizedConversationTokens = 0,
}) {
  const items = CONTEXT_USAGE_CATEGORIES.map((category) => {
    if (category.id === "conversation") {
      return { ...category, tokens: conversationTokens };
    }
    if (category.id === "summarizedConversation") {
      return { ...category, tokens: summarizedConversationTokens || baselines.summarizedConversation || 0 };
    }
    return { ...category, tokens: baselines[category.id] || 0 };
  }).filter((item) => item.tokens > 0);

  const total = items.reduce((sum, item) => sum + item.tokens, 0);
  return { items, total };
}

function ChatContextUsage({ breakdown, budget }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { items, total } = breakdown;
  const rawPercent = budget > 0 ? (total / budget) * 100 : 0;
  const displayPercent = Math.min(100, Math.round(rawPercent));
  const ringPercent = total > 0 ? Math.max(rawPercent, 3) : 0;
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const dash = (ringPercent / 100) * circumference;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="chat-context-usage-wrap" ref={wrapRef}>
      <button
        type="button"
        className="chat-composer-icon-btn chat-context-ring"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Context usage ${displayPercent} percent`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Context usage"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r={radius} fill="none" stroke="var(--chat-context-track)" strokeWidth="2" />
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            stroke="var(--chat-context-fill)"
            strokeWidth="2"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 9 9)"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="chat-context-usage-popover" role="dialog" aria-label="Context usage">
          <header className="chat-context-usage-head">
            <h3 className="chat-context-usage-title">Context Usage</h3>
            <button
              type="button"
              className="chat-context-usage-close"
              onClick={() => setOpen(false)}
              aria-label="Close context usage"
            >
              ×
            </button>
          </header>

          <div className="chat-context-usage-summary">
            <span className="chat-context-usage-percent">{displayPercent}% Full</span>
            <span className="chat-context-usage-total">
              ~{formatCompactTokens(total)} / {formatCompactTokens(budget)} Tokens
            </span>
          </div>

          <div
            className="chat-context-usage-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={total}
            aria-label="Context token breakdown"
          >
            {items.map((item) => (
              <span
                key={item.id}
                className="chat-context-usage-segment"
                style={{
                  flexGrow: item.tokens,
                  backgroundColor: item.color,
                }}
                title={`${item.label}: ${formatCompactTokens(item.tokens)}`}
              />
            ))}
          </div>

          <ul className="chat-context-usage-legend">
            {items.map((item) => (
              <li key={item.id} className="chat-context-usage-legend-item">
                <span className="chat-context-usage-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                <span className="chat-context-usage-legend-label">{item.label}</span>
                <span className="chat-context-usage-legend-value">{formatCompactTokens(item.tokens)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function ChatAttachmentChips({ attachments, onRemove }) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="chat-attachment-list">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="chat-attachment-chip">
          {attachment.kind === "image" && attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" className="chat-attachment-thumb" />
          ) : (
            <span className="chat-attachment-file-icon" aria-hidden="true">📄</span>
          )}
          <span className="chat-attachment-name" title={attachment.name}>{attachment.name}</span>
          <button
            type="button"
            className="chat-attachment-remove"
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function isTextLikeFilePart(part) {
  const mediaType = part.mediaType || "";
  if (mediaType.startsWith("text/")) {
    return true;
  }
  if (mediaType.includes("json") || mediaType.includes("xml") || mediaType.includes("javascript")) {
    return true;
  }
  const filename = part.filename || "";
  return /\.(txt|md|json|csv|xml|yaml|yml|log|py|js|ts|jsx|tsx)$/i.test(filename);
}

function decodeFilePartContent(part) {
  const url = part.url || "";
  if (!url.startsWith("data:")) {
    return null;
  }

  const commaIndex = url.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }

  const metadata = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);

  if (metadata.includes(";base64")) {
    if (!isTextLikeFilePart(part)) {
      return null;
    }
    try {
      return decodeBase64Utf8(payload);
    } catch {
      try {
        return atob(payload);
      } catch {
        return null;
      }
    }
  }

  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function openFilePartInNewTab(part) {
  if (!part.url) {
    return;
  }
  window.open(part.url, "_blank", "noopener,noreferrer");
}

function ChatAttachmentPreviewDialog({ preview, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }
    if (preview) {
      dialog.showModal();
    } else {
      dialog.close();
    }
    return undefined;
  }, [preview]);

  if (!preview) {
    return null;
  }

  const downloadUrl = preview.downloadUrl || preview.blobUrl;

  return (
    <dialog
      ref={dialogRef}
      className="chat-attachment-preview-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="chat-attachment-preview-panel">
        <header className="chat-attachment-preview-head">
          <h3 className="chat-attachment-preview-title">{preview.filename || "Attached file"}</h3>
          <div className="chat-attachment-preview-actions">
            {downloadUrl ? (
              <a
                className="btn btn-ghost btn-sm"
                href={downloadUrl}
                download={preview.filename || "attachment"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close preview">
              Close
            </button>
          </div>
        </header>
        {preview.kind === "image" ? (
          <div className="chat-attachment-preview-image-wrap">
            <img src={preview.url} alt={preview.filename || "Attached image"} className="chat-attachment-preview-image" />
          </div>
        ) : (
          <pre className="chat-attachment-preview-content">{preview.content || ""}</pre>
        )}
      </div>
    </dialog>
  );
}

function ChatMessageAttachments({ parts }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => () => {
    if (preview?.blobUrl) {
      URL.revokeObjectURL(preview.blobUrl);
    }
  }, [preview]);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.blobUrl) {
        URL.revokeObjectURL(current.blobUrl);
      }
      return null;
    });
  }, []);

  const openPart = useCallback((part) => {
    if (part.mediaType?.startsWith("image/")) {
      setPreview((current) => {
        if (current?.blobUrl) {
          URL.revokeObjectURL(current.blobUrl);
        }
        return {
          kind: "image",
          filename: part.filename,
          url: part.url,
          downloadUrl: part.url,
        };
      });
      return;
    }

    const textContent = decodeFilePartContent(part);
    if (textContent != null) {
      const blob = new Blob([textContent], { type: part.mediaType || "text/plain" });
      const blobUrl = URL.createObjectURL(blob);
      setPreview((current) => {
        if (current?.blobUrl) {
          URL.revokeObjectURL(current.blobUrl);
        }
        return {
          kind: "text",
          filename: part.filename,
          content: textContent,
          blobUrl,
          downloadUrl: blobUrl,
        };
      });
      return;
    }

    openFilePartInNewTab(part);
  }, []);

  if (!parts.length) {
    return null;
  }

  return (
    <>
      <div className="chat-message-attachments">
        {parts.map((part, index) => {
          const key = `${part.filename || "file"}-${index}`;
          const label = part.filename || (part.mediaType?.startsWith("image/") ? "Attached image" : "Attached file");

          if (part.mediaType?.startsWith("image/")) {
            return (
              <button
                key={key}
                type="button"
                className="chat-message-attachment chat-message-attachment-image chat-message-attachment-open"
                onClick={() => openPart(part)}
                title={`Open ${label}`}
                aria-label={`Open ${label}`}
              >
                <img src={part.url} alt="" className="chat-message-attachment-img" />
                <span className="chat-message-attachment-name">{label}</span>
              </button>
            );
          }

          return (
            <button
              key={key}
              type="button"
              className="chat-message-attachment chat-message-attachment-file chat-message-attachment-open"
              onClick={() => openPart(part)}
              title={`Open ${label}`}
              aria-label={`Open ${label}`}
            >
              <span className="chat-message-attachment-icon" aria-hidden="true">📄</span>
              <span className="chat-message-attachment-name">{label}</span>
            </button>
          );
        })}
      </div>
      <ChatAttachmentPreviewDialog preview={preview} onClose={closePreview} />
    </>
  );
}

function ChatMessageBody({ text, isUser }) {
  if (!text) {
    return <>…</>;
  }

  if (isUser) {
    return <div className="chat-message-plain">{text}</div>;
  }

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <pre className="chat-code-block">{children}</pre>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="chat-inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ChatMessage({ message, messageChatModes }) {
  const isUser = message.role === "user";
  const fileParts = extractMessageFileParts(message);
  const rawText = extractMessageText(message);
  const text = fileParts.length && /^(See attached files\.|See attached context\.)$/.test(rawText)
    ? ""
    : rawText;
  const chatMode = resolveMessageChatMode(message, messageChatModes);

  return (
    <div className={`chat-message chat-message-${isUser ? "user" : "assistant"} chat-message-mode-${chatMode}`}>
      <div className="chat-message-role">{formatChatModeLabel(chatMode)}</div>
      <div className="chat-message-body">
        <ChatMessageAttachments parts={fileParts} />
        {(text || !fileParts.length) ? <ChatMessageBody text={text} isUser={isUser} /> : null}
      </div>
    </div>
  );
}

function ChatPanel({
  open,
  onClose,
  mode = "docked",
  onPopOut,
  onAttach,
  popupActive = false,
  visuallyHidden = false,
  chatHealth = { loading: false, ready: true, message: "", models: [], defaultModel: null },
  chatSession,
  onBusyChange,
  sendBlocked = false,
}) {
  const isPopup = mode === "popup";
  const detachedLayout = isPopup ? readDetachedLayout() : null;
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState("");
  const [panelWidth, setPanelWidth] = useState(() => (
    isPopup ? (detachedLayout?.width ?? readSavedChatWidth()) : readSavedChatWidth()
  ));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const resizerRef = useRef(null);
  const widthDraggingRef = useRef(false);

  const {
    messages,
    sendMessage,
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
  } = chatSession;

  const chatBlocked = !chatHealth.loading && !chatHealth.ready;

  const handleModelChange = useCallback(async (model) => {
    setSelectedModel(model);
    try {
      await persistChatModelSelection(model, chatHealth.defaultModel);
    } catch (err) {
      console.error("Failed to persist model selection:", err);
    }
  }, [setSelectedModel, chatHealth.defaultModel]);

  const handleModeChange = useCallback(async (mode) => {
    if (!CHAT_MODES.some((entry) => entry.id === mode)) {
      return;
    }
    setSelectedMode(mode);
    try {
      await persistChatModeSelection(mode);
    } catch (err) {
      console.error("Failed to persist chat mode:", err);
    }
  }, [setSelectedMode]);

  const handleAttachFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    setAttachError("");
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const nextAttachments = [...attachments];
    for (const file of files.slice(0, remaining)) {
      try {
        nextAttachments.push(await readAttachmentFile(file));
      } catch (err) {
        setAttachError(formatClientError(err));
      }
    }
    setAttachments(nextAttachments);
  }, [attachments]);

  const handleDragOver = useCallback((event) => {
    if (isBusy || chatBlocked || sendBlocked) {
      return;
    }
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [chatBlocked, isBusy, sendBlocked]);

  const handleDrop = useCallback((event) => {
    if (isBusy || chatBlocked || sendBlocked) {
      return;
    }
    const files = event.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    event.preventDefault();
    handleAttachFiles(files);
    inputRef.current?.focus();
  }, [chatBlocked, handleAttachFiles, isBusy, sendBlocked]);

  const removeAttachment = useCallback((attachmentId) => {
    setAttachments((current) => current.filter((entry) => entry.id !== attachmentId));
    setAttachError("");
  }, []);

  const attachmentTokens = attachments.reduce((total, attachment) => {
    if (attachment.kind === "file") {
      return total + estimateTokenCount(attachment.text);
    }
    return total + Math.ceil((attachment.data?.length || 0) / 4);
  }, 0);
  const contextBudget = resolveContextBudget(selectedModel, chatHealth.defaultModel);
  const conversationTokens = estimateMessagesTokens(messages) + estimateTokenCount(input) + attachmentTokens;
  const contextBreakdown = useMemo(
    () => buildContextUsageBreakdown({
      baselines: chatHealth.contextBaselines || DEFAULT_CONTEXT_BASELINES,
      conversationTokens,
    }),
    [chatHealth.contextBaselines, conversationTokens],
  );
  const canSend = Boolean(input.trim() || attachments.length) && !isBusy && !chatBlocked && !sendBlocked;

  const persistPanelWidth = useCallback((width) => {
    const layout = window.catalogToolLayoutCouple;
    if (layout) {
      const { chatWidth } = layout.applyCoupledFromChat(width);
      setPanelWidth(chatWidth);
      return;
    }
    const next = clampChatWidth(width);
    setPanelWidth(next);
    localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
  }, []);

  useEffect(() => {
    const layout = window.catalogToolLayoutCouple;
    if (!layout) {
      return undefined;
    }
    const onLayoutCouple = (event) => {
      const { source, chatWidth } = event.detail || {};
      if (source === "workflow" && Number.isFinite(chatWidth)) {
        setPanelWidth(chatWidth);
      }
    };
    document.addEventListener(layout.LAYOUT_COUPLE_EVENT, onLayoutCouple);
    return () => document.removeEventListener(layout.LAYOUT_COUPLE_EVENT, onLayoutCouple);
  }, []);

  useEffect(() => {
    if (!open || isPopup || visuallyHidden) {
      return undefined;
    }
    document.documentElement.style.setProperty("--chat-panel-width", `${panelWidth}px`);
    return () => {
      document.documentElement.style.removeProperty("--chat-panel-width");
    };
  }, [isPopup, open, panelWidth, visuallyHidden]);

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    const onWindowResize = () => {
      setPanelWidth((current) => clampChatWidth(current));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  useEffect(() => {
    const resizer = resizerRef.current;
    if (!resizer || !open || isPopup) {
      return undefined;
    }

    const stopWidthDrag = () => {
      if (!widthDraggingRef.current) {
        return;
      }
      widthDraggingRef.current = false;
      resizer.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-chat-panel");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopWidthDrag);
      document.removeEventListener("pointercancel", stopWidthDrag);
    };

    const onPointerMove = (event) => {
      if (!widthDraggingRef.current) {
        return;
      }
      persistPanelWidth(window.innerWidth - event.clientX);
    };

    const onPointerDown = (event) => {
      if (window.matchMedia("(max-width: 768px)").matches || event.button !== 0) {
        return;
      }
      const layout = window.catalogToolLayoutCouple;
      if (layout?.shouldPinWorkflowMain?.()) {
        layout.pinWorkflowMainWidth?.();
      }
      widthDraggingRef.current = true;
      resizer.classList.add("is-dragging");
      document.body.classList.add("is-resizing-chat-panel");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopWidthDrag);
      document.addEventListener("pointercancel", stopWidthDrag);
      event.preventDefault();
    };

    resizer.addEventListener("pointerdown", onPointerDown);

    return () => {
      resizer.removeEventListener("pointerdown", onPointerDown);
      stopWidthDrag();
    };
  }, [open, isPopup, persistPanelWidth]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !open || visuallyHidden) {
      return undefined;
    }

    const onPaste = (event) => {
      if (isBusy || chatBlocked || sendBlocked) {
        return;
      }

      const pastedFiles = extractPasteFiles(event.clipboardData);
      if (!pastedFiles.length) {
        return;
      }

      event.preventDefault();
      handleAttachFiles(pastedFiles);
      inputRef.current?.focus();
    };

    panel.addEventListener("paste", onPaste);
    return () => panel.removeEventListener("paste", onPaste);
  }, [chatBlocked, handleAttachFiles, isBusy, open, sendBlocked, visuallyHidden]);

  useEffect(() => {
    if (open && !visuallyHidden) {
      inputRef.current?.focus();
    }
  }, [open, visuallyHidden]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const text = input.trim();
      if ((!text && !attachments.length) || isBusy) {
        return;
      }

      const outgoingAttachments = attachments.map(({ id, kind, name, mimeType, data, text: fileText, previewUrl }) => ({
        id,
        kind,
        name,
        mimeType,
        data,
        text: fileText,
        previewUrl,
      }));
      const fileParts = outgoingAttachments.map(attachmentToFilePart);

      setInput("");
      setAttachments([]);
      setAttachError("");
      setPendingAttachments(outgoingAttachments);
      pendingTurnModeRef.current = selectedMode;

      try {
        await sendMessage({
          text: text || (outgoingAttachments.length ? "See attached files." : ""),
          files: fileParts,
          metadata: { chatMode: selectedMode },
        });
      } finally {
        clearPendingAttachments();
      }
    },
    [
      attachments,
      clearPendingAttachments,
      input,
      isBusy,
      sendMessage,
      selectedMode,
      pendingTurnModeRef,
      setPendingAttachments,
    ],
  );

  if (!open && !isPopup) {
    return null;
  }

  const panelClassName = [
    "chat-panel",
    isPopup ? "chat-panel-popup" : "",
    visuallyHidden ? "chat-panel-hidden" : "",
  ].filter(Boolean).join(" ");
  const panelStyle = { "--chat-panel-width": `${panelWidth}px` };

  return (
    <aside
      ref={panelRef}
      className={panelClassName}
      aria-label="Catalog assistant"
      style={panelStyle}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!isPopup ? (
        <div
          ref={resizerRef}
          className="chat-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel width"
          tabIndex={0}
          title="Drag to resize width"
        />
      ) : null}

      <header className={`chat-panel-head${isPopup ? " chat-popup-head" : ""}`}>
        {isPopup ? (
          <div className="chat-popup-brand">
            <img className="chat-popup-brand-logo" src="/static/logo.svg" width="32" height="32" alt="" />
            <div className="chat-popup-brand-copy">
              <span className="chat-popup-brand-title">Catalog Tool</span>
              <span className="chat-popup-brand-sub">Catalog assistant</span>
            </div>
          </div>
        ) : (
          <div>
            <span className="chat-panel-eyebrow">Agentic</span>
            <h2 className="chat-panel-title">Catalog Assistant</h2>
          </div>
        )}
        <div className="chat-panel-actions">
          {isPopup ? (
            <ChatIconButton label="Attach chat" title="Attach to main window" onClick={onAttach}>
              <AttachIcon />
            </ChatIconButton>
          ) : (
            <ChatIconButton
              label="Detach chat"
              title="Open in separate window (other monitor)"
              onClick={onPopOut}
              disabled={popupActive}
            >
              <DetachIcon />
            </ChatIconButton>
          )}
          <ChatIconButton
            label={isPopup ? "Close window" : "Close chat"}
            title={isPopup ? "Close window" : "Close chat"}
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </ChatIconButton>
        </div>
      </header>

      <div className="chat-messages" role="log" aria-live="polite">
        {chatBlocked ? (
          <div className="chat-setup-banner">
            <strong>Catalog assistant unavailable</strong>
            <pre className="chat-setup-instructions">{chatHealth.message}</pre>
          </div>
        ) : null}
        {!chatBlocked && messages.length === 0 ? (
          <div className="chat-empty">
            <p>
              Use Agent, Plan, or Ask mode to get help with Upload, Review &amp; Publish,
              DG Import, CatalogOne MCP tools, or your connected environment.
            </p>
            <ul>
              <li>How do I upload a zip and review changes before publishing?</li>
              <li>How does DG Import load Actions and Reasons from Excel?</li>
              <li>Am I connected to CatalogOne, and which MCP tools are available?</li>
            </ul>
          </div>
        ) : null}
        {!chatBlocked
          ? messages.map((message) => (
            <ChatMessage key={message.id} message={message} messageChatModes={messageChatModes} />
          ))
          : null}
        {isBusy ? <div className="chat-typing">Thinking…</div> : null}
        {sendBlocked && !isBusy ? (
          <div className="chat-typing chat-handoff-notice">Waiting for the current agent run to finish…</div>
        ) : null}
        {error ? <div className="chat-error">{formatClientError(error)}</div> : null}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={onSubmit}>
        <div className="chat-composer-box">
          <ChatAttachmentChips attachments={attachments} onRemove={removeAttachment} />
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={2}
            placeholder={composerPlaceholder(selectedMode, chatBlocked)}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
            }}
            disabled={isBusy || chatBlocked || sendBlocked}
          />
          <div className="chat-composer-toolbar">
            <div className="chat-composer-toolbar-left">
              <ChatModeSelect
                selectedMode={selectedMode}
                onChange={handleModeChange}
                disabled={isBusy || chatBlocked}
              />
              <ChatModelSelect
                selectedModel={selectedModel}
                onChange={handleModelChange}
                models={chatHealth.models}
                defaultModel={chatHealth.defaultModel}
                disabled={isBusy || chatBlocked}
              />
            </div>
            <div className="chat-composer-toolbar-right">
              <ChatContextUsage breakdown={contextBreakdown} budget={contextBudget} />
              <input
                ref={fileInputRef}
                type="file"
                className="visually-hidden"
                multiple
                accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.json,.csv,.xml,.yaml,.yml,.log,.py,.js,.ts,.jsx,.tsx"
                onChange={(event) => {
                  handleAttachFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="chat-composer-icon-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || chatBlocked || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach, paste, or drop file or image"
                title="Attach, paste, or drop file or image"
              >
                <PaperclipIcon />
              </button>
              <button
                type="submit"
                className={`chat-composer-send${canSend ? " is-ready" : ""}`}
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
                </svg>
              </button>
            </div>
          </div>
          {attachError ? <div className="chat-attachment-error">{attachError}</div> : null}
        </div>
      </form>
    </aside>
  );
}

function openChatPopup(outerWidth, outerHeight, left, top, sessionId) {
  const popupWidth = outerWidth;
  const popupHeight = outerHeight;
  const features = [
    "popup=yes",
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  return window.open(`/chat?s=${sessionId}`, CHAT_POPUP_NAME, features);
}

function useAgentCloseGuard({ localBusyRef, remoteBusyRef }) {
  useEffect(() => {
    const warnBeforeClose = (event) => {
      if (!localBusyRef.current && !remoteBusyRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "An agent is still working. Close this page anyway?";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [localBusyRef, remoteBusyRef]);
}

function ChatApp() {
  const chatHealth = useChatHealth();
  const [open, setOpen] = useState(false);
  const [popupActive, setPopupActive] = useState(false);
  const [keepAliveBusy, setKeepAliveBusy] = useState(false);
  const popupRef = useRef(null);
  const channelRef = useRef(null);
  const popupActiveRef = useRef(false);
  const localBusyRef = useRef(false);
  const remoteBusyRef = useRef(false);

  const chatSession = useCatalogChatSession({ channelRef, windowRole: "main" });

  useEffect(() => {
    popupActiveRef.current = popupActive;
  }, [popupActive]);

  useEffect(() => {
    localBusyRef.current = chatSession.isBusy;
    setKeepAliveBusy(chatSession.isBusy);
  }, [chatSession.isBusy]);

  useAgentCloseGuard({ localBusyRef, remoteBusyRef });

  const attachDetachedChat = useCallback(() => {
    channelRef.current?.postMessage({ type: "popup-attach" });
    setPopupActive(false);
    popupRef.current = null;
    setOpen(true);
    window.focus();
  }, []);

  useEffect(() => {
    const onCloseChat = () => setOpen(false);
    window.addEventListener("catalogTool:close-chat", onCloseChat);
    return () => window.removeEventListener("catalogTool:close-chat", onCloseChat);
  }, []);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHAT_POPUP_CHANNEL);
    const channel = channelRef.current;
    channel.onmessage = (event) => {
      if (event.data?.type === "popup-opened") {
        setPopupActive(true);
        setOpen(false);
      }
      if (event.data?.type === "popup-closed") {
        setPopupActive(false);
        popupRef.current = null;
      }
      if (event.data?.type === "popup-attach") {
        attachDetachedChat();
      }
      if (event.data?.type === "chat-busy" && event.data.sender) {
        remoteBusyRef.current = Boolean(event.data.busy);
      }
      if (event.data?.type === "chat-handoff-complete") {
        setKeepAliveBusy(false);
      }
    };
    return () => channel.close();
  }, [attachDetachedChat]);

  useEffect(() => {
    if (!popupActive || !chatSession.isBusy) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (!chatSession.isBusy && popupActive) {
        channelRef.current?.postMessage({
          type: "chat-handoff",
          messages: chatSession.messages,
          selectedModel: chatSession.selectedModel,
          selectedMode: chatSession.selectedMode,
        });
        channelRef.current?.postMessage({ type: "chat-handoff-complete" });
        setKeepAliveBusy(false);
      }
    }, 300);

    return () => window.clearInterval(intervalId);
  }, [popupActive, chatSession.isBusy, chatSession.messages, chatSession.selectedModel, chatSession.selectedMode]);

  useEffect(() => {
    const closeDetachedOnExit = () => {
      if (!popupActiveRef.current) {
        return;
      }
      try {
        popupRef.current?.close();
      } catch {
        // Ignore if the popup reference is unavailable.
      }
      channelRef.current?.postMessage({ type: "main-closed" });
    };

    window.addEventListener("pagehide", closeDetachedOnExit);
    return () => window.removeEventListener("pagehide", closeDetachedOnExit);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setPopupActive(false);
        channelRef.current?.postMessage({ type: "popup-closed" });
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const handlePopOut = useCallback(async () => {
    const existing = popupRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    if (popupActive && !chatSession.isBusy) {
      channelRef.current?.postMessage({ type: "focus-request" });
      return;
    }

    writeChatSession({
      messages: chatSession.messages,
      selectedModel: chatSession.selectedModel,
      selectedMode: chatSession.selectedMode,
      messageModes: chatSession.messageChatModes,
    });

    const sessionId = String(Date.now());
    const { width, outerWidth, outerHeight } = readDetachedChatSize();
    const { left, top } = detachedWindowPlacement(outerWidth);
    storeDetachedLayout({ width, outerWidth, outerHeight, left, top });

    try {
      const response = await fetch("/api/chat/open-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          width: outerWidth,
          height: outerHeight,
          left,
          top,
          session: sessionId,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload.opened) {
          setPopupActive(true);
          setOpen(false);
          channelRef.current?.postMessage({ type: "popup-opened" });
          channelRef.current?.postMessage({
            type: "chat-sync",
            messages: chatSession.messages,
            selectedModel: chatSession.selectedModel,
            selectedMode: chatSession.selectedMode,
            status: chatSession.status,
            messageModes: chatSession.messageChatModes,
            windowRole: "main",
          });
          return;
        }
      }
    } catch {
      // Fall back to a regular browser popup below.
    }

    const popup = openChatPopup(outerWidth, outerHeight, left, top, sessionId);
    if (!popup) {
      window.alert("Allow pop-ups for this site to open chat in a separate window.");
      return;
    }
    popupRef.current = popup;
    setPopupActive(true);
    setOpen(false);
    channelRef.current?.postMessage({ type: "popup-opened" });
    channelRef.current?.postMessage({
      type: "chat-sync",
      messages: chatSession.messages,
      selectedModel: chatSession.selectedModel,
      selectedMode: chatSession.selectedMode,
      status: chatSession.status,
      messageModes: chatSession.messageChatModes,
      windowRole: "main",
    });
  }, [chatSession, popupActive]);

  const handleAttachFromMain = useCallback(() => {
    if (!popupActive) {
      return;
    }
    attachDetachedChat();
  }, [attachDetachedChat, popupActive]);

  const handleBusyChange = useCallback((busy) => {
    setKeepAliveBusy(busy);
    localBusyRef.current = busy;
  }, []);

  useEffect(() => {
    const attachBtn = document.getElementById("chatAttachBtn");
    if (!attachBtn) {
      return undefined;
    }
    attachBtn.hidden = !popupActive;
    attachBtn.disabled = !popupActive;
    const onAttach = () => handleAttachFromMain();
    attachBtn.addEventListener("click", onAttach);
    return () => attachBtn.removeEventListener("click", onAttach);
  }, [popupActive, handleAttachFromMain]);

  useEffect(() => {
    const toggleBtn = document.getElementById("chatToggleBtn");
    if (!toggleBtn) {
      return undefined;
    }
    const onToggle = () => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.focus();
        return;
      }
      if (popupActive) {
        channelRef.current?.postMessage({ type: "focus-request" });
        return;
      }
      setOpen((value) => !value);
    };
    toggleBtn.addEventListener("click", onToggle);
    return () => toggleBtn.removeEventListener("click", onToggle);
  }, [popupActive]);

  useEffect(() => {
    const toggleBtn = document.getElementById("chatToggleBtn");
    if (!toggleBtn) {
      return;
    }
    toggleBtn.classList.toggle("is-active", open || popupActive);
    toggleBtn.setAttribute("aria-pressed", open || popupActive ? "true" : "false");
  }, [open, popupActive]);

  useEffect(() => {
    if (!open || popupActive) {
      return undefined;
    }

    const onPointerDown = (event) => {
      const panel = document.querySelector("aside.chat-panel:not(.chat-panel-popup):not(.chat-panel-hidden)");
      if (!panel) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (panel.contains(target)) {
        return;
      }

      const toggleBtn = document.getElementById("chatToggleBtn");
      if (toggleBtn?.contains(target)) {
        return;
      }

      const attachBtn = document.getElementById("chatAttachBtn");
      if (attachBtn?.contains(target)) {
        return;
      }

      const openDialog = document.querySelector("dialog[open]");
      if (openDialog?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, popupActive]);

  const showDockedPanel = open || (popupActive && keepAliveBusy);
  const chatDockedVisible = open && !popupActive;

  useEffect(() => {
    document.body.classList.toggle("is-chat-docked", chatDockedVisible);
    if (!chatDockedVisible) {
      window.catalogToolLayoutCouple?.releaseWorkflowMainPin?.();
    }
    return () => document.body.classList.remove("is-chat-docked");
  }, [chatDockedVisible]);

  return (
    <ChatPanel
      open={showDockedPanel}
      visuallyHidden={popupActive}
      onClose={() => setOpen(false)}
      mode="docked"
      onPopOut={handlePopOut}
      popupActive={popupActive}
      chatHealth={chatHealth}
      chatSession={chatSession}
      onBusyChange={handleBusyChange}
      sendBlocked={chatSession.sendBlocked}
    />
  );
}

function ChatPopupApp() {
  const chatHealth = useChatHealth();
  const channelRef = useRef(null);
  const localBusyRef = useRef(false);
  const remoteBusyRef = useRef(false);

  const chatSession = useCatalogChatSession({ channelRef, windowRole: "popup" });

  useAgentCloseGuard({ localBusyRef, remoteBusyRef });

  useEffect(() => {
    localBusyRef.current = chatSession.isBusy;
  }, [chatSession.isBusy]);

  useEffect(() => {
    document.title = DETACHED_CHAT_WINDOW_TITLE;
    const layout = readDetachedLayout();
    const cleanupLayout = applyDetachedWindowLayout(layout);

    channelRef.current = new BroadcastChannel(CHAT_POPUP_CHANNEL);
    const channel = channelRef.current;
    channel.onmessage = (event) => {
      if (event.data?.type === "focus-request") {
        window.focus();
      }
      if (event.data?.type === "popup-attach") {
        window.close();
      }
      if (event.data?.type === "main-closed") {
        window.close();
      }
      if (event.data?.type === "chat-busy") {
        remoteBusyRef.current = Boolean(event.data.busy);
      }
    };
    channel.postMessage({ type: "popup-opened" });
    const onUnload = () => {
      channelRef.current?.postMessage({ type: "popup-closed" });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cleanupLayout();
      window.removeEventListener("beforeunload", onUnload);
      channel.postMessage({ type: "popup-closed" });
      channel.close();
    };
  }, [chatSession]);

  const handleAttach = useCallback(() => {
    channelRef.current?.postMessage({ type: "popup-attach" });
    window.close();
  }, []);

  const handleBusyChange = useCallback((busy) => {
    localBusyRef.current = busy;
  }, []);

  return (
    <ChatPanel
      open
      mode="popup"
      onClose={() => window.close()}
      onAttach={handleAttach}
      chatHealth={chatHealth}
      chatSession={chatSession}
      onBusyChange={handleBusyChange}
      sendBlocked={chatSession.sendBlocked}
    />
  );
}

const mount = document.getElementById("chatRoot");
if (mount) {
  const mode = mount.dataset.chatMode || "embedded";

  function isAgenticEnabled() {
    return window.catalogTool?.useAgentic !== false
      && document.body?.dataset?.useAgentic !== "false";
  }

  let chatRoot = null;

  function renderChat() {
    if (chatRoot || !isAgenticEnabled()) {
      return;
    }
    mount.hidden = false;
    chatRoot = createRoot(mount);
    chatRoot.render(mode === "popup" ? <ChatPopupApp /> : <ChatApp />);
  }

  function mountChatApp() {
    if (!isAgenticEnabled()) {
      mount.hidden = true;
      return;
    }
    mount.hidden = false;
    if (chatRoot) {
      return;
    }

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(renderChat, { timeout: 1500 });
    } else {
      window.setTimeout(renderChat, 50);
    }
  }

  mountChatApp();
  document.getElementById("chatToggleBtn")?.addEventListener("click", renderChat, { capture: true });
  window.addEventListener("catalogTool:agentic-changed", (event) => {
    if (event.detail?.enabled) {
      mountChatApp();
      return;
    }
    mount.hidden = true;
  });
}
