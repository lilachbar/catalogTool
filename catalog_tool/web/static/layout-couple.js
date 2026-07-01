(function initCatalogToolLayoutCouple() {
  const WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY = "catalogTool.workflowSidebarWidth";
  const CHAT_WIDTH_STORAGE_KEY = "catalogTool.chatPanelWidth";
  const WORKFLOW_SIDEBAR_WIDTH_MIN = 240;
  const WORKFLOW_SIDEBAR_WIDTH_MAX = 480;
  const WORKFLOW_SIDEBAR_WIDTH_DEFAULT = 300;
  const CHAT_WIDTH_MIN = 320;
  const CHAT_WIDTH_MAX = 900;
  const CHAT_WIDTH_DEFAULT = 420;
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

  function readChatWidth() {
    const cssVal = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--chat-panel-width"),
    );
    if (Number.isFinite(cssVal) && cssVal > 0) {
      return clampChatWidth(cssVal);
    }
    const saved = Number(localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      return clampChatWidth(saved);
    }
    return CHAT_WIDTH_DEFAULT;
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

  function setChatPanelWidth(width, { persist = true } = {}) {
    const next = clampChatWidth(width);
    document.documentElement.style.setProperty("--chat-panel-width", `${next}px`);
    if (persist) {
      localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next));
    }
    return next;
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
    if (!isCoupledLayoutEnabled()) {
      releaseWorkflowMainPin();
      const workflowWidth = readWorkflowSidebarWidth();
      const chatWidth = setChatPanelWidth(proposedChatWidth);
      dispatchCouple({ source: "chat", workflowWidth, chatWidth });
      return { workflowWidth, chatWidth };
    }

    if (shouldPinWorkflowMain() && !document.body.classList.contains("workflow-main-pinned")) {
      pinWorkflowMainWidth();
    }
    if (!shouldPinWorkflowMain()) {
      releaseWorkflowMainPin();
    }

    const startC = readChatWidth();
    const startW = readWorkflowSidebarWidth();
    let nextC = clampChatWidth(proposedChatWidth);
    const delta = nextC - startC;
    let nextW = shouldPinWorkflowMain() ? clampWorkflowSidebarWidth(startW - delta) : startW;
    const actualDelta = shouldPinWorkflowMain() ? (startW - nextW) : (nextC - startC);
    nextC = clampChatWidth(startC + actualDelta);

    const chatWidth = setChatPanelWidth(nextC);
    const workflowWidth = shouldPinWorkflowMain() ? setWorkflowSidebarWidth(nextW) : startW;
    dispatchCouple({ source: "chat", workflowWidth, chatWidth });
    return { workflowWidth, chatWidth };
  }

  function initWorkflowSidebarWidth() {
    const saved = Number(localStorage.getItem(WORKFLOW_SIDEBAR_WIDTH_STORAGE_KEY));
    const width = Number.isFinite(saved) && saved > 0
      ? saved
      : WORKFLOW_SIDEBAR_WIDTH_DEFAULT;
    setWorkflowSidebarWidth(width, { persist: false });
  }

  function initLayoutCoupleListeners() {
    window.addEventListener("resize", () => {
      if (!shouldPinWorkflowMain()) {
        releaseWorkflowMainPin();
      }
    });
  }

  window.catalogToolLayoutCouple = {
    WORKFLOW_SIDEBAR_WIDTH_MIN,
    WORKFLOW_SIDEBAR_WIDTH_MAX,
    WORKFLOW_SIDEBAR_WIDTH_DEFAULT,
    CHAT_WIDTH_MIN,
    CHAT_WIDTH_MAX,
    CHAT_WIDTH_DEFAULT,
    LAYOUT_COUPLE_EVENT,
    isCoupledLayoutEnabled,
    isChatDocked,
    shouldPinWorkflowMain,
    pinWorkflowMainWidth,
    releaseWorkflowMainPin,
    clampWorkflowSidebarWidth,
    clampChatWidth,
    readWorkflowSidebarWidth,
    readChatWidth,
    setWorkflowSidebarWidth,
    setChatPanelWidth,
    applyCoupledFromWorkflow,
    applyCoupledFromChat,
    initWorkflowSidebarWidth,
  };

  initWorkflowSidebarWidth();
  initLayoutCoupleListeners();
}());
