const THEME_STORAGE_KEY = "catalogTool.theme";

const TABLES = JSON.parse(document.getElementById("tablesConfig")?.textContent || "[]");
const DEFAULTS = JSON.parse(document.getElementById("defaultsConfig")?.textContent || "{}");

/** In-memory cache synced to data/environments/{username}.json via the server. */
let environmentStore = { activeEnvironmentId: null, environments: [] };

const TABLE_DEFAULT_ROWS = {
  modify_reason: {
    name: "POV-CATTOOL-001",
    localized: "Catalog Tool POV - Test Modify Reason",
  },
  action: {
    name: "POV-CATTOOL-ACT-001",
    localized: "Catalog Tool POV - Test Action",
  },
};

const TABLE_STORAGE_KEY = "catalogTool.tableKey";
const VIEW_STORAGE_KEY = "catalogTool.activeView";
const SIDEBAR_WIDTH_STORAGE_KEY = "catalogTool.sidebarWidth";
const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 520;
const SIDEBAR_WIDTH_DEFAULT = 300;

const VIEW_META = {
  push: {
    eyebrow: "CatalogOne",
    title: "Upload, Review & Publish",
    description: "Upload a CatalogOne export zip, review changes, and publish when ready.",
  },
  "dg-import": {
    eyebrow: "CatalogOne DG",
    title: "DG Import",
    description: "Import WLS Actions & Reasons from an Excel workbook into CatalogOne.",
  },
  "mcp-tools": {
    eyebrow: "CatalogOne MCP",
    title: "CatalogOne MCP tools",
    description: "Browse and run CatalogOne MCP tools with your connected environment.",
  },
};

/** crypto.randomUUID() is only available in secure contexts (HTTPS / localhost). */
function newEnvironmentId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const state = {
  loggedIn: false,
  activeEnvironmentId: null,
  connectedEnvironmentId: null,
  editingEnvironmentId: null,
  currentEnvironmentLabel: "",
  activeTableKey: TABLES[0]?.key || "modify_reason",
  editorMode: "form",
  tableDrafts: new Map(),
  activeView: "push",
  mcpToolsConfigured: false,
  mcpToolsOnline: false,
  mcpToolsAvailable: false,
  mcpToolsStatusMessage: "",
  useAgentic: document.body?.dataset?.useAgentic !== "false",
  dgAnalyzeResult: null,
  dgImportCompleted: false,
  zipAnalyzeResult: null,
  zipImportCompleted: false,
  zipImportBusinessRequestId: null,
  zipImportError: null,
  importType: null,
  importFilename: null,
  brCompareData: null,
  brCompareResultsOpen: false,
  compareEntityPayload: null,
  brCompareTableUi: {
    query: "",
    status: "all",
    entityType: "all",
    sortKey: "status",
    sortDir: "asc",
  },
};

let pushWorkflowNav = null;

const els = {
  connectionForm: document.getElementById("connectionForm"),
  connectionModal: document.getElementById("connectionModal"),
  connectionModalTitle: document.getElementById("connectionModalTitle"),
  connectionModalDesc: document.getElementById("connectionModalDesc"),
  closeConnectionModalBtn: document.getElementById("closeConnectionModalBtn"),
  cancelConnectionModalBtn: document.getElementById("cancelConnectionModalBtn"),
  addEnvironmentBtn: document.getElementById("addEnvironmentBtn"),
  refreshEnvironmentsBtn: document.getElementById("refreshEnvironmentsBtn"),
  environmentSidebarList: document.getElementById("environmentSidebarList"),
  envSidebarEmpty: document.getElementById("envSidebarEmpty"),
  environmentItemTemplate: document.getElementById("environmentItemTemplate"),
  environmentDisplayNameInput: document.getElementById("environmentDisplayNameInput"),
  mainConnectionHint: document.getElementById("mainConnectionHint"),
  mainConnectionHintText: document.getElementById("mainConnectionHintText"),
  logoutBtn: document.getElementById("logoutBtn"),
  appLogoutBtn: document.getElementById("appLogoutBtn"),
  loginResult: document.getElementById("loginResult"),
  pushBtn: document.getElementById("pushBtn"),
  publishBtn: document.getElementById("publishBtn"),
  pushResult: document.getElementById("pushResult"),
  pushResultCard: document.getElementById("pushResultCard"),
  pushWorkflowStatus: document.getElementById("pushWorkflowStatus"),
  pushWorkflowStatusText: document.getElementById("pushWorkflowStatusText"),
  pushStepNav: document.getElementById("pushStepNav"),
  catalogZipInput: document.getElementById("catalogZipInput"),
  analyzeZipBtn: document.getElementById("analyzeZipBtn"),
  analyzeZipBtnLabel: document.getElementById("analyzeZipBtnLabel"),
  zipAnalyzeReport: document.getElementById("zipAnalyzeReport"),
  zipAnalyzeSummary: document.getElementById("zipAnalyzeSummary"),
  zipAnalyzePanel: document.getElementById("zipAnalyzePanel"),
  zipAnalyzeToggleBtn: document.getElementById("zipAnalyzeToggleBtn"),
  zipAnalyzeStatusBadge: document.getElementById("zipAnalyzeStatusBadge"),
  zipDropzone: document.getElementById("zipDropzone"),
  zipDropzoneTitle: document.getElementById("zipDropzoneTitle"),
  zipDropzoneHint: document.getElementById("zipDropzoneHint"),
  catalogExcelInput: document.getElementById("catalogExcelInput"),
  analyzeExcelBtn: document.getElementById("analyzeExcelBtn"),
  excelAnalyzeReport: document.getElementById("excelAnalyzeReport"),
  excelAnalyzePanel: document.getElementById("excelAnalyzePanel"),
  excelAnalyzeJson: document.getElementById("excelAnalyzeJson"),
  excelAnalyzeShowJson: document.getElementById("excelAnalyzeShowJson"),
  excelDropzone: document.getElementById("excelDropzone"),
  excelDropzoneTitle: document.getElementById("excelDropzoneTitle"),
  excelDropzoneHint: document.getElementById("excelDropzoneHint"),
  dgBusinessRequestName: document.getElementById("dgBusinessRequestName"),
  dgBusinessRequestId: document.getElementById("dgBusinessRequestId"),
  dgBusinessRequestNameHint: document.getElementById("dgBusinessRequestNameHint"),
  dgCreateBrBtn: document.getElementById("dgCreateBrBtn"),
  dgCreateBrBtnHint: document.getElementById("dgCreateBrBtnHint"),
  dgBrConnectHint: document.getElementById("dgBrConnectHint"),
  dgBrConnectHintText: document.getElementById("dgBrConnectHintText"),
  dgBrCreateResult: document.getElementById("dgBrCreateResult"),
  dgImportEntriesBtn: document.getElementById("dgImportEntriesBtn"),
  dgImportEntriesHint: document.getElementById("dgImportEntriesHint"),
  dgImportResult: document.getElementById("dgImportResult"),
  dgImportResultCard: document.getElementById("dgImportResultCard"),
  dgPublishBusinessRequestId: document.getElementById("dgPublishBusinessRequestId"),
  dgPublishBusinessRequestIdHint: document.getElementById("dgPublishBusinessRequestIdHint"),
  dgPublishBtn: document.getElementById("dgPublishBtn"),
  dgPublishResult: document.getElementById("dgPublishResult"),
  dgPublishResultCard: document.getElementById("dgPublishResultCard"),
  dgWorkflowStatus: document.getElementById("dgWorkflowStatus"),
  dgWorkflowStatusText: document.getElementById("dgWorkflowStatusText"),
  dgStepNav: document.getElementById("dgStepNav"),
  dgBrCreateResultCard: document.getElementById("dgBrCreateResultCard"),
  rowTemplate: document.getElementById("rowTemplate"),
  rowsContainer: document.getElementById("rowsContainer"),
  addRowBtn: document.getElementById("addRowBtn"),
  formMode: document.getElementById("formMode"),
  jsonMode: document.getElementById("jsonMode"),
  entriesJson: document.getElementById("entriesJson"),
  editorModeTabs: document.querySelectorAll("#editorModeTabs .tab"),
  tableSelect: document.getElementById("tableSelect"),
  tableDescription: document.getElementById("tableDescription"),
  tableDraftSummary: document.getElementById("tableDraftSummary"),
  businessRequestId: document.getElementById("businessRequestId"),
  businessRequestName: document.getElementById("businessRequestName"),
  clearBrBtn: document.getElementById("clearBrBtn"),
  mergeBrFormSection: document.getElementById("mergeBrFormSection"),
  publishBusinessRequestId: document.getElementById("publishBusinessRequestId"),
  publishBusinessRequestIdHint: document.getElementById("publishBusinessRequestIdHint"),
  createBrBtn: document.getElementById("createBrBtn"),
  brCreateResult: document.getElementById("brCreateResult"),
  brCreatePanel: document.getElementById("brCreatePanel"),
  brCreateToggleBtn: document.getElementById("brCreateToggleBtn"),
  brCreateStatusBadge: document.getElementById("brCreateStatusBadge"),
  brCompareResultsSection: document.getElementById("brCompareResultsSection"),
  brCompareHint: document.getElementById("brCompareHint"),
  brCompareProductionBtn: document.getElementById("brCompareProductionBtn"),
  brComparePanel: document.getElementById("brComparePanel"),
  brCompareTitle: document.getElementById("brCompareTitle"),
  brCompareReport: document.getElementById("brCompareReport"),
  brCompareJson: document.getElementById("brCompareJson"),
  brCompareShowJson: document.getElementById("brCompareShowJson"),
  keycloakUrlInput: document.getElementById("keycloakUrlInput"),
  keycloakRealmInput: document.getElementById("keycloakRealmInput"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  apigwUrlInput: document.getElementById("apigwUrlInput"),
  openKeycloakBtn: document.getElementById("openKeycloakBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  appPage: document.getElementById("appPage"),
  pushView: document.getElementById("pushView"),
  dgImportView: document.getElementById("dgImportView"),
  mcpToolsView: document.getElementById("mcpToolsView"),
  appNavItems: document.querySelectorAll(".app-nav-item"),
  navMcpToolsView: document.getElementById("navMcpToolsView"),
  chatToggleBtn: document.getElementById("chatToggleBtn"),
  chatAttachBtn: document.getElementById("chatAttachBtn"),
  agenticSettingsBtn: document.getElementById("agenticSettingsBtn"),
  agenticSettingsModal: document.getElementById("agenticSettingsModal"),
  agenticSettingsForm: document.getElementById("agenticSettingsForm"),
  agenticProviderSelect: document.getElementById("agenticProviderSelect"),
  agenticApiKeyInput: document.getElementById("agenticApiKeyInput"),
  agenticApiKeyField: document.getElementById("agenticApiKeyField"),
  agenticSettingsError: document.getElementById("agenticSettingsError"),
  closeAgenticSettingsBtn: document.getElementById("closeAgenticSettingsBtn"),
  cancelAgenticSettingsBtn: document.getElementById("cancelAgenticSettingsBtn"),
  appShell: document.getElementById("appShell"),
  sidebarResizer: document.getElementById("sidebarResizer"),
};

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width));
}

function setSidebarWidth(width, { persist = true } = {}) {
  if (!els.appShell) {
    return;
  }
  const nextWidth = clampSidebarWidth(width);
  els.appShell.style.setProperty("--sidebar-width", `${nextWidth}px`);
  syncEnvRefreshButtonLayout({ recompute: true });
  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function syncEnvRefreshButtonLayout({ recompute = false } = {}) {
  const head = document.querySelector(
    ".env-sidebar-section:not(.env-sidebar-section--compact) .env-sidebar-head",
  );
  const refreshBtn = head?.querySelector(".env-refresh-btn");
  const title = head?.querySelector(".env-sidebar-title");
  if (!head || !refreshBtn || !title) {
    return;
  }

  const overflows = () => (
    head.scrollWidth > head.clientWidth + 1
    || title.scrollWidth > title.clientWidth + 1
  );

  if (recompute) {
    refreshBtn.classList.remove("is-icon-only");
  } else if (refreshBtn.classList.contains("is-icon-only")) {
    return;
  }

  if (overflows()) {
    refreshBtn.classList.add("is-icon-only");
  }
}

function initEnvRefreshButtonLayout() {
  syncEnvRefreshButtonLayout({ recompute: true });
  window.addEventListener("resize", () => {
    syncEnvRefreshButtonLayout({ recompute: true });
  });
}

function initSidebarResize() {
  if (!els.appShell || !els.sidebarResizer) {
    return;
  }

  const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  if (Number.isFinite(savedWidth) && savedWidth > 0) {
    setSidebarWidth(savedWidth, { persist: false });
  }

  let dragging = false;

  const stopDragging = (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    els.sidebarResizer.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing-sidebar");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", stopDragging);
    document.removeEventListener("pointercancel", stopDragging);
    window.removeEventListener("blur", stopDragging);
    if (event?.pointerId != null && els.sidebarResizer.hasPointerCapture?.(event.pointerId)) {
      try {
        els.sidebarResizer.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
  };

  const onPointerMove = (event) => {
    if (!dragging) {
      return;
    }
    setSidebarWidth(event.clientX);
  };

  els.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches || event.button !== 0) {
      return;
    }
    dragging = true;
    els.sidebarResizer.classList.add("is-dragging");
    document.body.classList.add("is-resizing-sidebar");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", stopDragging);
    document.addEventListener("pointercancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    try {
      els.sidebarResizer.setPointerCapture(event.pointerId);
    } catch {
      // pointer capture is optional; document listeners handle cleanup
    }
    event.preventDefault();
  });

  els.sidebarResizer.addEventListener("keydown", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      return;
    }
    const sidebarWidth = Number.parseFloat(getComputedStyle(els.appShell).getPropertyValue("--sidebar-width")) || SIDEBAR_WIDTH_DEFAULT;
    if (event.key === "ArrowLeft") {
      setSidebarWidth(sidebarWidth - (event.shiftKey ? 20 : 8));
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      setSidebarWidth(sidebarWidth + (event.shiftKey ? 20 : 8));
      event.preventDefault();
    }
  });
}

function initWorkflowSidebarResize() {
  const layout = window.catalogToolLayoutCouple;
  if (!layout) {
    return;
  }

  const resizers = document.querySelectorAll(".workflow-sidebar-resizer");
  resizers.forEach((resizer) => {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const stopDragging = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      resizer.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-workflow-sidebar");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", stopDragging);
      document.removeEventListener("pointercancel", stopDragging);
      window.removeEventListener("blur", stopDragging);
      if (event?.pointerId != null && resizer.hasPointerCapture?.(event.pointerId)) {
        try {
          resizer.releasePointerCapture(event.pointerId);
        } catch {
          // ignore release failures
        }
      }
    };

    const onPointerMove = (event) => {
      if (!dragging) {
        return;
      }
      const proposed = startWidth + (event.clientX - startX);
      layout.applyCoupledFromWorkflow(proposed);
    };

    resizer.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 960px)").matches || event.button !== 0) {
        return;
      }
      if (layout.shouldPinWorkflowMain?.()) {
        layout.pinWorkflowMainWidth?.();
      }
      dragging = true;
      startX = event.clientX;
      startWidth = layout.readWorkflowSidebarWidth();
      resizer.classList.add("is-dragging");
      document.body.classList.add("is-resizing-workflow-sidebar");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", stopDragging);
      document.addEventListener("pointercancel", stopDragging);
      window.addEventListener("blur", stopDragging);
      try {
        resizer.setPointerCapture(event.pointerId);
      } catch {
        // pointer capture is optional
      }
      event.preventDefault();
    });

    resizer.addEventListener("keydown", (event) => {
      if (window.matchMedia("(max-width: 960px)").matches) {
        return;
      }
      const step = event.shiftKey ? 20 : 8;
      const current = layout.readWorkflowSidebarWidth();
      if (event.key === "ArrowLeft") {
        layout.applyCoupledFromWorkflow(current - step);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        layout.applyCoupledFromWorkflow(current + step);
        event.preventDefault();
      }
    });
  });
}

function setActiveView(view) {
  const nextView = VIEW_META[view] ? view : "push";
  if (nextView === "mcp-tools" && (!state.mcpToolsConfigured || !state.useAgentic)) {
    return;
  }
  state.activeView = nextView;
  localStorage.setItem(VIEW_STORAGE_KEY, nextView);

  if (els.pushView) {
    els.pushView.hidden = nextView !== "push";
  }
  if (els.dgImportView) {
    els.dgImportView.hidden = nextView !== "dg-import";
  }
  if (els.mcpToolsView) {
    els.mcpToolsView.hidden = nextView !== "mcp-tools";
  }

  els.appNavItems?.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === nextView);
  });

  updateMainConnectionHint();
}

function connectionHintForView() {
  if (state.loggedIn) {
    const label = escapeHtml(state.currentEnvironmentLabel || "Unknown");
    return {
      connected: true,
      html: `The AI Catalog Tool is connected to environment: ${label}`,
    };
  }
  return {
    connected: false,
    html: "The AI Catalog Tool is not connected to any environment yet — connect to get started.",
  };
}

function setMainConnectionHintState(connected, html) {
  if (!els.mainConnectionHint) {
    return;
  }
  els.mainConnectionHint.hidden = false;
  els.mainConnectionHint.className = connected
    ? "main-connection-hint main-connection-hint-connected"
    : "main-connection-hint main-connection-hint-disconnected";
  if (els.mainConnectionHintText) {
    els.mainConnectionHintText.innerHTML = html;
  }
}

