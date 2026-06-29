/**
 * Resolve catalogone MCP env from the Catalog Tool web session (Flask).
 */
const FLASK_BASE_URL = process.env.FLASK_BASE_URL || "http://127.0.0.1:8080";

export async function callInternalApi(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${FLASK_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(text) };
  } catch {
    return { ok: response.ok, status: response.status, data: text };
  }
}

export async function fetchCatalogoneEnvFromSession(cookie) {
  if (!cookie) {
    return null;
  }

  const response = await fetch(`${FLASK_BASE_URL}/api/mcp/env`, {
    headers: { Cookie: cookie },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }

  if (!response.ok || !data?.catalogoneEnv) {
    return null;
  }

  return {
    catalogoneEnv: data.catalogoneEnv,
    environmentLabel: data.environment_label || null,
    apigwUrl: data.apigw_url || null,
  };
}
