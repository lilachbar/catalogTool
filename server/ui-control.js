/**
 * Queue Catalog Tool browser UI actions through the Flask session bridge.
 */
import { callInternalApi } from "./mcp-session.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function storePageContext(pageContext, cookie) {
  if (!pageContext || !cookie) {
    return;
  }
  await callInternalApi("/api/ui-control/context", {
    method: "POST",
    body: pageContext,
    headers: { Cookie: cookie },
  });
}

export async function queueUiAction(action, cookie, { timeoutMs = 45000, pollMs = 250 } = {}) {
  if (!cookie) {
    return { ok: false, error: "No browser session cookie — UI control requires an active Catalog Tool login." };
  }

  const queued = await callInternalApi("/api/ui-control/queue", {
    method: "POST",
    body: action,
    headers: { Cookie: cookie },
  });

  if (!queued.ok) {
    return { ok: false, error: queued.data?.error || "Failed to queue UI action." };
  }

  const actionId = queued.data?.id;
  if (!actionId) {
    return { ok: false, error: "UI action queue did not return an action id." };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await callInternalApi(`/api/ui-control/result/${encodeURIComponent(actionId)}`, {
      headers: { Cookie: cookie },
    });
    if (result.ok && result.data?.status === "done") {
      return result.data.result ?? { ok: true };
    }
    if (result.status === 404 || result.data?.status === "missing") {
      return { ok: false, error: "UI action expired before the browser executed it." };
    }
    await sleep(pollMs);
  }

  return {
    ok: false,
    error: "Timed out waiting for the Catalog Tool browser to execute the UI action. Keep the main window open while the assistant works.",
    actionId,
  };
}

export function formatPageContextNote(pageContext) {
  if (!pageContext || typeof pageContext !== "object") {
    return "Catalog Tool page context was not supplied — ask the user to keep the main Catalog Tool window open, then retry.";
  }

  const lines = [
    "## Catalog Tool web UI (live page context)",
    "You can see and control the user's Catalog Tool browser page with `get_catalog_tool_page` and `catalog_tool_ui_action`.",
    "Prefer `catalog_tool_ui_action` for clicks/navigation instead of telling the user to click manually.",
    "",
    `Active view: ${pageContext.activeViewLabel || pageContext.activeView || "unknown"}`,
    `Connected: ${pageContext.connected ? "yes" : "no"}${pageContext.environmentLabel ? ` (${pageContext.environmentLabel})` : ""}`,
  ];

  const push = pageContext.workflow?.push;
  if (push) {
    lines.push(
      "",
      "Upload workflow:",
      `- Step: ${push.activeStep || "unknown"}`,
      `- BR name: ${push.businessRequestName || "(empty)"}`,
      `- BR id: ${push.businessRequestId || "(empty)"}`,
      `- Zip: ${push.zipFileName || "(none selected)"}`,
    );
  }

  const actions = Array.isArray(pageContext.actions) ? pageContext.actions : [];
  const visibleActions = actions.filter((item) => item.visible);
  if (visibleActions.length) {
    lines.push("", "Visible controls (use actionId with catalog_tool_ui_action):");
    for (const item of visibleActions.slice(0, 24)) {
      lines.push(
        `- ${item.actionId} · ${item.label}${item.enabled ? "" : " (disabled)"}${item.active ? " (active)" : ""}`,
      );
    }
    if (visibleActions.length > 24) {
      lines.push(`- …and ${visibleActions.length - 24} more`);
    }
  }

  return lines.join("\n");
}