function updateMainConnectionHint() {
  if (!els.mainConnectionHint) {
    return;
  }

  const hint = connectionHintForView();
  setMainConnectionHintState(hint.connected, hint.html);
  updateWorkflowStatusLines();
}

function updateMcpToolsNav({ configured, online, message }) {
  if (configured !== undefined) {
    state.mcpToolsConfigured = Boolean(configured);
  }
  if (online !== undefined) {
    state.mcpToolsOnline = Boolean(online);
  }
  state.mcpToolsAvailable = state.mcpToolsConfigured;
  state.mcpToolsStatusMessage = message || "";

  const button = els.navMcpToolsView;
  if (!button) {
    return;
  }

  button.disabled = !state.mcpToolsConfigured || !state.useAgentic;
  button.classList.toggle("is-disabled", !state.mcpToolsConfigured || !state.useAgentic);
  if (!state.useAgentic) {
    button.title = "Enable agentic assistant to use CatalogOne MCP tools";
  } else if (state.mcpToolsOnline) {
    button.title = message
      ? `Browse and run CatalogOne MCP tools — ${message}`
      : "Browse and run CatalogOne MCP tools";
  } else if (state.mcpToolsConfigured) {
    button.title = message || "MCP installed — server starts when you open this page";
  } else {
    button.title = message || "catalogone MCP is not installed (see README)";
  }

  if ((!state.mcpToolsConfigured || !state.useAgentic) && state.activeView === "mcp-tools") {
    setActiveView("push");
  }
}

function updateAgenticUi(enabled) {
  state.useAgentic = Boolean(enabled);
  window.catalogTool = window.catalogTool || {};
  window.catalogTool.useAgentic = state.useAgentic;
  if (document.body) {
    document.body.dataset.useAgentic = state.useAgentic ? "true" : "false";
  }

  els.chatToggleBtn?.toggleAttribute("hidden", !state.useAgentic);
  if (!state.useAgentic) {
    els.chatAttachBtn?.setAttribute("hidden", "");
    window.dispatchEvent(new CustomEvent("catalogTool:close-chat"));
  }

  updateMcpToolsNav({});
  if (!state.useAgentic && state.activeView === "mcp-tools") {
    setActiveView("push");
  }

  window.dispatchEvent(new CustomEvent("catalogTool:agentic-changed", {
    detail: { enabled: state.useAgentic },
  }));
}

async function loadAppUserSession() {
  try {
    const response = await fetch("/api/user/session");
    if (!response.ok) {
      updateAgenticUi(document.body?.dataset?.useAgentic !== "false");
      return;
    }
    const data = await response.json();
    updateAgenticUi(Boolean(data.use_agentic));
  } catch {
    updateAgenticUi(document.body?.dataset?.useAgentic !== "false");
  }
}

const agenticProviderMeta = {
  cursor: { placeholder: "crsr_…" },
  openai: { placeholder: "sk-… or sk-proj-…" },
  claude: { placeholder: "sk-ant-…" },
};
let agenticProviderDefaults = {};

function isAgenticProvider(provider) {
  return Boolean(provider) && provider !== "none";
}

function isMaskedAgenticKey(value) {
  return /…/.test(value) || /•/.test(value);
}

function updateAgenticModalFields() {
  if (!els.agenticProviderSelect || !els.agenticApiKeyInput || !els.agenticApiKeyField) {
    return;
  }

  const provider = els.agenticProviderSelect.value;
  const useAgentic = isAgenticProvider(provider);
  els.agenticApiKeyInput.disabled = !useAgentic;
  els.agenticApiKeyField.classList.toggle("is-disabled", !useAgentic);

  if (!useAgentic) {
    els.agenticApiKeyInput.required = false;
    els.agenticApiKeyInput.value = "";
    els.agenticApiKeyInput.placeholder = "Not required";
    return;
  }

  const saved = agenticProviderDefaults[provider] || {};
  const meta = agenticProviderMeta[provider] || {};
  els.agenticApiKeyInput.placeholder = saved.configured ? saved.maskedApiKey : meta.placeholder;
  els.agenticApiKeyInput.required = !saved.configured;
  els.agenticApiKeyInput.value = "";
}

async function loadAgenticProviderDefaults() {
  try {
    const response = await fetch("/api/chat/config");
    if (!response.ok) {
      updateAgenticModalFields();
      return;
    }
    const data = await response.json();
    agenticProviderDefaults = data.providers || {};

    if (data.provider === "none" || !state.useAgentic) {
      els.agenticProviderSelect.value = "none";
    } else {
      const configuredProvider = data.provider && agenticProviderDefaults[data.provider]?.configured
        ? data.provider
        : null;
      els.agenticProviderSelect.value = configuredProvider || data.provider || "cursor";
    }
  } catch {
    els.agenticProviderSelect.value = state.useAgentic ? "cursor" : "none";
  }
  updateAgenticModalFields();
}

function openAgenticSettingsModal() {
  if (!els.agenticSettingsModal) {
    return;
  }
  if (els.agenticSettingsError) {
    els.agenticSettingsError.hidden = true;
    els.agenticSettingsError.textContent = "";
  }
  void loadAgenticProviderDefaults();
  if (typeof els.agenticSettingsModal.showModal === "function") {
    els.agenticSettingsModal.showModal();
  }
}

function closeAgenticSettingsModal() {
  els.agenticSettingsModal?.close();
}

function initAgenticSettings() {
  els.agenticSettingsBtn?.addEventListener("click", openAgenticSettingsModal);
  els.closeAgenticSettingsBtn?.addEventListener("click", closeAgenticSettingsModal);
  els.cancelAgenticSettingsBtn?.addEventListener("click", closeAgenticSettingsModal);
  els.agenticProviderSelect?.addEventListener("change", updateAgenticModalFields);

  els.agenticSettingsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const provider = els.agenticProviderSelect?.value?.trim() || "none";
    const payload = { chat_provider: provider };

    if (isAgenticProvider(provider)) {
      const apiKey = els.agenticApiKeyInput?.value?.trim() || "";
      const saved = agenticProviderDefaults[provider] || {};
      if (apiKey && !isMaskedAgenticKey(apiKey) && apiKey !== saved.maskedApiKey) {
        payload.api_key = apiKey;
      } else if (!saved.configured) {
        if (els.agenticSettingsError) {
          els.agenticSettingsError.hidden = false;
          els.agenticSettingsError.textContent = "API key is required for the selected AI provider.";
        }
        return;
      }
    }

    if (els.agenticSettingsError) {
      els.agenticSettingsError.hidden = true;
      els.agenticSettingsError.textContent = "";
    }

    try {
      const response = await fetch("/api/user/agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not update agentic settings.");
      }
      updateAgenticUi(Boolean(data.use_agentic));
      closeAgenticSettingsModal();
      if (data.use_agentic) {
        void refreshMcpToolsNavStatus();
      } else {
        updateMcpToolsNav({ configured: state.mcpToolsConfigured, online: false });
      }
    } catch (error) {
      if (els.agenticSettingsError) {
        els.agenticSettingsError.hidden = false;
        els.agenticSettingsError.textContent = error.message || "Could not update agentic settings.";
      }
    }
  });
}

async function refreshMcpToolsNavStatus() {
  try {
    const configResponse = await fetch("/api/mcp/config");
    const config = await configResponse.json();

    if (!config.configured) {
      const reason = config.error || "catalogone MCP is not installed in ~/.cursor/mcp.json";
      updateMcpToolsNav({ configured: false, online: false, message: reason });
      updateMainConnectionHint();
      return;
    }

    updateMcpToolsNav({
      configured: true,
      online: false,
      message: "checking MCP server…",
    });
    updateMainConnectionHint();

    try {
      const response = await fetch("/api/mcp/status");
      const status = await response.json();

      if (status.online) {
        updateMcpToolsNav({
          configured: true,
          online: true,
          message: `${status.toolCount ?? 0} tools available`,
        });
      } else {
        const reason = status.onlineError
          || status.error
          || "MCP server starting — open CatalogOne MCP tools to load tools (~15s first time)";
        updateMcpToolsNav({ configured: true, online: false, message: reason });
      }
    } catch {
      updateMcpToolsNav({
        configured: true,
        online: false,
        message: "MCP installed — start ./run_web.sh if tools fail to load",
      });
    }
    updateMainConnectionHint();
  } catch (error) {
    updateMcpToolsNav({
      configured: false,
      online: false,
      message: error.message || "Could not check MCP configuration",
    });
    updateMainConnectionHint();
  }
}

function initSidebarFloatTips() {
  const sidebar = document.querySelector(".env-sidebar");
  const tip = document.getElementById("sidebarFloatTip");
  if (!sidebar || !tip) {
    return;
  }

  let tipActive = false;
  const pointerOffset = 12;

  function hideSidebarFloatTip() {
    tip.hidden = true;
    tipActive = false;
  }

  function positionSidebarFloatTipAtPointer(clientX, clientY) {
    tip.hidden = false;
    const tipRect = tip.getBoundingClientRect();
    let left = clientX + pointerOffset;
    let top = clientY + pointerOffset;

    if (left + tipRect.width > window.innerWidth - 8) {
      left = clientX - tipRect.width - pointerOffset;
    }
    if (top + tipRect.height > window.innerHeight - 8) {
      top = clientY - tipRect.height - pointerOffset;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showSidebarFloatTip(html, clientX, clientY) {
    tip.innerHTML = html;
    tipActive = true;
    positionSidebarFloatTipAtPointer(clientX, clientY);
  }

  function environmentTipHtml(environment) {
    const displayName = getEnvironmentDisplayName(environment);
    const label = environment.label || deriveEnvironmentLabel(environment.apigw_url || "");
    let html = `<p class="sidebar-float-tip-title">${escapeHtml(displayName)}</p>`;
    if (label && label !== displayName) {
      html += formatTipDescriptionHtml(label);
    }
    return html;
  }

  function tipTargetForEvent(event) {
    const navItem = event.target.closest(".app-nav-item[data-view]");
    if (navItem) {
      const meta = VIEW_META[navItem.dataset.view];
      if (!meta?.description) {
        return null;
      }
      return {
        html: `<p class="sidebar-float-tip-title">${escapeHtml(meta.title)}</p>${formatTipDescriptionHtml(meta.description)}`,
      };
    }

    const envInner = event.target.closest(".env-card-inner");
    if (!envInner) {
      return null;
    }
    const envId = envInner.closest(".env-card")?.dataset.environmentId;
    const environment = getEnvironmentById(envId);
    if (!environment) {
      return null;
    }
    return { html: environmentTipHtml(environment) };
  }

  sidebar.addEventListener("mouseover", (event) => {
    const target = tipTargetForEvent(event);
    if (!target) {
      hideSidebarFloatTip();
      return;
    }
    showSidebarFloatTip(target.html, event.clientX, event.clientY);
  });

  sidebar.addEventListener("mousemove", (event) => {
    const target = tipTargetForEvent(event);
    if (!target) {
      if (tipActive) {
        hideSidebarFloatTip();
      }
      return;
    }
    if (!tipActive || tip.hidden) {
      showSidebarFloatTip(target.html, event.clientX, event.clientY);
      return;
    }
    positionSidebarFloatTipAtPointer(event.clientX, event.clientY);
  });

  sidebar.addEventListener("mouseleave", hideSidebarFloatTip);
  sidebar.addEventListener("scroll", hideSidebarFloatTip, true);
  document.addEventListener("mouseleave", hideSidebarFloatTip);
  window.addEventListener("blur", hideSidebarFloatTip);
  window.addEventListener("scroll", hideSidebarFloatTip, true);
  window.addEventListener("resize", hideSidebarFloatTip);
}

function initConnectionModalFloatTips() {
  const modal = els.connectionModal;
  const tip = document.getElementById("connectionFloatTip");
  if (!modal || !tip) {
    return;
  }

  let tipActive = false;
  const pointerOffset = 12;

  function hideConnectionFloatTip() {
    tip.hidden = true;
    tipActive = false;
  }

  function positionConnectionFloatTipAtPointer(clientX, clientY) {
    tip.hidden = false;
    const tipRect = tip.getBoundingClientRect();
    let left = clientX + pointerOffset;
    let top = clientY + pointerOffset;

    if (left + tipRect.width > window.innerWidth - 8) {
      left = clientX - tipRect.width - pointerOffset;
    }
    if (top + tipRect.height > window.innerHeight - 8) {
      top = clientY - tipRect.height - pointerOffset;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function connectionTipHtml(field) {
    const title = field.dataset.tipTitle || "";
    const desc = field.dataset.tipDesc || "";
    let html = `<p class="sidebar-float-tip-title">${escapeHtml(title)}</p>`;
    if (desc) {
      html += formatTipDescriptionHtml(desc);
    }
    return html;
  }

  function tipTargetForEvent(event) {
    const field = event.target.closest(".connection-tip-field");
    if (!field || !modal.contains(field)) {
      return null;
    }
    return { html: connectionTipHtml(field), field };
  }

  modal.addEventListener("mouseover", (event) => {
    const target = tipTargetForEvent(event);
    if (!target) {
      hideConnectionFloatTip();
      return;
    }
    tip.innerHTML = target.html;
    tipActive = true;
    positionConnectionFloatTipAtPointer(event.clientX, event.clientY);
  });

  modal.addEventListener("mousemove", (event) => {
    const target = tipTargetForEvent(event);
    if (!target) {
      if (tipActive) {
        hideConnectionFloatTip();
      }
      return;
    }
    if (!tipActive || tip.hidden) {
      tip.innerHTML = target.html;
      tipActive = true;
    }
    positionConnectionFloatTipAtPointer(event.clientX, event.clientY);
  });

  modal.addEventListener("mouseleave", hideConnectionFloatTip);
  modal.addEventListener("close", hideConnectionFloatTip);
  modal.addEventListener("scroll", hideConnectionFloatTip, true);
}

function initAppNavigation() {
  // Defer restoring MCP Tools view until refreshMcpToolsNavStatus() confirms MCP is online.
  setActiveView("push");

  els.appNavItems?.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      setActiveView(button.dataset.view || "push");
    });
  });
}

const MCP_STATUS_POLL_MS = 30_000;

function startMcpStatusPolling() {
  window.setInterval(() => {
    refreshMcpToolsNavStatus().catch(() => {});
  }, MCP_STATUS_POLL_MS);
}

function getActiveTableKey() {
  return els.tableSelect?.value || state.activeTableKey;
}

function getTableMeta(tableKey) {
  return TABLES.find((table) => table.key === tableKey);
}

function createTableDraft(tableKey) {
  const defaults = TABLE_DEFAULT_ROWS[tableKey];
  return {
    mode: "form",
    rows: defaults
      ? [{ name: defaults.name, localized_name: defaults.localized }]
      : [],
    entriesJson: "",
  };
}

function getTableDraft(tableKey) {
  if (!state.tableDrafts.has(tableKey)) {
    state.tableDrafts.set(tableKey, createTableDraft(tableKey));
  }
  return state.tableDrafts.get(tableKey);
}

function updateTableDescription() {
  const table = getTableMeta(getActiveTableKey());
  if (!table || !els.tableDescription) {
    return;
  }
  els.tableDescription.textContent = table.description || table.id;
}

function describeDraft(draft) {
  if (draft.mode === "json") {
    return draft.entriesJson.trim() ? "JSON ready" : "No JSON";
  }
  const rows = draft.rows.filter((row) => row.name || row.localized_name);
  if (rows.length === 0) {
    return "No rows";
  }
  return rows.length === 1 ? "1 row" : `${rows.length} rows`;
}

function updateTableDraftSummary() {
  if (!els.tableDraftSummary) {
    return;
  }

  const parts = TABLES.map((table) => {
    const draft = getTableDraft(table.key);
    const status = describeDraft(draft);
    const isActive = table.key === getActiveTableKey();
    return `${table.label}: ${status}${isActive ? " (editing)" : ""}`;
  });

  els.tableDraftSummary.textContent = parts.join(" · ");
}

function setEditorMode(mode) {
  state.editorMode = mode;
  els.editorModeTabs?.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  if (els.formMode) {
    els.formMode.hidden = mode !== "form";
  }
  if (els.jsonMode) {
    els.jsonMode.hidden = mode !== "json";
  }
}

function collectRowsFromEditor() {
  if (!els.rowsContainer) {
    return [];
  }
  return [...els.rowsContainer.querySelectorAll(".row-item")].map((row) => ({
    name: row.querySelector(".row-name").value.trim(),
    localized_name: row.querySelector(".row-localized").value.trim(),
  }));
}

function addRow(name = "", localized = "") {
  if (!els.rowTemplate?.content || !els.rowsContainer) {
    return;
  }
  const node = els.rowTemplate.content.cloneNode(true);
  const row = node.querySelector(".row-item");
  row.querySelector(".row-name").value = name;
  row.querySelector(".row-localized").value = localized;
  row.querySelector(".remove-row").addEventListener("click", () => row.remove());
  els.rowsContainer.appendChild(node);
}

function renderRows(rows) {
  if (!els.rowsContainer) {
    return;
  }
  els.rowsContainer.innerHTML = "";
  for (const row of rows) {
    addRow(row.name, row.localized_name);
  }
}

function saveActiveTableDraft() {
  if (!els.tableSelect) {
    return;
  }
  const tableKey = getActiveTableKey();
  state.tableDrafts.set(tableKey, {
    mode: state.editorMode,
    rows: collectRowsFromEditor(),
    entriesJson: els.entriesJson?.value || "",
  });
  updateTableDraftSummary();
}

