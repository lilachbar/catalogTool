import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  buildContextUsageBreakdown,
  CHAT_MODES,
  ChatComposer,
  ChatHeader,
  ChatMessage,
  DEFAULT_CONTEXT_BASELINES,
} from "../ui/islands/chat/primitives";
import { useAgentCloseGuard, useChatHealth } from "../ui/islands/chat/hooks";
import {
  attachmentToFilePart,
  composerPlaceholder,
  estimateMessagesTokens,
  estimateTokenCount,
  extractPasteFiles,
  formatChatModeLabel,
  formatClientError,
  MAX_ATTACHMENTS,
  readAttachmentFile,
  resolveContextBudget,
  resolveMessageChatMode,
  useCatalogChatSession,
  writeChatSession,
} from "../ui/islands/chat/session";

const CHAT_WIDTH_STORAGE_KEY = "catalogTool.chatPanelWidth";
const CHAT_DETACHED_LAYOUT_KEY = "catalogTool.detachedLayout";
const CHAT_POPUP_CHANNEL = "catalog-tool-chat";
const CHAT_POPUP_NAME = "catalogToolChatPopup";
const DETACHED_CHAT_WINDOW_TITLE = "Catalog Tool · Chat";
const CHAT_WIDTH_MIN = 220;
const CHAT_WIDTH_MAX = 520;
const CHAT_WIDTH_PERCENT_DEFAULT = 0.2;
const CHAT_WIDTH_CUSTOMIZED_KEY = "catalogTool.chatPanelWidthCustomized";
const CHAT_DETACHED_HEIGHT_MIN = 320;
const CHAT_APP_TOP_CHROME = 28;
function clampChatWidth(width, viewportWidth = window.innerWidth) {
  const max = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, viewportWidth - 80));
  return Math.min(max, Math.max(CHAT_WIDTH_MIN, width));
}

function clampDetachedHeight(height) {
  const max = Math.max(CHAT_DETACHED_HEIGHT_MIN, window.screen.availHeight - 24);
  return Math.min(max, Math.max(CHAT_DETACHED_HEIGHT_MIN, height));
}

function readAppShellPaddingRight() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--app-shell-padding").trim();
  if (!value) {
    return 14;
  }
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.paddingRight = value;
  document.body.appendChild(probe);
  const pixels = Number.parseFloat(getComputedStyle(probe).paddingRight) || 14;
  probe.remove();
  return pixels;
}

function proposedChatWidthFromPointer(clientX, viewportWidth = window.innerWidth, inset = readAppShellPaddingRight()) {
  return viewportWidth - inset - clientX;
}

function computeDefaultChatWidth(viewportWidth = window.innerWidth) {
  const layout = window.catalogToolLayoutCouple;
  if (layout?.computeDefaultChatWidth) {
    return layout.computeDefaultChatWidth(viewportWidth);
  }
  return clampChatWidth(Math.round(viewportWidth * CHAT_WIDTH_PERCENT_DEFAULT), viewportWidth);
}

