// Typed, presentational chat primitives extracted from the legacy
// src/chat-client.jsx monolith as the first TypeScript + shadcn/lucide slice
// of the incremental migration. Behavior and class names are preserved so the
// tuned chat layout is unaffected; the hand-drawn SVG icons are upgraded to the
// shadcn-standard lucide-react set.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEventHandler, ReactNode, RefObject, SyntheticEvent } from "react";
import {
  ArrowUp,
  ChevronDown,
  ExternalLink,
  FileText,
  Infinity as InfinityIcon,
  PanelRight,
  Paperclip,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Pop the chat out into a detached window. */
export function DetachIcon() {
  return <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />;
}

/** Dock/attach the chat back into the main window. */
export function AttachIcon() {
  return <PanelRight size={15} strokeWidth={2} aria-hidden="true" />;
}

/** Attachment affordance in the composer. */
export function PaperclipIcon() {
  return <Paperclip size={16} strokeWidth={2} aria-hidden="true" />;
}

export interface ChatIconButtonProps {
  label: string;
  title?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
}

export function ChatIconButton({
  label,
  title,
  onClick,
  disabled = false,
  children,
}: ChatIconButtonProps) {
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

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  pre: ({ children }) => <pre className="chat-code-block">{children}</pre>,
  code: ({ className, children, node: _node, ...props }) => {
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
};

export interface ChatMessageBodyProps {
  text?: string;
  isUser?: boolean;
}

export function ChatMessageBody({ text, isUser }: ChatMessageBodyProps) {
  if (!text) {
    return <>…</>;
  }

  if (isUser) {
    return <div className="chat-message-plain">{text}</div>;
  }

  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export interface ChatAttachment {
  id: string;
  kind?: string;
  previewUrl?: string | null;
  name: string;
}

export interface ChatAttachmentChipsProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}

/** Pending-attachment chips shown above the composer. */
export function ChatAttachmentChips({
  attachments,
  onRemove,
}: ChatAttachmentChipsProps) {
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
            <FileText
              className="chat-attachment-file-icon"
              size={14}
              strokeWidth={2}
              aria-hidden="true"
            />
          )}
          <span className="chat-attachment-name" title={attachment.name}>
            {attachment.name}
          </span>
          <button
            type="button"
            className="chat-attachment-remove inline-flex items-center"
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.name}`}
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

export interface AttachmentPreview {
  filename?: string;
  downloadUrl?: string | null;
  blobUrl?: string | null;
  kind?: string;
  url?: string;
  content?: string | null;
}

export interface ChatAttachmentPreviewDialogProps {
  preview: AttachmentPreview | null;
  onClose: () => void;
}

/** Full attachment preview (image or text) in a shadcn/Radix modal dialog. */
export function ChatAttachmentPreviewDialog({
  preview,
  onClose,
}: ChatAttachmentPreviewDialogProps) {
  const downloadUrl = preview?.downloadUrl || preview?.blobUrl || undefined;

  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3 text-left">
          <DialogTitle className="truncate text-[0.9375rem] font-semibold leading-tight">
            {preview?.filename || "Attached file"}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {downloadUrl ? (
              <a
                className="btn btn-ghost btn-sm"
                href={downloadUrl}
                download={preview?.filename || "attachment"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            ) : null}
            <DialogClose asChild>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Close preview"
              >
                Close
              </button>
            </DialogClose>
          </div>
        </DialogHeader>
        {preview?.kind === "image" ? (
          <div className="flex items-start justify-center overflow-auto bg-muted p-4">
            <img
              src={preview.url}
              alt={preview.filename || "Attached image"}
              className="block max-h-[min(70vh,720px)] max-w-full rounded-lg object-contain"
            />
          </div>
        ) : (
          <pre className="m-0 max-h-[min(70vh,640px)] overflow-auto p-4 font-mono text-[0.8125rem]">
            {preview?.content || ""}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface MessageFilePart {
  type?: string;
  mediaType?: string;
  filename?: string;
  url?: string;
}

export interface MessagePart extends MessageFilePart {
  text?: string;
}

export interface ChatMessageData {
  id?: string;
  role?: string;
  parts?: MessagePart[];
  content?: string;
}

export function extractMessageFileParts(message: ChatMessageData): MessageFilePart[] {
  return (message.parts ?? []).filter((part) => part.type === "file");
}

export function extractMessageText(message: ChatMessageData): string {
  let text = "";
  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      text += part.text ?? "";
    }
  }
  if (!text && typeof message.content === "string") {
    text = message.content;
  }
  return text;
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function isTextLikeFilePart(part: MessageFilePart): boolean {
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

function decodeFilePartContent(part: MessageFilePart): string | null {
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

function openFilePartInNewTab(part: MessageFilePart): void {
  if (!part.url) {
    return;
  }
  window.open(part.url, "_blank", "noopener,noreferrer");
}

export interface ChatMessageAttachmentsProps {
  parts: MessageFilePart[];
}

/** Attachments rendered inside a sent message; opens the preview modal. */
export function ChatMessageAttachments({ parts }: ChatMessageAttachmentsProps) {
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);

  useEffect(
    () => () => {
      if (preview?.blobUrl) {
        URL.revokeObjectURL(preview.blobUrl);
      }
    },
    [preview],
  );

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.blobUrl) {
        URL.revokeObjectURL(current.blobUrl);
      }
      return null;
    });
  }, []);

  const openPart = useCallback((part: MessageFilePart) => {
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
          const label =
            part.filename ||
            (part.mediaType?.startsWith("image/") ? "Attached image" : "Attached file");

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
              <FileText
                className="chat-message-attachment-icon"
                size={14}
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="chat-message-attachment-name">{label}</span>
            </button>
          );
        })}
      </div>
      <ChatAttachmentPreviewDialog preview={preview} onClose={closePreview} />
    </>
  );
}

const ATTACHMENT_PLACEHOLDER_RE = /^(See attached files\.|See attached context\.)$/;

export interface ChatMessageProps {
  message: ChatMessageData;
  /** Resolved mode id for styling (e.g. "agent" | "plan" | "ask"). */
  chatMode: string;
  /** Display label shown as the message role (e.g. "AGENT"). */
  roleLabel: string;
}

/** A single chat message (role label, attachments, markdown/plain body). */
export function ChatMessage({ message, chatMode, roleLabel }: ChatMessageProps) {
  const isUser = message.role === "user";
  const fileParts = extractMessageFileParts(message);
  const rawText = extractMessageText(message);
  const text =
    fileParts.length && ATTACHMENT_PLACEHOLDER_RE.test(rawText) ? "" : rawText;

  return (
    <div
      className={`chat-message chat-message-${isUser ? "user" : "assistant"} chat-message-mode-${chatMode}`}
    >
      <div className="chat-message-role">{roleLabel}</div>
      <div className="chat-message-body">
        <ChatMessageAttachments parts={fileParts} />
        {text || !fileParts.length ? (
          <ChatMessageBody text={text} isUser={isUser} />
        ) : null}
      </div>
    </div>
  );
}

export interface ContextCategory {
  id: string;
  label: string;
  color: string;
}

export interface ContextUsageItem extends ContextCategory {
  tokens: number;
}

export interface ContextBreakdown {
  items: ContextUsageItem[];
  total: number;
}

export type ContextBaselines = Record<string, number>;

const CONTEXT_USAGE_CATEGORIES: ContextCategory[] = [
  { id: "systemPrompt", label: "System prompt", color: "#a1a1aa" },
  { id: "toolDefinitions", label: "Tool definitions", color: "#a855f7" },
  { id: "rules", label: "Rules", color: "#22c55e" },
  { id: "skills", label: "Skills", color: "#ca8a04" },
  { id: "mcp", label: "MCP", color: "#ec4899" },
  { id: "subagentDefinitions", label: "Subagent definitions", color: "#2563eb" },
  { id: "summarizedConversation", label: "Summarized conversation", color: "#ef4444" },
  { id: "conversation", label: "Conversation", color: "#06b6d4" },
];

export const DEFAULT_CONTEXT_BASELINES: ContextBaselines = {
  systemPrompt: 462,
  toolDefinitions: 6700,
  rules: 0,
  skills: 0,
  mcp: 746,
  subagentDefinitions: 0,
  summarizedConversation: 0,
};

function formatCompactTokens(value: number): string {
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

export function buildContextUsageBreakdown({
  baselines = DEFAULT_CONTEXT_BASELINES,
  conversationTokens = 0,
  summarizedConversationTokens = 0,
}: {
  baselines?: ContextBaselines;
  conversationTokens?: number;
  summarizedConversationTokens?: number;
}): ContextBreakdown {
  const items = CONTEXT_USAGE_CATEGORIES.map((category): ContextUsageItem => {
    if (category.id === "conversation") {
      return { ...category, tokens: conversationTokens };
    }
    if (category.id === "summarizedConversation") {
      return {
        ...category,
        tokens: summarizedConversationTokens || baselines.summarizedConversation || 0,
      };
    }
    return { ...category, tokens: baselines[category.id] || 0 };
  }).filter((item) => item.tokens > 0);

  const total = items.reduce((sum, item) => sum + item.tokens, 0);
  return { items, total };
}

export interface ChatContextUsageProps {
  breakdown: ContextBreakdown;
  budget: number;
}

/** Composer context-usage ring + popover (token budget breakdown). */
export function ChatContextUsage({ breakdown, budget }: ChatContextUsageProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
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

    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
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
              className="chat-context-usage-close inline-flex items-center"
              onClick={() => setOpen(false)}
              aria-label="Close context usage"
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
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

export interface ChatModeOption {
  id: string;
  label: string;
  hint?: string;
}

/** Canonical chat modes (single source of truth for UI + session/health logic). */
export const CHAT_MODES: ChatModeOption[] = [
  { id: "agent", label: "Agent", hint: "Use MCP tools to act on CatalogOne" },
  { id: "plan", label: "Plan", hint: "Plan catalog changes before executing" },
  { id: "ask", label: "Ask", hint: "Answer questions without running tools" },
];

export interface ChatModeSelectProps {
  selectedMode: string;
  onChange: (mode: string) => void;
  modes: ChatModeOption[];
  disabled?: boolean;
}

/** Composer "mode" pill (Agent / Plan / Ask) — native select for a11y, styled overlay. */
export function ChatModeSelect({
  selectedMode,
  onChange,
  modes,
  disabled,
}: ChatModeSelectProps) {
  const current = modes.find((mode) => mode.id === selectedMode) ?? modes[0];

  return (
    <label className="chat-composer-pill chat-composer-mode-pill" title={current?.hint}>
      <InfinityIcon
        className="chat-composer-pill-icon"
        size={13}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="chat-composer-mode-label">{current?.label}</span>
      <select
        className="chat-composer-select-overlay"
        value={selectedMode}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Chat mode"
      >
        {modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="chat-composer-chevron"
        size={12}
        strokeWidth={2}
        aria-hidden="true"
      />
    </label>
  );
}

export interface ChatModelOption {
  id: string;
  label?: string;
}

export interface ChatModelSelectProps {
  selectedModel: string;
  onChange: (model: string) => void;
  models: ChatModelOption[];
  defaultModel?: string | null;
  disabled?: boolean;
}

/** Composer "model" pill — Auto + configured models via a native select. */
export function ChatModelSelect({
  selectedModel,
  onChange,
  models,
  defaultModel,
  disabled,
}: ChatModelSelectProps) {
  const resolvedModel =
    selectedModel === "auto"
      ? defaultModel || "Auto"
      : models.find((entry) => entry.id === selectedModel)?.label || selectedModel;

  return (
    <label
      className="chat-composer-model"
      title={defaultModel ? `Automatic uses ${defaultModel}` : "Select AI model"}
    >
      <span className="chat-composer-model-label">
        {selectedModel === "auto" ? "Auto" : resolvedModel}
      </span>
      <select
        className="chat-composer-select-overlay"
        value={selectedModel}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="AI model"
      >
        <option value="auto">Auto</option>
        {models.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label || entry.id}
          </option>
        ))}
      </select>
      <ChevronDown
        className="chat-composer-chevron"
        size={12}
        strokeWidth={2}
        aria-hidden="true"
      />
    </label>
  );
}

export interface ChatComposerProps {
  onSubmit: (event: SyntheticEvent) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  input: string;
  onInputChange: (value: string) => void;
  attachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  onAttachFiles: (files: FileList | null) => void;
  selectedMode: string;
  onModeChange: (mode: string) => void;
  modes: ChatModeOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: ChatModelOption[];
  defaultModel?: string | null;
  contextBreakdown: ContextBreakdown;
  contextBudget: number;
  attachError?: string;
  canSend: boolean;
  isBusy: boolean;
  chatBlocked: boolean;
  sendBlocked: boolean;
  maxAttachments: number;
}

/** The message composer: textarea, mode/model/context toolbar, attach + send. */
export function ChatComposer({
  onSubmit,
  inputRef,
  fileInputRef,
  placeholder,
  input,
  onInputChange,
  attachments,
  onRemoveAttachment,
  onAttachFiles,
  selectedMode,
  onModeChange,
  modes,
  selectedModel,
  onModelChange,
  models,
  defaultModel,
  contextBreakdown,
  contextBudget,
  attachError,
  canSend,
  isBusy,
  chatBlocked,
  sendBlocked,
  maxAttachments,
}: ChatComposerProps) {
  return (
    <form className="chat-composer" onSubmit={(event) => onSubmit(event)}>
      <div className="chat-composer-box">
        <ChatAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          placeholder={placeholder}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
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
              onChange={onModeChange}
              modes={modes}
              disabled={isBusy || chatBlocked}
            />
            <ChatModelSelect
              selectedModel={selectedModel}
              onChange={onModelChange}
              models={models}
              defaultModel={defaultModel}
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
                onAttachFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="chat-composer-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || chatBlocked || attachments.length >= maxAttachments}
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
              <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        </div>
        {attachError ? <div className="chat-attachment-error">{attachError}</div> : null}
      </div>
    </form>
  );
}

export interface ChatHeaderProps {
  /** Popup window vs. docked panel — switches branding + attach control. */
  isPopup: boolean;
  /** Detached popup already open (kept for popup-mode wiring compatibility). */
  popupActive?: boolean;
  onAttach: () => void;
  onClose: () => void;
}

/** Chat panel header: brand/title + attach (popup only) + close controls. */
export function ChatHeader({
  isPopup,
  onAttach,
  onClose,
}: ChatHeaderProps) {
  return (
    <header className={`chat-panel-head${isPopup ? " chat-popup-head" : ""}`}>
      {isPopup ? (
        <div className="chat-popup-brand">
          <img
            className="chat-popup-brand-logo"
            src="/static/logo.svg"
            width="32"
            height="32"
            alt=""
          />
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
        ) : null}
        <ChatIconButton
          label={isPopup ? "Close window" : "Close chat"}
          title={isPopup ? "Close window" : "Close chat"}
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </ChatIconButton>
      </div>
    </header>
  );
}
