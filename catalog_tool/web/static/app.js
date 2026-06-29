const THEME_STORAGE_KEY = "catalogTool.theme";

const TABLES = JSON.parse(document.getElementById("tablesConfig")?.textContent || "[]");
const DEFAULTS = JSON.parse(document.getElementById("defaultsConfig")?.textContent || "{}");

/** In-memory cache synced to data/environments.json via the server. */
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
    title: "Merge & Import",
  },
  "dg-import": {
    eyebrow: "CatalogOne DG",
    title: "DG Import",
  },
  "mcp-tools": {
    eyebrow: "CatalogOne MCP",
    title: "MCP Tools",
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
  dgAnalyzeResult: null,
  dgImportCompleted: false,
  zipAnalyzeResult: null,
  zipImportCompleted: false,
  zipImportBusinessRequestId: null,
  zipImportError: null,
  importType: null,
  importFilename: null,
};

const els = {
  connectionForm: document.getElementById("connectionForm"),
  connectionModal: document.getElementById("connectionModal"),
  connectionModalTitle: document.getElementById("connectionModalTitle"),
  connectionModalDesc: document.getElementById("connectionModalDesc"),
  closeConnectionModalBtn: document.getElementById("closeConnectionModalBtn"),
  cancelConnectionModalBtn: document.getElementById("cancelConnectionModalBtn"),
  addEnvironmentBtn: document.getElementById("addEnvironmentBtn"),
  environmentSidebarList: document.getElementById("environmentSidebarList"),
  envSidebarEmpty: document.getElementById("envSidebarEmpty"),
  environmentItemTemplate: document.getElementById("environmentItemTemplate"),
  environmentDisplayNameInput: document.getElementById("environmentDisplayNameInput"),
  mainConnectionHint: document.getElementById("mainConnectionHint"),
  logoutBtn: document.getElementById("logoutBtn"),
  appLogoutBtn: document.getElementById("appLogoutBtn"),
  loginResult: document.getElementById("loginResult"),
  pushBtn: document.getElementById("pushBtn"),
  publishBtn: document.getElementById("publishBtn"),
  forcePublish: document.getElementById("forcePublish"),
  pushResult: document.getElementById("pushResult"),
  catalogZipInput: document.getElementById("catalogZipInput"),
  analyzeZipBtn: document.getElementById("analyzeZipBtn"),
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
  dgPublishBusinessRequestId: document.getElementById("dgPublishBusinessRequestId"),
  dgPublishBusinessRequestIdHint: document.getElementById("dgPublishBusinessRequestIdHint"),
  dgForcePublish: document.getElementById("dgForcePublish"),
  dgPublishBtn: document.getElementById("dgPublishBtn"),
  dgPublishResult: document.getElementById("dgPublishResult"),
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
  brCompareSection: document.getElementById("brCompareSection"),
  brCompareActions: document.getElementById("brCompareActions"),
  brCompareHint: document.getElementById("brCompareHint"),
  brCompareProductionBtn: document.getElementById("brCompareProductionBtn"),
  brComparePanel: document.getElementById("brComparePanel"),
  brCompareToggleBtn: document.getElementById("brCompareToggleBtn"),
  brCompareTitle: document.getElementById("brCompareTitle"),
  brCompareReport: document.getElementById("brCompareReport"),
  brCompareJson: document.getElementById("brCompareJson"),
  brCompareShowJson: document.getElementById("brCompareShowJson"),
  keycloakUrlInput: document.getElementById("keycloakUrlInput"),
  keycloakRealmInput: document.getElementById("keycloakRealmInput"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  apigwUrlInput: document.getElementById("apigwUrlInput"),
  syncKeycloakBtn: document.getElementById("syncKeycloakBtn"),
  openKeycloakBtn: document.getElementById("openKeycloakBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  appPage: document.getElementById("appPage"),
  pushView: document.getElementById("pushView"),
  dgImportView: document.getElementById("dgImportView"),
  mcpToolsView: document.getElementById("mcpToolsView"),
  topbarEyebrow: document.getElementById("topbarEyebrow"),
  topbarTitle: document.getElementById("topbarTitle"),
  appNavItems: document.querySelectorAll(".app-nav-item"),
  navMcpToolsView: document.getElementById("navMcpToolsView"),
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
  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth));
  }
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

  const stopDragging = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    els.sidebarResizer.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing-sidebar");
  };

  const onPointerMove = (event) => {
    if (!dragging) {
      return;
    }
    setSidebarWidth(event.clientX);
  };

  els.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      return;
    }
    dragging = true;
    els.sidebarResizer.classList.add("is-dragging");
    document.body.classList.add("is-resizing-sidebar");
    els.sidebarResizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  els.sidebarResizer.addEventListener("pointermove", onPointerMove);
  els.sidebarResizer.addEventListener("pointerup", stopDragging);
  els.sidebarResizer.addEventListener("pointercancel", stopDragging);

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