function loadTableDraft(tableKey) {
  if (!els.tableSelect) {
    return;
  }
  const draft = getTableDraft(tableKey);
  state.activeTableKey = tableKey;
  els.tableSelect.value = tableKey;
  localStorage.setItem(TABLE_STORAGE_KEY, tableKey);
  setEditorMode(draft.mode);
  renderRows(draft.rows);
  if (els.entriesJson) {
    els.entriesJson.value = draft.entriesJson;
  }
  updateTableDescription();
  updateTableDraftSummary();
}

function initTableDrafts() {
  if (!els.tableSelect) {
    return;
  }
  TABLES.forEach((table) => {
    state.tableDrafts.set(table.key, createTableDraft(table.key));
  });
  const savedTableKey = localStorage.getItem(TABLE_STORAGE_KEY);
  const initialTableKey = savedTableKey && TABLES.some((table) => table.key === savedTableKey)
    ? savedTableKey
    : getActiveTableKey();
  loadTableDraft(initialTableKey);
}

function buildCatalogUiLaunchPath(tableKey, businessRequestId) {
  const params = new URLSearchParams();
  if (businessRequestId) {
    params.set("business_request_id", businessRequestId);
  }
  params.set("table_key", tableKey);
  return `/launch/catalog-ui?${params.toString()}`;
}

function getTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", resolved);
  localStorage.setItem(THEME_STORAGE_KEY, resolved);
  if (els.themeToggleBtn) {
    const label = resolved === "light" ? "Switch to dark mode" : "Switch to light mode";
    els.themeToggleBtn.title = label;
    els.themeToggleBtn.setAttribute("aria-label", label);
  }
}

function toggleTheme() {
  applyTheme(getTheme() === "light" ? "dark" : "light");
}

function showResult(el, data, isError = false) {
  if (!el) {
    return;
  }
  el.hidden = false;
  el.classList.toggle("result-error", isError);
  el.classList.toggle("result-success", !isError);
  el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const card = el.closest(".mcp-tool-result-card");
  if (card) {
    card.hidden = false;
  }
}

function hideResult(el) {
  if (!el) {
    return;
  }
  el.hidden = true;
  const card = el.closest(".mcp-tool-result-card");
  if (card) {
    card.hidden = true;
  }
}

function setWorkflowButtonBusy(button, labelEl, busy, { busyText, idleText } = {}) {
  if (!button) {
    return;
  }
  const idle = idleText || button.dataset.idleText || labelEl?.textContent || button.textContent?.trim() || "";
  if (!button.dataset.idleText) {
    button.dataset.idleText = idle;
  }
  button.classList.toggle("is-busy", busy);
  if (labelEl) {
    labelEl.textContent = busy ? busyText : button.dataset.idleText;
    return;
  }
  button.textContent = busy ? busyText : button.dataset.idleText;
}

function initWorkflowStepNav(navEl, defaultStep = "upload") {
  if (!navEl) {
    return { showStep: () => {} };
  }

  const panelRoot = navEl.closest(".workflow-workbench");
  const buttons = [...navEl.querySelectorAll("[data-workflow-step]")];
  const scopedPanels = panelRoot
    ? [...panelRoot.querySelectorAll(".workflow-step-panel")]
    : [];

  const showStep = (stepId) => {
    buttons.forEach((button) => {
      const active = button.dataset.workflowStep === stepId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    scopedPanels.forEach((panel) => {
      const active = panel.dataset.workflowStep === stepId;
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", active ? "false" : "true");
      panel.removeAttribute("hidden");
    });
    panelRoot?.querySelector(".workflow-main-scroll")?.scrollTo({ top: 0, behavior: "auto" });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => showStep(button.dataset.workflowStep));
  });

  showStep(defaultStep);
  return { showStep };
}

function getConnectedEnvironmentLabel() {
  if (!state.loggedIn || !state.connectedEnvironmentId) {
    return null;
  }
  const env = getEnvironmentById(state.connectedEnvironmentId);
  return env ? getEnvironmentDisplayName(env) : "CatalogOne";
}

function updateWorkflowStatusLine(lineEl, textEl, workflowLabel) {
  if (!lineEl || !textEl) {
    return;
  }
  lineEl.classList.remove("is-online", "is-loading", "is-error");
  const envLabel = getConnectedEnvironmentLabel();
  if (envLabel) {
    lineEl.classList.add("is-online");
    textEl.textContent = `Connected to ${envLabel} — ${workflowLabel} ready.`;
    return;
  }
  lineEl.classList.add("is-loading");
  textEl.textContent = "Connect to a CatalogOne environment in the sidebar to begin.";
}

function updateWorkflowStatusLines() {
  updateWorkflowStatusLine(
    els.pushWorkflowStatus,
    els.pushWorkflowStatusText,
    "upload workflow",
  );
  updateWorkflowStatusLine(
    els.dgWorkflowStatus,
    els.dgWorkflowStatusText,
    "DG import",
  );
}

function updatePushWorkflowStepStates() {
  if (!els.pushStepNav) {
    return;
  }
  const hasZip = isZipFile(els.catalogZipInput?.files?.[0]);
  const hasValidatedZip = Boolean(state.zipAnalyzeResult);
  const hasBr = Boolean(els.businessRequestId?.value.trim());
  const importDone = Boolean(state.zipImportCompleted);
  els.pushStepNav.querySelector('[data-workflow-step="upload"]')
    ?.classList.toggle("is-complete", hasValidatedZip && !state.zipAnalyzeResult?.has_blocking_issues);
  els.pushStepNav.querySelector('[data-workflow-step="review"]')
    ?.classList.toggle("is-complete", importDone || hasBr);
  els.pushStepNav.querySelector('[data-workflow-step="publish"]')
    ?.classList.toggle("is-complete", false);
}

function updateDgWorkflowStepStates() {
  if (!els.dgStepNav) {
    return;
  }
  const analyzed = Boolean(state.dgAnalyzeResult);
  const hasBr = Boolean(els.dgBusinessRequestId?.value.trim());
  els.dgStepNav.querySelector('[data-workflow-step="upload"]')
    ?.classList.toggle("is-complete", analyzed);
  els.dgStepNav.querySelector('[data-workflow-step="import"]')
    ?.classList.toggle("is-complete", state.dgImportCompleted || hasBr);
  els.dgStepNav.querySelector('[data-workflow-step="publish"]')
    ?.classList.toggle("is-complete", false);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTipDescriptionHtml(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return "";
  }
  const sentences = trimmed.split(/(?<=\.)\s+/).filter((part) => part.trim());
  if (sentences.length <= 1) {
    return `<p class="sidebar-float-tip-desc">${escapeHtml(trimmed)}</p>`;
  }
  return sentences.map((sentence) => (
    `<p class="sidebar-float-tip-desc">${escapeHtml(sentence.trim())}</p>`
  )).join("");
}

function analyzeStatCard(label, value, tone = "") {
  const toneClass = tone ? ` is-${tone}` : "";
  return `<div class="analyze-stat${toneClass}"><span class="analyze-stat-value">${escapeHtml(value)}</span><span class="analyze-stat-label">${escapeHtml(label)}</span></div>`;
}

