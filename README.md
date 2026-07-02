# Catalog Tool

A Python + Node toolkit and web app for **CatalogOne authoring** — connect to environments, import catalog exports and design-guide workbooks, create business requests, publish to production, open tables in the CatalogOne UI, run **catalogone MCP tools** from the browser, and chat with an AI assistant that can call those tools.

> **New to the app?** A built-in, plain-language **User Guide** is available from the book icon in the top bar (also at `/guide`). It walks end users through every capability — see [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

---

## Features

| Capability | Web UI | CLI |
|------------|--------|-----|
| **Amdocs LDAP** sign-in (gates access before CatalogOne Connect) | Yes | — |
| Log in to CatalogOne via Keycloak (APIGW token) | Yes | — |
| Save & switch environments (per-user disk store, up to 12) | Yes | — |
| **Upload, Review & Publish** — pick a CatalogOne export zip, auto-advance to BR, publish | Yes | — |
| **DG Import** — parse WLS Actions & Reasons Excel, import entries, publish BR | Yes | — |
| **Streamlined uploads** — selecting a file jumps straight to the next step (no analyze click) | Yes | — |
| Create a new business request by **name**, or compare an existing one by **ID** | Yes | — |
| Paste a **Business request ID** with no name to compare — real BR name auto-filled | Yes | — |
| Compare BR entities vs production (field-level diffs) | Yes | — |
| Push `genericElementEntry` payloads to CatalogOne | Yes | — |
| Publish business request to production | Yes | — |
| Open table in CatalogOne UI (scoped to BR) | Yes | — |
| Auto sign-in to CatalogOne UI (SSO launch) | Yes | — |
| **MCP Tools** — list, search & run catalogone MCP tools in browser | Yes | — |
| **Catalog assistant** — streaming chat with tool use | Yes | — |
| **Movable, resizable** assistant panel (drag to move; resize from edges/corners) | Yes | — |
| **Connect-first** pointer popups + Environments-menu pulse when disconnected | Yes | — |
| **In-app User Guide** — rendered, end-user help opened from the top bar (`/guide`) | Yes | — |
| Dark / light theme, resizable sidebar | Yes | — |
| Generate sample entry JSON to disk | — | Yes |

**Safety by default:** importing and comparing never auto-publish. You explicitly create a BR, import (DG), compare, and publish when you're ready.

---

## Architecture

```
Browser (Flask :8080)
├── Merge & Import / DG Import / MCP Tools UI (app.js, mcp-tools.js)
├── Chat panel (React → chat.bundle.js)
└── Proxies:
    ├── POST /api/chat        → Node chat server :3001
    ├── GET/POST /api/mcp/*   → Node MCP routes (session env override)
    ├── GET  /api/mcp/env     → C1_* from active Connect session
    └── POST /api/chat/open-window → macOS Chrome app window (no URL bar)

Node chat server (Express :3001)
├── Cursor SDK or OpenAI (CHAT_PROVIDER)
├── catalogone MCP client (stdio; env from Flask session per request)
├── Agent tools + streaming responses
└── mcp-session.js — fetches /api/mcp/env with browser cookies

Flask
├── CatalogOne REST client (login, push, publish)
├── zip_catalog/   — parse export zips, diff vs baseline, PR packages
├── excel_dg/      — parse WLS DG workbooks → planned entries + MCP plan
├── Environment store (data/environments/{username}.json)
├── LDAP app auth (auth/ldap.py)
└── Session (logged-in CatalogOne connection)

data/
├── environments/{username}.json   # per-user CatalogOne credentials
├── catalog-baseline/              # baseline for zip diff (CATALOG_BASELINE_DIR)
└── catalog-pr/catalog-zip/        # generated PR packages (CATALOG_PR_DIR)
```

Both processes are started by `./run_web.sh`. API keys stay **server-side** only.

For maintainer-focused structure, session model, and MCP vs REST paths, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

### Environment alignment (important)

| Consumer | CatalogOne target |
|----------|-------------------|
| **Merge & Import**, **DG Import** (push/publish) | Sidebar **Connect** session → Flask `data/environments/{username}.json` |
| **MCP Tools** (browser) | Same — Flask injects `X-Catalogone-Env` from the active Connect session |
| **Catalog assistant** (chat) | Same — Node calls `/api/mcp/env` with session cookies each message |
| `~/.cursor/mcp.json` `C1_*` | Install location + fallback only; **overridden** when a Connect session is active |

Use **Connect** on the environment you intend to work against before MCP Tools, chat, or import.

---

## Quick start

### 1. Prerequisites

- Python **3.10+**
- **Node.js 22+** (catalogone MCP server; Node 18+ is enough for the chat UI bundle only)
- Network access to your CatalogOne authoring cluster (VPN as needed)
- Valid CatalogOne / Keycloak credentials
- **CatalogOne MCP server** installed and registered in Cursor (see below)
- **CatalogOne agent skills** installed in `~/.cursor/skills/` (see below)
- For **DG Import**: `openpyxl` (included in project dependencies)

### 2. Install CatalogOne MCP & agent skills

The web app’s **MCP Tools** tab and **Catalog assistant** chat rely on the [CatalogOne MCP server](https://github.com/amdocs/catalogone-mcp) (or the `mcp/` package from the C1 Agent distribution). Install it once per machine:

```bash
# From the C1 Agent distribution (adjust path to your download)
cd "/path/to/C1 Agent/mcp"
python3 install.py
# Or manually: npm install && npm run build, then add to ~/.cursor/mcp.json
```

Default install location: `~/.mcp-servers/catalogone-mcp/dist/index.js`. The web app loads MCP install config from **`~/.cursor/mcp.json`** (same as Cursor IDE). At runtime, **MCP Tools and chat use the environment you Connect to in the sidebar**, not the static `C1_*` values in `mcp.json`.

**Node 22** is required for the MCP server (`undici@8`). Use `/opt/homebrew/opt/node@22/bin/node` in `mcp.json` if your default `node` is older.

#### Agent skills (required for best chat results)

Install the three CatalogOne SDLC skills into **`~/.cursor/skills/`**. They ship with the C1 Agent distribution under `skills/`:

| Skill | Role | Use when |
|-------|------|----------|
| `c1-solution` | Architect / PO | Discover catalog, plan builds, validate prerequisites |
| `c1-development` | Implementation | Create BRs, entities, prices, promotions, wiring |
| `c1-testing` | QA / release | Validate, fix errors, share/publish, cleanup |

```bash
# Copy from C1 Agent distribution (adjust path)
SKILLS_SRC="/path/to/C1 Agent/skills"
for skill in c1-solution c1-development c1-testing; do
  cp -R "$SKILLS_SRC/$skill" ~/.cursor/skills/
done
```

Restart Cursor after installing MCP and skills. The web app does not bundle these skills — they guide the Cursor SDK agent when using **Catalog assistant** chat with `CHAT_PROVIDER=cursor`.

### 3. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:

1. Set **`CURSOR_API_KEY`** — create at [cursor.com/dashboard → Integrations](https://cursor.com/dashboard/integrations) (format `crsr_…`). Required for **Catalog assistant** chat.
2. Set **`FLASK_SECRET_KEY`** to a random value if you expose the app on the network.

**CatalogOne URLs and credentials do not belong in `.env`** for normal use:

| What | Where |
|------|--------|
| Merge & Import, DG Import, login, publish (web UI) | **`data/environments/{username}.json`** — per-user, private to each LDAP account |
| MCP install path | **`~/.cursor/mcp.json`** — `mcpServers.catalogone` command/args |
| MCP & chat **runtime** target | **Sidebar Connect** session (overrides `mcp.json` `C1_*`) |

The `.env` `CATALOG_*` / `C1_*` variables are optional fallbacks only when no Connect session is active.

Alternatively use OpenAI for chat: `CHAT_PROVIDER=openai` and `OPENAI_API_KEY`.

Optional zip import paths:

| Variable | Default |
|----------|---------|
| `CATALOG_BASELINE_DIR` | `data/catalog-baseline` |
| `CATALOG_PR_DIR` | `data/catalog-pr` |
| `CATALOG_EXPORT_GIT_REPO` | — (optional; enables git branch creation on analyze) |

### 4. Run

`./run_web.sh` runs a **preflight check** before starting. It exits if the catalogone MCP server or agent skills (`c1-solution`, `c1-development`, `c1-testing`) are missing. A missing or invalid `CURSOR_API_KEY` prints a warning but still allows Merge & Import, DG Import, and MCP Tools; the **Catalog assistant** chat panel shows setup instructions until the key is fixed.

```bash
./run_web.sh
# or
PORT=8081 ./scripts/run_web.sh
```

Open **http://127.0.0.1:8080** (default port). Sign in with **Amdocs LDAP** when enabled.

### Share with teammates (same network / VPN)

```bash
./run_web_network.sh
# or
WEB_SERVER_HOST=0.0.0.0 ./run_web.sh
```

The script prints your machine’s LAN IP (e.g. `http://192.168.x.x:8080`). Others open that URL and sign in with **Amdocs LDAP**.

| Setting | Purpose |
|---------|---------|
| `WEB_SERVER_HOST=0.0.0.0` | Listen on all interfaces (required for remote access) |
| `FLASK_DEBUG=false` | Disable Flask debug/reloader for shared use |
| `FLASK_SECRET_KEY` | **Required** — set a random secret before exposing on the network |
| `CHAT_SERVER_HOST=127.0.0.1` | Keep chat API internal; only port **8080** needs to be reachable |

Ensure your OS firewall allows inbound **TCP 8080**. For HTTPS and a stable hostname, put **nginx** (or similar) in front — see `deploy/nginx-catalog-tool.conf.example`.

The script will:

- Create `.venv` and `pip install -e .` if needed
- `npm install` and `npm run build:chat` if needed
- Start the Node chat server on port **3001**
- Start the Flask web app on port **8080**

### 5. Typical workflow

1. **Sign in** — Amdocs LDAP at `/login` (only when `USE_LDAP=true`; disabled by default).
2. **Environments** (top bar) — Add an environment (+), enter APIGW / Keycloak / credentials, **Connect**. Up to 12 per user; stored in `data/environments/{username}.json` (passwords base64-encoded). Each signed-in user sees only their own environments.
3. **Upload, Review & Publish** — Choose a CatalogOne export zip → the app auto-advances to the business request step → create a BR (by name) or compare an existing one (by ID) → publish when ready.
4. **DG Import** — Choose a WLS Actions & Reasons Excel workbook → auto-advance to the business request step → create BR → **Import entries to catalog** → publish when ready.
5. **MCP Tools** — Browse and search tools from catalogone MCP (uses connected environment), fill arguments, run and inspect JSON results.
6. **Catalog assistant** (chat icon) — Ask about tables, workflows, or CatalogOne; agent uses the same connected environment for MCP calls.

New users can open the **User Guide** (book icon in the top bar) at any time for a plain-language walkthrough.

---

## Web UI

### Sidebar navigation

Three main views (full-width layout, consistent pill buttons):

| Sidebar view | Purpose |
|--------------|---------|
| **Upload, Review & Publish** | CatalogOne export zip → business request → compare vs production → publish |
| **DG Import** | WLS Actions & Reasons Excel → entry import → business request → publish |
| **CatalogOne MCP tools** | MCP tool workbench (requires catalogone MCP installed) |

**Environments** — top-bar menu with cards for Connect / Disconnect / Edit / Delete; resizable sidebar (220–520px).

Top bar: **User Guide** (book icon), theme toggle, **Disconnect** (CatalogOne session), **Log out** (LDAP session when enabled).

### Upload, Review & Publish (zip)

Streamlined three-step workflow:

1. **Choose a zip** — Drag & drop or browse. **As soon as a file is selected the app advances to the business request step** — there is no separate analyze/preview click and no upfront zip validation. Selected files show a green “ready” state. Expects `promotion/<uuid>.json` inside the zip; entities are read when the BR is created (and cached for compare).
2. **Business request** — Either type a **BR Name** and select **Create BR and Import** (a fresh BR ID is generated — any ID you also typed is ignored), or paste an existing **Business request ID** and select **Run Compare** (the real BR name is fetched from the environment and filled in for you).
3. **Compare vs production** — Review field-level entity diffs against production/audit baselines before publishing.
4. **Publish** — Explicit publish only (optional force publish). Importing/comparing never publishes automatically.

### DG Import

Streamlined workflow for **WLS Actions and Reasons** design-guide workbooks (`.xlsx` / `.xlsm`):

1. **Choose a workbook** — Same drag & drop UX as zip; **selecting a file advances automatically** to the business request step. Tabs parsed include Add, Cancel, Change, Terminate, Modify_Reasons, and proration policy sheets.
2. **Business request** — BR name auto-suggested from the workbook (`DG import — …`). Create a BR (or paste an existing ID to compare, as in the zip flow).
3. **Import entries to catalog** — Posts all Modify Reason and Action `genericElementEntry` payloads via `/api/push`; review the result.
4. **Publish** — Same publish flow as the zip workflow.

Policy directive rows are parsed for review; map them to price policies separately (not auto-imported).

### CatalogOne MCP tools

- Tool list, **search box** (filter by name/description), argument forms, raw JSON mode, result viewer.
- Uses the **connected environment** — same APIGW/credentials as the import flows.
- Disabled in the sidebar when catalogone MCP is not installed (tooltip explains).

### Catalog assistant (chat)

- Docked panel; **stays open until you close it** — clicking elsewhere on the page won't dismiss it.
- **Movable** — drag the panel header to reposition it anywhere inside the browser window.
- **Resizable** — drag any edge, or grab a corner grip, to resize width and height together.
- Agent messages render **Markdown** (GFM), including tables and lists.
- MCP calls use the **active Connect session** (fetched from Flask per message).

### In-app User Guide

- The **book icon** in the top bar opens a rendered, end-user User Guide (route `/guide`, source `docs/USER_GUIDE.md`).
- It focuses on **what the tool does and how to use it** — not project internals — and follows the app's light/dark theme.
- Rendered server-side by a small dependency-free Markdown converter (`catalog_tool/web/markdown_lite.py`), with an on-page table of contents and a Print action.

### Consistent tooltips & connect-first guidance

- Buttons and fields share a unified, icon-led tooltip style.
- Attempting **Create BR and Import** or **Run Compare** while disconnected shows a popup next to the pointer and pulses the **Environments** menu to guide you to connect first.

### Supported catalog tables (push / DG import)

| UI label | `table_key` | Generic element ID |
|----------|-------------|-------------------|
| Modify Reason | `modify_reason` | `OrderCaptureProductConfiguratorModifyReason` |
| Action | `action` | `OrderCaptureProductConfiguratorAction` |

DG Import maps Excel reason codes to these tables. For Action-specific fields beyond name/localized name, extend builders in `catalog_tool/excel_dg/` or use MCP Tools / JSON push.

---

## Project layout

```
catalogTool/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md       # Maintainer architecture overview
│   └── USER_GUIDE.md         # End-user guide (rendered at /guide)
├── pyproject.toml
├── package.json              # Node deps; build:chat script
├── .env.example
├── run_web.sh                # → scripts/run_web.sh
├── run_web_network.sh
├── archive_candidate/        # Unused files held before deletion
├── scripts/
│   └── run_web.sh            # venv + npm + chat server + Flask
├── data/
│   ├── environments/         # Per-user stores: {username}.json (gitignored)
│   ├── catalog-baseline/     # Zip diff baseline
│   └── catalog-pr/           # Generated PR packages
├── samples/
│   ├── modify_reason_entries/
│   └── action_entries/
├── server/                   # Node chat + MCP server
│   ├── index.js
│   ├── cursor-chat.js
│   ├── catalogone-mcp-client.js
│   ├── mcp-env.js
│   ├── mcp-session.js
│   ├── mcp-config.js
│   ├── mcp-routes.js
│   └── tools.js
├── tests/                    # pytest suite (17 modules, 75+ tests)
│   ├── fixtures/
│   └── test_*.py
└── catalog_tool/
    ├── settings.py
    ├── tables.py
    ├── br_compare.py         # BR vs production/audit entity compare
    ├── zip_catalog/          # Zip parse, diff, validate, PR package
    ├── excel_dg/             # DG Excel parse, plan, analyze
    ├── auth/ldap.py
    ├── builders/
    ├── client/catalog_one_client.py
    ├── cli/
    └── web/
        ├── app.py
        ├── chat_window.py
        ├── environment_store.py
        ├── import_context.py # Upload + compare entity session cache
        ├── push_service.py
        ├── mcp_catalog.py    # Catalog writes via MCP
        ├── markdown_lite.py    # Tiny Markdown→HTML renderer for /guide
        ├── helpers.py          # Session → MCP env mapping
        ├── routes/
        │   ├── auth.py         # CatalogOne login/logout
        │   ├── user_auth.py    # LDAP login/logout
        │   ├── catalog.py      # push, publish, BR
        │   ├── zip_import.py   # POST /api/zip/analyze
        │   ├── excel_import.py # POST /api/excel/analyze
        │   ├── environments.py
        │   └── chat.py         # MCP proxy + /api/mcp/env
        ├── src/chat-client.jsx
        ├── templates/
        │   ├── index.html
        │   ├── login.html
        │   ├── guide.html      # Rendered user guide page
        │   ├── chat_popup.html
        │   └── catalog_ui_launch.html
        └── static/
            ├── app.js
            ├── mcp-tools.js
            ├── styles.css
            ├── logo.svg
            ├── favicon.svg
            └── chat.bundle.js  # Built from src/ (gitignored)
```

---

## Configuration

### Python / Flask

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Web server port | `8080` |
| `WEB_SERVER_HOST` | Bind address (`127.0.0.1` local, `0.0.0.0` network) | `127.0.0.1` |
| `FLASK_DEBUG` | Flask debug/reloader | `false` |
| `FLASK_SECRET_KEY` | Flask session signing | Dev default — **change for network access** |
| `CHAT_SERVER_HOST` | Node chat bind (keep `127.0.0.1`) | `127.0.0.1` |
| `CHAT_SERVER_URL` | Flask → Node proxy target (auto from host/port) | `http://127.0.0.1:3001` |
| `ENVIRONMENTS_FILE` | Legacy shared store (migrated once) | `data/environments.json` |
| `CATALOG_BASELINE_DIR` | Baseline for zip diff | `data/catalog-baseline` |
| `CATALOG_PR_DIR` | PR package output root | `data/catalog-pr` |
| `CATALOG_EXPORT_GIT_REPO` | Optional git repo for analyze branches | — |
| `CATALOG_GATEWAY_URL` | APIGW default (form placeholder only) | il41 rel285 host in `settings.py` |
| `CATALOG_UI_URL` | C1 web UI default | Derived from APIGW |
| `KEYCLOAK_URL` | Keycloak default | `keycloak-…-runtime` |
| `KEYCLOAK_REALM` | Keycloak realm default | Environment authoring name |
| `C1_USERNAME` | Default username in forms | `k8k_runtimeapp` |

**Amdocs LDAP (application login)** — gates access to the web UI before CatalogOne **Connect**:

| Variable | Purpose | Default |
|----------|---------|---------|
| `USE_LDAP` | Require LDAP sign-in at `/login` | `false` (set `true` to enable the login page; legacy `LDAP_AUTH_ENABLED` still honored as a fallback) |
| `LDAP_URI` | Corporate LDAP server (`ldap://host:389` or `ldaps://…`) | `ldap://corp.amdocs.com:389` |
| `LDAP_DOMAIN` | Domain for UPN bind (`user@corp.amdocs.com`) | `corp.amdocs.com` |
| `LDAP_BIND_FORMAT` | `upn`, `sam` (`CORP\user`), or `dn` (with template) | `upn` |
| `LDAP_BIND_DN_TEMPLATE` | Used when `LDAP_BIND_FORMAT=dn` | — |
| `LDAP_USE_SSL` | Use LDAPS (`ldaps://` in URI) | `false` |
| `LDAP_TLS` | StartTLS on plain LDAP | `true` |
| `LDAP_RECEIVE_TIMEOUT` | Bind timeout (seconds) | `10` |

When enabled, users sign in with their Amdocs network credentials. **Disconnect** in the top bar only ends the CatalogOne session; **Log out** ends the LDAP session.

**Runtime CatalogOne connection** (APIGW, Keycloak, credentials) comes from your **per-user environment file** after you **Connect** in the sidebar — not from `.env`.

### Node / Chat (`.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `CHAT_PROVIDER` | `cursor` or `openai` | Auto: Cursor if `CURSOR_API_KEY`, else OpenAI |
| `CURSOR_API_KEY` | Cursor user API key (`crsr_…`) from [Dashboard → Integrations](https://cursor.com/dashboard/integrations) | — |
| `CURSOR_MODEL` | Cursor model | `composer-2.5` |
| `OPENAI_API_KEY` | OpenAI key (when provider is openai) | — |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `CHAT_SERVER_PORT` | Node listen port | `3001` |
| `C1_APIGW_URL`, `C1_*` | catalogone MCP env fallback | — |
| `CATALOGONE_MCP_PATH` | Path to MCP server script | `~/.mcp-servers/catalogone-mcp/dist/index.js` |

MCP install config is read from **`~/.cursor/mcp.json`**. **Runtime credentials** for MCP Tools and chat come from the Flask Connect session via `/api/mcp/env`.

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
| `GET` | `/guide` | Rendered end-user User Guide (`?theme=light|dark`) |
| `GET` | `/login` | LDAP login page |
| `POST` | `/api/user/login` | LDAP authenticate |
| `POST` | `/api/user/logout` | End LDAP session |
| `POST` | `/api/login` | CatalogOne authenticate & start session |
| `POST` | `/api/logout` | Clear CatalogOne session (disconnect) |
| `GET` | `/api/session` | Current CatalogOne session info |
| `GET` | `/api/environments` | Read environment store |
| `PUT` | `/api/environments` | Save environment store |
| `GET` | `/api/table-ui-url` | Designer URL — `table_key`, `business_request_id`, `apigw_url` |
| `GET` | `/launch/catalog-ui` | SSO launch page |
| `POST` | `/api/business-request` | Create business request |
| `GET` | `/api/business-request/<id>` | Get business request details |
| `POST` | `/api/push` | Post entries to BR (`table_payloads` or single `table_key`) |
| `POST` | `/api/publish` | Publish business request |

### Zip & Excel import

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/zip/analyze` | Multipart `zip_file` — diff vs baseline, build PR package (never publishes) |
| `POST` | `/api/excel/analyze` | Multipart `excel_file` — parse DG workbook, return `planned_entries` + MCP plan |

### Chat & MCP (proxied to Node)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Streaming chat (Vercel AI SDK UI protocol) |
| `GET` | `/api/mcp/env` | `C1_*` env from active Connect session |
| `GET` | `/api/mcp/status` | MCP connection status |
| `GET` | `/api/mcp/tools` | List catalogone MCP tools |
| `POST` | `/api/mcp/call` | Execute an MCP tool |
| `GET` | `/chat` | Detached chat popup page |
| `POST` | `/api/chat/open-window` | Open detached chat (macOS Chrome app mode) |
| `POST` | `/api/chat/resize-window` | Resize detached chat window (macOS) |

Node also exposes `GET http://127.0.0.1:3001/health` for provider and MCP status.

---

## Chat & MCP setup

### CatalogOne MCP server

1. Install the MCP package (`mcp/` from C1 Agent) to `~/.mcp-servers/catalogone-mcp` (or run `install.py`).
2. Register it in **`~/.cursor/mcp.json`** under `mcpServers.catalogone` (command, args).
3. Use **Node 22+** as the MCP `command` if your system default is Node 20.
4. In the web app, **Connect** to your target environment in the sidebar before using MCP Tools or chat.

The web app reads install config from `mcp.json` automatically. Fallback: set `C1_APIGW_URL`, credentials, and `CATALOGONE_MCP_PATH` in `.env` (used only when no Connect session is active).

### Agent skills

Copy **`c1-solution`**, **`c1-development`**, and **`c1-testing`** into **`~/.cursor/skills/`** (from the C1 Agent `skills/` folder). These skills define CatalogOne SDLC workflows (plan → build → validate/publish) and improve **Catalog assistant** answers when using the Cursor SDK.

### Chat provider

1. **Cursor (recommended)** — Set `CURSOR_API_KEY` in `.env` ([Integrations](https://cursor.com/dashboard/integrations)). Requires MCP + skills above for full catalog authoring assistance.
2. **OpenAI** — Set `CHAT_PROVIDER=openai` and `OPENAI_API_KEY`.
3. **MCP without Cursor IDE config** — Set `C1_APIGW_URL`, credentials, and optionally `CATALOGONE_MCP_PATH` in `.env`.

Chat and MCP calls require the Node server running (`./run_web.sh` starts it automatically).

### Startup checks

`./run_web.sh` runs `node server/preflight-check.js` before starting servers. It **exits with an error** if:

- catalogone MCP is not installed or `dist/index.js` is missing
- Agent skills `c1-solution`, `c1-development`, `c1-testing` are not in `~/.cursor/skills/`

Run checks manually: `npm run preflight`

If MCP is installed but the server process fails to start, the **MCP Tools** sidebar button stays **disabled** (tooltip explains why). The chat panel shows setup instructions when `CURSOR_API_KEY` is missing or rejected.

**`CURSOR_API_KEY` setup:**

1. Open https://cursor.com/dashboard/integrations
2. Create an API key (`crsr_…`)
3. Set in project `.env`: `CURSOR_API_KEY=crsr_…`
4. Restart `./run_web.sh`

### Assistant panel behavior

- The assistant is a **docked, in-window panel** — no separate OS window to manage.
- **Stays open** until dismissed with its close button (outside clicks don't close it).
- **Movable** by dragging its header and **resizable** from its edges or corner grips.
- Panel size/position preferences persist in the browser (`localStorage`).

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

# Optional lint (requires: pip install ruff)
ruff check catalog_tool tests

# Node server (preflight, chat key validation)
npm run test:server
npm run preflight
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
| `catalogTool.activeView` | Last view: `push` (Merge & Import), `dg-import`, or `mcp-tools` |
| `catalogTool.tableKey` | Last selected table (legacy) |
| `catalogTool.sidebarWidth` | Sidebar width (px) |
| `catalogTool.chatPanelWidth` | Docked chat panel width (px) |
| `catalogTool.detachedLayout` | Detached window size/position (session) |
| `catalogTool.connectionHistory` | Legacy; migrated to server store on load |

Environment credentials live in **`data/environments/{username}.json`** (server-side, gitignored). Passwords are base64-encoded, not plain text.

---

## Adding a new table

1. Add a `GenericElementTable` entry to `CATALOG_TABLES` in `catalog_tool/tables.py`.
2. Reuse `build_name_localized_entry()` for simple rows, or add a dedicated builder for extra fields.
3. For DG Excel mapping, extend `catalog_tool/excel_dg/parser.py` and `planner.py`.
4. The web UI and `/api/push` pick up tables from the registry.

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

- Do **not** commit `.env` or `data/environments/` (per-user CatalogOne credentials).
- Change `FLASK_SECRET_KEY` if the app is reachable beyond localhost.
- Chat API keys and MCP credentials are read only by the Node process; the browser talks to Flask proxies on the same origin.
- Saved environment passwords are encoded on disk — treat `data/environments/` as sensitive.
- Each LDAP user only sees environments in their own file (`data/environments/{username}.json`).
- PR packages under `data/catalog-pr/` may contain catalog export data — treat as sensitive.

## Requirements summary

| Component | Version |
|-----------|---------|
| Python | 3.10+ |
| Node.js | 22+ (catalogone MCP); 18+ (chat UI build) |
| openpyxl | DG Excel import (via `pip install -e .`) |
| CatalogOne MCP | Installed to `~/.mcp-servers/catalogone-mcp`, configured in `~/.cursor/mcp.json` |
| Agent skills | `c1-solution`, `c1-development`, `c1-testing` in `~/.cursor/skills/` |
| Google Chrome | Recommended on macOS for detached chat (app mode) |
