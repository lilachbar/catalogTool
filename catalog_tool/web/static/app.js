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
  zipAnalyzePanel: document.getElementById("zipAnalyzePanel"),
  zipAnalyzeJson: document.getElementById("zipAnalyzeJson"),
  zipAnalyzeShowJson: document.getElementById("zipAnalyzeShowJson"),
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
  businessRequestNameHint: document.getElementById("businessRequestNameHint"),
  publishBusinessRequestId: document.getElementById("publishBusinessRequestId"),
  publishBusinessRequestIdHint: document.getElementById("publishBusinessRequestIdHint"),
  createBrBtn: document.getElementById("createBrBtn"),
  createBrBtnHint: document.getElementById("createBrBtnHint"),
  mergeBrConnectHint: document.getElementById("mergeBrConnectHint"),
  mergeBrConnectHintText: document.getElementById("mergeBrConnectHintText"),
  brCreateResult: document.getElementById("brCreateResult"),
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
    const label = state.currentEnvironmentLabel || "environment";
    if (onDgImport) {
      return {
        connected: true,
        html: `Connected to <strong>${label}</strong>. Analyze the DG Excel to preview the import plan — connect before executing.`,
      };
    }
    if (onMcpTools) {
      const toolsNote = state.mcpToolsOnline && state.mcpToolsStatusMessage
        ? ` ${state.mcpToolsStatusMessage}.`
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
          ? `<span class="connection-error-text">${state.mcpToolsStatusMessage}</span>`
          : "catalogone MCP is not installed. See README — configure ~/.cursor/mcp.json and run npm run preflight.",
      };
    }
    if (!state.mcpToolsOnline) {
      const starting = state.mcpToolsStatusMessage || "Starting catalogone MCP server (first launch can take ~15s)…";
      return {
        connected: false,
        html: `MCP is configured (${state.mcpToolsStatusMessage || "from ~/.cursor/mcp.json"}). ${starting}`,
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

function wireAnalyzeReport({ reportEl, panelEl, jsonEl, toggleEl, panelHtml, rawData, isError }) {
  if (!reportEl || !panelEl || !jsonEl) {
    return;
  }
  reportEl.hidden = false;
  reportEl.classList.toggle("is-error", Boolean(isError));
  panelEl.innerHTML = panelHtml;
  jsonEl.textContent = typeof rawData === "string" ? rawData : JSON.stringify(rawData, null, 2);
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

function showAnalyzeError({ reportEl, panelEl, jsonEl, toggleEl, message, rawData }) {
  wireAnalyzeReport({
    reportEl,
    panelEl,
    jsonEl,
    toggleEl,
    panelHtml: `<p class="analyze-error-msg">${escapeHtml(message)}</p>`,
    rawData: rawData ?? message,
    isError: true,
  });
}

function buildZipAnalyzePanel(body) {
  const counts = body.counts || {};
  const prFiles = body.pr_files || [];
  const findings = body.findings || [];
  const blocking = body.has_blocking_issues;

  let html = `<div class="analyze-stat-grid">
    ${analyzeStatCard("New", counts.new ?? 0, counts.new ? "accent" : "")}
    ${analyzeStatCard("Changed", counts.changed ?? 0, counts.changed ? "warn" : "")}
    ${analyzeStatCard("Unchanged", counts.unchanged ?? 0)}
    ${analyzeStatCard("PR files", counts.pr_files ?? prFiles.length, "accent")}
  </div>`;

  html += `<div class="analyze-badge-row">
    <span class="analyze-badge${blocking ? " is-muted" : ""}">${blocking ? "Review required" : "Ready for review"}</span>
    <span class="analyze-badge is-muted">Publish blocked</span>
  </div>`;

  html += `<section>
    <h5 class="analyze-section-title">Package</h5>
    <ul class="analyze-meta-list">
      <li><strong>Zip:</strong> ${escapeHtml(body.zip_name)}</li>
      <li><strong>Branch:</strong> ${escapeHtml(body.branch_name || "—")}</li>
      <li><strong>Output:</strong> ${escapeHtml(body.package_dir || "—")}</li>
      ${body.entity_count != null ? `<li><strong>Entities:</strong> ${escapeHtml(body.entity_count)}</li>` : ""}
    </ul>
  </section>`;

  if (findings.length) {
    html += `<section>
      <h5 class="analyze-section-title">Findings (${findings.length})</h5>
      <ul class="analyze-findings">
        ${findings.slice(0, 8).map((finding) => `
          <li class="analyze-finding is-warn">
            ${escapeHtml(finding.message || finding.kind)}
            ${finding.entity_path ? `<br><span class="analyze-step-note">${escapeHtml(finding.entity_path)}</span>` : ""}
          </li>`).join("")}
        ${findings.length > 8 ? `<li class="analyze-finding">…and ${findings.length - 8} more (see raw JSON)</li>` : ""}
      </ul>
    </section>`;
  }

  if (prFiles.length) {
    html += `<section>
      <h5 class="analyze-section-title">Files in PR</h5>
      <div class="analyze-chip-list">
        ${prFiles.map((file) => `<span class="analyze-chip">${escapeHtml(file)}</span>`).join("")}
      </div>
    </section>`;
  }

  const entities = (body.entities || [])
    .filter((entity) => entity.status === "new" || entity.status === "changed")
    .slice(0, 12);
  if (entities.length) {
    html += `<section>
      <h5 class="analyze-section-title">Changed entities (sample)</h5>
      <div class="analyze-table-wrap">
        <table class="analyze-table">
          <thead><tr><th>Status</th><th>Type</th><th>Title</th><th>Path</th></tr></thead>
          <tbody>
            ${entities.map((entity) => `<tr>
              <td>${escapeHtml(entity.status)}</td>
              <td>${escapeHtml(entity.entity_type)}</td>
              <td>${escapeHtml(entity.title || entity.entity_id)}</td>
              <td>${escapeHtml(entity.path)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  if (body.summary_markdown) {
    html += `<section>
      <h5 class="analyze-section-title">Summary</h5>
      <div class="analyze-prose">${escapeHtml(body.summary_markdown)}</div>
    </section>`;
  }

  return html;
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
        if (error.message.includes("Password")) {
          openConnectionModal("edit", environment.id);
          showResult(els.loginResult, error.message, true);
          return;
        }
        updateMainConnectionHint();
        if (els.mainConnectionHint) {
          els.mainConnectionHint.className = "main-connection-hint";
          els.mainConnectionHint.innerHTML = `<span class="connection-error-text">${error.message}</span>`;
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

function updateMergeBrUi() {
  const hasBr = !!els.businessRequestId?.value.trim();
  const hasName = !!els.businessRequestName?.value.trim();
  const connected = state.loggedIn;

  if (els.mergeBrConnectHint) {
    els.mergeBrConnectHint.classList.toggle("is-connected", connected);
  }
  if (els.mergeBrConnectHintText) {
    els.mergeBrConnectHintText.innerHTML = connected
      ? "Connected to CatalogOne. Enter a name and click <strong>Create business request</strong>."
      : 'Connect to an environment in the sidebar (click <strong>Connect</strong> on a card), then create your business request below.';
  }
  if (els.createBrBtnHint) {
    if (hasBr) {
      els.createBrBtnHint.textContent = "Business request ID is set. Clear it to create another.";
    } else if (!connected) {
      els.createBrBtnHint.textContent = "CatalogOne connection required — use Connect in the sidebar.";
    } else if (!hasName) {
      els.createBrBtnHint.textContent = "Enter a business request name above.";
    } else {
      els.createBrBtnHint.textContent = "Ready to create.";
    }
  }
  if (els.createBrBtn) {
    els.createBrBtn.disabled = hasBr;
  }
}

function setActionButtonsEnabled() {
  const hasBr = !!getPublishBusinessRequestId();
  els.publishBtn.disabled = !state.loggedIn || !hasBr;
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
  const hasId = Boolean(els.businessRequestId.value.trim());

  if (els.businessRequestNameHint) {
    if (hasId) {
      els.businessRequestNameHint.innerHTML =
        "Business request created. Clear the ID field to create another, or publish in Step 3.";
    } else {
      els.businessRequestNameHint.innerHTML =
        "Enter a name and click <strong>Create business request</strong>, or paste an existing BR ID.";
    }
  }
  setActionButtonsEnabled();
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
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
      hintEl.innerHTML = `${selectedLabel}${size ? ` · ${size}` : ""} — <span class="zip-dropzone-link">click to replace</span>`;
    } else {
      hintEl.innerHTML = emptyHintHtml;
    }
  }
}

function updateZipDropzoneLabel() {
  updateDropzoneSelection({
    dropzone: els.zipDropzone,
    titleEl: els.zipDropzoneTitle,
    hintEl: els.zipDropzoneHint,
    file: els.catalogZipInput?.files?.[0],
    emptyTitle: "Drag & drop your zip here",
    emptyHintHtml: 'or <span class="zip-dropzone-link">browse files</span> · expects <code>promotion/&lt;uuid&gt;.json</code>',
    selectedLabel: "Zip ready",
  });
  if (els.zipAnalyzeReport) {
    els.zipAnalyzeReport.hidden = true;
  }
}

function initZipDropzone() {
  const dropzone = els.zipDropzone;
  const input = els.catalogZipInput;
  if (!dropzone || !input) {
    return;
  }

  input.addEventListener("change", updateZipDropzoneLabel);

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
    if (!file || !file.name.toLowerCase().endsWith(".zip")) {
      showAnalyzeError({
        reportEl: els.zipAnalyzeReport,
        panelEl: els.zipAnalyzePanel,
        jsonEl: els.zipAnalyzeJson,
        toggleEl: els.zipAnalyzeShowJson,
        message: "Please drop a .zip file.",
      });
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

  input.addEventListener("change", updateExcelDropzoneLabel);

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
    if (!file) {
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
    showAnalyzeError({
      reportEl: els.zipAnalyzeReport,
      panelEl: els.zipAnalyzePanel,
      jsonEl: els.zipAnalyzeJson,
      toggleEl: els.zipAnalyzeShowJson,
      message: "Choose a CatalogOne export .zip file first.",
    });
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

    wireAnalyzeReport({
      reportEl: els.zipAnalyzeReport,
      panelEl: els.zipAnalyzePanel,
      jsonEl: els.zipAnalyzeJson,
      toggleEl: els.zipAnalyzeShowJson,
      panelHtml: buildZipAnalyzePanel(body),
      rawData: body,
      isError: body.has_blocking_issues,
    });
  } catch (error) {
    showAnalyzeError({
      reportEl: els.zipAnalyzeReport,
      panelEl: els.zipAnalyzePanel,
      jsonEl: els.zipAnalyzeJson,
      toggleEl: els.zipAnalyzeShowJson,
      message: error.message || "Zip analysis failed.",
    });
  } finally {
    els.analyzeZipBtn.disabled = false;
  }
});

els.createBrBtn?.addEventListener("click", async () => {
  const name = els.businessRequestName.value.trim();
  if (!state.loggedIn) {
    showResult(
      els.brCreateResult,
      "Connect to a CatalogOne environment first — select one in the sidebar and click Connect.",
      true,
    );
    return;
  }
  if (!name) {
    showResult(els.brCreateResult, "Enter a business request name first.", true);
    els.businessRequestName?.focus();
    return;
  }
  if (els.businessRequestId.value.trim()) {
    showResult(els.brCreateResult, "Clear the business request ID to create a new one.", true);
    return;
  }

  els.createBrBtn.disabled = true;
  els.brCreateResult.hidden = true;

  try {
    const result = await api("/api/business-request", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    els.businessRequestId.value = result.business_request_id;
    syncBusinessRequestFields();
    showResult(els.brCreateResult, {
      status: "ok",
      message: `Business request created.`,
      business_request_id: result.business_request_id,
      name: result.name,
    });
  } catch (error) {
    showResult(els.brCreateResult, error.message, true);
  } finally {
    setActionButtonsEnabled();
  }
});

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

async function restoreSession() {
  try {
    const session = await api("/api/session");
    if (session.logged_in) {
      const label = deriveEnvironmentLabel(session.apigw_url || "");
      state.currentEnvironmentLabel = label;

      if (session.apigw_url) {
        els.apigwUrlInput.value = session.apigw_url;
      }
      if (session.keycloak_url) {
        els.keycloakUrlInput.value = session.keycloak_url;
      }
      if (session.realm) {
        els.keycloakRealmInput.value = session.realm;
      }
      if (session.username) {
        els.usernameInput.value = session.username;
      }

      const store = loadEnvironmentStore();
      const matched = store.environments.find(
        (item) => environmentKey(item) === environmentKey(getConnectionFields())
      );
      if (matched) {
        state.activeEnvironmentId = matched.id;
        state.connectedEnvironmentId = matched.id;
        store.activeEnvironmentId = matched.id;
        saveEnvironmentStore(store);
        els.passwordInput.value = matched.password || "";
        state.currentEnvironmentLabel = getEnvironmentDisplayName(matched);
        applyConnectionFields(matched);
        renderEnvironmentSidebar();
      } else {
        state.currentEnvironmentLabel = deriveEnvironmentLabel(session.apigw_url || "");
      }

      setLoggedIn(true, session.username, state.currentEnvironmentLabel);
    }
  } catch {
    setLoggedIn(false);
  }
}

els.businessRequestId.addEventListener("change", syncBusinessRequestFields);
els.businessRequestId.addEventListener("input", () => {
  syncPublishBrIdFromStep2();
  syncBusinessRequestFields();
  setActionButtonsEnabled();
});
els.publishBusinessRequestId?.addEventListener("input", () => {
  syncStep2BrIdFromPublish();
  setActionButtonsEnabled();
});
els.businessRequestName.addEventListener("input", () => {
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

async function initApp() {
  initSidebarResize();
  initZipDropzone();
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

  await restoreSession();
  updateMainConnectionHint();
}

initApp();

window.catalogTool = window.catalogTool || {};
window.catalogTool.refreshMcpNav = refreshMcpToolsNavStatus;