function wireCollapsibleReport(container, toggleBtn, { defaultCollapsed = false } = {}) {
  if (!container || !toggleBtn) {
    return;
  }
  if (!toggleBtn.dataset.wired) {
    toggleBtn.addEventListener("click", () => {
      const collapsed = container.classList.toggle("is-collapsed");
      toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    });
    toggleBtn.dataset.wired = "1";
  }
  if (defaultCollapsed) {
    container.classList.add("is-collapsed");
    toggleBtn.setAttribute("aria-expanded", "false");
  } else {
    container.classList.remove("is-collapsed");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
}

function wireAnalyzeReport({ reportEl, panelEl, jsonEl, toggleEl, toggleBtn, statusBadgeEl, statusText, panelHtml, rawData, isError, defaultCollapsed = false }) {
  if (!reportEl || !panelEl || !jsonEl) {
    return;
  }
  reportEl.hidden = false;
  reportEl.classList.toggle("is-error", Boolean(isError));
  panelEl.innerHTML = panelHtml;
  jsonEl.textContent = typeof rawData === "string" ? rawData : JSON.stringify(rawData, null, 2);
  if (statusBadgeEl && statusText) {
    statusBadgeEl.textContent = statusText;
    statusBadgeEl.className = `analyze-badge${isError ? " is-warn" : " is-ok"}`;
  }
  if (toggleBtn) {
    wireCollapsibleReport(reportEl, toggleBtn, { defaultCollapsed });
  }
  if (toggleEl) {
    if (!toggleEl.dataset.wired) {
      toggleEl.addEventListener("change", () => {
        panelEl.hidden = toggleEl.checked;
        jsonEl.hidden = !toggleEl.checked;
      });
      toggleEl.dataset.wired = "1";
    }
    toggleEl.checked = false;
    panelEl.hidden = false;
    jsonEl.hidden = true;
  }
}

function showAnalyzeError({ reportEl, panelEl, jsonEl, toggleEl, toggleBtn, statusBadgeEl, message, rawData }) {
  wireAnalyzeReport({
    reportEl,
    panelEl,
    jsonEl,
    toggleEl,
    toggleBtn,
    statusBadgeEl,
    statusText: "Failed",
    panelHtml: `<p class="analyze-error-msg">${escapeHtml(message)}</p>`,
    rawData: rawData ?? message,
    isError: true,
  });
}

function buildZipAnalyzeSummary(body) {
  const counts = body.counts || {};
  const changedCount = (counts.new ?? 0) + (counts.changed ?? 0);
  return `<div class="analyze-stat-grid analyze-stat-grid-compact">
    ${analyzeStatCard("Changed", changedCount, changedCount ? "warn" : "")}
    ${analyzeStatCard("Unchanged", counts.unchanged ?? 0)}
    ${analyzeStatCard("PR files", counts.pr_files ?? (body.pr_files || []).length, "accent")}
  </div>`;
}

function buildZipAnalyzeDetails(body) {
  const findings = body.findings || [];
  const blocking = body.has_blocking_issues;
  let html = `<p class="analyze-step-note">${escapeHtml(body.zip_name || body.import_filename || "Zip")}${body.entity_count != null ? ` · ${body.entity_count} entities` : ""}</p>`;

  const blockingFindings = findings.filter((f) => f.blocking !== false).slice(0, 4);
  if (blockingFindings.length) {
    html += `<ul class="analyze-findings analyze-findings-compact">
      ${blockingFindings.map((finding) => `
        <li class="analyze-finding is-warn">${escapeHtml(finding.message || finding.kind)}</li>`).join("")}
      ${findings.length > 4 ? `<li class="analyze-finding">…and ${findings.length - 4} more</li>` : ""}
    </ul>`;
  } else if (!blocking) {
    html += `<p class="analyze-step-note">Ready to import into a business request.</p>`;
  }

  return html;
}

function wireZipValidateReport({ body, isError = false, errorMessage = "", defaultCollapsed = true }) {
  if (!els.zipAnalyzeReport || !els.zipAnalyzeSummary || !els.zipAnalyzePanel) {
    return;
  }

  els.zipAnalyzeReport.hidden = false;
  els.zipAnalyzeReport.classList.toggle("is-error", Boolean(isError));

  if (isError) {
    els.zipAnalyzeSummary.innerHTML = "";
    els.zipAnalyzePanel.innerHTML = `<p class="analyze-error-msg">${escapeHtml(errorMessage)}</p>`;
    if (els.zipAnalyzeStatusBadge) {
      els.zipAnalyzeStatusBadge.textContent = "Failed";
      els.zipAnalyzeStatusBadge.className = "analyze-badge is-warn";
    }
    wireCollapsibleReport(els.zipAnalyzeReport, els.zipAnalyzeToggleBtn, { defaultCollapsed: false });
    return;
  }

  els.zipAnalyzeSummary.innerHTML = buildZipAnalyzeSummary(body);
  els.zipAnalyzePanel.innerHTML = buildZipAnalyzeDetails(body);
  const blocking = body.has_blocking_issues;
  if (els.zipAnalyzeStatusBadge) {
    els.zipAnalyzeStatusBadge.textContent = blocking ? "Review required" : "Ready";
    els.zipAnalyzeStatusBadge.className = `analyze-badge${blocking ? " is-warn" : " is-ok"}`;
  }
  wireCollapsibleReport(els.zipAnalyzeReport, els.zipAnalyzeToggleBtn, { defaultCollapsed });
}

function showZipValidateError(message) {
  wireZipValidateReport({ body: null, isError: true, errorMessage: message, defaultCollapsed: false });
}

function buildBrCreatePanel(result) {
  const brId = result.business_request_id || "";
  const zipName = result.zip_name || state.importFilename || "";
  return `<ul class="analyze-meta-list analyze-meta-list-compact">
    <li><strong>BR:</strong> <code>${escapeHtml(brId)}</code></li>
    <li><strong>Zip:</strong> ${escapeHtml(zipName)}</li>
    <li><strong>Status:</strong> ${escapeHtml(result.message || "Imported")}</li>
  </ul>`;
}

function formatImportFailureMessage(error) {
  const body = error?.body && typeof error.body === "object" ? error.body : null;
  let message = body?.error || error?.message || (typeof error === "string" ? error : "Import failed.");

  const mcpPayload = body?.mcp;
  const nestedError = mcpPayload?.error
    || mcpPayload?.result?.error
    || mcpPayload?.message
    || (typeof mcpPayload?.result === "string" ? mcpPayload.result : null);
  if (nestedError && !message.includes(String(nestedError))) {
    message = `${message} — ${nestedError}`;
  }

  return message;
}

function isZipImportSuccessful(result) {
  if (!result || result.status !== "ok" || result.import_type !== "zip") {
    return false;
  }
  const imported = result.import;
  if (!imported) {
    return false;
  }
  if (imported.error) {
    return false;
  }
  if (["error", "failed", "failure"].includes(String(imported.status || "").toLowerCase())) {
    return false;
  }
  return true;
}

function applyBusinessRequestIdFromResult(result) {
  const brId = result?.business_request_id;
  if (!brId || !els.businessRequestId) {
    return;
  }
  els.businessRequestId.value = brId;
  els.businessRequestId.readOnly = true;
  if (els.clearBrBtn) {
    els.clearBrBtn.hidden = false;
  }
  syncBusinessRequestFields();
}

function showBrCreateResult(result, { isError = false } = {}) {
  if (!els.brCreateResult || !els.brCreatePanel) {
    return;
  }
  if (isError) {
    const message = formatImportFailureMessage(result);
    state.zipImportError = message;
    els.brCreateResult.hidden = false;
    els.brCreateResult.classList.add("is-error");
    els.brCreatePanel.innerHTML = `<p class="analyze-error-msg">${escapeHtml(message)}</p>`;
    if (els.brCreateStatusBadge) {
      els.brCreateStatusBadge.textContent = "Import failed";
      els.brCreateStatusBadge.className = "analyze-badge is-warn";
    }
    wireCollapsibleReport(els.brCreateResult, els.brCreateToggleBtn, { defaultCollapsed: false });
    updateCompareUi();
    return;
  }

  state.zipImportError = null;
  els.brCreateResult.hidden = false;
  els.brCreateResult.classList.remove("is-error");
  els.brCreatePanel.innerHTML = buildBrCreatePanel(result);
  if (els.brCreateStatusBadge) {
    els.brCreateStatusBadge.textContent = "Imported";
    els.brCreateStatusBadge.className = "analyze-badge is-ok";
  }
  wireCollapsibleReport(els.brCreateResult, els.brCreateToggleBtn, { defaultCollapsed: true });
  updateCompareUi();
}

function updateCompareUi() {
  if (!els.brCompareProductionBtn) {
    return;
  }

  const hasBr = !!els.businessRequestId?.value.trim();
  const canCompare = state.zipImportCompleted && hasBr;

  els.brCompareProductionBtn.hidden = !hasBr;
  els.brCompareProductionBtn.disabled = !canCompare;
  els.brCompareProductionBtn.title = canCompare
    ? "Compare imported entities with production"
    : state.zipImportError || "Complete Create BR and Import before comparing";

  if (els.brCompareHint) {
    if (!hasBr || canCompare) {
      els.brCompareHint.hidden = true;
      els.brCompareHint.textContent = "";
    } else {
      els.brCompareHint.hidden = false;
      els.brCompareHint.textContent = state.zipImportError
        || "Zip import did not complete successfully. Compare is unavailable until import succeeds.";
    }
  }
}

function getCompareScrollHost() {
  const section = els.brCompareResultsSection;
  const shell = section?.closest(".workflow-shell");
  if (shell?.classList.contains("has-compare-open")) {
    return (
      els.brCompareReport?.querySelector(".br-compare-table-wrap")
      || els.brCompareReport?.closest(".br-compare-panel-body")
      || shell
    );
  }
  return document.getElementById("pushView") || document.getElementById("appPage") || document.scrollingElement || null;
}

function syncCompareShellLayout() {
  const section = els.brCompareResultsSection;
  const shell = section?.closest(".workflow-shell");
  const open = Boolean(section && !section.hidden && state.brCompareResultsOpen);
  shell?.classList.toggle("has-compare-open", open);
  document.getElementById("pushView")?.classList.toggle("has-compare-results", open);
  document.getElementById("appShell")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

let comparePanelLayoutSyncing = false;

function syncComparePanelLayout() {
  if (comparePanelLayoutSyncing) {
    return;
  }
  comparePanelLayoutSyncing = true;
  try {
    const section = els.brCompareResultsSection;
    const panel = els.brComparePanel;
    const body = els.brCompareReport;
    syncCompareShellLayout();
    if (!section || section.hidden || !panel) {
      if (panel) {
        panel.style.maxHeight = "";
        panel.style.height = "";
      }
      body?.style.removeProperty("max-height");
      body?.querySelector(".br-compare-table-wrap")?.style.removeProperty("max-height");
      return;
    }

    panel.style.maxHeight = "";
    panel.style.height = "";
    body?.style.removeProperty("max-height");
    body?.querySelector(".br-compare-table-wrap")?.style.removeProperty("max-height");
  } finally {
    comparePanelLayoutSyncing = false;
  }
}

function openCompareResultsPanel() {
  if (els.brCompareResultsSection) {
    els.brCompareResultsSection.hidden = false;
  }
  if (els.brComparePanel) {
    els.brComparePanel.hidden = false;
  }
  if (els.brCompareReport) {
    els.brCompareReport.hidden = false;
  }
  state.brCompareResultsOpen = true;
  syncComparePanelLayout();
}

function closeCompareResultsPanel() {
  if (els.brCompareResultsSection) {
    els.brCompareResultsSection.hidden = true;
  }
  state.brCompareResultsOpen = false;
  syncComparePanelLayout();
}

function initComparePanelLayout() {
  if (window.__comparePanelLayoutWired) {
    return;
  }
  window.__comparePanelLayoutWired = true;
  window.addEventListener("resize", () => {
    if (state.brCompareResultsOpen) {
      syncComparePanelLayout();
    }
  });
}

function wireCompareJsonToggle() {
  if (!els.brCompareShowJson || els.brCompareShowJson.dataset.wired === "1") {
    return;
  }
  els.brCompareShowJson.addEventListener("change", () => {
    const showJson = els.brCompareShowJson.checked;
    if (els.brCompareReport) {
      els.brCompareReport.hidden = showJson;
    }
    if (els.brCompareJson) {
      els.brCompareJson.hidden = !showJson;
    }
  });
  els.brCompareShowJson.dataset.wired = "1";
}

function rememberCompareEntityPayload(source) {
  const raw = source?.compare_entities || source?.entities;
  if (!Array.isArray(raw)) {
    return;
  }
  const entities = raw
    .filter((item) => item?.entity_id && item?.entity_type)
    .map((item) => ({
      entity_id: String(item.entity_id).trim(),
      entity_type: String(item.entity_type).trim(),
      title: String(item.title || item.entity_id).trim(),
    }));
  if (entities.length) {
    state.compareEntityPayload = entities;
  }
}

function resetMergeCompareUi() {
  state.zipImportCompleted = false;
  state.zipImportBusinessRequestId = null;
  state.zipImportError = null;
  state.brCompareData = null;
  state.compareEntityPayload = null;
  resetBrCompareTableUi();
  closeCompareResultsPanel();
  if (els.brCompareReport) {
    els.brCompareReport.dataset.compareTableWired = "";
  }
  if (els.brCompareReport) {
    els.brCompareReport.innerHTML = "";
  }
  updateCompareUi();
}

function formatCompareErrorMessage(error) {
  const raw = typeof error === "string" ? error : error?.message || "Compare failed.";
  if (error?.body?.error && typeof error.body.error === "string") {
    return error.body.error;
  }
  const httpMatch = raw.match(/^HTTP (\d+):\s*(.+)$/s);
  if (httpMatch) {
    try {
      const payload = JSON.parse(httpMatch[2]);
      if (payload?.message) {
        return `Compare failed (HTTP ${httpMatch[1]}): ${payload.message}`;
      }
      if (payload?.error) {
        return `Compare failed (HTTP ${httpMatch[1]}): ${payload.error}`;
      }
    } catch {
      // Fall through to raw message.
    }
    return `Compare failed (HTTP ${httpMatch[1]}). Check that the business request exists and you are connected to the right environment.`;
  }
  return raw;
}

function scrollCompareResultsIntoView() {
  if (!els.brCompareResultsSection || els.brCompareResultsSection.hidden) {
    return;
  }
  window.requestAnimationFrame(() => {
    syncComparePanelLayout();
    const section = els.brCompareResultsSection;
    const shell = section.closest(".workflow-shell");
    const tableWrap = els.brCompareReport?.querySelector(".br-compare-table-wrap");
    if (shell?.classList.contains("has-compare-open")) {
      tableWrap?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const scrollHost = getCompareScrollHost();
    if (!scrollHost) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const hostRect = scrollHost.getBoundingClientRect();
    const targetRect = section.getBoundingClientRect();
    const nextTop = scrollHost.scrollTop + (targetRect.top - hostRect.top) - 16;
    scrollHost.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    window.setTimeout(() => {
      const target = tableWrap || section;
      if (!scrollHost || scrollHost === document.scrollingElement) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const nextHostRect = scrollHost.getBoundingClientRect();
      const nextTargetRect = target.getBoundingClientRect();
      const tableTop = scrollHost.scrollTop + (nextTargetRect.top - nextHostRect.top) - 8;
      scrollHost.scrollTo({ top: Math.max(0, tableTop), behavior: "smooth" });
    }, 360);
  });
}

function setCompareRunningUi(compareType, running) {
  setWorkflowButtonBusy(els.brCompareProductionBtn, null, running, {
    busyText: "Comparing…",
    idleText: "Run compare",
  });
  if (els.brCompareProductionBtn) {
    els.brCompareProductionBtn.disabled = running || !(state.zipImportCompleted && getCompareBusinessRequestId());
  }
  if (!running || !els.brCompareTitle) {
    return;
  }
  const compareLabel = compareType === "audit" ? "audit" : "production";
  els.brCompareTitle.textContent = `Comparing with ${compareLabel}…`;
}

function getCompareBusinessRequestId() {
  return (
    state.zipImportBusinessRequestId
    || els.businessRequestId?.value.trim()
    || ""
  );
}

function getCompareEntityPayload() {
  if (state.compareEntityPayload?.length) {
    return state.compareEntityPayload;
  }
  const entities = (state.zipAnalyzeResult?.entities || [])
    .filter((item) => item?.entity_id && item?.entity_type)
    .map((item) => ({
      entity_id: String(item.entity_id).trim(),
      entity_type: String(item.entity_type).trim(),
      title: String(item.title || item.entity_id).trim(),
    }));
  return entities.length ? entities : null;
}

function showCompareSectionAfterImport(businessRequestId) {
  if (!state.zipImportCompleted || !businessRequestId) {
    updateCompareUi();
    return;
  }
  state.zipImportBusinessRequestId = businessRequestId;
  updateCompareUi();
}

function resetMergeBelowStep1() {
  resetMergeCompareUi();

  if (els.businessRequestId) {
    els.businessRequestId.value = "";
    els.businessRequestId.readOnly = false;
  }
  if (els.businessRequestName) {
    els.businessRequestName.value = "";
  }
  if (els.publishBusinessRequestId) {
    els.publishBusinessRequestId.value = "";
  }
  if (els.clearBrBtn) {
    els.clearBrBtn.hidden = true;
  }
  if (els.brCreateResult) {
    els.brCreateResult.hidden = true;
  }
  if (els.brCreatePanel) {
    els.brCreatePanel.innerHTML = "";
  }
  if (els.pushResult) {
    hideResult(els.pushResult);
  }
  if (els.zipAnalyzeReport) {
    els.zipAnalyzeReport.hidden = true;
  }
  if (els.zipAnalyzeSummary) {
    els.zipAnalyzeSummary.innerHTML = "";
  }
  if (els.zipAnalyzePanel) {
    els.zipAnalyzePanel.innerHTML = "";
  }

  state.zipAnalyzeResult = null;
  state.importType = null;
  state.importFilename = null;
  syncBusinessRequestFields();
}

const COMPARE_STAT_DEFS = [
  ["identical", "Identical", "ok"],
  ["changed", "Changed", "warn"],
  ["new_in_br", "New in BR", "accent"],
  ["missing_in_br", "Missing in BR", "muted"],
  ["errors", "Errors", "warn"],
];

function buildBrCompareStatGrid(summary, ui = state.brCompareTableUi) {
  return `<div class="analyze-stat-grid br-compare-stat-grid">
    ${COMPARE_STAT_DEFS.map(([key, label, tone]) => {
    const value = summary[key] ?? 0;
    const active = ui.status === key ? " is-active" : "";
    return `<button
        type="button"
        class="analyze-stat is-${tone} br-compare-stat-btn${active}"
        data-compare-status="${key}"
        title="Filter table to ${label}"
      >
        <span class="analyze-stat-value">${escapeHtml(value)}</span>
        <span class="analyze-stat-label">${escapeHtml(label)}</span>
      </button>`;
  }).join("")}
  </div>`;
}

const COMPARE_STATUS_ORDER = {
  changed: 0,
  new_in_br: 1,
  missing_in_br: 2,
  errors: 3,
  identical: 4,
};

function resetBrCompareTableUi() {
  state.brCompareTableUi = {
    query: "",
    status: "all",
    entityType: "all",
    sortKey: "status",
    sortDir: "asc",
  };
}

function getBrCompareEntityTypes(entities) {
  return [...new Set(entities.map((entity) => entity.entity_type).filter(Boolean))].sort();
}

function entityMatchesCompareFilter(entity, ui) {
  if (ui.status !== "all" && entity.status !== ui.status) {
    return false;
  }
  if (ui.entityType !== "all" && entity.entity_type !== ui.entityType) {
    return false;
  }
  const query = (ui.query || "").trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    entity.status,
    compareStatusLabel(entity.status),
    entity.entity_type,
    entity.title,
    entity.entity_id,
    entity.summary,
    entity.error,
    ...(entity.field_changes || []).flatMap((change) => [
      change.change,
      change.path,
      change.baseline,
      change.current,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function sortCompareEntities(entities, ui) {
  const dir = ui.sortDir === "desc" ? -1 : 1;
  const sorted = [...entities];
  sorted.sort((left, right) => {
    let cmp = 0;
    if (ui.sortKey === "status") {
      const leftOrder = COMPARE_STATUS_ORDER[left.status] ?? 99;
      const rightOrder = COMPARE_STATUS_ORDER[right.status] ?? 99;
      cmp = leftOrder - rightOrder;
      if (cmp === 0) {
        cmp = String(left.entity_type || "").localeCompare(String(right.entity_type || ""));
      }
    } else if (ui.sortKey === "type") {
      cmp = String(left.entity_type || "").localeCompare(String(right.entity_type || ""));
    } else if (ui.sortKey === "entity") {
      cmp = String(left.title || left.entity_id || "").localeCompare(
        String(right.title || right.entity_id || ""),
        undefined,
        { sensitivity: "base" },
      );
    } else {
      cmp = String(left.summary || "").localeCompare(String(right.summary || ""), undefined, {
        sensitivity: "base",
      });
    }
    if (cmp === 0) {
      cmp = String(left.entity_id || "").localeCompare(String(right.entity_id || ""));
    }
    return cmp * dir;
  });
  return sorted;
}

function filterAndSortCompareEntities(entities, ui = state.brCompareTableUi) {
  return sortCompareEntities(
    entities.filter((entity) => entityMatchesCompareFilter(entity, ui)),
    ui,
  );
}

function compareCellTitle(value) {
  const text = value == null ? "" : String(value);
  return text && text !== "—" ? ` title="${escapeHtml(text)}"` : "";
}

const COMPARE_ICON_ENTITY =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3.5 2.5h6L12.5 5.5v8a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 2.5V6h3.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const COMPARE_ICON_FIELD =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
const COMPARE_ICON_SOURCE =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 8h5M8 5.5v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
const COMPARE_ICON_CHEVRON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const COMPARE_VALUE_CLAMP = 150;

function compareChangeBadge(change) {
  const raw = String(change || "").toLowerCase();
  let label = "Changed";
  let tone = "warn";
  if (!raw) {
    return "";
  }
  if (raw.includes("add")) {
    label = "Added";
    tone = "ok";
  } else if (raw.includes("remov") || raw.includes("delet")) {
    label = "Removed";
    tone = "err";
  } else if (raw.includes("modif") || raw.includes("chang") || raw.includes("updat")) {
    label = "Changed";
    tone = "warn";
  } else {
    label = raw.charAt(0).toUpperCase() + raw.slice(1);
    tone = "muted";
  }
  return `<span class="analyze-badge is-${tone} br-compare-diff-badge">${escapeHtml(label)}</span>`;
}

function compareValueCell(value, side) {
  const text = value == null || value === "" ? "" : String(value);
  const isEmpty = text === "";
  return `<div class="br-compare-diff-value is-${side}${isEmpty ? " is-empty" : ""}">
    <div class="br-compare-diff-value-content">${isEmpty ? "—" : escapeHtml(text)}</div>
  </div>`;
}

function compareEmptyGroupNote(entity) {
  if (entity.status === "new_in_br") {
    return "New entity — not present in the production baseline.";
  }
  if (entity.status === "missing_in_br") {
    return "Present in the baseline but missing from this business request.";
  }
  if (entity.status === "errors") {
    return entity.error || entity.summary || "Comparison could not be completed for this entity.";
  }
  return entity.summary || "No field-level differences detected.";
}

function buildBrCompareDiffRow(change) {
  const path = change.path || "";
  const baseline = change.baseline == null ? "" : String(change.baseline);
  const current = change.current == null ? "" : String(change.current);
  const clampable = baseline.length > COMPARE_VALUE_CLAMP || current.length > COMPARE_VALUE_CLAMP;
  return `<div class="br-compare-diff-row${clampable ? " is-clampable" : ""}">
    <div class="br-compare-diff-field"${compareCellTitle(path)}>
      <span class="br-compare-diff-field-icon" aria-hidden="true">${COMPARE_ICON_FIELD}</span>
      <span class="br-compare-diff-field-label">${escapeHtml(path || "—")}</span>
    </div>
    <div class="br-compare-diff-change">${compareChangeBadge(change.change)}</div>
    ${compareValueCell(baseline, "baseline")}
    ${compareValueCell(current, "current")}
    ${clampable
      ? `<button type="button" class="br-compare-diff-toggle" data-compare-expand>Show more</button>`
      : ""}
  </div>`;
}

function buildBrCompareDiffGroup(entity) {
  const entityName = entity.title || entity.entity_id || "";
  const changes = entity.field_changes || [];
  const statusTone = compareStatusTone(entity.status);
  const statusLabel = compareStatusLabel(entity.status);
  const typeChip = entity.entity_type
    ? `<span class="br-compare-diff-group-type">${escapeHtml(entity.entity_type)}</span>`
    : "";
  const countChip = changes.length
    ? `<span class="br-compare-diff-group-count">${changes.length} ${changes.length === 1 ? "field" : "fields"}</span>`
    : "";
  const rows = changes.length
    ? changes.map((change) => buildBrCompareDiffRow(change)).join("")
    : `<div class="br-compare-diff-note">${escapeHtml(compareEmptyGroupNote(entity))}</div>`;
  return `<div class="br-compare-diff-group" data-status="${escapeHtml(entity.status || "")}">
    <div class="br-compare-diff-group-head" role="button" tabindex="0" aria-expanded="true" data-compare-group-toggle title="Show or hide fields">
      <span class="br-compare-diff-group-icon" aria-hidden="true">${COMPARE_ICON_ENTITY}</span>
      <span class="br-compare-diff-group-name"${compareCellTitle(entityName)}>${escapeHtml(entityName)}</span>
      ${typeChip}
      <span class="analyze-badge is-${statusTone} br-compare-diff-group-status">${escapeHtml(statusLabel)}</span>
      ${countChip}
      <span class="br-compare-diff-group-chevron" aria-hidden="true">${COMPARE_ICON_CHEVRON}</span>
    </div>
    ${rows}
  </div>`;
}

function buildBrCompareDiffGroupsHtml(entities) {
  return entities.map((entity) => buildBrCompareDiffGroup(entity)).join("");
}

function buildBrCompareDiffSources(body) {
  const isAudit = body.compare_type === "audit";
  const baselineName = isAudit ? "Audit baseline" : "Production";
  const baselineMeta = isAudit ? "audit history" : "environment";
  const brId = body.business_request_id || "current";
  return `<div class="br-compare-diff-sources">
    <div class="br-compare-diff-colhead">Field</div>
    <div class="br-compare-diff-colhead is-change">Change</div>
    <div class="br-compare-diff-source is-baseline">
      <span class="br-compare-diff-source-icon" aria-hidden="true">${COMPARE_ICON_SOURCE}</span>
      <span class="br-compare-diff-source-body">
        <span class="br-compare-diff-source-name">${escapeHtml(baselineName)}</span>
        <span class="br-compare-diff-source-meta">${escapeHtml(baselineMeta)}</span>
      </span>
      <span class="br-compare-diff-source-pill is-baseline">Baseline</span>
    </div>
    <div class="br-compare-diff-source is-current">
      <span class="br-compare-diff-source-icon" aria-hidden="true">${COMPARE_ICON_SOURCE}</span>
      <span class="br-compare-diff-source-body">
        <span class="br-compare-diff-source-name">BR (local import)</span>
        <span class="br-compare-diff-source-meta"${compareCellTitle(brId)}>${escapeHtml(brId)}</span>
      </span>
      <span class="br-compare-diff-source-pill is-current">Draft</span>
    </div>
  </div>`;
}

function buildBrCompareEntitiesSection(body, ui = state.brCompareTableUi) {
  const entities = body.entities || [];
  if (!entities.length) {
    return "";
  }

  const entityTypes = getBrCompareEntityTypes(entities);
  const filtered = filterAndSortCompareEntities(entities, ui);
  const statusOptions = [
    ["all", "All statuses"],
    ["identical", "Identical"],
    ["changed", "Changed"],
    ["new_in_br", "New in BR"],
    ["missing_in_br", "Missing in BR"],
    ["errors", "Errors"],
  ];

  return `<section class="br-compare-entities br-compare-diff" id="brCompareEntitiesSection">
    <div class="br-compare-toolbar br-compare-diff-toolbar">
      <div class="br-compare-diff-controls">
        <label class="br-compare-filter">
          <span class="br-compare-filter-label">Status</span>
          <select id="brCompareFilterStatus" class="br-compare-filter-select">
            ${statusOptions.map(([value, label]) => `<option value="${value}"${ui.status === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
        </label>
        <label class="br-compare-filter">
          <span class="br-compare-filter-label">Type</span>
          <select id="brCompareFilterType" class="br-compare-filter-select">
            <option value="all"${ui.entityType === "all" ? " selected" : ""}>All types</option>
            ${entityTypes.map((type) => `<option value="${escapeHtml(type)}"${ui.entityType === type ? " selected" : ""}>${escapeHtml(type)}</option>`).join("")}
          </select>
        </label>
        <label class="br-compare-filter br-compare-filter-search">
          <span class="visually-hidden">Filter entities</span>
          <input
            type="search"
            id="brCompareFilterQuery"
            class="br-compare-filter-input"
            placeholder="Filter by name, type, field, value…"
            value="${escapeHtml(ui.query)}"
            autocomplete="off"
          >
        </label>
      </div>
      <p id="brCompareFilterCount" class="br-compare-diff-count">${filtered.length} ${filtered.length === 1 ? "item" : "items"}</p>
    </div>
    <div class="br-compare-table-wrap br-compare-diff-wrap">
      ${buildBrCompareDiffSources(body)}
      <div class="br-compare-diff-groups" id="brCompareEntitiesTbody">
        ${filtered.length
    ? buildBrCompareDiffGroupsHtml(filtered)
    : `<div class="br-compare-diff-empty">No entities match the current filters.</div>`}
      </div>
    </div>
  </section>`;
}

function updateBrCompareSortButtons(ui = state.brCompareTableUi) {
  if (!els.brCompareReport) {
    return;
  }
  els.brCompareReport.querySelectorAll("[data-compare-sort]").forEach((button) => {
    const sortKey = button.dataset.compareSort;
    const active = sortKey === ui.sortKey;
    button.classList.toggle("is-active", active);
    const dirLabel = active ? (ui.sortDir === "asc" ? "ascending" : "descending") : "none";
    button.setAttribute("aria-sort", dirLabel);
    let arrow = button.querySelector(".br-compare-sort-arrow");
    if (active) {
      if (!arrow) {
        arrow = document.createElement("span");
        arrow.className = "br-compare-sort-arrow";
        arrow.setAttribute("aria-hidden", "true");
        button.appendChild(arrow);
      }
      arrow.textContent = ui.sortDir === "asc" ? "↑" : "↓";
    } else if (arrow) {
      arrow.remove();
    }
  });
}

function refreshBrCompareEntitiesTable() {
  if (!state.brCompareData || !els.brCompareReport) {
    return;
  }

  const entities = state.brCompareData.entities || [];
  const filtered = filterAndSortCompareEntities(entities);
  const tbody = els.brCompareReport.querySelector("#brCompareEntitiesTbody");
  if (tbody) {
    tbody.innerHTML = filtered.length
      ? buildBrCompareDiffGroupsHtml(filtered)
      : `<div class="br-compare-diff-empty">No entities match the current filters.</div>`;
  }

  const countEl = els.brCompareReport.querySelector("#brCompareFilterCount");
  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  }
  const entityCountEl = els.brCompareReport.querySelector("#brCompareEntityCount");
  if (entityCountEl) {
    entityCountEl.textContent = String(filtered.length);
  }

  updateBrCompareSortButtons();

  const statGrid = els.brCompareReport.querySelector(".br-compare-stat-grid");
  if (statGrid) {
    statGrid.outerHTML = buildBrCompareStatGrid(state.brCompareData.summary || {}, state.brCompareTableUi);
  }

  syncComparePanelLayout();
}

function wireBrCompareTableInteractions() {
  if (!els.brCompareReport || els.brCompareReport.dataset.compareTableWired === "1") {
    return;
  }
  els.brCompareReport.dataset.compareTableWired = "1";

  els.brCompareReport.addEventListener("input", (event) => {
    if (event.target.id !== "brCompareFilterQuery") {
      return;
    }
    state.brCompareTableUi.query = event.target.value;
    refreshBrCompareEntitiesTable();
  });

  els.brCompareReport.addEventListener("change", (event) => {
    if (event.target.id === "brCompareFilterStatus") {
      state.brCompareTableUi.status = event.target.value;
      refreshBrCompareEntitiesTable();
      return;
    }
    if (event.target.id === "brCompareFilterType") {
      state.brCompareTableUi.entityType = event.target.value;
      refreshBrCompareEntitiesTable();
    }
  });

  const toggleCompareGroup = (groupHead) => {
    const group = groupHead.closest(".br-compare-diff-group");
    if (!group) {
      return;
    }
    const collapsed = group.classList.toggle("is-collapsed");
    groupHead.setAttribute("aria-expanded", collapsed ? "false" : "true");
    syncComparePanelLayout();
  };

  els.brCompareReport.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }
    const groupHead = event.target.closest("[data-compare-group-toggle]");
    if (groupHead) {
      event.preventDefault();
      toggleCompareGroup(groupHead);
    }
  });

  els.brCompareReport.addEventListener("click", (event) => {
    const expandBtn = event.target.closest("[data-compare-expand]");
    if (expandBtn) {
      const row = expandBtn.closest(".br-compare-diff-row");
      if (row) {
        const expanded = row.classList.toggle("is-expanded");
        expandBtn.textContent = expanded ? "Show less" : "Show more";
        syncComparePanelLayout();
      }
      return;
    }

    const groupHead = event.target.closest("[data-compare-group-toggle]");
    if (groupHead) {
      toggleCompareGroup(groupHead);
      return;
    }

    const statBtn = event.target.closest("[data-compare-status]");
    if (statBtn) {
      const status = statBtn.dataset.compareStatus;
      state.brCompareTableUi.status = state.brCompareTableUi.status === status ? "all" : status;
      const statusSelect = els.brCompareReport.querySelector("#brCompareFilterStatus");
      if (statusSelect) {
        statusSelect.value = state.brCompareTableUi.status;
      }
      refreshBrCompareEntitiesTable();
      return;
    }

    const sortBtn = event.target.closest("[data-compare-sort]");
    if (!sortBtn) {
      return;
    }
    const sortKey = sortBtn.dataset.compareSort;
    if (state.brCompareTableUi.sortKey === sortKey) {
      state.brCompareTableUi.sortDir = state.brCompareTableUi.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.brCompareTableUi.sortKey = sortKey;
      state.brCompareTableUi.sortDir = "asc";
    }
    refreshBrCompareEntitiesTable();
  });
}

function compareStatusTone(status) {
  if (status === "identical") {
    return "ok";
  }
  if (status === "changed") {
    return "warn";
  }
  if (status === "new_in_br") {
    return "accent";
  }
  if (status === "errors") {
    return "warn";
  }
  return "muted";
}

function compareStatusLabel(status) {
  const labels = {
    identical: "Identical",
    changed: "Changed",
    new_in_br: "New in BR",
    missing_in_br: "Missing in BR",
    errors: "Error",
  };
  return labels[status] || status;
}

function buildBrComparePanel(body) {
  const summary = body.summary || {};
  const entities = body.entities || [];

  let html = `<p class="br-compare-stat-hint analyze-step-note">Click a result type below to filter. Use search to narrow rows.</p>`;
  html += buildBrCompareStatGrid(summary);

  html += `<div class="analyze-badge-row">
    <span class="analyze-badge is-accent">${body.compare_type === "audit" ? "Compared with audit history" : "BR (local import) vs production (environment)"}</span>
    <span class="analyze-badge is-muted">BR ${escapeHtml(body.business_request_id || "")}</span>
  </div>`;

  if (summary.truncated && summary.total_entity_count > summary.entity_count) {
    html += `<p class="analyze-step-note">Compared the first ${summary.entity_count} of ${summary.total_entity_count} entities for responsiveness. Re-run on a smaller zip or filter entities for a full compare.</p>`;
  }

  if (!entities.length) {
    html += `<p class="analyze-error-msg">No entities were compared.</p>`;
    return html;
  }

  html += buildBrCompareEntitiesSection(body);

  return html;
}

function showBrCompareReport(body, { isError = false } = {}) {
  if (!els.brComparePanel || !els.brCompareReport || !els.brCompareJson) {
    return;
  }

  wireCompareJsonToggle();

  const compareLabel = body?.compare_type === "audit" ? "Audit" : "Production";
  if (els.brCompareTitle) {
    els.brCompareTitle.textContent = isError
      ? "Compare failed"
      : `Compare with ${compareLabel}`;
  }

  const panelHtml = isError
    ? `<p class="analyze-error-msg">${escapeHtml(formatCompareErrorMessage(typeof body === "string" ? body : body?.error || body))}</p>`
    : buildBrComparePanel(body);

  els.brCompareReport.innerHTML = panelHtml;
  els.brCompareJson.textContent = typeof body === "string"
    ? body
    : JSON.stringify(body, null, 2);
  els.brComparePanel.classList.toggle("is-error", Boolean(isError));

  if (els.brCompareShowJson) {
    els.brCompareShowJson.checked = false;
  }
  els.brCompareReport.hidden = false;
  els.brCompareJson.hidden = true;

  if (!isError && body?.entities?.length) {
    state.brCompareData = body;
    resetBrCompareTableUi();
    wireBrCompareTableInteractions();
  } else {
    state.brCompareData = null;
  }

  openCompareResultsPanel();
  scrollCompareResultsIntoView();
  window.requestAnimationFrame(syncComparePanelLayout);
}

async function runBrCompare(compareType, businessRequestId) {
  const brId = businessRequestId || getCompareBusinessRequestId();
  if (!brId) {
    showBrCompareReport("No business request ID available for compare.", { isError: true });
    return;
  }

  openCompareResultsPanel();
  if (els.brCompareReport) {
    els.brCompareReport.innerHTML = `<p class="analyze-step-note analyze-compare-loading">Comparing with ${compareType}…</p>`;
  }
  els.brCompareResultsSection?.classList.add("is-running");
  setCompareRunningUi(compareType, true);
  scrollCompareResultsIntoView();

  try {
    const payload = { compare_type: compareType };
    const entities = getCompareEntityPayload();
    if (entities) {
      payload.entities = entities;
    }
    const result = await api(`/api/business-request/${encodeURIComponent(brId)}/compare`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (result?.error && !result?.entities?.length) {
      showBrCompareReport(result, { isError: true });
      return;
    }
    showBrCompareReport(result);
  } catch (error) {
    showBrCompareReport(formatCompareErrorMessage(error), { isError: true });
  } finally {
    els.brCompareResultsSection?.classList.remove("is-running");
    setCompareRunningUi(compareType, false);
    updateCompareUi();
  }
}

async function promptCompareAfterImport(businessRequestId) {
  showCompareSectionAfterImport(businessRequestId);
}

function buildExcelAnalyzePanel(body) {
  const summary = body.summary || {};
  const findings = body.findings || [];
  const mcpPlan = body.mcp_plan || [];
  const plannedEntries = body.planned_entries || [];
  const samples = plannedEntries.slice(0, 8);
  const policies = (body.policy_directives || []).slice(0, 5);

  let html = `<div class="analyze-stat-grid">
    ${analyzeStatCard("Modify reasons", summary.modify_reason_entries ?? 0, "accent")}
    ${analyzeStatCard("Actions", summary.action_entries ?? 0, "accent")}
    ${analyzeStatCard("Policies", summary.policy_directives ?? 0, "warn")}
    ${analyzeStatCard("Unique codes", summary.unique_reason_codes ?? 0, "ok")}
  </div>`;

  html += `<div class="analyze-badge-row">
    <span class="analyze-badge is-muted">Publish blocked — preview only</span>
    <span class="analyze-badge">${escapeHtml(plannedEntries.length)} planned entries</span>
  </div>`;

  html += `<section>
    <h5 class="analyze-section-title">Workbook</h5>
    <ul class="analyze-meta-list">
      <li><strong>Name:</strong> ${escapeHtml(body.workbook_name)}</li>
      <li><strong>Rows parsed:</strong> ${escapeHtml(summary.total_rows_parsed ?? "—")}</li>
    </ul>
  </section>`;

  if (findings.length) {
    html += `<section>
      <h5 class="analyze-section-title">Findings</h5>
      <ul class="analyze-findings">
        ${findings.map((finding) => `
          <li class="analyze-finding${finding.kind?.includes("duplicate") ? " is-warn" : ""}">
            ${escapeHtml(finding.message)}
          </li>`).join("")}
      </ul>
    </section>`;
  }

  if (mcpPlan.length) {
    html += `<section>
      <h5 class="analyze-section-title">MCP plan</h5>
      <ol class="analyze-steps">
        ${mcpPlan.map((step) => `
          <li class="analyze-step">
            <span class="analyze-step-num">${escapeHtml(step.step)}</span>
            <div class="analyze-step-body">
              <span class="analyze-step-tool">${escapeHtml(step.tool)}</span>
              <p class="analyze-step-note">${escapeHtml(step.note)}</p>
            </div>
          </li>`).join("")}
      </ol>
    </section>`;
  }

  if (samples.length) {
    html += `<section>
      <h5 class="analyze-section-title">Sample entries</h5>
      <div class="analyze-table-wrap">
        <table class="analyze-table">
          <thead><tr><th>Code</th><th>Table</th><th>Action</th><th>Description</th></tr></thead>
          <tbody>
            ${samples.map((entry) => {
              const localized = entry.generic_element_entry?.localizedName;
              const description = Array.isArray(localized)
                ? localized.find((item) => item?.value)?.value
                : "";
              return `<tr>
                <td><code>${escapeHtml(entry.reason_code)}</code></td>
                <td>${escapeHtml(entry.table_label || entry.table_key)}</td>
                <td>${escapeHtml(entry.order_action || "—")}</td>
                <td>${escapeHtml(description || "—")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${plannedEntries.length > samples.length
        ? `<p class="field-hint">Showing ${samples.length} of ${plannedEntries.length} — enable raw JSON for full payloads.</p>`
        : ""}
    </section>`;
  }

  if (policies.length) {
    html += `<section>
      <h5 class="analyze-section-title">Policy directives (sample)</h5>
      <div class="analyze-table-wrap">
        <table class="analyze-table">
          <thead><tr><th>Policy</th><th>Action</th><th>Reason</th><th>Directive</th></tr></thead>
          <tbody>
            ${policies.map((policy) => `<tr>
              <td>${escapeHtml(policy.policyName || "—")}</td>
              <td>${escapeHtml(policy.action || "—")}</td>
              <td>${escapeHtml(policy.reason || "—")}</td>
              <td>${escapeHtml(policy.prorationDirective || "—")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  return html;
}

function normalizeApigwUrl(apigwUrl) {
  const trimmed = apigwUrl.trim().replace(/\/$/, "");
  const match = trimmed.match(/^https:\/\/amd-apigw-([^.]+)\.apps\.(.+)$/);
  if (!match) {
    return trimmed;
  }
  let envName = match[1].replace(/-runtime$/, "");
  if (!envName.endsWith("-authoring")) {
    envName = `${envName}-authoring`;
  }
  return `https://amd-apigw-${envName}.apps.${match[2].replace(/\/$/, "")}`;
}

function deriveEnvironmentLabel(apigwUrl) {
  const match = normalizeApigwUrl(apigwUrl).match(/amd-apigw-([^.]+)\./);
  return match ? match[1] : apigwUrl.trim();
}

function deriveCatalogUiUrl(apigwUrl) {
  return normalizeApigwUrl(apigwUrl).replace("amd-apigw-", "c1-web-ui-");
}

function friendlyEnvironmentLabel(technicalLabel) {
  const value = (technicalLabel || "").trim();
  const match = value.match(/^amo-(il\d+-rel\d+)-authoring$/i);
  if (match) {
    return match[1];
  }
  return value.replace(/-authoring$/, "") || value;
}

function displayNameMatchesEnvironment(displayName, apigwUrl, technicalLabel) {
  const custom = (displayName || "").trim();
  const derived = (technicalLabel || deriveEnvironmentLabel(apigwUrl || "")).trim();
  if (!custom) {
    return false;
  }
  if (!derived) {
    return true;
  }
  const dn = custom.toLowerCase();
  const core = derived.replace(/-authoring$/, "").toLowerCase();
  if (core && dn.includes(core)) {
    return true;
  }
  return core
    .split("-")
    .filter((part) => part.length > 2)
    .some((part) => dn.includes(part));
}

function displayNameLooksMismatched(displayName, apigwUrl, technicalLabel) {
  const custom = (displayName || "").trim();
  if (!custom) {
    return false;
  }
  if (displayNameMatchesEnvironment(custom, apigwUrl, technicalLabel)) {
    return false;
  }
  const derived = (technicalLabel || deriveEnvironmentLabel(apigwUrl || "")).trim();
  const core = derived.replace(/-authoring$/, "").toLowerCase();
  const foreignClusters = custom.match(/il\d+-rel\d+/gi) || [];
  if (!foreignClusters.length) {
    return false;
  }
  return foreignClusters.some((cluster) => !core.includes(cluster.toLowerCase()));
}

function environmentTechnicalLabel(environment) {
  return deriveEnvironmentLabel(environment?.apigw_url || "") || environment?.label || "";
}

function resolveEnvironmentDisplayName(profile, existing = null) {
  const apigwUrl = profile.apigw_url || existing?.apigw_url || "";
  const technicalLabel = deriveEnvironmentLabel(apigwUrl) || existing?.label || "";
  const friendly = friendlyEnvironmentLabel(technicalLabel);
  const custom = (profile.display_name ?? "").trim();
  if (custom && !displayNameLooksMismatched(custom, apigwUrl, technicalLabel)) {
    return custom;
  }
  const existingCustom = (existing?.display_name ?? "").trim();
  if (
    existingCustom
    && !displayNameLooksMismatched(existingCustom, apigwUrl, technicalLabel)
  ) {
    return existingCustom;
  }
  return friendly || technicalLabel;
}

function getEnvironmentDisplayName(environment) {
  const technicalLabel = environmentTechnicalLabel(environment);
  const custom = (environment?.display_name || "").trim();
  if (custom && !displayNameLooksMismatched(custom, environment?.apigw_url, technicalLabel)) {
    return custom;
  }
  return friendlyEnvironmentLabel(technicalLabel) || technicalLabel;
}

function getEnvironmentSidebarLabel(environment, environments) {
  const base = getEnvironmentDisplayName(environment);
  const duplicates = (environments || []).filter(
    (item) => getEnvironmentDisplayName(item) === base,
  );
  if (duplicates.length <= 1) {
    return base;
  }
  const cluster = friendlyEnvironmentLabel(environmentTechnicalLabel(environment));
  if (cluster && cluster !== base) {
    return `${base} · ${cluster}`;
  }
  return `${base} · ${environment.id}`;
}


function environmentKey(profile) {
  return [
    profile.apigw_url?.trim(),
    profile.keycloak_url?.trim(),
    profile.keycloak_realm?.trim(),
    profile.username?.trim(),
  ].join("|");
}

function loadEnvironmentStore() {
  return environmentStore;
}

async function persistEnvironmentStore(store) {
  environmentStore = store;
  await api("/api/environments", {
    method: "PUT",
    body: JSON.stringify(store),
  });
}

async function saveEnvironmentStore(store) {
  environmentStore = store;
  try {
    await persistEnvironmentStore(store);
  } catch (error) {
    console.error("Failed to save environments:", error);
    setMainConnectionHintState(
      false,
      `<span class="connection-status-label connection-status-disconnected">Not connected</span> `
        + `<span class="connection-error-text">Could not save environments: ${escapeHtml(error.message)}</span>`,
    );
    throw error;
  }
}

async function loadEnvironmentsFromServer(options = {}) {
  const { silent = false } = options;
  const refreshBtn = els.refreshEnvironmentsBtn;
  if (refreshBtn && !silent) {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");
  }

  try {
    const serverStore = await api(`/api/environments?_=${Date.now()}`, { cache: "no-store" });
    const previousActiveId = state.activeEnvironmentId;

    environmentStore = {
      activeEnvironmentId: serverStore.activeEnvironmentId ?? null,
      environments: Array.isArray(serverStore.environments) ? serverStore.environments : [],
    };

    const store = loadEnvironmentStore();
    if (store.activeEnvironmentId && getEnvironmentById(store.activeEnvironmentId)) {
      state.activeEnvironmentId = store.activeEnvironmentId;
    } else if (previousActiveId && getEnvironmentById(previousActiveId)) {
      state.activeEnvironmentId = previousActiveId;
    } else {
      state.activeEnvironmentId = store.environments[0]?.id || null;
    }

    if (state.activeEnvironmentId) {
      const environment = getEnvironmentById(state.activeEnvironmentId);
      if (environment) {
        applyConnectionFields(environment);
      }
    }

    renderEnvironmentSidebar();
    updateMainConnectionHint();
  } catch (error) {
    console.warn("Could not load environments from server:", error);
    if (!silent) {
      setMainConnectionHintState(
        false,
        `<span class="connection-status-label connection-status-disconnected">Not connected</span> `
          + `<span class="connection-error-text">Could not reload environments: ${escapeHtml(error.message)}</span>`,
      );
    }
  } finally {
    if (refreshBtn && !silent) {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("is-loading");
    }
  }
}

async function refreshEnvironmentsFromServer() {
  return loadEnvironmentsFromServer({ silent: false });
}

let environmentsRefreshTimer = null;
function scheduleEnvironmentsRefresh() {
  clearTimeout(environmentsRefreshTimer);
  environmentsRefreshTimer = setTimeout(() => {
    void loadEnvironmentsFromServer({ silent: true });
  }, 400);
}

function getConnectionFields() {
  const apigwUrl = normalizeApigwUrl(els.apigwUrlInput.value);
  els.apigwUrlInput.value = apigwUrl;
  return {
    display_name: els.environmentDisplayNameInput.value.trim(),
    apigw_url: apigwUrl,
    keycloak_url: els.keycloakUrlInput.value.trim(),
    keycloak_realm: els.keycloakRealmInput.value.trim(),
    username: els.usernameInput.value.trim(),
    password: els.passwordInput.value,
  };
}

function applyConnectionFields(profile) {
  els.environmentDisplayNameInput.value = profile.display_name || getEnvironmentDisplayName(profile);
  els.apigwUrlInput.value = profile.apigw_url || "";
  els.keycloakUrlInput.value = profile.keycloak_url || "";
  els.keycloakRealmInput.value = profile.keycloak_realm || "";
  els.usernameInput.value = profile.username || "";
  els.passwordInput.value = profile.password || "";
  state.activeEnvironmentId = profile.id || null;
  state.currentEnvironmentLabel = getEnvironmentDisplayName(profile);
}

function getEnvironmentById(environmentId) {
  return loadEnvironmentStore().environments.find((item) => item.id === environmentId);
}

function fillDefaultConnectionFields() {
  els.environmentDisplayNameInput.value = "";
  els.apigwUrlInput.value = "";
  els.keycloakUrlInput.value = "";
  els.keycloakRealmInput.value = "";
  els.usernameInput.value = "";
  els.passwordInput.value = "";
}

function openConnectionModal(mode, environmentId = null) {
  state.editingEnvironmentId = mode === "edit" ? environmentId : null;
  els.loginResult.hidden = true;

  if (mode === "edit") {
    const environment = getEnvironmentById(environmentId);
    if (!environment) {
      return;
    }
    applyConnectionFields(environment);
    els.connectionModalTitle.textContent = "Edit Environment";
    els.connectionModalDesc.innerHTML = "Update the connection definition.<br>Connect from the sidebar when you are ready.";
  } else {
    fillDefaultConnectionFields();
    els.connectionModalTitle.textContent = "New Environment";
    els.connectionModalDesc.innerHTML = "Define endpoints and credentials.<br>Save now and connect from the sidebar.";
  }

  els.connectionModal.showModal();
  els.environmentDisplayNameInput.focus();
}

function closeConnectionModal() {
  els.connectionModal.close();
  els.loginResult.hidden = true;
  state.editingEnvironmentId = null;
}

function saveEnvironmentFromForm() {
  const payload = getConnectionFields();
  if (!payload.apigw_url || !payload.keycloak_url || !payload.keycloak_realm || !payload.username) {
    throw new Error("Fill in all required connection fields.");
  }

  const store = loadEnvironmentStore();
  const existingById = state.editingEnvironmentId
    ? store.environments.find((item) => item.id === state.editingEnvironmentId)
    : null;
  const existingByKey = store.environments.find((item) => environmentKey(item) === environmentKey(payload));
  const existing = existingById || existingByKey;

  if (!payload.password && existing?.password) {
    payload.password = existing.password;
  }
  if (!payload.password) {
    throw new Error("Password is required when saving a new environment.");
  }

  const suggestedLabel = deriveEnvironmentLabel(payload.apigw_url);
  const displayName = resolveEnvironmentDisplayName(
    { ...payload, display_name: payload.display_name || suggestedLabel },
    existing,
  );

  return upsertEnvironment({
    ...payload,
    id: existing?.id || state.editingEnvironmentId || undefined,
    display_name: displayName,
  });
}

async function ensureConnectionFieldsMatchApigw() {
  const apigwUrl = normalizeApigwUrl(els.apigwUrlInput.value);
  if (!apigwUrl) {
    throw new Error("API gateway URL is required.");
  }
  const data = await api(`/api/derive-urls?apigw_url=${encodeURIComponent(apigwUrl)}`);
  els.apigwUrlInput.value = data.apigw_url;
  els.keycloakUrlInput.value = data.keycloak_url;
  els.keycloakRealmInput.value = data.environment_label;
  return data;
}

async function connectEnvironment(environmentId) {
  const environment = getEnvironmentById(environmentId);
  if (!environment) {
    throw new Error("Environment not found.");
  }
  if (!environment.password) {
    throw new Error("Password is missing — edit the environment and try again.");
  }

  applyConnectionFields(environment);
  state.activeEnvironmentId = environmentId;
  await ensureConnectionFieldsMatchApigw();

  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => null);
  setLoggedIn(false);

  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify(getConnectionFields()),
  });

  const saved = upsertEnvironment({
    ...environment,
    ...getConnectionFields(),
    password: environment.password,
  });

  if (result.normalized_apigw_url) {
    els.apigwUrlInput.value = result.normalized_apigw_url;
    saved.apigw_url = result.normalized_apigw_url;
    upsertEnvironment(saved);
  }

  state.connectedEnvironmentId = saved.id;
  state.activeEnvironmentId = saved.id;
  setLoggedIn(true, result.username, getEnvironmentDisplayName(saved));
  renderEnvironmentSidebar();
  return saved;
}

async function deleteEnvironment(environmentId) {
  const environment = getEnvironmentById(environmentId);
  if (!environment) {
    return;
  }

  const label = getEnvironmentDisplayName(environment);
  if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) {
    return;
  }

  if (state.connectedEnvironmentId === environmentId) {
    await api("/api/logout", { method: "POST", body: "{}" }).catch(() => null);
    setLoggedIn(false);
  }

  removeEnvironment(environmentId);
}

function upsertEnvironment(profile) {
  const store = loadEnvironmentStore();
  const key = environmentKey(profile);
  let existing = null;
  if (profile.id) {
    existing = store.environments.find((item) => item.id === profile.id) || null;
  } else {
    existing = store.environments.find((item) => environmentKey(item) === key) || null;
  }
  const now = Date.now();
  const technicalLabel = deriveEnvironmentLabel(profile.apigw_url);
  const displayName = resolveEnvironmentDisplayName(profile, existing);
  const next = {
    id: existing?.id || profile.id || newEnvironmentId(),
    display_name: displayName,
    label: technicalLabel,
    apigw_url: profile.apigw_url.trim(),
    keycloak_url: profile.keycloak_url.trim(),
    keycloak_realm: profile.keycloak_realm.trim(),
    username: profile.username.trim(),
    password: profile.password || existing?.password || "",
    last_used_at: now,
  };

  store.environments = [
    next,
    ...store.environments.filter((item) => item.id !== next.id),
  ].slice(0, 12);

  store.activeEnvironmentId = next.id;
  void saveEnvironmentStore(store);
  state.activeEnvironmentId = next.id;
  state.currentEnvironmentLabel = getEnvironmentDisplayName(next);
  renderEnvironmentSidebar();
  return next;
}

function removeEnvironment(environmentId) {
  const store = loadEnvironmentStore();
  store.environments = store.environments.filter((item) => item.id !== environmentId);
  if (store.activeEnvironmentId === environmentId) {
    store.activeEnvironmentId = store.environments[0]?.id || null;
    state.activeEnvironmentId = store.activeEnvironmentId;
  }
  if (state.connectedEnvironmentId === environmentId) {
    state.connectedEnvironmentId = null;
  }
  void saveEnvironmentStore(store);
  renderEnvironmentSidebar();
  updateMainConnectionHint();
}

function sortEnvironmentsForSidebar(environments) {
  return [...environments].sort((a, b) => {
    const aConnected = state.loggedIn && state.connectedEnvironmentId === a.id;
    const bConnected = state.loggedIn && state.connectedEnvironmentId === b.id;
    if (aConnected !== bConnected) {
      return aConnected ? -1 : 1;
    }
    return (b.last_used_at || 0) - (a.last_used_at || 0);
  });
}

async function handleEnvironmentConnectClick(environmentId) {
  try {
    await connectEnvironment(environmentId);
  } catch (error) {
    setLoggedIn(false);
    if (error.message.includes("Password")) {
      openConnectionModal("edit", environmentId);
      showResult(els.loginResult, error.message, true);
      return;
    }
    setMainConnectionHintState(
      false,
      `<span class="connection-status-label connection-status-disconnected">Not connected</span> <span class="connection-error-text">${escapeHtml(error.message)}</span>`,
    );
  }
}

async function toggleEnvironmentConnection(environmentId) {
  const currentlyConnected = state.loggedIn && state.connectedEnvironmentId === environmentId;
  if (currentlyConnected) {
    await disconnectSession();
    return;
  }
  state.activeEnvironmentId = environmentId;
  const environment = getEnvironmentById(environmentId);
  if (environment) {
    applyConnectionFields(environment);
  }
  await handleEnvironmentConnectClick(environmentId);
}

function renderEnvironmentSidebar() {
  const store = loadEnvironmentStore();
  const environments = sortEnvironmentsForSidebar(store.environments);

  if (els.envSidebarEmpty) {
    els.envSidebarEmpty.hidden = environments.length > 0;
  }
  if (!els.environmentSidebarList) {
    return;
  }

  els.environmentSidebarList.innerHTML = "";

  for (const environment of environments) {
    const node = els.environmentItemTemplate.content.cloneNode(true);
    const item = node.querySelector(".env-card");
    const displayName = getEnvironmentSidebarLabel(environment, environments);
    const isConnected = state.loggedIn && state.connectedEnvironmentId === environment.id;
    const isSelected = state.activeEnvironmentId === environment.id;

    item.dataset.environmentId = environment.id;
    item.classList.toggle("env-card-connected", isConnected);
    item.classList.toggle("env-card-disconnected", !isConnected);
    item.classList.toggle("env-card-selected", isSelected && !isConnected);

    const nameEl = item.querySelector(".env-card-name");
    nameEl.textContent = displayName;
    nameEl.title = displayName;

    const bodyBtn = item.querySelector(".env-card-body");
    if (bodyBtn) {
      bodyBtn.setAttribute("aria-label", `${displayName}${isConnected ? " (connected)" : ""}`);
    }

    const connectBtn = item.querySelector(".env-action-connect");
    const disconnectBtn = item.querySelector(".env-action-disconnect");
    if (isConnected) {
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
    } else {
      connectBtn.hidden = false;
      disconnectBtn.hidden = true;
      connectBtn.title = "Connect";
    }

    item.querySelector(".env-action-connect").addEventListener("click", async (event) => {
      event.stopPropagation();
      await handleEnvironmentConnectClick(environment.id);
    });

    item.querySelector(".env-action-disconnect").addEventListener("click", async (event) => {
      event.stopPropagation();
      await disconnectSession();
    });

    item.querySelector(".env-action-edit").addEventListener("click", (event) => {
      event.stopPropagation();
      state.activeEnvironmentId = environment.id;
      renderEnvironmentSidebar();
      openConnectionModal("edit", environment.id);
    });

    item.querySelector(".env-action-delete").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteEnvironment(environment.id);
    });

    item.querySelector(".env-card-inner").addEventListener("click", (event) => {
      if (event.target.closest(".env-card-actions")) {
        return;
      }
      void toggleEnvironmentConnection(environment.id);
    });

    els.environmentSidebarList.appendChild(node);
  }
}

function restoreSelectedEnvironment() {
  const store = loadEnvironmentStore();
  renderEnvironmentSidebar();
  if (store.activeEnvironmentId && getEnvironmentById(store.activeEnvironmentId)) {
    state.activeEnvironmentId = store.activeEnvironmentId;
    applyConnectionFields(getEnvironmentById(store.activeEnvironmentId));
    return;
  }
  if (store.environments.length === 1) {
    state.activeEnvironmentId = store.environments[0].id;
    applyConnectionFields(store.environments[0]);
  }
}

function getPublishBusinessRequestId() {
  return (els.publishBusinessRequestId?.value || els.businessRequestId?.value || "").trim();
}

function syncPublishBrIdFromStep2() {
  if (!els.publishBusinessRequestId || !els.businessRequestId) {
    return;
  }
  els.publishBusinessRequestId.value = els.businessRequestId.value;
  updatePublishBrUi();
}

function syncStep2BrIdFromPublish() {
  if (!els.publishBusinessRequestId || !els.businessRequestId) {
    return;
  }
  els.businessRequestId.value = els.publishBusinessRequestId.value;
  updateMergeBrUi();
}

function updatePublishBrUi() {
  const publishId = getPublishBusinessRequestId();
  if (els.publishBusinessRequestIdHint) {
    els.publishBusinessRequestIdHint.textContent = publishId
      ? "Ready to publish this business request."
      : "Paste an existing BR UUID or create one in Step 2.";
  }
}

function isZipFile(file) {
  return Boolean(file?.name?.toLowerCase().endsWith(".zip"));
}

function isExcelFile(file) {
  return Boolean(file?.name?.toLowerCase().match(/\.(xlsx|xlsm)$/));
}

function updateMergeBrUi() {
  const hasBr = !!els.businessRequestId?.value.trim();
  const hasName = !!els.businessRequestName?.value.trim();
  const hasZip = isZipFile(els.catalogZipInput?.files?.[0]);
  const connected = isCatalogOneConnected();

  if (els.clearBrBtn) {
    els.clearBrBtn.hidden = !hasBr;
  }
  if (els.businessRequestId) {
    els.businessRequestId.readOnly = hasBr;
  }
  if (els.createBrBtn) {
    const busy = els.createBrBtn.classList.contains("is-busy");
    els.createBrBtn.disabled = busy || hasBr || !connected || !hasZip || !hasName;
    const reasons = [];
    if (hasBr) reasons.push("Clear the business request ID to create another");
    else if (!connected) reasons.push("Connect to CatalogOne first");
    else if (!hasZip) reasons.push("Choose a zip file in Step 1 first");
    else if (!hasName) reasons.push("Enter a business request name");
    els.createBrBtn.title = reasons.join(" · ") || "Create a business request and import the zip";
  }
  updateCompareUi();
  updatePushWorkflowStepStates();
}

function setActionButtonsEnabled() {
  const hasBr = !!getPublishBusinessRequestId();
  els.publishBtn.disabled = !isCatalogOneConnected() || !hasBr;
  updateMergeBrUi();
  updatePublishBrUi();
  setDgActionButtonsEnabled();
}

function getDgPublishBusinessRequestId() {
  return (els.dgPublishBusinessRequestId?.value || els.dgBusinessRequestId?.value || "").trim();
}

function syncDgPublishBrIdFromStep2() {
  if (!els.dgPublishBusinessRequestId || !els.dgBusinessRequestId) {
    return;
  }
  els.dgPublishBusinessRequestId.value = els.dgBusinessRequestId.value;
  updateDgPublishBrUi();
}

function syncDgStep2BrIdFromPublish() {
  if (!els.dgPublishBusinessRequestId || !els.dgBusinessRequestId) {
    return;
  }
  els.dgBusinessRequestId.value = els.dgPublishBusinessRequestId.value;
  updateDgBrUi();
}

function updateDgPublishBrUi() {
  const publishId = getDgPublishBusinessRequestId();
  if (els.dgPublishBusinessRequestIdHint) {
    els.dgPublishBusinessRequestIdHint.textContent = publishId
      ? state.dgImportCompleted
        ? "Entries imported — ready to publish this business request."
        : "Import entries in Step 2 before publishing."
      : "Paste an existing BR UUID or create one in Step 2.";
  }
}

function updateDgBrUi() {
  const hasBr = !!els.dgBusinessRequestId?.value.trim();
  const hasName = !!els.dgBusinessRequestName?.value.trim();
  const connected = state.loggedIn;
  const analyzed = Boolean(state.dgAnalyzeResult);

  if (els.dgBrConnectHint) {
    els.dgBrConnectHint.classList.toggle("is-connected", connected);
  }
  if (els.dgBrConnectHintText) {
    if (!analyzed) {
      els.dgBrConnectHintText.innerHTML = "Analyze your workbook in Step 1 first, then connect and create a business request.";
    } else if (!connected) {
      els.dgBrConnectHintText.innerHTML = 'Connect to an environment in the sidebar (click <strong>Connect</strong>), then create your business request below.';
    } else {
      els.dgBrConnectHintText.innerHTML = "Connected. Create a business request, then click <strong>Import entries to catalog</strong>.";
    }
  }
  if (els.dgCreateBrBtnHint) {
    if (hasBr) {
      els.dgCreateBrBtnHint.textContent = "Business request ID is set. Clear it to create another.";
    } else if (!connected) {
      els.dgCreateBrBtnHint.textContent = "CatalogOne connection required — use Connect in the sidebar.";
    } else if (!hasName) {
      els.dgCreateBrBtnHint.textContent = "Enter a business request name above.";
    } else {
      els.dgCreateBrBtnHint.textContent = "Ready to create.";
    }
  }
  if (els.dgCreateBrBtn) {
    els.dgCreateBrBtn.disabled = hasBr;
  }
  if (els.dgImportEntriesHint) {
    const entryCount = state.dgAnalyzeResult?.planned_entries?.length || 0;
    if (!analyzed) {
      els.dgImportEntriesHint.textContent = "Analyze the workbook first to load entry payloads.";
    } else if (!connected) {
      els.dgImportEntriesHint.textContent = "Connect to CatalogOne before importing entries.";
    } else if (!hasBr) {
      els.dgImportEntriesHint.textContent = "Create or paste a business request ID first.";
    } else if (state.dgImportCompleted) {
      els.dgImportEntriesHint.textContent = `${entryCount} entries imported — you can re-import if needed.`;
    } else {
      els.dgImportEntriesHint.textContent = `Ready to import ${entryCount} Modify Reason and Action entries.`;
    }
  }
  updateDgWorkflowStepStates();
}

function setDgActionButtonsEnabled() {
  const hasBr = !!getDgPublishBusinessRequestId();
  const analyzed = Boolean(state.dgAnalyzeResult);
  if (els.dgImportEntriesBtn) {
    els.dgImportEntriesBtn.disabled = !state.loggedIn || !hasBr || !analyzed;
  }
  if (els.dgPublishBtn) {
    els.dgPublishBtn.disabled = !state.loggedIn || !hasBr;
  }
  updateDgBrUi();
  updateDgPublishBrUi();
}

function syncDgBusinessRequestFields() {
  syncDgPublishBrIdFromStep2();
  const hasId = Boolean(els.dgBusinessRequestId?.value.trim());

  if (els.dgBusinessRequestNameHint) {
    if (hasId) {
      els.dgBusinessRequestNameHint.innerHTML =
        "Business request created. Import entries below, or publish in Step 3.";
    } else if (state.dgAnalyzeResult) {
      els.dgBusinessRequestNameHint.innerHTML =
        "Name suggested from workbook — edit if needed, then click <strong>Create business request</strong>.";
    } else {
      els.dgBusinessRequestNameHint.innerHTML =
        "Filled automatically after analyze — edit if needed.";
    }
  }
  setDgActionButtonsEnabled();
}

function suggestDgBusinessRequestName(workbookName) {
  if (!els.dgBusinessRequestName || els.dgBusinessRequestName.value.trim()) {
    return;
  }
  const base = (workbookName || "DG workbook").replace(/\.(xlsx|xlsm)$/i, "");
  els.dgBusinessRequestName.value = `DG import — ${base}`;
}

function buildDgTablePayloads(analyzeResult) {
  const planned = analyzeResult?.planned_entries || [];
  const byTable = { modify_reason: [], action: [] };
  for (const entry of planned) {
    const tableKey = entry.table_key;
    if (tableKey in byTable && entry.generic_element_entry) {
      byTable[tableKey].push(entry.generic_element_entry);
    }
  }
  return Object.entries(byTable)
    .filter(([, entries]) => entries.length > 0)
    .map(([tableKey, entries]) => ({
      table_key: tableKey,
      include: true,
      mode: "json",
      entries_json: entries,
    }));
}

function syncBusinessRequestFields() {
  syncPublishBrIdFromStep2();
  setActionButtonsEnabled();
}

function clearBusinessRequest() {
  if (els.businessRequestId) {
    els.businessRequestId.value = "";
    els.businessRequestId.readOnly = false;
  }
  if (els.publishBusinessRequestId) {
    els.publishBusinessRequestId.value = "";
  }
  if (els.clearBrBtn) {
    els.clearBrBtn.hidden = true;
  }
  if (els.brCreateResult) {
    els.brCreateResult.hidden = true;
  }
  resetMergeCompareUi();
  syncBusinessRequestFields();
}

function setLoggedIn(loggedIn, username = "", environmentLabel = "") {
  state.loggedIn = loggedIn;
  setActionButtonsEnabled();

  if (els.logoutBtn) {
    els.logoutBtn.hidden = false;
    els.logoutBtn.disabled = !loggedIn;
    els.logoutBtn.title = loggedIn ? "Disconnect from CatalogOne" : "Connect to an environment first";
  }

  if (!loggedIn) {
    state.connectedEnvironmentId = null;
  }

  renderEnvironmentSidebar();
  updateMainConnectionHint();
  updateWorkflowStatusLines();
  window.catalogTool?.reloadMcpTools?.();
  window.catalogTool?.refreshMcpRunState?.();
  window.catalogTool?.notifyEnvironmentsChanged?.();
}

async function disconnectSession() {
  await api("/api/logout", { method: "POST", body: "{}" });
  setLoggedIn(false);
  els.passwordInput.value = "";
}

function collectTablePayloads() {
  saveActiveTableDraft();
  const payloads = [];

  for (const table of TABLES) {
    const draft = getTableDraft(table.key);
    if (draft.mode === "form") {
      const rows = draft.rows.filter((row) => row.name || row.localized_name);
      if (!rows.length) {
        continue;
      }
      payloads.push({
        table_key: table.key,
        include: true,
        mode: "form",
        rows,
      });
    } else if (draft.entriesJson.trim()) {
      payloads.push({
        table_key: table.key,
        include: true,
        mode: "json",
        entries_json: draft.entriesJson.trim(),
      });
    }
  }

  return payloads;
}

function validateTablesForPush() {
  const payloads = collectTablePayloads();
  if (payloads.length === 0) {
    return "Prepare at least one table with rows or JSON before pushing.";
  }

  for (const payload of payloads) {
    const table = getTableMeta(payload.table_key);
    const label = table?.label || payload.table_key;
    if (payload.mode === "form") {
      for (const row of payload.rows) {
        if (!row.name || !row.localized_name) {
          return `${label}: each row needs name and localized name.`;
        }
      }
    }
  }

  return null;
}

function isCatalogOneConnected() {
  return state.loggedIn;
}

async function handleSessionExpired(message) {
  if (!state.loggedIn) {
    return;
  }
  setLoggedIn(false);
  setMainConnectionHintState(
    false,
    `<span class="connection-status-label connection-status-disconnected">Not connected</span> <span class="connection-error-text">${escapeHtml(message || "CatalogOne session expired — connect again.")}</span>`,
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body.error || `Request failed (${response.status})`;
    if (
      response.status === 401
      && !String(path).includes("/api/login")
      && !String(path).includes("/api/logout")
      && /log in first|session expired|not logged in/i.test(message)
    ) {
      void handleSessionExpired(message);
    }
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return body;
}

async function apiForm(path, formData) {
  const response = await fetch(path, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body.error || `Request failed (${response.status})`;
    if (
      response.status === 401
      && !String(path).includes("/api/login")
      && !String(path).includes("/api/logout")
      && /log in first|session expired|not logged in/i.test(message)
    ) {
      void handleSessionExpired(message);
    }
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return body;
}

els.themeToggleBtn?.addEventListener("click", toggleTheme);

applyTheme(getTheme());

els.addEnvironmentBtn?.addEventListener("click", () => openConnectionModal("create"));

els.refreshEnvironmentsBtn?.addEventListener("click", () => {
  void refreshEnvironmentsFromServer();
});

window.addEventListener("focus", scheduleEnvironmentsRefresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scheduleEnvironmentsRefresh();
  }
});
window.addEventListener("catalogTool:environments-changed", () => {
  void loadEnvironmentsFromServer({ silent: true });
});

els.closeConnectionModalBtn?.addEventListener("click", closeConnectionModal);
els.cancelConnectionModalBtn?.addEventListener("click", closeConnectionModal);

els.connectionModal?.addEventListener("click", (event) => {
  if (event.target === els.connectionModal) {
    closeConnectionModal();
  }
});

els.connectionModal?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConnectionModal();
});

els.connectionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginResult.hidden = true;

  try {
    saveEnvironmentFromForm();
    closeConnectionModal();
  } catch (error) {
    setLoggedIn(false);
    showResult(els.loginResult, error.message, true);
  }
});

els.logoutBtn?.addEventListener("click", () => {
  if (els.logoutBtn?.disabled) {
    return;
  }
  disconnectSession();
});

els.appLogoutBtn?.addEventListener("click", async () => {
  sessionStorage.removeItem(APP_TAB_SESSION_KEY);
  try {
    await api("/api/user/logout", { method: "POST", body: "{}" });
  } catch {
    // still redirect on failure
  }
  window.location.href = "/login";
});

async function syncKeycloakFromGateway() {
  const normalized = normalizeApigwUrl(els.apigwUrlInput.value);
  els.apigwUrlInput.value = normalized;
  try {
    const data = await api(`/api/derive-urls?apigw_url=${encodeURIComponent(normalized)}`);
    els.apigwUrlInput.value = data.apigw_url;
    els.keycloakUrlInput.value = data.keycloak_url;
    els.keycloakRealmInput.value = data.environment_label;
    const currentDisplayName = els.environmentDisplayNameInput.value.trim();
    const nextLabel = data.environment_label || deriveEnvironmentLabel(data.apigw_url);
    if (
      !currentDisplayName
      || displayNameLooksMismatched(currentDisplayName, data.apigw_url, nextLabel)
    ) {
      els.environmentDisplayNameInput.value = friendlyEnvironmentLabel(nextLabel) || nextLabel;
    }
  } catch (error) {
    showResult(
      els.loginResult,
      error?.message || "Could not derive Keycloak URL from API gateway URL.",
      true,
    );
  }
}

els.apigwUrlInput.addEventListener("change", syncKeycloakFromGateway);

els.openKeycloakBtn?.addEventListener("click", () => {
  const url = els.keycloakUrlInput.value.trim();
  if (!url) {
    showResult(els.loginResult, "Enter a Keycloak URL first.", true);
    openConnectionModal("create");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
});

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateDropzoneSelection({
  dropzone,
  titleEl,
  hintEl,
  file,
  emptyTitle,
  emptyHintHtml,
  selectedLabel = "Selected file",
}) {
  if (!dropzone || !titleEl) {
    return;
  }
  const hasFile = Boolean(file);
  dropzone.classList.toggle("has-file", hasFile);
  titleEl.textContent = hasFile ? file.name : emptyTitle;
  if (hintEl) {
    if (hasFile) {
      const size = formatFileSize(file.size);
      hintEl.innerHTML = size
        ? `${size} · <span class="zip-dropzone-link">Replace</span>`
        : '<span class="zip-dropzone-link">Replace</span>';
    } else {
      hintEl.innerHTML = emptyHintHtml;
    }
  }
}

function updateZipValidateButton() {
  if (!els.analyzeZipBtn) {
    return;
  }
  const hasZip = isZipFile(els.catalogZipInput?.files?.[0]);
  const busy = els.analyzeZipBtn.classList.contains("is-busy");
  els.analyzeZipBtn.disabled = busy || !hasZip;
  els.analyzeZipBtn.title = hasZip ? "Analyze and preview the selected zip file" : "Choose a zip file first";
}

function updateZipDropzoneLabel() {
  updateDropzoneSelection({
    dropzone: els.zipDropzone,
    titleEl: els.zipDropzoneTitle,
    hintEl: els.zipDropzoneHint,
    file: els.catalogZipInput?.files?.[0],
    emptyTitle: "Choose or drop a zip file",
    emptyHintHtml: '<span class="zip-dropzone-link">Browse</span>',
    selectedLabel: "",
  });
  resetMergeBelowStep1();
  updateZipValidateButton();
  updateMergeBrUi();
}

function initZipDropzone() {
  const dropzone = els.zipDropzone;
  const input = els.catalogZipInput;
  if (!dropzone || !input) {
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file && !isZipFile(file)) {
      input.value = "";
      showZipValidateError("Please choose a CatalogOne export .zip file.");
      updateZipValidateButton();
      return;
    }
    updateZipDropzoneLabel();
    updatePushWorkflowStepStates();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !isZipFile(file)) {
      showZipValidateError("Please drop a CatalogOne export .zip file.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    updateZipDropzoneLabel();
  });
}

function updateExcelDropzoneLabel() {
  updateDropzoneSelection({
    dropzone: els.excelDropzone,
    titleEl: els.excelDropzoneTitle,
    hintEl: els.excelDropzoneHint,
    file: els.catalogExcelInput?.files?.[0],
    emptyTitle: "Choose or drop a workbook",
    emptyHintHtml: '<span class="zip-dropzone-link">Browse</span>',
    selectedLabel: "Workbook ready",
  });
  state.dgAnalyzeResult = null;
  state.dgImportCompleted = false;
  if (state.importType === "excel") {
    state.importType = null;
    state.importFilename = null;
  }
  if (els.excelAnalyzeReport) {
    els.excelAnalyzeReport.hidden = true;
  }
  setDgActionButtonsEnabled();
}

function initExcelDropzone() {
  const dropzone = els.excelDropzone;
  const input = els.catalogExcelInput;
  if (!dropzone || !input) {
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file && !isExcelFile(file)) {
      input.value = "";
      showAnalyzeError({
        reportEl: els.excelAnalyzeReport,
        panelEl: els.excelAnalyzePanel,
        jsonEl: els.excelAnalyzeJson,
        toggleEl: els.excelAnalyzeShowJson,
        message: "DG Import requires an .xlsx or .xlsm workbook.",
      });
    }
    updateExcelDropzoneLabel();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !isExcelFile(file)) {
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    updateExcelDropzoneLabel();
  });
}

