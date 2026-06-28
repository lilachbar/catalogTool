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
    eyebrow: "CatalogOne Authoring",
    title: "Merge",
  },
  "mcp-tools": {
    eyebrow: "CatalogOne MCP",
    title: "MCP Tools",
  },
};

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
  loginResult: document.getElementById("loginResult"),
  pushBtn: document.getElementById("pushBtn"),
  publishBtn: document.getElementById("publishBtn"),
  forcePublish: document.getElementById("forcePublish"),
  pushResult: document.getElementById("pushResult"),
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
  createBr: document.getElementById("createBr"),
  keycloakUrlInput: document.getElementById("keycloakUrlInput"),
  keycloakRealmInput: document.getElementById("keycloakRealmInput"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  apigwUrlInput: document.getElementById("apigwUrlInput"),
  syncKeycloakBtn: document.getElementById("syncKeycloakBtn"),
  openKeycloakBtn: document.getElementById("openKeycloakBtn"),
  openTableLinks: document.getElementById("openTableLinks"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  appPage: document.getElementById("appPage"),
  pushView: document.getElementById("pushView"),
  mcpToolsView: document.getElementById("mcpToolsView"),
  topbarEyebrow: document.getElementById("topbarEyebrow"),
  topbarTitle: document.getElementById("topbarTitle"),
  appNavItems: document.querySelectorAll(".app-nav-item"),
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
  state.activeView = nextView;
  localStorage.setItem(VIEW_STORAGE_KEY, nextView);

  if (els.pushView) {
    els.pushView.hidden = nextView !== "push";
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
}

function initAppNavigation() {
  const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
  setActiveView(savedView || "push");

  els.appNavItems?.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.view || "push");
    });
  });
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
  els.editorModeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  els.formMode.hidden = mode !== "form";
  els.jsonMode.hidden = mode !== "json";
}

function collectRowsFromEditor() {
  return [...els.rowsContainer.querySelectorAll(".row-item")].map((row) => ({
    name: row.querySelector(".row-name").value.trim(),
    localized_name: row.querySelector(".row-localized").value.trim(),
  }));
}

function addRow(name = "", localized = "") {
  const node = els.rowTemplate.content.cloneNode(true);
  const row = node.querySelector(".row-item");
  row.querySelector(".row-name").value = name;
  row.querySelector(".row-localized").value = localized;
  row.querySelector(".remove-row").addEventListener("click", () => row.remove());
  els.rowsContainer.appendChild(node);
}

function renderRows(rows) {
  els.rowsContainer.innerHTML = "";
  for (const row of rows) {
    addRow(row.name, row.localized_name);
  }
}

function saveActiveTableDraft() {
  const tableKey = getActiveTableKey();
  state.tableDrafts.set(tableKey, {
    mode: state.editorMode,
    rows: collectRowsFromEditor(),
    entriesJson: els.entriesJson.value,
  });
  updateTableDraftSummary();
}

function loadTableDraft(tableKey) {
  const draft = getTableDraft(tableKey);
  state.activeTableKey = tableKey;
  if (els.tableSelect) {
    els.tableSelect.value = tableKey;
  }
  localStorage.setItem(TABLE_STORAGE_KEY, tableKey);
  setEditorMode(draft.mode);
  renderRows(draft.rows);
  els.entriesJson.value = draft.entriesJson;
  updateTableDescription();
  updateTableDraftSummary();
}

function initTableDrafts() {
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
    if (Array.isArray(serverStore.environments) && serverStore.environments.length > 0) {
      environmentStore = {
        activeEnvironmentId: serverStore.activeEnvironmentId || null,
        environments: serverStore.environments,
      };
      return;
    }
  } catch (error) {
    console.warn("Could not load environments from server:", error);
  }
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
  refreshOpenTableLinks();
}

function getEnvironmentById(environmentId) {
  return loadEnvironmentStore().environments.find((item) => item.id === environmentId);
}