function readSavedChatWidth() {
  const layout = window.catalogToolLayoutCouple;
  if (layout) {
    return layout.readChatWidth();
  }
  const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    return clampChatWidth(saved);
  }
  return computeDefaultChatWidth();
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
  const dragWidthRef = useRef(null);
  const dragRafRef = useRef(null);
  const dragInsetRef = useRef(null);
  const latestClientXRef = useRef(null);

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

  const persistPanelWidth = useCallback((width, { persist = true } = {}) => {
    const layout = window.catalogToolLayoutCouple;
    if (layout) {
      const { chatWidth } = layout.applyChatPanelWidth(width, { persist });
      setPanelWidth(chatWidth);
      return chatWidth;
    }
    const next = clampChatWidth(width);
    setPanelWidth(next);
    if (persist) {
      localStorage.setItem(CHAT_WIDTH_CUSTOMIZED_KEY, "true");
      localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
    }
    return next;
  }, []);

  const setPanelWidthLive = useCallback((width) => {
    const layout = window.catalogToolLayoutCouple;
    const next = layout?.setChatPanelWidthLive
      ? layout.setChatPanelWidthLive(width)
      : clampChatWidth(width);
    dragWidthRef.current = next;
    return next;
  }, []);

  useEffect(() => {
    const layout = window.catalogToolLayoutCouple;
    if (!layout) {
      return undefined;
    }
    const onLayoutCouple = (event) => {
      const { source, chatWidth } = event.detail || {};
      if ((source === "workflow" || source === "layout") && Number.isFinite(chatWidth)) {
        setPanelWidth(chatWidth);
      }
    };
    document.addEventListener(layout.LAYOUT_COUPLE_EVENT, onLayoutCouple);
    return () => document.removeEventListener(layout.LAYOUT_COUPLE_EVENT, onLayoutCouple);
  }, []);

  useEffect(() => {
    if (!open || isPopup) {
      return undefined;
    }
    const next = readSavedChatWidth();
    setPanelWidth(next);
    document.documentElement.style.setProperty("--chat-panel-width", `${next}px`);
  }, [isPopup, open]);

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

    const stopWidthDrag = (event) => {
      if (!widthDraggingRef.current) {
        return;
      }
      widthDraggingRef.current = false;
      resizer.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-chat-panel");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopWidthDrag);
      document.removeEventListener("pointercancel", stopWidthDrag);
      window.removeEventListener("blur", stopWidthDrag);
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (event?.pointerId != null && resizer.hasPointerCapture?.(event.pointerId)) {
        try {
          resizer.releasePointerCapture(event.pointerId);
        } catch {
          // ignore release failures
        }
      }
      const finalWidth = dragWidthRef.current ?? readSavedChatWidth();
      persistPanelWidth(finalWidth, { persist: true });
    };

    const applyDragFrame = () => {
      dragRafRef.current = null;
      if (!widthDraggingRef.current || latestClientXRef.current == null) {
        return;
      }
      // Use the latest pointer position (not the first sample of the frame) and
      // a cached shell inset so the panel tracks the cursor without lag or a
      // per-frame DOM probe / forced reflow.
      setPanelWidthLive(
        proposedChatWidthFromPointer(latestClientXRef.current, window.innerWidth, dragInsetRef.current),
      );
    };

    const onPointerMove = (event) => {
      if (!widthDraggingRef.current) {
        return;
      }
      latestClientXRef.current = event.clientX;
      if (dragRafRef.current) {
        return;
      }
      dragRafRef.current = requestAnimationFrame(applyDragFrame);
    };

    const onPointerDown = (event) => {
      if (window.matchMedia("(max-width: 900px)").matches || event.button !== 0) {
        return;
      }
      window.catalogToolLayoutCouple?.releaseWorkflowMainPin?.();
      dragInsetRef.current = readAppShellPaddingRight();
      latestClientXRef.current = event.clientX;
      dragWidthRef.current = panelWidth;
      widthDraggingRef.current = true;
      resizer.classList.add("is-dragging");
      document.body.classList.add("is-resizing-chat-panel");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopWidthDrag);
      document.addEventListener("pointercancel", stopWidthDrag);
      window.addEventListener("blur", stopWidthDrag);
      try {
        resizer.setPointerCapture(event.pointerId);
      } catch {
        // pointer capture is optional; document listeners handle cleanup
      }
      event.preventDefault();
    };

    const onKeyDown = (event) => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        return;
      }
      const step = event.shiftKey ? 20 : 8;
      if (event.key === "ArrowLeft") {
        persistPanelWidth(panelWidth + step);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        persistPanelWidth(panelWidth - step);
        event.preventDefault();
      }
    };

    resizer.addEventListener("pointerdown", onPointerDown);
    resizer.addEventListener("keydown", onKeyDown);

    return () => {
      resizer.removeEventListener("pointerdown", onPointerDown);
      resizer.removeEventListener("keydown", onKeyDown);
      stopWidthDrag();
    };
  }, [isPopup, open, panelWidth, persistPanelWidth, setPanelWidthLive]);

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
  // The docked panel intentionally does NOT set an inline --chat-panel-width.
  // It inherits the value from :root, which is the single source of truth kept
  // live during a drag by setChatPanelWidthLive (and otherwise by the
  // panel-width effect). This keeps the panel and the .app-main padding in
  // lockstep on every pointer move, matching the env sidebar's resize. The
  // popup runs in a separate window with no :root variable and no resizer, so
  // it still needs the inline width.
  const panelStyle = isPopup ? { "--chat-panel-width": `${panelWidth}px` } : undefined;

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

      <ChatHeader
        isPopup={isPopup}
        popupActive={popupActive}
        onAttach={onAttach}
        onPopOut={onPopOut}
        onClose={onClose}
      />

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
          ? messages.map((message) => {
            const chatMode = resolveMessageChatMode(message, messageChatModes);
            return (
              <ChatMessage
                key={message.id}
                message={message}
                chatMode={chatMode}
                roleLabel={formatChatModeLabel(chatMode)}
              />
            );
          })
          : null}
        {isBusy ? <div className="chat-typing">Thinking…</div> : null}
        {sendBlocked && !isBusy ? (
          <div className="chat-typing chat-handoff-notice">Waiting for the current agent run to finish…</div>
        ) : null}
        {error ? <div className="chat-error">{formatClientError(error)}</div> : null}
        <div ref={messagesEndRef} />
      </div>

      <ChatComposer
        onSubmit={onSubmit}
        inputRef={inputRef}
        fileInputRef={fileInputRef}
        placeholder={composerPlaceholder(selectedMode, chatBlocked)}
        input={input}
        onInputChange={setInput}
        attachments={attachments}
        onRemoveAttachment={removeAttachment}
        onAttachFiles={handleAttachFiles}
        selectedMode={selectedMode}
        onModeChange={handleModeChange}
        modes={CHAT_MODES}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        models={chatHealth.models}
        defaultModel={chatHealth.defaultModel}
        contextBreakdown={contextBreakdown}
        contextBudget={contextBudget}
        attachError={attachError}
        canSend={canSend}
        isBusy={isBusy}
        chatBlocked={chatBlocked}
        sendBlocked={sendBlocked}
        maxAttachments={MAX_ATTACHMENTS}
      />
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
