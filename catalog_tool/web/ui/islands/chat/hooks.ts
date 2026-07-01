// Typed chat hooks extracted from the legacy src/chat-client.jsx monolith as
// part of the incremental TypeScript migration. Behavior is preserved 1:1.
import { useEffect, useState } from "react";
import type { RefObject } from "react";

import {
  CHAT_MODES,
  DEFAULT_CONTEXT_BASELINES,
  type ChatModelOption,
  type ContextBaselines,
} from "./primitives";

export interface ChatHealth {
  loading: boolean;
  ready: boolean;
  message: string;
  provider: string | null;
  defaultModel: string | null;
  models: ChatModelOption[];
  chatMode: string;
  contextBaselines: ContextBaselines;
}

const UNREACHABLE_MESSAGE = "Could not reach the chat server. Restart with ./run_web.sh";

/** Polls /api/chat/health (on mount, every 60s, and on window focus). */
export function useChatHealth(): ChatHealth {
  const [health, setHealth] = useState<ChatHealth>({
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
          data.chatKey?.setupInstructions ||
          data.chatKey?.message ||
          (data.chatReady ? "" : "Chat is not configured.");

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
            message: UNREACHABLE_MESSAGE,
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

export interface AgentCloseGuardRefs {
  localBusyRef: RefObject<boolean>;
  remoteBusyRef: RefObject<boolean>;
}

/** Warns before unload while a local or remote agent run is still in progress. */
export function useAgentCloseGuard({ localBusyRef, remoteBusyRef }: AgentCloseGuardRefs): void {
  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (!localBusyRef.current && !remoteBusyRef.current) {
        return undefined;
      }
      event.preventDefault();
      event.returnValue = "An agent is still working. Close this page anyway?";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [localBusyRef, remoteBusyRef]);
}
