/**
 * CatalogOne MCP Tools browser — list and execute each MCP tool from the web UI.
 */
(function initCatalogoneMcpTools() {
  const MCP_CATEGORY_ORDER = [
    "Auth",
    "Search & Browse",
    "Business Requests",
    "Catalog CRUD",
    "Pricing",
    "Characteristics",
    "Relationships",
    "Rules & Config",
    "Other",
  ];

  const state = {
    tools: [],
    selectedToolName: null,
    rawJsonMode: false,
    loading: false,
  };

  const els = {
    panel: document.getElementById("mcpToolsPanel"),
    searchInput: document.getElementById("mcpToolsSearch"),
    list: document.getElementById("mcpToolsList"),
    status: document.getElementById("mcpToolsStatus"),
    emptyDetail: document.getElementById("mcpToolsEmptyDetail"),
    detail: document.getElementById("mcpToolsDetail"),
    detailTitle: document.getElementById("mcpToolDetailTitle"),
    detailDesc: document.getElementById("mcpToolDetailDesc"),
    fields: document.getElementById("mcpToolFields"),
    rawJsonWrap: document.getElementById("mcpToolRawJsonWrap"),
    rawJson: document.getElementById("mcpToolRawJson"),
    rawToggle: document.getElementById("mcpToolRawToggle"),
    runBtn: document.getElementById("mcpToolRunBtn"),
    result: document.getElementById("mcpToolResult"),
    resultMeta: document.getElementById("mcpToolResultMeta"),
  };

  if (!els.panel || !els.list) {
    return;
  }

  function categorizeTool(name) {
    if (name === "login") return "Auth";
    if (
      name.startsWith("search_") ||
      name.startsWith("find_") ||
      name === "list_catalog_items" ||
      name === "list_entity_types" ||
      name === "search_by_ids" ||
      name === "search_related"
    ) {
      return "Search & Browse";
    }
    if (name.includes("business_request")) return "Business Requests";
    if (
      name.startsWith("create_entity") ||
      name.startsWith("get_entity") ||
      name.startsWith("update_entity") ||
      name.startsWith("delete_entity") ||
      name.startsWith("duplicate_entity") ||
      name.startsWith("restore_entity")
    ) {
      return "Catalog CRUD";
    }
    if (
      name.includes("price") ||
      name.includes("promotion") ||
      name === "import_catalog_data" ||
      name === "create_price_policy"
    ) {
      return "Pricing";
    }
    if (name.includes("characteristic")) return "Characteristics";
    if (
      name.includes("link_") ||
      name.includes("_to_") ||
      name.includes("_group") ||
      name.includes("category")
    ) {
      return "Relationships";
    }
    if (
      name.startsWith("get_") ||
      name.startsWith("attach_") ||
      name === "custom_api_request"
    ) {
      return "Rules & Config";
    }
    return "Other";
  }

  async function mcpApi(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || response.statusText };
    }
    if (!response.ok) {
      throw new Error(data.error || data.message || response.statusText);
    }
    return data;
  }

  function filteredTools() {
    const query = (els.searchInput?.value || "").trim().toLowerCase();
    if (!query) {
      return state.tools;
    }
    return state.tools.filter((tool) => {
      const haystack = `${tool.name} ${tool.title || ""} ${tool.description || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderToolList() {
    const tools = filteredTools();
    const grouped = new Map();
    for (const tool of tools) {
      const category = categorizeTool(tool.name);
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category).push(tool);
    }

    els.list.innerHTML = "";
    for (const category of MCP_CATEGORY_ORDER) {
      const items = grouped.get(category);
      if (!items?.length) {
        continue;
      }
      items.sort((a, b) => a.name.localeCompare(b.name));

      const section = document.createElement("section");
      section.className = "mcp-tools-category";
      section.innerHTML = `<h3 class="mcp-tools-category-title">${category}</h3>`;

      const ul = document.createElement("ul");
      ul.className = "mcp-tools-category-list";
      for (const tool of items) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mcp-tools-list-item";
        if (tool.name === state.selectedToolName) {
          btn.classList.add("is-active");
        }
        btn.dataset.toolName = tool.name;
        btn.innerHTML = `<span class="mcp-tools-list-name">${tool.name}</span><span class="mcp-tools-list-title">${tool.title || ""}</span>`;
        btn.addEventListener("click", () => selectTool(tool.name));
        li.appendChild(btn);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      els.list.appendChild(section);
    }

    if (!tools.length) {
      els.list.innerHTML = state.loading
        ? '<p class="mcp-tools-list-empty">Loading tools…</p>'
        : '<p class="mcp-tools-list-empty">No tools match your search.</p>';
    }
  }

  function fieldDefault(schema) {
    if (schema.default !== undefined) {
      return schema.default;
    }
    if (schema.type === "boolean") {
      return false;
    }
    if (schema.type === "array") {
      return [];
    }
    if (schema.type === "object") {
      return {};
    }
    return "";
  }

  function renderField(name, schema, required) {
    const wrap = document.createElement("label");
    wrap.className = "field mcp-tool-field";
    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = required ? `${name} *` : name;
    wrap.appendChild(label);

    if (schema.description) {
      const hint = document.createElement("span");
      hint.className = "field-hint";
      hint.textContent = schema.description;
      wrap.appendChild(hint);
    }

    let input;
    const id = `mcp-field-${name}`;

    if (schema.enum) {
      input = document.createElement("select");
      input.id = id;
      input.dataset.fieldName = name;
      input.dataset.fieldType = "enum";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = schema.default !== undefined ? String(schema.default) : "(select)";
      input.appendChild(empty);
      for (const value of schema.enum) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        if (schema.default === value) {
          opt.selected = true;
        }
        input.appendChild(opt);
      }
    } else if (schema.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.dataset.fieldName = name;
      input.dataset.fieldType = "boolean";
      input.checked = Boolean(schema.default);
      wrap.classList.add("mcp-tool-field-checkbox");
    } else if (schema.type === "number" || schema.type === "integer") {
      input = document.createElement("input");
      input.type = "number";
      input.id = id;
      input.dataset.fieldName = name;
      input.dataset.fieldType = "number";
      if (schema.default !== undefined) {
        input.value = String(schema.default);
      }
    } else if (schema.type === "array" || schema.type === "object") {
      input = document.createElement("textarea");
      input.rows = schema.type === "object" ? 6 : 3;
      input.id = id;
      input.dataset.fieldName = name;
      input.dataset.fieldType = schema.type;
      input.spellcheck = false;
      input.placeholder = schema.type === "array" ? '["value1", "value2"]' : '{"key": "value"}';
      const def = fieldDefault(schema);
      if (Array.isArray(def) && def.length) {
        input.value = JSON.stringify(def, null, 2);
      } else if (def && typeof def === "object" && Object.keys(def).length) {
        input.value = JSON.stringify(def, null, 2);
      }
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.id = id;
      input.dataset.fieldName = name;
      input.dataset.fieldType = "string";
      if (schema.default !== undefined) {
        input.value = String(schema.default);
      }
    }

    wrap.appendChild(input);
    return wrap;
  }

  function renderToolForm(tool) {
    if (!els.fields || !tool) {
      return;
    }

    els.fields.innerHTML = "";
    const schema = tool.inputSchema || {};
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);
    const names = Object.keys(properties);

    if (!names.length) {
      els.fields.innerHTML = '<p class="field-hint">This tool takes no arguments.</p>';
      return;
    }

    for (const name of names) {
      els.fields.appendChild(renderField(name, properties[name], required.has(name)));
    }
  }

  function selectTool(toolName) {
    const tool = state.tools.find((entry) => entry.name === toolName);
    if (!tool) {
      return;
    }

    state.selectedToolName = toolName;
    state.rawJsonMode = false;
    renderToolList();

    if (els.emptyDetail) {
      els.emptyDetail.hidden = true;
    }
    if (els.detail) {
      els.detail.hidden = false;
    }
    if (els.detailTitle) {
      els.detailTitle.textContent = tool.title || tool.name;
    }
    if (els.detailDesc) {
      els.detailDesc.textContent = tool.description || "";
    }
    if (els.rawToggle) {
      els.rawToggle.checked = false;
    }
    if (els.rawJsonWrap) {
      els.rawJsonWrap.hidden = true;
    }
    if (els.fields) {
      els.fields.hidden = false;
    }
    if (els.result) {
      els.result.hidden = true;
      els.result.textContent = "";
    }
    if (els.resultMeta) {
      els.resultMeta.textContent = "";
    }

    renderToolForm(tool);

    const exampleArgs = {};
    for (const [name, schema] of Object.entries(tool.inputSchema?.properties || {})) {
      if (schema.default !== undefined) {
        exampleArgs[name] = schema.default;
      }
    }
    if (els.rawJson) {
      els.rawJson.value = JSON.stringify(exampleArgs, null, 2);
    }
  }

  function collectFormArguments(tool) {
    const args = {};
    const schema = tool.inputSchema || {};
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [name, propSchema] of Object.entries(properties)) {
      if (state.rawJsonMode) {
        continue;
      }

      const field = els.fields?.querySelector(`[data-field-name="${name}"]`);
      if (!field) {
        continue;
      }

      const type = field.dataset.fieldType;
      if (type === "boolean") {
        if (field.checked) {
          args[name] = true;
        } else if (required.has(name)) {
          args[name] = false;
        }
        continue;
      }

      const raw = field.value?.trim?.() ?? field.value;
      if (raw === "" || raw === undefined || raw === null) {
        if (required.has(name)) {
          throw new Error(`Missing required field: ${name}`);
        }
        continue;
      }

      if (type === "number") {
        args[name] = Number(raw);
        continue;
      }
      if (type === "array" || type === "object") {
        try {
          args[name] = JSON.parse(raw);
        } catch {
          throw new Error(`Invalid JSON for ${name}`);
        }
        continue;
      }
      args[name] = raw;
    }

    if (state.rawJsonMode) {
      const raw = (els.rawJson?.value || "").trim();
      if (!raw) {
        return {};
      }
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error("Invalid JSON in raw arguments");
      }
    }

    return args;
  }

  async function runSelectedTool() {
    const tool = state.tools.find((entry) => entry.name === state.selectedToolName);
    if (!tool || !els.runBtn) {
      return;
    }

    els.runBtn.disabled = true;
    if (els.result) {
      els.result.hidden = true;
    }

    try {
      const toolArgs = collectFormArguments(tool);
      const started = performance.now();
      const response = await mcpApi("/api/mcp/call", {
        method: "POST",
        body: JSON.stringify({ toolName: tool.name, arguments: toolArgs }),
      });
      const elapsed = Math.round(performance.now() - started);

      if (els.resultMeta) {
        els.resultMeta.textContent = `${tool.name} · ${elapsed}ms`;
      }
      if (els.result) {
        els.result.hidden = false;
        els.result.textContent = JSON.stringify(response.result ?? response, null, 2);
      }
    } catch (error) {
      if (els.resultMeta) {
        els.resultMeta.textContent = `${tool.name} · error`;
      }
      if (els.result) {
        els.result.hidden = false;
        els.result.textContent = error.message;
      }
    } finally {
      els.runBtn.disabled = false;
    }
  }

  async function loadTools() {
    state.loading = true;
    renderToolList();
    if (els.status) {
      els.status.textContent = "Loading catalogone MCP tools…";
    }

    try {
      const status = await mcpApi("/api/mcp/config");
      if (!status.configured) {
        const reason = status.onlineError
          || status.error
          || "catalogone MCP is not configured in ~/.cursor/mcp.json";
        if (els.status) {
          els.status.textContent = reason;
        }
        if (els.list) {
          els.list.innerHTML = `<p class="mcp-tools-list-empty">${reason}</p>`;
        }
        if (window.catalogTool?.refreshMcpNav) {
          window.catalogTool.refreshMcpNav();
        }
        return;
      }

      if (els.status) {
        els.status.textContent = "Starting catalogone MCP server…";
      }

      const payload = await mcpApi("/api/mcp/tools");
      state.tools = payload.tools || [];
      let credentialsNote = `credentials from ${status.source || "MCP"}`;
      if (status.credentialsSource === "connected_session" && status.activeEnvironment?.label) {
        credentialsNote = `using connected environment: ${status.activeEnvironment.label}`;
      } else if (payload.credentialsSource === "connected_session") {
        try {
          const sessionPayload = await fetch("/api/session").then((r) => r.json());
          if (sessionPayload.logged_in && sessionPayload.environment_label) {
            credentialsNote = `using connected environment: ${sessionPayload.environment_label}`;
          }
        } catch {
          // keep default note
        }
      }
      if (els.status) {
        els.status.textContent = status.configured
          ? `${state.tools.length} tools available · ${credentialsNote}`
          : "catalogone MCP not configured — check ~/.cursor/mcp.json and restart the chat server";
      }
      renderToolList();
      if (state.tools.length && !state.selectedToolName) {
        selectTool(state.tools[0].name);
      }
    } catch (error) {
      if (els.status) {
        els.status.textContent = error.message;
      }
      if (els.list) {
        els.list.innerHTML = `<p class="mcp-tools-list-empty">${error.message}</p>`;
      }
    } finally {
      state.loading = false;
    }
  }

  els.searchInput?.addEventListener("input", renderToolList);
  els.runBtn?.addEventListener("click", runSelectedTool);
  els.rawToggle?.addEventListener("change", () => {
    state.rawJsonMode = Boolean(els.rawToggle?.checked);
    if (els.rawJsonWrap) {
      els.rawJsonWrap.hidden = !state.rawJsonMode;
    }
    if (els.fields) {
      els.fields.hidden = state.rawJsonMode;
    }
  });

  loadTools();

  window.catalogTool = window.catalogTool || {};
  window.catalogTool.reloadMcpTools = loadTools;
})();