els.analyzeExcelBtn?.addEventListener("click", async () => {
  const file = els.catalogExcelInput?.files?.[0];
  if (!file) {
    showAnalyzeError({
      reportEl: els.excelAnalyzeReport,
      panelEl: els.excelAnalyzePanel,
      jsonEl: els.excelAnalyzeJson,
      toggleEl: els.excelAnalyzeShowJson,
      message: "Choose a DG Excel workbook first.",
    });
    return;
  }
  if (!isExcelFile(file)) {
    showAnalyzeError({
      reportEl: els.excelAnalyzeReport,
      panelEl: els.excelAnalyzePanel,
      jsonEl: els.excelAnalyzeJson,
      toggleEl: els.excelAnalyzeShowJson,
      message: "DG import requires an .xlsx or .xlsm workbook.",
    });
    return;
  }

  els.analyzeExcelBtn.disabled = true;
  els.excelAnalyzeReport.hidden = true;

  const formData = new FormData();
  formData.append("excel_file", file);

  try {
    const response = await fetch("/api/excel/analyze", {
      method: "POST",
      body: formData,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }

    wireAnalyzeReport({
      reportEl: els.excelAnalyzeReport,
      panelEl: els.excelAnalyzePanel,
      jsonEl: els.excelAnalyzeJson,
      toggleEl: els.excelAnalyzeShowJson,
      panelHtml: buildExcelAnalyzePanel(body),
      rawData: body,
      isError: false,
    });
    state.dgAnalyzeResult = body;
    state.dgImportCompleted = false;
    state.importType = body.import_type || "excel";
    state.importFilename = body.import_filename || file.name;
    state.zipAnalyzeResult = null;
    suggestDgBusinessRequestName(body.workbook_name);
    syncDgBusinessRequestFields();
    updateDgWorkflowStepStates();
  } catch (error) {
    showAnalyzeError({
      reportEl: els.excelAnalyzeReport,
      panelEl: els.excelAnalyzePanel,
      jsonEl: els.excelAnalyzeJson,
      toggleEl: els.excelAnalyzeShowJson,
      message: error.message || "Excel analysis failed.",
    });
  } finally {
    els.analyzeExcelBtn.disabled = false;
  }
});

els.analyzeZipBtn?.addEventListener("click", async () => {
  const file = els.catalogZipInput?.files?.[0];
  if (!file) {
    showZipValidateError("Choose a zip file first.");
    return;
  }
  if (!isZipFile(file)) {
    showZipValidateError("Please choose a CatalogOne export .zip file.");
    return;
  }

  setWorkflowButtonBusy(els.analyzeZipBtn, els.analyzeZipBtnLabel, true, {
    busyText: "Analyzing…",
    idleText: "Analyze & preview",
  });
  els.zipAnalyzeReport.hidden = true;

  const formData = new FormData();
  formData.append("zip_file", file);

  try {
    const response = await fetch("/api/zip/analyze", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || `Request failed (${response.status})`);
    }

    wireZipValidateReport({
      body,
      defaultCollapsed: !body.has_blocking_issues,
    });
    state.zipAnalyzeResult = body;
    rememberCompareEntityPayload(body);
    state.importType = body.import_type || "zip";
    state.importFilename = body.import_filename || file.name;
    state.dgAnalyzeResult = null;
    updateMergeBrUi();
    if (!body.has_blocking_issues) {
      pushWorkflowNav?.showStep("review");
    }
  } catch (error) {
    showZipValidateError(error.message || "Zip validation failed.");
  } finally {
    setWorkflowButtonBusy(els.analyzeZipBtn, els.analyzeZipBtnLabel, false, {
      idleText: "Analyze & preview",
    });
    updateZipValidateButton();
  }
});

