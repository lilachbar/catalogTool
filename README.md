# Catalog Tool

A Python + Node toolkit and web app for **CatalogOne authoring** — connect to environments, merge generic element entries into business requests, publish to production, open tables in the CatalogOne UI, run **catalogone MCP tools** from the browser, and chat with an AI assistant that can call those tools.

---

## Features

| Capability | Web UI | CLI |
|------------|--------|-----|
| Log in via Keycloak (APIGW token) | Yes | — |
| Save & switch environments (disk + browser, up to 12) | Yes | — |
| **Merge** — build rows or paste JSON, push to CatalogOne | Yes | — |
| Create or reuse a business request | Yes | — |
| Publish business request to production | Yes | — |
| Open table in CatalogOne UI (scoped to BR) | Yes | — |
| Auto sign-in to CatalogOne UI (SSO launch) | Yes | — |
| **MCP Tools** — list & run catalogone MCP tools in browser | Yes | — |
| **Catalog assistant** — streaming chat with tool use | Yes | — |
| Detach chat to separate window (macOS app mode) | Yes | — |
| Dark / light theme, resizable sidebar & chat panel | Yes | — |
| Generate sample entry JSON to disk | — | Yes |

---

## Architecture

```
Browser (Flask :8080)
├── Merge / MCP Tools UI (app.js, mcp-tools.js)
├── Chat panel (React → chat.bundle.js)
└── Proxies:
    ├── POST /api/chat        → Node chat server :3001
    ├── GET/POST /api/mcp/*   → Node MCP routes
    └── POST /api/chat/open-window → macOS Chrome app window (no URL bar)

Node chat server (Express :3001)
├── Cursor SDK or OpenAI (CHAT_PROVIDER)
├── catalogone MCP client (stdio, from ~/.cursor/mcp.json or .env)
└── Agent tools + streaming responses

Flask
├── CatalogOne REST client (login, push, publish)
├── Environment store (data/environments.json)
└── Session (logged-in connection)
```

Both processes are started by `./run_web.sh`. API keys and MCP credentials stay **server-side** only.

---

## Quick start

### 1. Prerequisites

- Python **3.10+**
- **Node.js 18+** (for chat server and UI bundle)
- Network access to your CatalogOne authoring cluster (VPN as needed)
- Valid CatalogOne / Keycloak credentials

### 2. Configure chat (optional but recommended)

```bash
cp .env.example .env
```

