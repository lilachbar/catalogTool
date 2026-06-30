/**
 * Catalog Tool page context + UI actions for the agentic assistant.
 */
(function initCatalogToolPageControl() {
  const VIEW_LABELS = {
    push: "Upload, Review & Publish",
    "dg-import": "DG Import",
    "mcp-tools": "CatalogOne MCP Tools",
  };

  const BUTTON_SPECS = [
    { id: "analyzeZipBtn", label: "Validate", aliases: ["validation", "validate zip"] },
    { id: "createBrBtn", label: "Create BR and Import", aliases: ["create br", "import"] },
    { id: "publishBtn", label: "Publish business request", aliases: ["publish"] },
    { id: "clearBrBtn", label: "Clear business request", aliases: ["clear br"] },
    { id: "analyzeExcelBtn", label: "Analyze workbook", aliases: ["analyze excel"] },
    { id: "dgCreateBrBtn", label: "Create business request (DG)", aliases: [] },
    { id: "dgImportEntriesBtn", label: "Import entries to catalog", aliases: ["import entries"] },
    { id: "dgPublishBtn", label: "Publish business request (DG)", aliases: [] },
    { id: "brCompareProductionBtn", label: "Run compare", aliases: ["compare", "run compare"] },
  ];

  function normalizeToken(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isElementVisible(element) {
    if (!element || element.hidden) {
      return false;
    }
    return element.getClientRects().length > 0;
  }

  function getActiveWorkflowStep(navEl) {
    if (!navEl) {
      return null;
    }
    const active = navEl.querySelector(".workflow-step-btn.is-active");
    return active?.dataset?.workflowStep || null;
  }

  function collectActionableElements() {
    const actions = [];

    for (const spec of BUTTON_SPECS) {
      const element = document.getElementById(spec.id);
      if (!element) {
        continue;
      }
      actions.push({
        actionId: spec.id,
        type: "click",
        label: spec.label,
        aliases: spec.aliases,
        enabled: !element.disabled,
        visible: isElementVisible(element),
        title: element.title || "",
      });
    }

    document.querySelectorAll(".workflow-step-btn[data-workflow-step]").forEach((button) => {
      const step = button.dataset.workflowStep;
      const nav = button.closest(".workflow-step-list");
      const workflow = nav?.closest("#pushView, #dgImportView")?.id === "pushView" ? "push" : "dg";
      actions.push({
        actionId: `workflow:${workflow}:${step}`,
        type: "workflow_step",
        label: button.querySelector(".workflow-step-label")?.textContent?.trim() || step,
        workflow,
        step,
        enabled: true,
        visible: isElementVisible(button),
        active: button.classList.contains("is-active"),
      });
    });

    document.querySelectorAll(".app-nav-item[data-view]").forEach((button) => {
      actions.push({
        actionId: `view:${button.dataset.view}`,
        type: "set_view",
        label: button.textContent?.trim() || button.dataset.view,
        view: button.dataset.view,
        enabled: true,
        visible: isElementVisible(button),
        active: button.classList.contains("is-active"),
      });
    });

    return actions;
  }

  function getPageContext() {
    const activeView = window.catalogTool?.getActiveView?.()
      || document.querySelector(".app-nav-item.is-active")?.dataset?.view
      || "push";

    const connected = typeof window.catalogTool?.isEnvironmentConnected === "function"
      ? window.catalogTool.isEnvironmentConnected()
      : false;

    return {
      capturedAt: new Date().toISOString(),
      activeView,
      activeViewLabel: VIEW_LABELS[activeView] || activeView,
      connected,
      environmentLabel: connected ? (window.catalogTool?.getEnvironmentLabel?.() || null) : null,
      workflow: {
        push: {
          activeStep: getActiveWorkflowStep(document.getElementById("pushStepNav")),
          businessRequestName: document.getElementById("businessRequestName")?.value?.trim() || "",
          businessRequestId: document.getElementById("businessRequestId")?.value?.trim() || "",
          zipFileName: document.getElementById("catalogZipInput")?.files?.[0]?.name || "",
          validateEnabled: !document.getElementById("analyzeZipBtn")?.disabled,
          createBrEnabled: !document.getElementById("createBrBtn")?.disabled,
        },
        dgImport: {
          activeStep: getActiveWorkflowStep(document.getElementById("dgStepNav")),
          businessRequestName: document.getElementById("dgBusinessRequestName")?.value?.trim() || "",
          businessRequestId: document.getElementById("dgBusinessRequestId")?.value?.trim() || "",
          workbookName: document.getElementById("catalogExcelInput")?.files?.[0]?.name || "",
        },
      },
      actions: collectActionableElements(),
    };
  }

  function resolveClickTarget(actionId, label) {
    const token = normalizeToken(actionId || label);
    if (!token) {
      return null;
    }

    for (const spec of BUTTON_SPECS) {
      const idMatch = normalizeToken(spec.id) === token;
      const labelMatch = normalizeToken(spec.label) === token;
      const aliasMatch = spec.aliases.some((alias) => normalizeToken(alias) === token || token.includes(normalizeToken(alias)));
      if (idMatch || labelMatch || aliasMatch) {
        return document.getElementById(spec.id);
      }
    }

    if (token.includes("valid")) {
      return document.getElementById("analyzeZipBtn");
    }
    if (token.includes("compare")) {
      return document.getElementById("brCompareProductionBtn");
    }

    return document.getElementById(actionId);
  }

  function executePageAction(action) {
    if (!action || typeof action !== "object") {
      return { ok: false, error: "Invalid UI action payload." };
    }

    const type = action.type || "click";

    if (type === "set_view") {
      const view = action.view || String(action.actionId || "").replace(/^view:/, "");
      if (!view) {
        return { ok: false, error: "set_view requires a view id." };
      }
      window.catalogTool?.setActiveView?.(view);
      return { ok: true, type, view, page: getPageContext() };
    }

    if (type === "workflow_step") {
      const workflow = action.workflow || "push";
      const step = action.step || String(action.actionId || "").split(":").pop();
      const nav = document.getElementById(workflow === "dg" ? "dgStepNav" : "pushStepNav");
      const button = nav?.querySelector(`[data-workflow-step="${step}"]`);
      if (!button) {
        return { ok: false, error: `Workflow step not found: ${workflow}/${step}` };
      }
      button.click();
      return { ok: true, type, workflow, step, page: getPageContext() };
    }

    if (type === "set_field") {
      const fieldId = action.fieldId;
      const element = fieldId ? document.getElementById(fieldId) : null;
      if (!element) {
        return { ok: false, error: `Field not found: ${fieldId}` };
      }
      element.value = action.value ?? "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, type, fieldId, page: getPageContext() };
    }

    const target = resolveClickTarget(action.actionId || action.targetId, action.label);
    if (!target) {
      return { ok: false, error: `No control found for actionId/label: ${action.actionId || action.label || "unknown"}` };
    }
    if (target.disabled) {
      return {
        ok: false,
        error: target.title || `Control "${target.id}" is disabled.`,
        actionId: target.id,
      };
    }
    if (!isElementVisible(target)) {
      return { ok: false, error: `Control "${target.id}" is not visible on the current page.`, actionId: target.id };
    }

    target.click();
    return { ok: true, type: "click", actionId: target.id, label: target.textContent?.trim() || target.id, page: getPageContext() };
  }

  window.catalogTool = window.catalogTool || {};
  window.catalogTool.getPageContext = getPageContext;
  window.catalogTool.executePageAction = executePageAction;
})();