els.createBrBtn?.addEventListener("click", async () => {
  const name = els.businessRequestName.value.trim();
  const zipFile = els.catalogZipInput?.files?.[0];
  if (!state.loggedIn) {
    showBrCreateResult("Connect to CatalogOne first.", { isError: true });
    return;
  }
  if (!isZipFile(zipFile)) {
    showBrCreateResult("Choose a zip file in Step 1 first.", { isError: true });
    return;
  }
  if (!name) {
    showBrCreateResult("Enter a business request name first.", { isError: true });
    els.businessRequestName?.focus();
    return;
  }
  if (els.businessRequestId.value.trim()) {
    showBrCreateResult("Clear the business request ID to create another.", { isError: true });
    return;
  }

  setWorkflowButtonBusy(els.createBrBtn, null, true, {
    busyText: "Working…",
    idleText: "Create BR and Import",
  });
  resetMergeCompareUi();
  if (els.brCreateResult) {
    els.brCreateResult.hidden = true;
  }

  try {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("import_type", "zip");
    formData.append("zip_file", zipFile);

    const result = await apiForm("/api/business-request", formData);

    applyBusinessRequestIdFromResult(result);
    rememberCompareEntityPayload(result);
    state.zipImportCompleted = isZipImportSuccessful(result);
    if (!state.zipImportCompleted) {
      const importError = result.import?.error || result.message || "Zip import did not complete successfully.";
      showBrCreateResult(importError, { isError: true });
      return;
    }

    showBrCreateResult(result, { isError: false });
    await promptCompareAfterImport(result.business_request_id);
  } catch (error) {
    state.zipImportCompleted = false;
    const message = error.message || "";
    if (/log in first|session expired|not logged in/i.test(message)) {
      void handleSessionExpired("CatalogOne session expired — connect again in the sidebar.");
    } else if (/401|unauthorized/i.test(message) && /kid|keycloak|valid key/i.test(message)) {
      showBrCreateResult(
        "Authentication failed: Keycloak settings do not match the selected API gateway. "
          + "Edit the environment, click Sync next to APIGW, save, and connect again.",
        { isError: true },
      );
      if (error?.body?.business_request_id) {
        applyBusinessRequestIdFromResult(error.body);
      }
      return;
    }
    if (error?.body?.business_request_id) {
      applyBusinessRequestIdFromResult(error.body);
    }
    showBrCreateResult(error, { isError: true });
  } finally {
    setWorkflowButtonBusy(els.createBrBtn, null, false, {
      idleText: "Create BR and Import",
    });
    setActionButtonsEnabled();
  }
});

