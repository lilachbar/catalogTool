# Catalog Tool — Architecture Overview

This document complements [README.md](../README.md) with structural detail for maintainers.

## Process model

Two long-lived processes serve the web application:

| Process | Port | Entry | Responsibility |
|---------|------|-------|----------------|
| **Flask** | 8080 (default) | `catalog-tool-web` | UI, LDAP gate, CatalogOne session, zip/Excel analysis, API proxies |
| **Node** | 3001 (default) | `server/index.js` | AI chat streaming, catalogone MCP stdio client, `/api/mcp/*` |

Both are started by `./run_web.sh`, which also runs preflight checks (MCP install + agent skills).

## Request flow

```
Browser
  └─► Flask (same origin)
        ├─► CatalogOne REST (login, token refresh, BR compare entity reads)
        ├─► Local disk (environment store, import uploads, PR packages)
        └─► Node proxy (chat, MCP tool list/call)
              └─► catalogone MCP (stdio; C1_* env from Connect session)
```

## CatalogOne operations: MCP vs REST

The web app uses **two paths** to CatalogOne:

| Operation | Path | Module |
|-----------|------|--------|
| LDAP login | Flask only | `auth/ldap.py` |
| CatalogOne Connect (Keycloak token) | REST | `client/catalog_one_client.py` |
| Create BR, push entries, publish, zip import | **MCP** (via Node) | `web/mcp_catalog.py`, `web/push_service.py` |
| BR compare (entity fetch, audit) | **REST** | `br_compare.py` + `CatalogOneClient` |
| MCP Tools tab, Catalog assistant tool calls | **MCP** (via Node) | `server/mcp-routes.js` |

MCP is preferred for write operations because it matches Cursor IDE tooling and centralizes CatalogOne API knowledge in the MCP server. REST write methods on `CatalogOneClient` are retained as documented fallbacks but are not used by the current web routes.

**Runtime environment alignment:** MCP and chat use the sidebar **Connect** session. Flask injects `C1_*` from the active session into Node on each MCP/chat request. Static values in `~/.cursor/mcp.json` are install/fallback only.

## Session model

Flask session holds:

| Key | Purpose |
|-----|---------|
| LDAP user | App login identity (`user_session.py`) |
| `connection` | CatalogOne APIGW, Keycloak, credentials |
| `access_token` | Keycloak bearer token (refreshed on validate) |
| `catalog_import_context` | Active zip/Excel upload metadata + disk path |
| Zip analyze entity list | Used by BR compare after import |
| Page context / UI action queue | Agentic assistant (`ui_control.py`) |

Import uploads are written to a temp directory referenced by session; see `web/import_context.py`.

## Python package map

```
catalog_tool/
├── settings.py              Paths and env defaults
├── tables.py                Generic element registry (modify_reason, action, …)
├── client/
│   ├── catalog_one_client.py   REST client (login, compare, fallback writes)
│   └── entity_api.py           Entity GET spec for compare
├── zip_catalog/             Export zip → diff → PR package (never publishes)
├── excel_dg/                WLS DG workbook → planned entries
├── br_compare.py            Parallel BR vs production/audit compare
├── auth/ldap.py             Application login
├── builders/                genericElementEntry JSON builders
└── web/
    ├── routes/              Flask blueprints by domain
    ├── mcp_client.py        HTTP client to Node MCP routes
    ├── mcp_catalog.py         MCP wrappers for catalog writes
    ├── push_service.py        Push/publish orchestration (MCP)
    ├── import_context.py      Upload persistence + compare entity cache
    └── environment_store.py   Per-user environment JSON on disk
```

## Node server map

```
server/
├── index.js                 Chat API (Cursor / OpenAI / Claude)
├── mcp-routes.js            MCP list/call/status HTTP routes
├── catalogone-mcp-client.js Spawns MCP, invokes tools
├── mcp-session.js           Fetches /api/mcp/env from Flask (cookies)
├── providers.js             Chat provider config and validation
├── tools.js                 Agent tool definitions
└── catalog-tool-ui-mcp.js   UI-control bridge for agentic mode
```

## Frontend

| Asset | Role |
|-------|------|
| `templates/index.html` | Shell layout, sidebar, three main views |
| `static/app.js` | Environments, Merge & Import, DG Import, BR compare UI |
| `static/mcp-tools.js` | MCP Tools workbench |
| `static/page-control.js` | Agentic page context for chat |
| `ui/` (Vite + React + TS + Tailwind) → `static/dist/` | Modern frontend build; entry `ui/main.tsx`. First island: chat (`src/chat-client.jsx`) |
| `static/styles.css` | Shared theme and layout |

### Frontend build (incremental migration)

The frontend is migrating incrementally to **Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui**:

- Source lives in `catalog_tool/web/ui/` (entry `main.tsx`); Vite builds hashed assets + a manifest into `static/dist/`.
- Flask injects the right tags via the `vite_assets('main.tsx')` Jinja helper (`web/vite.py`): the built manifest in prod, or the Vite dev server (HMR) when `VITE_DEV=1`.
- Tailwind is loaded **without Preflight** so it coexists with the existing global `styles.css` (no reset conflicts). New islands opt into the design system; legacy vanilla-JS views keep working unchanged.
- Dev with HMR: `npm run dev:ui` (Vite on :5173) + `VITE_DEV=1 ./scripts/run_web.sh`. Prod: `npm run build` (or `build:ui`).

## Data on disk

| Path | Git | Purpose |
|------|-----|---------|
| `data/environments/{user}.json` | Ignored | Per-user CatalogOne credentials |
| `data/catalog-baseline/` | Ignored | Zip diff baseline |
| `data/catalog-pr/` | Ignored | Generated PR packages |
| `samples/` | Tracked | Example entry JSON for CLI |
| `tests/fixtures/` | Tracked | Test environment fixture |

## Key workflows

### Merge & Import (zip)

1. `POST /api/zip/analyze` → `zip_catalog.service.analyze_catalog_zip`
2. Upload stored in session via `import_context.store_import_file`
3. User creates BR → `create_business_request_via_mcp` + optional `import_catalog_data_via_mcp`
4. Optional BR compare → `br_compare.compare_business_request` (REST reads)
5. Publish → `publish_business_request_via_mcp`

### DG Import (Excel)

1. `POST /api/excel/analyze` → `excel_dg.service.analyze_excel_dg`
2. User creates BR, then `POST /api/push` with planned entries

### Catalog assistant

1. Browser `POST /api/chat` → Flask proxy → Node `streamText` / Cursor SDK
2. Node fetches MCP env from Flask per message
3. Agent may call catalogone MCP tools and UI-control tools

## Testing

```bash
pytest                    # 75+ Python tests
npm run test:server       # Node unit tests
npm run preflight         # MCP + skills check
```

See [README.md — Development](../README.md#development) for build commands.

## Extension points

| Change | Where |
|--------|-------|
| New catalog table | `tables.py`, optional builder, `excel_dg/` if DG-mapped |
| New REST route | `web/routes/*.py`, register in `routes/__init__.py` |
| New MCP tool exposure | Automatic from catalogone MCP; UI in `mcp-tools.js` |
| New chat provider | `server/providers.js`, `env_file.py`, `chat_config.py` |