function setActiveView(view) {
  const nextView = VIEW_META[view] ? view : "push";
  if (nextView === "mcp-tools" && !state.mcpToolsConfigured) {
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

  const meta = VIEW_META[nextView];
  if (els.topbarEyebrow) {
    els.topbarEyebrow.textContent = meta.eyebrow;
  }
  if (els.topbarTitle) {
    els.topbarTitle.textContent = meta.title;
  }

  updateMainConnectionHint();
}

function connectionHintForView() {
  const onMcpTools = state.activeView === "mcp-tools";
  const onDgImport = state.activeView === "dg-import";

  if (state.loggedIn) {
    const label = escapeHtml(state.currentEnvironmentLabel || "environment");
    if (onDgImport) {
      return {
        connected: true,
        html: `Connected to <strong>${label}</strong>. Analyze the DG Excel to preview the import plan — connect before executing.`,
      };
    }
    if (onMcpTools) {
      const toolsNote = state.mcpToolsOnline && state.mcpToolsStatusMessage
        ? ` ${escapeHtml(state.mcpToolsStatusMessage)}.`
        : !state.mcpToolsOnline
          ? " MCP server is starting — tools load on first use."
          : "";
      return {
        connected: true,
        html: `Connected to <strong>${label}</strong>. Browse and run CatalogOne MCP tools — search catalog, manage business requests, create entities, and more.${toolsNote}`,
      };
    }
    return {
      connected: true,
      html: `Connected to <strong>${label}</strong>. You can merge data and publish.`,
    };
  }

  const store = loadEnvironmentStore();
  if (onMcpTools) {
    if (!state.mcpToolsConfigured) {
      return {
        connected: false,
        html: state.mcpToolsStatusMessage
          ? `<span class="connection-error-text">${escapeHtml(state.mcpToolsStatusMessage)}</span>`
          : "catalogone MCP is not installed. See README — configure ~/.cursor/mcp.json and run npm run preflight.",
      };
    }
    if (!state.mcpToolsOnline) {
      const starting = state.mcpToolsStatusMessage || "Starting catalogone MCP server (first launch can take ~15s)…";
      return {
        connected: false,
        html: `MCP is configured (${escapeHtml(state.mcpToolsStatusMessage || "from ~/.cursor/mcp.json")}). ${escapeHtml(starting)}`,
      };
    }
    if (store.environments.length === 0) {
      return {
        connected: false,
        html: 'CatalogOne MCP is online. Add an environment with <strong>+ Add</strong> to connect for merge workflows.',
      };
    }
    return {
      connected: false,
      html: "CatalogOne MCP is online. Connect an environment in the sidebar for merge/publish, or run tools below.",
    };
  }

  if (store.environments.length === 0) {
    return {
      connected: false,
      html: 'No environments yet. Click <strong>+ Add</strong> in the sidebar to create one.',
    };
  }
  return {
    connected: false,
    html: "Select an environment in the sidebar and click <strong>Connect</strong>, or add a new one.",
  };
}

function updateMainConnectionHint() {
  if (!els.mainConnectionHint) {
    return;
  }

  const hint = connectionHintForView();
  els.mainConnectionHint.hidden = false;
  els.mainConnectionHint.className = hint.connected
    ? "main-connection-hint main-connection-hint-connected"
    : "main-connection-hint";
  els.mainConnectionHint.innerHTML = hint.html;
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

  button.disabled = !state.mcpToolsConfigured;
  button.classList.toggle("is-disabled", !state.mcpToolsConfigured);
  if (state.mcpToolsOnline) {
    button.title = message
      ? `Browse and run CatalogOne MCP tools — ${message}`
      : "Browse and run CatalogOne MCP tools";
  } else if (state.mcpToolsConfigured) {
    button.title = message || "MCP installed — server starts when you open this page";
  } else {
    button.title = message || "catalogone MCP is not installed (see README)";
  }

  if (!state.mcpToolsConfigured && state.activeView === "mcp-tools") {
    setActiveView("push");
  }
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
          || "MCP server starting — open MCP Tools to load tools (~15s first time)";
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
  return stored === "light" ? "light" : "dark";
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
  el.hidden = false;
  el.classList.toggle("result-error", isError);
  el.classList.toggle("result-success", !isError);
  el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  if (!els.brCompareSection || !els.brCompareProductionBtn) {
    return;
  }

  const hasBr = !!els.businessRequestId?.value.trim();
  const canCompare = state.zipImportCompleted && hasBr;

  els.brCompareSection.hidden = !hasBr;
  els.brCompareProductionBtn.disabled = !canCompare;
  els.brCompareProductionBtn.title = canCompare
    ? "Compare imported entities with production"
    : state.zipImportError || "Import must complete successfully before comparing";

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

function resetMergeCompareUi() {
  state.zipImportCompleted = false;
  state.zipImportBusinessRequestId = null;
  state.zipImportError = null;
  if (els.brComparePanel) {
    els.brComparePanel.hidden = true;
  }
  if (els.brCompareReport) {
    els.brCompareReport.innerHTML = "";
  }
  updateCompareUi();
}

function getCompareBusinessRequestId() {
  return (
    state.zipImportBusinessRequestId
    || els.businessRequestId?.value.trim()
    || ""
  );
}

function showCompareSectionAfterImport(businessRequestId) {
  if (!state.zipImportCompleted || !businessRequestId) {
    updateCompareUi();
    return;
  }
  state.zipImportBusinessRequestId = businessRequestId;
  if (els.brComparePanel) {
    els.brComparePanel.hidden = true;
  }
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
    els.pushResult.hidden = true;
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
  const compareLabel = body.compare_type === "audit" ? "Audit" : "Production";

  let html = `<div class="analyze-stat-grid">
    ${analyzeStatCard("Identical", summary.identical ?? 0, summary.identical ? "ok" : "")}
    ${analyzeStatCard("Changed", summary.changed ?? 0, summary.changed ? "warn" : "")}
    ${analyzeStatCard("New in BR", summary.new_in_br ?? 0, summary.new_in_br ? "accent" : "")}
    ${analyzeStatCard("Errors", summary.errors ?? 0, summary.errors ? "warn" : "")}
  </div>`;

  html += `<div class="analyze-badge-row">
    <span class="analyze-badge is-accent">${body.compare_type === "audit" ? "Compared with audit history" : "BR (local import) vs production (environment)"}</span>
    <span class="analyze-badge is-muted">BR ${escapeHtml(body.business_request_id || "")}</span>
  </div>`;

  if (body.compare_type !== "audit") {
    html += `<p class="analyze-step-note">Production is what is live in the environment today. Local is what you imported into this business request.</p>`;
  }

  if (!entities.length) {
    html += `<p class="analyze-error-msg">No entities were compared.</p>`;
    return html;
  }

  html += `<section>
    <h5 class="analyze-section-title">Entities (${entities.length})</h5>
    <div class="analyze-table-wrap">
      <table class="analyze-table">
        <thead><tr><th>Status</th><th>Type</th><th>Entity</th><th>Summary</th></tr></thead>
        <tbody>
          ${entities.map((entity) => `<tr>
            <td><span class="analyze-badge is-${compareStatusTone(entity.status)}">${escapeHtml(compareStatusLabel(entity.status))}</span></td>
            <td>${escapeHtml(entity.entity_type)}</td>
            <td>${escapeHtml(entity.title || entity.entity_id)}</td>
            <td>${escapeHtml(entity.summary || "")}${entity.error ? `<br><span class="analyze-step-note">${escapeHtml(entity.error)}</span>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>`;

  const changedEntities = entities.filter(
    (entity) => entity.field_changes?.length || entity.audit_versions?.length > 1,
  );
  for (const entity of changedEntities.slice(0, 6)) {
    html += `<section>
      <h5 class="analyze-section-title">${escapeHtml(entity.title || entity.entity_id)}</h5>`;
    if (entity.audit_versions?.length) {
      html += `<ul class="analyze-meta-list">
        ${entity.audit_versions.slice(0, 4).map((version) => `
          <li><strong>${escapeHtml(version.published_at || "—")}</strong> · ${escapeHtml(version.operation || "")} · ${escapeHtml(version.business_request_name || version.id || "")}</li>
        `).join("")}
      </ul>`;
    }
    if (entity.field_changes?.length) {
      html += `<div class="analyze-table-wrap">
        <table class="analyze-table">
          <thead><tr><th>Change</th><th>Field</th><th>Production</th><th>BR (local)</th></tr></thead>
          <tbody>
            ${entity.field_changes.slice(0, 12).map((change) => `<tr>
              <td>${escapeHtml(change.change)}</td>
              <td>${escapeHtml(change.path)}</td>
              <td>${escapeHtml(change.baseline ?? "—")}</td>
              <td>${escapeHtml(change.current ?? "—")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
      if (entity.field_changes.length > 12) {
        html += `<p class="analyze-step-note">…and ${entity.field_changes.length - 12} more field changes (see raw JSON).</p>`;
      }
    }
    html += `</section>`;
  }

  return html;
}

function showBrCompareReport(body, { isError = false } = {}) {
  if (!els.brComparePanel || !els.brCompareReport || !els.brCompareJson) {
    return;
  }
  const compareLabel = body?.compare_type === "audit" ? "Audit" : "Production";
  if (els.brCompareTitle) {
    els.brCompareTitle.textContent = isError
      ? "Compare failed"
      : `Compare with ${compareLabel}`;
  }
  wireAnalyzeReport({
    reportEl: els.brComparePanel,
    panelEl: els.brCompareReport,
    jsonEl: els.brCompareJson,
    toggleEl: els.brCompareShowJson,
    toggleBtn: els.brCompareToggleBtn,
    panelHtml: isError
      ? `<p class="analyze-error-msg">${escapeHtml(typeof body === "string" ? body : body?.error || "Compare failed.")}</p>`
      : buildBrComparePanel(body),
    rawData: body,
    isError,
    defaultCollapsed: false,
  });
  if (els.brCompareSection) {
    els.brCompareSection.hidden = false;
  }
  els.brComparePanel.hidden = false;
}

async function runBrCompare(compareType, businessRequestId) {
  const brId = businessRequestId || getCompareBusinessRequestId();
  if (!brId) {
    showBrCompareReport("No business request ID available for compare.", { isError: true });
    return;
  }

  const entities = (state.zipAnalyzeResult?.entities || [])
    .filter((entity) => entity.entity_id && entity.entity_type)
    .map((entity) => ({
      entity_id: entity.entity_id,
      entity_type: entity.entity_type,
      title: entity.title,
    }));

  if (!entities.length) {
    showBrCompareReport("No analyzed entities available for compare.", { isError: true });
    return;
  }

  if (els.brCompareSection) {
    els.brCompareSection.hidden = false;
  }
  if (els.brComparePanel) {
    els.brComparePanel.hidden = false;
    els.brComparePanel.classList.remove("is-collapsed");
  }
  if (els.brCompareToggleBtn) {
    els.brCompareToggleBtn.setAttribute("aria-expanded", "true");
  }
  if (els.brCompareReport) {
    els.brCompareReport.innerHTML = `<p class="analyze-step-note">Running ${compareType} compare…</p>`;
  }

  try {
    const result = await api(`/api/business-request/${encodeURIComponent(brId)}/compare`, {
      method: "POST",
      body: JSON.stringify({ compare_type: compareType, entities }),
    });
    showBrCompareReport(result);
  } catch (error) {
    showBrCompareReport(error.message, { isError: true });
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

function getEnvironmentDisplayName(environment) {
  const custom = (environment?.display_name || "").trim();
  if (custom) {
    return custom;
  }
  return environment?.label || deriveEnvironmentLabel(environment?.apigw_url || "");
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

function saveEnvironmentStore(store) {
  environmentStore = store;
  persistEnvironmentStore(store).catch((error) => {
    console.error("Failed to save environments:", error);
  });
}

async function loadEnvironmentsFromServer() {
  try {
    const serverStore = await api("/api/environments");
    environmentStore = {
      activeEnvironmentId: serverStore.activeEnvironmentId ?? null,
      environments: Array.isArray(serverStore.environments) ? serverStore.environments : [],
    };
  } catch (error) {
    console.warn("Could not load environments from server:", error);
  }
  renderEnvironmentSidebar();
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
    els.connectionModalTitle.textContent = "Edit environment";
    els.connectionModalDesc.textContent = "Update the connection definition. Use Connect to sign in with these settings.";
  } else {
    fillDefaultConnectionFields();
    els.connectionModalTitle.textContent = "New environment";
    els.connectionModalDesc.textContent = "Define endpoints and credentials. Save for later or connect now.";
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
  const displayName = payload.display_name || existing?.display_name || suggestedLabel;

  return upsertEnvironment({
    ...payload,
    id: existing?.id || state.editingEnvironmentId || undefined,
    display_name: displayName,
  });
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
  const existing = profile.id
    ? store.environments.find((item) => item.id === profile.id)
    : store.environments.find((item) => environmentKey(item) === key);
  const now = Date.now();
  const technicalLabel = deriveEnvironmentLabel(profile.apigw_url);
  const displayName = (profile.display_name ?? "").trim() || existing?.display_name || "";
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
  saveEnvironmentStore(store);
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
  saveEnvironmentStore(store);
  renderEnvironmentSidebar();
  updateMainConnectionHint();
}

function renderEnvironmentSidebar() {
  const store = loadEnvironmentStore();
  const environments = [...store.environments].sort(
    (a, b) => (b.last_used_at || 0) - (a.last_used_at || 0)
  );

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
    const displayName = getEnvironmentDisplayName(environment);
    const isConnected = state.loggedIn && state.connectedEnvironmentId === environment.id;
    const isSelected = state.activeEnvironmentId === environment.id;

    item.dataset.environmentId = environment.id;
    item.classList.toggle("env-card-connected", isConnected);
    item.classList.toggle("env-card-selected", isSelected && !isConnected);

    item.querySelector(".env-card-name").textContent = displayName;
    item.querySelector(".env-card-meta").textContent = `${environment.username} · ${environment.label}`;

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
      try {
        await connectEnvironment(environment.id);
      } catch (error) {
        setLoggedIn(false);
        if (error.message.includes("Password")) {
          openConnectionModal("edit", environment.id);
          showResult(els.loginResult, error.message, true);
          return;
        }
        if (els.mainConnectionHint) {
          els.mainConnectionHint.hidden = false;
          els.mainConnectionHint.className = "main-connection-hint";
          els.mainConnectionHint.innerHTML =
            `<span class="connection-error-text">${escapeHtml(error.message)}</span>`;
        }
      }
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

    item.querySelector(".env-card-body").addEventListener("click", () => {
      state.activeEnvironmentId = environment.id;
      applyConnectionFields(environment);
      renderEnvironmentSidebar();
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
  const hasAnalyzedZip = state.importType === "zip" && Boolean(state.zipAnalyzeResult);
  const connected = isCatalogOneConnected();
  const blocking = state.zipAnalyzeResult?.has_blocking_issues;

  if (els.clearBrBtn) {
    els.clearBrBtn.hidden = !hasBr;
  }
  if (els.businessRequestId) {
    els.businessRequestId.readOnly = hasBr;
  }
  if (els.createBrBtn) {
    els.createBrBtn.disabled = hasBr || !connected || !hasAnalyzedZip || !hasName || blocking;
    const reasons = [];
    if (hasBr) reasons.push("Clear the business request ID to create another");
    else if (!connected) reasons.push("Connect to CatalogOne first");
    else if (!hasZip || !hasAnalyzedZip) reasons.push("Validate a zip in Step 1 first");
    else if (!hasName) reasons.push("Enter a business request name");
    else if (blocking) reasons.push("Resolve blocking validation issues");
    els.createBrBtn.title = reasons.join(" · ") || "Create business request and import zip";
  }
  updateCompareUi();
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
  window.catalogTool?.reloadMcpTools?.();
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
  if (els.mainConnectionHint) {
    els.mainConnectionHint.hidden = false;
    els.mainConnectionHint.className = "main-connection-hint";
    els.mainConnectionHint.innerHTML =
      `<span class="connection-error-text">${escapeHtml(message || "CatalogOne session expired — connect again.")}</span>`;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
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

els.themeToggleBtn?.addEventListener("click", toggleTheme);

applyTheme(getTheme());

els.addEnvironmentBtn?.addEventListener("click", () => openConnectionModal("create"));

els.closeConnectionModalBtn?.addEventListener("click", closeConnectionModal);
els.cancelConnectionModalBtn?.addEventListener("click", closeConnectionModal);

els.connectionModal?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConnectionModal();
});

els.connectionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.value || "save";
  els.loginResult.hidden = true;

  try {
    if (action === "connect") {
      const saved = saveEnvironmentFromForm();
      applyConnectionFields(saved);
      await api("/api/logout", { method: "POST", body: "{}" }).catch(() => null);
      setLoggedIn(false);
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(getConnectionFields()),
      });
      if (result.normalized_apigw_url) {
        els.apigwUrlInput.value = result.normalized_apigw_url;
        upsertEnvironment({ ...saved, apigw_url: result.normalized_apigw_url });
      }
      state.connectedEnvironmentId = saved.id;
      setLoggedIn(true, result.username, getEnvironmentDisplayName(saved));
      closeConnectionModal();
      return;
    }

    saveEnvironmentFromForm();
    closeConnectionModal();
  } catch (error) {
    setLoggedIn(false);
    showResult(els.loginResult, error.message, true);
  }
});

els.logoutBtn.addEventListener("click", () => {
  if (els.logoutBtn?.disabled) {
    return;
  }
  disconnectSession();
});

els.appLogoutBtn?.addEventListener("click", async () => {
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
  } catch (error) {
    showResult(
      els.loginResult,
      error?.message || "Could not derive Keycloak URL from API gateway URL.",
      true,
    );
  }
}

els.apigwUrlInput.addEventListener("change", syncKeycloakFromGateway);

els.syncKeycloakBtn.addEventListener("click", syncKeycloakFromGateway);

els.openKeycloakBtn.addEventListener("click", () => {
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
  els.analyzeZipBtn.disabled = !hasZip;
  els.analyzeZipBtn.title = hasZip ? "Validate the selected zip file" : "Choose a zip file first";
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
    emptyTitle: "Drag & drop your Excel DG here",
    emptyHintHtml: 'or <span class="zip-dropzone-link">browse files</span> · .xlsx / .xlsm',
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

  els.analyzeZipBtn.disabled = true;
  els.zipAnalyzeReport.hidden = true;

  const formData = new FormData();
  formData.append("zip_file", file);

  try {
    const response = await fetch("/api/zip/analyze", {
      method: "POST",
      body: formData,
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
    state.importType = body.import_type || "zip";
    state.importFilename = body.import_filename || file.name;
    state.dgAnalyzeResult = null;
    updateMergeBrUi();
  } catch (error) {
    showZipValidateError(error.message || "Zip validation failed.");
  } finally {
    els.analyzeZipBtn.disabled = false;
    updateZipValidateButton();
  }
});

els.createBrBtn?.addEventListener("click", async () => {
  const name = els.businessRequestName.value.trim();
  if (!state.loggedIn) {
    showBrCreateResult("Connect to CatalogOne first.", { isError: true });
    return;
  }
  if (!state.zipAnalyzeResult || state.importType !== "zip") {
    showBrCreateResult("Validate a zip in Step 1 first.", { isError: true });
    return;
  }
  if (state.zipAnalyzeResult?.has_blocking_issues) {
    showBrCreateResult("Resolve blocking validation issues first.", { isError: true });
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

  els.createBrBtn.disabled = true;
  resetMergeCompareUi();
  if (els.brCreateResult) {
    els.brCreateResult.hidden = true;
  }

  try {
    const result = await api("/api/business-request", {
      method: "POST",
      body: JSON.stringify({ name, import_type: "zip" }),
    });

    applyBusinessRequestIdFromResult(result);
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
    if (error?.body?.business_request_id) {
      applyBusinessRequestIdFromResult(error.body);
    }
    showBrCreateResult(error, { isError: true });
  } finally {
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

  const forceLabel = els.forcePublish.checked ? " with force publish enabled" : "";
  const confirmed = window.confirm(
    `Publish business request ${businessRequestId}${forceLabel}?\n\nThis queues the BR for production and cannot be undone once publishing completes.`
  );
  if (!confirmed) {
    return;
  }

  els.publishBtn.disabled = true;
  els.pushResult.hidden = true;

  try {
    const result = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({
        business_request_id: businessRequestId,
        force_publish: els.forcePublish.checked,
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
  els.dgBrCreateResult.hidden = true;

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
  els.dgImportResult.hidden = true;

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

  const forceLabel = els.dgForcePublish?.checked ? " with force publish enabled" : "";
  const confirmed = window.confirm(
    `Publish business request ${businessRequestId}${forceLabel}?\n\nThis queues the BR for production and cannot be undone once publishing completes.`
  );
  if (!confirmed) {
    return;
  }

  els.dgPublishBtn.disabled = true;
  els.dgPublishResult.hidden = true;

  try {
    const result = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({
        business_request_id: businessRequestId,
        force_publish: els.dgForcePublish?.checked,
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
  setLoggedIn(false);
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
  initZipDropzone();
  updateZipValidateButton();
  initExcelDropzone();
  setLoggedIn(false);

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

  await resetCatalogOneConnectionOnLoad();
  updateMainConnectionHint();
}

initApp();

window.catalogTool = window.catalogTool || {};
window.catalogTool.refreshMcpNav = refreshMcpToolsNavStatus;