els.clearBrBtn?.addEventListener("click", clearBusinessRequest);

els.publishBtn.addEventListener("click", async () => {
  const businessRequestId = getPublishBusinessRequestId();
  if (!businessRequestId) {
    showResult(els.pushResult, "Enter a business request ID in Step 3 before publishing.", true);
    els.publishBusinessRequestId?.focus();
    return;
  }

  const confirmed = window.confirm(
    `Publish business request ${businessRequestId}?\n\nThis queues the BR for production and cannot be undone once publishing completes.`
  );
  if (!confirmed) {
    return;
  }

  els.publishBtn.disabled = true;
  hideResult(els.pushResult);

  try {
    const result = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({
        business_request_id: businessRequestId,
      }),
    });
    showResult(els.pushResult, result, !result.ok);
  } catch (error) {
    showResult(els.pushResult, error.message, true);
  } finally {
    setActionButtonsEnabled();
  }
});

els.dgCreateBrBtn?.addEventListener("click", async () => {
  const name = els.dgBusinessRequestName?.value.trim();
  if (!state.loggedIn) {
    showResult(
      els.dgBrCreateResult,
      "Connect to a CatalogOne environment first — select one in the sidebar and click Connect.",
      true,
    );
    return;
  }
  if (!name) {
    showResult(els.dgBrCreateResult, "Enter a business request name first.", true);
    els.dgBusinessRequestName?.focus();
    return;
  }
  if (els.dgBusinessRequestId?.value.trim()) {
    showResult(els.dgBrCreateResult, "Clear the business request ID to create a new one.", true);
    return;
  }

  els.dgCreateBrBtn.disabled = true;
  hideResult(els.dgBrCreateResult);

  try {
    const result = await api("/api/business-request", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    els.dgBusinessRequestId.value = result.business_request_id;
    syncDgBusinessRequestFields();
    showResult(els.dgBrCreateResult, {
      status: "ok",
      message: "Business request created.",
      business_request_id: result.business_request_id,
      name: result.name,
    });
  } catch (error) {
    showResult(els.dgBrCreateResult, error.message, true);
  } finally {
    setDgActionButtonsEnabled();
  }
});

els.dgImportEntriesBtn?.addEventListener("click", async () => {
  if (!state.dgAnalyzeResult) {
    showResult(els.dgImportResult, "Analyze the workbook in Step 1 first.", true);
    return;
  }

  const businessRequestId = getDgPublishBusinessRequestId();
  if (!businessRequestId) {
    showResult(els.dgImportResult, "Create or paste a business request ID in Step 2 first.", true);
    return;
  }

  const tablePayloads = buildDgTablePayloads(state.dgAnalyzeResult);
  if (!tablePayloads.length) {
    showResult(els.dgImportResult, "No Modify Reason or Action entries found in the analyzed workbook.", true);
    return;
  }

  const entryCount = state.dgAnalyzeResult.planned_entries?.length || 0;
  const confirmed = window.confirm(
    `Import ${entryCount} entries into business request ${businessRequestId}?\n\nThis posts Modify Reason and Action genericElementEntry payloads to CatalogOne.`
  );
  if (!confirmed) {
    return;
  }

  els.dgImportEntriesBtn.disabled = true;
  hideResult(els.dgImportResult);

  try {
    const result = await api("/api/push", {
      method: "POST",
      body: JSON.stringify({
        business_request_id: businessRequestId,
        create_business_request: false,
        table_payloads: tablePayloads,
      }),
    });
    state.dgImportCompleted = result.status === "ok";
    showResult(els.dgImportResult, result, result.status !== "ok");
    setDgActionButtonsEnabled();
  } catch (error) {
    showResult(els.dgImportResult, error.message, true);
  } finally {
    setDgActionButtonsEnabled();
  }
});

els.dgPublishBtn?.addEventListener("click", async () => {
  const businessRequestId = getDgPublishBusinessRequestId();
  if (!businessRequestId) {
    showResult(els.dgPublishResult, "Enter a business request ID in Step 3 before publishing.", true);
    els.dgPublishBusinessRequestId?.focus();
    return;
  }

  const confirmed = window.confirm(
    `Publish business request ${businessRequestId}?\n\nThis queues the BR for production and cannot be undone once publishing completes.`
  );
  if (!confirmed) {
    return;
  }

  els.dgPublishBtn.disabled = true;
  hideResult(els.dgPublishResult);

  try {
    const result = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({
        business_request_id: businessRequestId,
      }),
    });
    showResult(els.dgPublishResult, result, !result.ok);
  } catch (error) {
    showResult(els.dgPublishResult, error.message, true);
  } finally {
    setDgActionButtonsEnabled();
  }
});