function fillDefaultConnectionFields() {
  els.environmentDisplayNameInput.value = "";
  els.apigwUrlInput.value = DEFAULTS.apigw_url || "";
  els.keycloakUrlInput.value = DEFAULTS.keycloak_url || "";
  els.keycloakRealmInput.value = DEFAULTS.keycloak_realm || "";
  els.usernameInput.value = DEFAULTS.username || "";
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

function updateMainConnectionHint() {
  if (!els.mainConnectionHint) {
    return;
  }

  if (state.loggedIn) {
    const label = state.currentEnvironmentLabel || "environment";
    els.mainConnectionHint.hidden = false;
    els.mainConnectionHint.className = "main-connection-hint main-connection-hint-connected";
    els.mainConnectionHint.innerHTML = `Connected to <strong>${label}</strong>. You can merge data and publish.`;
    return;
  }

  const store = loadEnvironmentStore();
  els.mainConnectionHint.hidden = false;
  els.mainConnectionHint.className = "main-connection-hint";
  if (store.environments.length === 0) {
    els.mainConnectionHint.innerHTML = 'No environments yet. Click <strong>+ Add</strong> in the sidebar to create one.';
  } else {
    els.mainConnectionHint.innerHTML = "Select an environment in the sidebar and click <strong>Connect</strong>, or add a new one.";
  }
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
    id: existing?.id || profile.id || crypto.randomUUID(),
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

function setActionButtonsEnabled() {
  const hasBr = !!els.businessRequestId.value.trim();
  els.pushBtn.disabled = !state.loggedIn;
  els.publishBtn.disabled = !state.loggedIn || !hasBr;
}

function syncBusinessRequestFields() {
  const hasId = Boolean(els.businessRequestId.value.trim());
  const creatingNew = !hasId && els.createBr.checked;

  els.businessRequestName.disabled = !creatingNew;
  els.businessRequestName.required = creatingNew;

  if (els.businessRequestNameHint) {
    if (hasId) {
      els.businessRequestNameHint.textContent = "Not used when reusing an existing business request ID.";
    } else if (creatingNew) {
      els.businessRequestNameHint.textContent = "Required when creating a new business request.";
    } else {
      els.businessRequestNameHint.textContent = 'Enable "Create a new business request" or enter an existing ID.';
    }
  }
}

function validateBusinessRequestForPush() {
  const businessRequestId = els.businessRequestId.value.trim();
  const businessRequestName = els.businessRequestName.value.trim();

  if (!businessRequestId && !els.createBr.checked) {
    return "Provide a business request ID or enable create new BR.";
  }
  if (!businessRequestId && els.createBr.checked && !businessRequestName) {
    return "Enter a business request name when creating a new business request.";
  }
  return null;
}

function setLoggedIn(loggedIn, username = "", environmentLabel = "") {
  state.loggedIn = loggedIn;
  setActionButtonsEnabled();
  els.logoutBtn.hidden = !loggedIn;

  if (!loggedIn) {
    state.connectedEnvironmentId = null;
  }

  renderEnvironmentSidebar();
  updateMainConnectionHint();
  refreshOpenTableLinks();
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

function renderOpenTableLinks(links) {
  if (!els.openTableLinks) {
    return;
  }

  els.openTableLinks.innerHTML = "";
  if (!links.length) {
    return;
  }

  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.className = "btn btn-ghost";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.title = link.title;
    anchor.textContent = link.label;
    els.openTableLinks.appendChild(anchor);
  }
}

async function refreshOpenTableLinks() {
  const brId = els.businessRequestId.value.trim();
  const apigwUrl = normalizeApigwUrl(els.apigwUrlInput.value);
  const links = [];

  for (const table of TABLES) {
    const tableLabel = table.label || table.key;
    try {
      const params = new URLSearchParams();
      if (brId) {
        params.set("business_request_id", brId);
      }
      if (apigwUrl) {
        params.set("apigw_url", apigwUrl);
      }
      params.set("table_key", table.key);
      const result = await api(`/api/table-ui-url?${params.toString()}`);
      const href = state.loggedIn && result.launch_url
        ? result.launch_url
        : state.loggedIn
          ? buildCatalogUiLaunchPath(table.key, brId)
          : result.table_ui_url;
      links.push({
        href,
        label: brId ? `Open ${tableLabel} in BR` : `Open ${tableLabel}`,
        title: state.loggedIn
          ? brId
            ? `Sign in and open ${tableLabel} in business request ${brId}`
            : `Sign in and open ${tableLabel}`
          : `Open ${tableLabel} in CatalogOne`,
      });
    } catch {
      if (apigwUrl) {
        links.push({
          href: `${deriveCatalogUiUrl(apigwUrl)}/designerLayout?entityType=productconfiguratortable&entityId=${encodeURIComponent(table.id)}`,
          label: brId ? `Open ${tableLabel} in BR` : `Open ${tableLabel}`,
          title: `Open ${tableLabel} in CatalogOne`,
        });
      }
    }
  }

  renderOpenTableLinks(links);
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
  disconnectSession();
});

async function syncKeycloakFromGateway() {
  const normalized = normalizeApigwUrl(els.apigwUrlInput.value);
  els.apigwUrlInput.value = normalized;
  try {
    const data = await api(`/api/derive-urls?apigw_url=${encodeURIComponent(normalized)}`);
    els.apigwUrlInput.value = data.apigw_url;
    els.keycloakUrlInput.value = data.keycloak_url;
    els.keycloakRealmInput.value = data.environment_label;
    refreshOpenTableLinks();
  } catch (error) {
    showResult(
      els.loginResult,
      error?.message || "Could not derive Keycloak URL from API gateway URL.",
      true,
    );
  }
}

els.apigwUrlInput.addEventListener("change", syncKeycloakFromGateway);
els.apigwUrlInput.addEventListener("input", refreshOpenTableLinks);

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

els.pushBtn.addEventListener("click", async () => {
  const brValidationError = validateBusinessRequestForPush();
  if (brValidationError) {
    showResult(els.pushResult, brValidationError, true);
    return;
  }

  const tableValidationError = validateTablesForPush();
  if (tableValidationError) {
    showResult(els.pushResult, tableValidationError, true);
    return;
  }

  els.pushBtn.disabled = true;
  els.pushResult.hidden = true;

  const payload = {
    table_payloads: collectTablePayloads(),
    business_request_id: els.businessRequestId.value.trim(),
    business_request_name: els.businessRequestName.value.trim(),
    create_business_request: els.createBr.checked,
  };

  try {
    const result = await api("/api/push", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showResult(els.pushResult, result);
    if (result.business_request_id) {
      els.businessRequestId.value = result.business_request_id;
      syncBusinessRequestFields();
    }
    refreshOpenTableLinks();
  } catch (error) {
    showResult(els.pushResult, error.message, true);
  } finally {
    setActionButtonsEnabled();
  }
});

els.publishBtn.addEventListener("click", async () => {
  const businessRequestId = els.businessRequestId.value.trim();
  if (!businessRequestId) {
    showResult(els.pushResult, "Enter a business request ID before publishing.", true);
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
    refreshOpenTableLinks();
  } catch (error) {
    showResult(els.pushResult, error.message, true);
  } finally {
    setActionButtonsEnabled();
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
      refreshOpenTableLinks();
    }
  } catch {
    setLoggedIn(false);
  }
}

els.businessRequestId.addEventListener("change", () => {
  syncBusinessRequestFields();
  refreshOpenTableLinks();
  setActionButtonsEnabled();
});
els.businessRequestId.addEventListener("input", () => {
  syncBusinessRequestFields();
  setActionButtonsEnabled();
});
els.createBr.addEventListener("change", syncBusinessRequestFields);

els.tableSelect?.addEventListener("change", () => {
  saveActiveTableDraft();
  loadTableDraft(els.tableSelect.value);
});

els.addRowBtn?.addEventListener("click", () => addRow());

els.editorModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setEditorMode(tab.dataset.mode);
    saveActiveTableDraft();
  });
});

els.entriesJson?.addEventListener("input", saveActiveTableDraft);

initTableDrafts();
syncBusinessRequestFields();

async function initApp() {
  initSidebarResize();
  initAppNavigation();
  await loadEnvironmentsFromServer();
  restoreSelectedEnvironment();
  await restoreSession();
  updateMainConnectionHint();
  refreshOpenTableLinks();
}

initApp();
