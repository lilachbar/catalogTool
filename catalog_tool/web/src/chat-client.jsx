import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CHAT_WIDTH_STORAGE_KEY = "catalogTool.chatPanelWidth";
const CHAT_DETACHED_LAYOUT_KEY = "catalogTool.detachedLayout";
const CHAT_POPUP_CHANNEL = "catalog-tool-chat";
const CHAT_POPUP_NAME = "catalogToolChatPopup";
const DETACHED_CHAT_WINDOW_TITLE = "Catalog Tool · Chat";
const CHAT_WIDTH_MIN = 320;
const CHAT_WIDTH_MAX = 900;
const CHAT_WIDTH_DEFAULT = 420;
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

function readSavedChatWidth() {
  const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    return clampChatWidth(saved);
  }
  return CHAT_WIDTH_DEFAULT;
}

function readCurrentChatPanelWidth() {
  const panel = document.querySelector("aside.chat-panel:not(.chat-panel-popup)");
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
        });
      } catch {
        if (!cancelled) {
          setHealth({
            loading: false,
            ready: false,
            message: "Could not reach the chat server. Restart with ./run_web.sh",
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

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const text = extractMessageText(message);

  return (
    <div className={`chat-message chat-message-${isUser ? "user" : "assistant"}`}>
      <div className="chat-message-role">{isUser ? "You" : "Agent"}</div>
      <div className="chat-message-body">
        <ChatMessageBody text={text} isUser={isUser} />
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
  chatHealth = { loading: false, ready: true, message: "" },
}) {
  const isPopup = mode === "popup";
  const detachedLayout = isPopup ? readDetachedLayout() : null;
  const [input, setInput] = useState("");
  const [panelWidth, setPanelWidth] = useState(() => (
    isPopup ? (detachedLayout?.width ?? readSavedChatWidth()) : readSavedChatWidth()
  ));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const resizerRef = useRef(null);
  const widthDraggingRef = useRef(false);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isBusy = status === "streaming" || status === "submitted";
  const chatBlocked = !chatHealth.loading && !chatHealth.ready;

  const persistPanelWidth = useCallback((width) => {
    const next = clampChatWidth(width);
    setPanelWidth(next);
    localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
  }, []);

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
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || isBusy) {
        return;
      }
      setInput("");
      await sendMessage({ text });
    },
    [input, isBusy, sendMessage],
  );

  if (!open && !isPopup) {
    return null;
  }

  const panelClassName = ["chat-panel", isPopup ? "chat-panel-popup" : ""].filter(Boolean).join(" ");
  const panelStyle = { "--chat-panel-width": `${panelWidth}px` };

  return (
    <aside className={panelClassName} aria-label="Catalog assistant" style={panelStyle}>
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
            <span className="chat-panel-eyebrow">Agent</span>
            <h2 className="chat-panel-title">Catalog assistant</h2>
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
            <p>Ask about CatalogOne tables, business requests, or how to use this app.</p>
            <ul>
              <li>What tables can I merge?</li>
              <li>How do I create a business request?</li>
              <li>Am I connected to CatalogOne?</li>
            </ul>
          </div>
        ) : null}
        {!chatBlocked
          ? messages.map((message) => <ChatMessage key={message.id} message={message} />)
          : null}
        {isBusy ? <div className="chat-typing">Thinking…</div> : null}
        {error ? <div className="chat-error">{formatClientError(error)}</div> : null}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          placeholder={chatBlocked ? "Configure CURSOR_API_KEY in .env to use chat" : "Ask the catalog assistant…"}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
          disabled={isBusy || chatBlocked}
        />
        <button type="submit" className="btn btn-primary" disabled={isBusy || chatBlocked || !input.trim()}>
          Send
        </button>
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

function ChatApp() {
  const chatHealth = useChatHealth();
  const [open, setOpen] = useState(false);
  const [popupActive, setPopupActive] = useState(false);
  const popupRef = useRef(null);
  const channelRef = useRef(null);
  const popupActiveRef = useRef(false);

  useEffect(() => {
    popupActiveRef.current = popupActive;
  }, [popupActive]);

  const attachDetachedChat = useCallback(() => {
    channelRef.current?.postMessage({ type: "popup-attach" });
    setPopupActive(false);
    popupRef.current = null;
    setOpen(true);
    window.focus();
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
    };
    return () => channel.close();
  }, [attachDetachedChat]);

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

    window.addEventListener("beforeunload", closeDetachedOnExit);
    window.addEventListener("pagehide", closeDetachedOnExit);
    return () => {
      window.removeEventListener("beforeunload", closeDetachedOnExit);
      window.removeEventListener("pagehide", closeDetachedOnExit);
    };
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
    if (popupActive) {
      channelRef.current?.postMessage({ type: "focus-request" });
      return;
    }

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
  }, [popupActive]);

  const handleAttachFromMain = useCallback(() => {
    if (!popupActive) {
      return;
    }
    attachDetachedChat();
  }, [attachDetachedChat, popupActive]);

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
  }, []);

  useEffect(() => {
    const toggleBtn = document.getElementById("chatToggleBtn");
    if (!toggleBtn) {
      return;
    }
    toggleBtn.classList.toggle("is-active", open || popupActive);
    toggleBtn.setAttribute("aria-pressed", open || popupActive ? "true" : "false");
  }, [open, popupActive]);

  return (
    <ChatPanel
      open={open}
      onClose={() => setOpen(false)}
      mode="docked"
      onPopOut={handlePopOut}
      popupActive={popupActive}
      chatHealth={chatHealth}
    />
  );
}

function ChatPopupApp() {
  const chatHealth = useChatHealth();
  const channelRef = useRef(null);

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
  }, []);

  const handleAttach = useCallback(() => {
    channelRef.current?.postMessage({ type: "popup-attach" });
    window.close();
  }, []);

  return (
    <ChatPanel
      open
      mode="popup"
      onClose={() => window.close()}
      onAttach={handleAttach}
      chatHealth={chatHealth}
    />
  );
}

const mount = document.getElementById("chatRoot");
if (mount) {
  const mode = mount.dataset.chatMode || "embedded";
  createRoot(mount).render(mode === "popup" ? <ChatPopupApp /> : <ChatApp />);
}