Edit `.env` — at minimum set `CURSOR_API_KEY` (from [cursor.com/dashboard](https://cursor.com/dashboard) → API Keys) or `OPENAI_API_KEY` with `CHAT_PROVIDER=openai`.

The **catalogone MCP server** is loaded automatically from `~/.cursor/mcp.json` if present (same config Cursor IDE uses). Override with `C1_*` variables in `.env` — see [Chat & MCP setup](#chat--mcp-setup).

### 3. Run

```bash
./run_web.sh
# or
PORT=8081 ./scripts/run_web.sh
```

Open **http://127.0.0.1:8080** (default port).

The script will:

- Create `.venv` and `pip install -e .` if needed
- `npm install` and `npm run build:chat` if needed
- Start the Node chat server on port **3001**
- Start the Flask web app on port **8080**

### 4. Typical workflow

1. **Environments** (sidebar) — Add an environment (+), enter APIGW / Keycloak / credentials, **Connect**. Up to 12 environments; stored in `data/environments.json` (passwords base64-encoded).
2. **Merge** — Select table, add **Simple rows** or paste **JSON**, push to CatalogOne, publish, open in CatalogOne UI.
3. **MCP Tools** — Browse tools from catalogone MCP, fill arguments, run and inspect JSON results.
4. **Catalog assistant** (chat icon) — Ask about tables, workflows, or CatalogOne; agent can invoke MCP tools when configured.

---

## Web UI

### Sidebar

- **Merge** — data merge and publish workflow (steps 01 & 02).
- **MCP Tools** — MCP tool runner workbench.
- **Environments** — cards with Connect / Disconnect / Edit / Delete; resizable sidebar (220–520px).

### Catalog assistant (chat)

- Docked panel on the right; width is resizable (320–900px).
- **Detach** — opens chat in a separate window (macOS: Chrome app mode, no address bar). Window size matches the docked panel.
- **Attach** — topbar button (visible while detached) or icon in detached window; docks chat back to the main page.
- Closing the **main tab/window** closes the detached chat automatically.
- Agent messages render **Markdown** (GFM).

### Supported tables

| UI label | `table_key` | Generic element ID |
|----------|-------------|-------------------|
| Modify Reason | `modify_reason` | `OrderCaptureProductConfiguratorModifyReason` |
| Action | `action` | `OrderCaptureProductConfiguratorAction` |

Both support **Simple rows** (`name` + localized name). For Action-specific fields, use **JSON** mode with a full entry payload.

---

## Project layout

```
catalogTool/
├── README.md
├── pyproject.toml
├── package.json              # Node deps; build:chat script
├── .env.example
├── run_web.sh                # → scripts/run_web.sh
├── scripts/
│   └── run_web.sh            # venv + npm + chat server + Flask
├── data/
│   └── environments.json     # Saved environments (gitignored)
├── samples/
│   ├── modify_reason_entries/
│   └── action_entries/
├── server/                     # Node chat + MCP server
│   ├── index.js
│   ├── cursor-chat.js
│   ├── catalogone-mcp-client.js
│   ├── mcp-config.js
│   ├── mcp-routes.js
│   └── tools.js
└── catalog_tool/
    ├── settings.py
    ├── tables.py
    ├── builders/
    ├── client/catalog_one_client.py
    ├── cli/
    └── web/
        ├── app.py              # Flask routes & API proxies
        ├── chat_window.py      # macOS detached window launcher
        ├── environment_store.py
        ├── src/chat-client.jsx # React chat UI source
        ├── templates/
        │   ├── index.html
        │   ├── chat_popup.html # Detached chat page
        │   └── catalog_ui_launch.html
        └── static/
            ├── app.js
            ├── mcp-tools.js
            ├── styles.css
            └── chat.bundle.js  # Built from src/ (gitignored)
```

---

## Configuration

### Python / Flask

| Variable | Purpose | Default |
|----------|---------|---------|
| `CATALOG_GATEWAY_URL` | APIGW base URL | il41 rel285 authoring host |
| `CATALOG_UI_URL` | C1 web UI base URL | Derived from APIGW |
| `KEYCLOAK_URL` | Keycloak base URL | `keycloak-…-runtime` |
| `KEYCLOAK_REALM` | Keycloak realm | Environment authoring name |
| `C1_USERNAME` | Default username in forms | `k8k_runtimeapp` |
| `PORT` | Web server port | `8080` |
| `WEB_SERVER_HOST` | Bind address | `127.0.0.1` |
| `FLASK_SECRET_KEY` | Flask session signing | Dev default — change for shared use |
| `CHAT_SERVER_URL` | Node chat server URL | `http://127.0.0.1:3001` |
| `ENVIRONMENTS_FILE` | Path to environment store | `data/environments.json` |

### Node / Chat (`.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `CHAT_PROVIDER` | `cursor` or `openai` | Auto: Cursor if `CURSOR_API_KEY`, else OpenAI |
| `CURSOR_API_KEY` | Cursor user API key (`crsr_…`) | — |
| `CURSOR_MODEL` | Cursor model | `composer-2.5` |
| `OPENAI_API_KEY` | OpenAI key (when provider is openai) | — |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `CHAT_SERVER_PORT` | Node listen port | `3001` |
| `C1_APIGW_URL`, `C1_*` | catalogone MCP env (if not using `~/.cursor/mcp.json`) | — |
| `CATALOGONE_MCP_PATH` | Path to MCP server script | `~/.mcp-servers/catalogone-mcp/dist/index.js` |

### URL conventions

| Service | Host pattern |
|---------|----------------|
| APIGW | `https://amd-apigw-{env}-authoring.apps.{domain}` |
| C1 web UI | `https://c1-web-ui-{env}-authoring.apps.{domain}` |
| Keycloak | `https://keycloak-{env}-runtime.apps.{domain}` |

The web app normalizes APIGW URLs to `…-authoring` and can derive Keycloak from APIGW via **Sync**.

---

## Web API

### CatalogOne / session

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Main web UI |
| `POST` | `/api/login` | Authenticate & start session |
| `POST` | `/api/logout` | Clear session (disconnect) |
| `GET` | `/api/session` | Current session info |
| `GET` | `/api/environments` | Read environment store |
| `PUT` | `/api/environments` | Save environment store |
| `GET` | `/api/table-ui-url` | Designer URL — `table_key`, `business_request_id`, `apigw_url` |
| `GET` | `/launch/catalog-ui` | SSO launch page |
| `POST` | `/api/push` | Create/reuse BR and post entries |
| `POST` | `/api/publish` | Publish business request |

### Chat & MCP (proxied to Node)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Streaming chat (Vercel AI SDK UI protocol) |
| `GET` | `/api/mcp/status` | MCP connection status |
| `GET` | `/api/mcp/tools` | List catalogone MCP tools |
| `POST` | `/api/mcp/call` | Execute an MCP tool |
| `GET` | `/chat` | Detached chat popup page |
| `POST` | `/api/chat/open-window` | Open detached chat (macOS Chrome app mode) |
| `POST` | `/api/chat/resize-window` | Resize detached chat window (macOS) |

Node also exposes `GET http://127.0.0.1:3001/health` for provider and MCP status.

---

## Chat & MCP setup

1. **Cursor (recommended)** — Set `CURSOR_API_KEY` in `.env`. Install catalogone MCP in Cursor (`~/.cursor/mcp.json`); the web app reuses that config.
2. **OpenAI** — Set `CHAT_PROVIDER=openai` and `OPENAI_API_KEY`.
3. **MCP without Cursor config** — Set `C1_APIGW_URL`, credentials, and optionally `CATALOGONE_MCP_PATH` in `.env`.

Chat and MCP calls require the Node server running (`./run_web.sh` starts it automatically).

### Detached chat (macOS)

- Opens via Chrome **app mode** (no address bar) when Chrome is installed.
- Window title: **Catalog Tool · Chat** (distinct from the main tab).
- macOS may prompt for **Accessibility** permission (Terminal / Python) so the app can resize the detached window to match the docked panel width.

---

## CatalogOne APIs used

- Keycloak OpenID token (password grant, `client_id=apigw`)
- `POST /catalogManagement/businessRequestManagement/v1/businessRequest`
- `POST /catalogManagement/genericEntity/v1/genericElementEntry`
- `GET /catalogManagement/businessRequestManagement/v1/businessRequest/{id}`
- `POST /catalogManagement/releaseManagement/v1/releaseQueue/publish`

---

## Development

```bash
# Python editable install
pip install -e .

# Rebuild chat UI after editing catalog_tool/web/src/chat-client.jsx
npm run build:chat

# Run chat server alone (Flask must proxy to it)
npm run chat-server

# Tests
pytest
```

Entry points:

```bash
catalog-tool-web                          # Flask web server
catalog-tool-generate-modify-reason-entry # Write sample JSON to samples/
```

---

## Browser & local storage

| Key | Purpose |
|-----|---------|
| `catalogTool.theme` | `light` or `dark` |
| `catalogTool.activeView` | Last view: `push` (Merge) or `mcp-tools` |
| `catalogTool.tableKey` | Last selected table |
| `catalogTool.sidebarWidth` | Sidebar width (px) |
| `catalogTool.chatPanelWidth` | Docked chat panel width (px) |
| `catalogTool.detachedLayout` | Detached window size/position (session) |
| `catalogTool.connectionHistory` | Legacy; migrated to server store on load |

Environment credentials live in **`data/environments.json`** (server-side, gitignored). Passwords are base64-encoded, not plain text.

---

## Adding a new table

1. Add a `GenericElementTable` entry to `CATALOG_TABLES` in `catalog_tool/tables.py`.
2. Reuse `build_name_localized_entry()` for simple rows, or add a dedicated builder for extra fields.
3. The web UI table dropdown and API pick it up from the registry.

Store sample JSON under `samples/<entries_subdirectory>/`.

---

## CLI — generate sample JSON

```bash
pip install -e .
catalog-tool-generate-modify-reason-entry
```

Writes a sample modify-reason entry to `samples/modify_reason_entries/`.

---

## Security notes

- Do **not** commit `.env` or `data/environments.json`.
- Change `FLASK_SECRET_KEY` if the app is reachable beyond localhost.
- Chat API keys and MCP credentials are read only by the Node process; the browser talks to Flask proxies on the same origin.
- Saved environment passwords are encoded on disk — treat `data/environments.json` as sensitive.

---

## Requirements summary

| Component | Version |
|-----------|---------|
| Python | 3.10+ |
| Node.js | 18+ (chat server & UI build) |
| Google Chrome | Recommended on macOS for detached chat (app mode) |
