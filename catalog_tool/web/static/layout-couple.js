(function initCatalogToolLayoutCouple() {
  const WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY = "catalogTool.workflowSidebarWidth";
  const CHAT_WIDTH_STORAGE_KEY = "catalogTool.chatPanelWidth";
  const WORKFLOW_SIDEBAR_WIDTH_MIN = 240;
  const WORKFLOW_SIDEBAR_WIDTH_MAX = 480;
  const WORKFLOW_SIDEBAR_WIDTH_DEFAULT = 300;
  const CHAT_WIDTH_MIN = 220;
  const CHAT_WIDTH_MAX = 520;
  const CHAT_WIDTH_PERCENT_DEFAULT = 0.2;
  const CHAT_WIDTH_CUSTOMIZED_KEY = "catalogTool.chatPanelWidthCustomized";
  const CHAT_WIDTH_LAYOUT_VERSION_KEY = "catalogTool.chatPanelWidthLayoutVersion";
  const CHAT_WIDTH_LAYOUT_VERSION = 4;
  const ENV_SIDEBAR_WIDTH_STORAGE_KEY = "catalogTool.sidebarWidth";
  const LAYOUT_COUPLE_EVENT = "catalogTool:layout-couple";
  const COUPLED_DESKTOP_MIN_WIDTH = 961;

  function isChatDocked() {
    return document.body.classList.contains("is-chat-docked");
  }

  function shouldPinWorkflowMain() {
    return isCoupledLayoutEnabled() && isChatDocked();
  }

  function pinWorkflowMainWidth() {
    const main = document.querySelector(
      "#pushView .workflow-workbench .workflow-main,"
      + "#dgImportView .workflow-workbench .workflow-main,"
      + "#mcpToolsView .workflow-workbench .workflow-main",
    );
    if (!main) {
      return null;
    }
    const width = Math.round(main.getBoundingClientRect().width);
    if (!Number.isFinite(width) || width <= 0) {
      return null;
    }
    document.documentElement.style.setProperty("--workflow-main-width", `${width}px`);
    document.body.classList.add("workflow-main-pinned");
    return width;
  }

  function releaseWorkflowMainPin() {
    document.documentElement.style.removeProperty("--workflow-main-width");
    document.body.classList.remove("workflow-main-pinned");
  }

  function isCoupledLayoutEnabled() {
    return document.body.classList.contains("app-page-body")
      && window.matchMedia(`(min-width: ${COUPLED_DESKTOP_MIN_WIDTH}px)`).matches;
  }

  function clampWorkflowSidebarWidth(width) {
    return Math.min(WORKFLOW_SIDEBAR_WIDTH_MAX, Math.max(WORKFLOW_SIDEBAR_WIDTH_MIN, width));
  }

  function clampChatWidth(width, viewportWidth = window.innerWidth) {
    const max = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, viewportWidth - 80));
    return Math.min(max, Math.max(CHAT_WIDTH_MIN, width));
  }

  function computeDefaultChatWidth(viewportWidth = window.innerWidth) {
    return clampChatWidth(Math.round(viewportWidth * CHAT_WIDTH_PERCENT_DEFAULT), viewportWidth);
  }

  function readWorkflowSidebarWidth() {
    const cssVal = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--workflow-sidebar-width"),
    );
    if (Number.isFinite(cssVal) && cssVal > 0) {
      return clampWorkflowSidebarWidth(cssVal);
    }
    const saved = Number(localStorage.getItem(WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      return clampWorkflowSidebarWidth(saved);
    }
    return WORKFLOW_SIDEBAR_WIDTH_DEFAULT;
  }

  function readEnvSidebarWidth() {
    const shell = document.getElementById("appShell");
    if (shell) {
      const cssWidth = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--sidebar-width"));
      if (Number.isFinite(cssWidth) && cssWidth > 0) {
        return clampChatWidth(cssWidth);
      }
    }
    const saved = Number(localStorage.getItem(ENV_SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      return clampChatWidth(saved);
    }
    return computeDefaultChatWidth();
  }

  function migrateChatWidthStorage() {
    const version = Number(localStorage.getItem(CHAT_WIDTH_LAYOUT_VERSION_KEY));
    if (Number.isFinite(version) && version >= CHAT_WIDTH_LAYOUT_VERSION) {
      return;
    }
    localStorage.setItem(CHAT_WIDTH_LAYOUT_VERSION_KEY, String(CHAT_WIDTH_LAYOUT_VERSION));
    localStorage.removeItem(CHAT_WIDTH_STORAGE_KEY);
    localStorage.removeItem(CHAT_WIDTH_CUSTOMIZED_KEY);
  }

  function isChatWidthCustomized() {
    migrateChatWidthStorage();
    return localStorage.getItem(CHAT_WIDTH_CUSTOMIZED_KEY) === "true";
  }

  function markChatWidthCustomized(width) {
    const next = clampChatWidth(width);
    localStorage.setItem(CHAT_WIDTH_LAYOUT_VERSION_KEY, String(CHAT_WIDTH_LAYOUT_VERSION));
    localStorage.setItem(CHAT_WIDTH_CUSTOMIZED_KEY, "true");
    localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
    return next;
  }

  function resolveChatWidthFromStorage() {
    migrateChatWidthStorage();
    if (!isChatWidthCustomized()) {
      return computeDefaultChatWidth();
    }
    const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      return clampChatWidth(saved);
    }
    return computeDefaultChatWidth();
  }

  function readChatWidth() {
    if (!isChatWidthCustomized()) {
      return computeDefaultChatWidth();
    }
    const cssVal = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--chat-panel-width"),
    );
    if (Number.isFinite(cssVal) && cssVal > 0) {
      return clampChatWidth(cssVal);
    }
    return resolveChatWidthFromStorage();
  }

  function dispatchCouple(detail) {
    document.dispatchEvent(new CustomEvent(LAYOUT_COUPLE_EVENT, { detail }));
  }

  function setWorkflowSidebarWidth(width, { persist = true } = {}) {
    const next = clampWorkflowSidebarWidth(width);
    document.documentElement.style.setProperty("--workflow-sidebar-width", `${next}px`);
    if (persist) {
      localStorage.setItem(WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    }
    return next;
  }

  function setChatPanelWidth(width, { persist = true, customized = true } = {}) {
    const next = clampChatWidth(width);
    document.documentElement.style.setProperty("--chat-panel-width", `${next}px`);
    if (persist) {
      if (customized) {
        markChatWidthCustomized(next);
      } else {
        localStorage.setItem(CHAT_WIDTH_LAYOUT_VERSION_KEY, String(CHAT_WIDTH_LAYOUT_VERSION));
      }
    }
    return next;
  }

  function setChatPanelWidthLive(width) {
    const next = clampChatWidth(width);
    document.documentElement.style.setProperty("--chat-panel-width", `${next}px`);
    return next;
  }

  function applyChatPanelWidth(width, { persist = true } = {}) {
    releaseWorkflowMainPin();
    const chatWidth = setChatPanelWidth(width, { persist, customized: persist });
    dispatchCouple({ source: "chat", chatWidth });
    return { chatWidth };
  }

  function applyCoupledFromWorkflow(proposedWorkflowWidth) {
    if (!isCoupledLayoutEnabled()) {
      releaseWorkflowMainPin();
      const workflowWidth = setWorkflowSidebarWidth(proposedWorkflowWidth);
      const chatWidth = readChatWidth();
      dispatchCouple({ source: "workflow", workflowWidth, chatWidth });
      return { workflowWidth, chatWidth };
    }

    if (shouldPinWorkflowMain() && !document.body.classList.contains("workflow-main-pinned")) {
      pinWorkflowMainWidth();
    }
    if (!shouldPinWorkflowMain()) {
      releaseWorkflowMainPin();
    }

    const startW = readWorkflowSidebarWidth();
    const startC = readChatWidth();
    let nextW = clampWorkflowSidebarWidth(proposedWorkflowWidth);
    const delta = nextW - startW;
    let nextC = shouldPinWorkflowMain() ? clampChatWidth(startC - delta) : startC;
    const actualDelta = shouldPinWorkflowMain() ? (startC - nextC) : (nextW - startW);
    nextW = clampWorkflowSidebarWidth(startW + actualDelta);

    const workflowWidth = setWorkflowSidebarWidth(nextW);
    const chatWidth = shouldPinWorkflowMain() ? setChatPanelWidth(nextC) : startC;
    dispatchCouple({ source: "workflow", workflowWidth, chatWidth });
    return { workflowWidth, chatWidth };
  }

  function applyCoupledFromChat(proposedChatWidth) {
    return applyChatPanelWidth(proposedChatWidth, { persist: true });
  }

  function initWorkflowSidebarWidth() {
    const saved = Number(localStorage.getItem(WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY));
    const width = Number.isFinite(saved) && saved > 0
      ? saved
      : WORKFLOW_SIDEBAR_WIDTH_DEFAULT;
    setWorkflowSidebarWidth(width, { persist: false });
  }

  function initChatPanelWidth() {
    const width = resolveChatWidthFromStorage();
    setChatPanelWidth(width, { persist: false });
    dispatchCouple({ source: "layout", chatWidth: width });
  }

  function syncChatWidthOnResize() {
    if (!isChatWidthCustomized()) {
      const width = computeDefaultChatWidth();
      document.documentElement.style.setProperty("--chat-panel-width", `${width}px`);
      dispatchCouple({ source: "layout", chatWidth: width });
      return;
    }
    const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      const width = clampChatWidth(saved);
      document.documentElement.style.setProperty("--chat-panel-width", `${width}px`);
      dispatchCouple({ source: "layout", chatWidth: width });
    }
  }

  function initLayoutCoupleListeners() {
    window.addEventListener("resize", () => {
      if (!shouldPinWorkflowMain()) {
        releaseWorkflowMainPin();
      }
      syncChatWidthOnResize();
    });
  }

  window.catalogToolLayoutCouple = {
    WORKFLOW_SIDEBAR_WIDTH_MIN,
    WORKFLOW_SIDEBAR_WIDTH_MAX,
    WORKFLOW_SIDEBAR_WIDTH_DEFAULT,
    CHAT_WIDTH_MIN,
    CHAT_WIDTH_MAX,
    CHAT_WIDTH_PERCENT_DEFAULT,
    LAYOUT_COUPLE_EVENT,
    isCoupledLayoutEnabled,
    isChatDocked,
    shouldPinWorkflowMain,
    pinWorkflowMainWidth,
    releaseWorkflowMainPin,
    clampWorkflowSidebarWidth,
    clampChatWidth,
    computeDefaultChatWidth,
    isChatWidthCustomized,
    markChatWidthCustomized,
    readWorkflowSidebarWidth,
    readEnvSidebarWidth,
    readChatWidth,
    setWorkflowSidebarWidth,
    setChatPanelWidth,
    setChatPanelWidthLive,
    applyChatPanelWidth,
    applyCoupledFromWorkflow,
    applyCoupledFromChat,
    initWorkflowSidebarWidth,
    initChatPanelWidth,
  };

  initWorkflowSidebarWidth();
  initLayoutCoupleListeners();
  if (document.body) {
    initChatPanelWidth();
  } else {
    document.addEventListener("DOMContentLoaded", initChatPanelWidth, { once: true });
  }
}());
