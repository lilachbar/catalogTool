/**
 * Parse catalogone C1_* env overrides forwarded from the Catalog Tool web session.
 */
export function parseCatalogoneEnvFromRequest(req) {
  const fromBody = req.body?.catalogoneEnv;
  if (fromBody && typeof fromBody === "object" && !Array.isArray(fromBody)) {
    return fromBody;
  }

  const header = req.headers["x-catalogone-env"];
  if (typeof header === "string" && header.trim()) {
    try {
      return JSON.parse(Buffer.from(header.trim(), "base64").toString("utf8"));
    } catch {
      // ignore malformed header
    }
  }

  return null;
}