async function resetCatalogOneConnectionOnLoad() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // still show disconnected if logout fails
  }
  state.connectedEnvironmentId = null;
  state.activeEnvironmentId = null;
  setLoggedIn(false);
}

const APP_TAB_SESSION_KEY = "catalogTool.appTabActive";

function isPageReload() {
  try {
    const [nav] = performance.getEntriesByType("navigation");
    if (nav?.type === "reload") {
      return true;
    }
  } catch {
    // ignore
  }
  return performance.navigation?.type === 1;
}

function shouldForceRelogin() {
  if (sessionStorage.getItem(APP_TAB_SESSION_KEY) === "1") {
    return true;
  }
  return isPageReload();
}

function markAppTabActive() {
  sessionStorage.setItem(APP_TAB_SESSION_KEY, "1");
}

async function logoutAppUserOnReload() {
  if (window.__catalogToolReloadLogout) {
    return true;
  }

  if (document.body?.dataset.ldapAuthEnabled !== "true") {
    return false;
  }

  if (!shouldForceRelogin()) {
    return false;
  }

  window.__catalogToolReloadLogout = true;
  sessionStorage.removeItem(APP_TAB_SESSION_KEY);

  try {
    await fetch("/api/user/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // still redirect on failure
  }

  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?reason=refresh&next=${encodeURIComponent(next)}`);
  return true;
}

els.businessRequestId?.addEventListener("change", syncBusinessRequestFields);
els.businessRequestId?.addEventListener("input", () => {
  syncPublishBrIdFromStep2();
  syncBusinessRequestFields();
  setActionButtonsEnabled();
});
els.publishBusinessRequestId?.addEventListener("input", () => {
  syncStep2BrIdFromPublish();
  setActionButtonsEnabled();
});
els.businessRequestName?.addEventListener("input", () => {
  syncBusinessRequestFields();
  setActionButtonsEnabled();
});

els.dgBusinessRequestId?.addEventListener("change", syncDgBusinessRequestFields);
els.dgBusinessRequestId?.addEventListener("input", () => {
  syncDgPublishBrIdFromStep2();
  syncDgBusinessRequestFields();
});
els.dgPublishBusinessRequestId?.addEventListener("input", () => {
  syncDgStep2BrIdFromPublish();
  setDgActionButtonsEnabled();
});
els.dgBusinessRequestName?.addEventListener("input", syncDgBusinessRequestFields);

els.tableSelect?.addEventListener("change", () => {
  saveActiveTableDraft();
  loadTableDraft(els.tableSelect.value);
});

els.addRowBtn?.addEventListener("click", () => addRow());

els.editorModeTabs?.forEach((tab) => {
  tab.addEventListener("click", () => {
    setEditorMode(tab.dataset.mode);
    saveActiveTableDraft();
  });
});

els.entriesJson?.addEventListener("input", saveActiveTableDraft);

initTableDrafts();
syncBusinessRequestFields();
syncDgBusinessRequestFields();

els.brCompareProductionBtn?.addEventListener("click", () => {
  if (!state.zipImportCompleted) {
    return;
  }
  void runBrCompare("production");
});

async function initApp() {
  initSidebarResize();
  window.catalogToolLayoutCouple?.initChatPanelWidth?.();

  if (window.__catalogToolReloadLogout || await logoutAppUserOnReload()) {
    return;
  }

  initWorkflowSidebarResize();
  initEnvRefreshButtonLayout();
  initSidebarFloatTips();
  initConnectionModalFloatTips();
  initZipDropzone();
  updateZipValidateButton();
  initExcelDropzone();
  pushWorkflowNav = initWorkflowStepNav(els.pushStepNav, "upload");
  initComparePanelLayout();
  wireCompareJsonToggle();
  initWorkflowStepNav(els.dgStepNav, "upload");
  updateWorkflowStatusLines();
  updatePushWorkflowStepStates();
  updateDgWorkflowStepStates();
  initAgenticSettings();
  updateAgenticUi(document.body?.dataset?.useAgentic !== "false");

  await resetCatalogOneConnectionOnLoad();
  await loadAppUserSession();

  await loadEnvironmentsFromServer();
  restoreSelectedEnvironment();
  updateMainConnectionHint();

  updateMcpToolsNav({ configured: false, online: false, message: "Checking CatalogOne MCP…" });
  initAppNavigation();
  void refreshMcpToolsNavStatus().then(() => {
    if (state.mcpToolsConfigured && localStorage.getItem(VIEW_STORAGE_KEY) === "mcp-tools") {
      setActiveView("mcp-tools");
    }
  });
  startMcpStatusPolling();
  updateMainConnectionHint();
  window.__catalogToolMarkAppTabActive?.();
  markAppTabActive();
}

initApp();

window.catalogTool = window.catalogTool || {};
window.catalogTool.refreshMcpNav = refreshMcpToolsNavStatus;
window.catalogTool.updateAgenticUi = updateAgenticUi;
window.catalogTool.openAgenticSettings = openAgenticSettingsModal;
window.catalogTool.refreshEnvironments = refreshEnvironmentsFromServer;
window.catalogTool.isEnvironmentConnected = () => Boolean(state.loggedIn && state.connectedEnvironmentId);
window.catalogTool.getActiveView = () => state.activeView;
window.catalogTool.setActiveView = setActiveView;
window.catalogTool.getEnvironmentLabel = getConnectedEnvironmentLabel;
window.catalogTool.notifyEnvironmentsChanged = () => {
  window.dispatchEvent(new CustomEvent("catalogTool:environments-changed"));
};

function initUiControlBridge() {
  let pollTimer = null;
  let contextTimer = null;

  async function syncPageContext() {
    if (typeof window.catalogTool?.getPageContext !== "function") {
      return;
    }
    try {
      await fetch("/api/ui-control/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(window.catalogTool.getPageContext()),
      });
    } catch {
      // Best-effort sync for popup chat and Cursor MCP bridge.
    }
  }

  async function pollPendingAction() {
    try {
      const response = await fetch("/api/ui-control/pending");
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (!data?.id || !data?.action) {
        return;
      }
      const result = typeof window.catalogTool?.executePageAction === "function"
        ? window.catalogTool.executePageAction(data.action)
        : { ok: false, error: "UI executor unavailable in this window." };
      await fetch("/api/ui-control/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.id, result }),
      });
    } catch {
      // Ignore transient network errors while polling.
    }
  }

  function setActionPolling(active) {
    if (active && !pollTimer) {
      pollPendingAction();
      pollTimer = window.setInterval(pollPendingAction, 250);
    } else if (!active && pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  syncPageContext();
  contextTimer = window.setInterval(syncPageContext, 2000);

  window.addEventListener("catalogTool:chat-busy", (event) => {
    setActionPolling(Boolean(event.detail?.busy));
  });

  try {
    const chatChannel = new BroadcastChannel("catalog-tool-chat");
    chatChannel.onmessage = (event) => {
      if (event.data?.type === "chat-busy") {
        setActionPolling(Boolean(event.data.busy));
      }
    };
  } catch {
    // BroadcastChannel unavailable — docked chat still uses catalogTool:chat-busy.
  }

  window.addEventListener("beforeunload", () => {
    if (pollTimer) {
      window.clearInterval(pollTimer);
    }
    if (contextTimer) {
      window.clearInterval(contextTimer);
    }
  });
}

initUiControlBridge();
