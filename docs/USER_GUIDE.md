# AI Catalog Tool — User Guide

Welcome! The **AI Catalog Tool** is a browser app for working with **CatalogOne**
without leaving your desk. From one screen you can connect to a CatalogOne
environment, bring in catalog changes from an export **zip** or a **design‑guide
Excel workbook**, create a **business request**, compare it against production,
publish it, jump straight into the CatalogOne UI, run **CatalogOne MCP tools**,
and chat with an **AI assistant** that can do the catalog work for you.

> **You are always in control.** Nothing is ever published automatically.
> Uploading a file, creating a business request, importing entries, and
> publishing are separate, explicit actions you take when you're ready.

---

## Getting started in three steps

1. **Sign in.** If your team has sign‑in enabled, log in with your Amdocs
   network account on the welcome screen. Otherwise the app opens straight away.
2. **Connect to an environment.** Open the **Environments** menu in the top bar
   and connect to the CatalogOne environment you want to work against.
3. **Pick what you want to do** from the left sidebar: **Upload** a catalog zip,
   run a **DG Import** from an Excel workbook, or open the **MCP Tools**
   workbench. The AI **assistant** is available any time from the chat icon.

That's it — the sections below explain each capability in detail.

---

## Connecting to a CatalogOne environment

Everything you do (importing, comparing, publishing, MCP tools, and the AI
assistant) runs against the environment you're **connected** to, so connect
first.

- Open **Environments** in the top bar to see your saved environments as cards.
- **Add** a new environment with the **+** button, fill in the gateway,
  Keycloak, and credential details, then **Connect**.
- **Switch** environments at any time by connecting to a different card.
- **Edit** or **Delete** a card from its menu.
- Your environments are **private to you** — other users never see them.

Once connected, the top bar shows a green “connected” indicator with the
environment name. Use **Disconnect** in the top bar to end the session.

> **Connect‑first reminders.** If you try to create a business request or run a
> compare before connecting, a friendly popup appears next to your pointer and
> the **Environments** menu gently pulses to show you where to go.

---

## Upload — import a CatalogOne export zip

Use the **Upload** view to bring the changes from a CatalogOne export **.zip**
into a business request and, when you're happy, publish them.

### Step 1 — Choose a zip

Drag a `.zip` file onto the drop area, or click to browse for one. **As soon as
you pick a file the app moves you straight to the next step** — there's no extra
“analyze” click to make. The selected file shows a green “ready” state.

### Step 2 — Business request

You have two choices here:

- **Create a new business request** — type a **BR Name** and select **Create BR
  and Import**. The app creates a fresh business request and imports your zip
  into it. (If you happened to also type a BR ID, it's ignored — a brand‑new ID
  is generated for you.)
- **Compare against an existing one** — paste an existing **Business request ID**
  (a name is optional) and select **Run Compare**. The app looks up the real
  name of that business request for you, fills it in, and compares its entities
  against production so you can review the differences.

### Step 3 — Publish

When the business request looks right, select **Publish business request**.
Publishing is always a deliberate step, and a force‑publish option is available
when you need it.

---

## DG Import — import a design‑guide workbook

Use **DG Import** to turn a **WLS Actions & Reasons** design‑guide workbook
(`.xlsx` or `.xlsm`) into catalog entries.

### Step 1 — Choose a workbook

Drag or browse for the workbook. Just like Upload, **selecting the file moves
you on automatically**. The tool reads the familiar tabs — Add, Cancel, Change,
Terminate, Modify Reasons, and the proration/policy sheets.

### Step 2 — Business request

A business request name is suggested for you based on the workbook. Create the
business request (or paste an existing ID to compare, exactly like the Upload
flow).

### Step 3 — Import entries & publish

Select **Import entries to catalog** to push the Modify Reason and Action
entries into your business request, review the result, then **Publish** when
ready.

---

## Comparing against production

Whether you started from a zip or from an existing business request ID, the
**Compare** action shows you a clear, field‑by‑field view of how the entities in
your business request differ from what's live in production. Review the
highlighted changes before you decide to publish — nothing changes in production
until you explicitly publish.

---

## Opening tables in the CatalogOne UI

Need to see or tweak something directly in CatalogOne? The tool can open the
right table in the CatalogOne web UI, already scoped to your business request,
and sign you in automatically so you don't have to log in again.

---

## MCP Tools — run CatalogOne tools from your browser

The **MCP Tools** view is a workbench for the CatalogOne MCP tools.

- **Browse and search** the tool library on the left. Start typing in the
  **Search tools** box to filter by name or description.
- **Select a tool** to see a friendly form for its inputs. Fill in the fields,
  or flip on **Raw JSON** to provide the arguments directly.
- Select **Run tool** to execute it and view the results, with a raw‑JSON toggle
  for the full response.
- Tools run against the **environment you're connected to**, so connect first.

If the MCP tools aren't available on your machine, the **MCP Tools** item in the
sidebar is disabled and a tooltip explains why.

---

## Catalog assistant — the AI chat

Open the **assistant** from the chat icon in the top bar. It's an AI helper that
understands CatalogOne and can call the same MCP tools on your behalf — great for
questions like “what's in this table?” or for guiding a build.

- **It stays open** until you close it with its close button — clicking elsewhere
  on the page won't dismiss it.
- **Move it** anywhere inside the browser window by dragging its header.
- **Resize it** from any edge, or grab a **corner** to resize width and height at
  once.
- Answers are shown as nicely formatted text (Markdown), including tables and
  lists.
- The assistant works against the **environment you're connected to**.
- Use the **settings** icon to choose which assistant provider powers the chat.

> **Tip:** The assistant is most helpful once you're connected to an
> environment, so it can look things up and make changes in the right place.

---

## Personalizing the app

- **Light or dark theme** — toggle it from the sun/moon icon in the top bar; your
  choice is remembered.
- **Resize the layout** — drag the sidebar edge to widen or narrow the tool
  library, and resize the assistant panel to suit your screen.
- **Helpful hints everywhere** — hover over buttons and fields for concise,
  consistent tooltips that explain what each control does.

---

## Good to know

- **Safe by default** — importing and comparing never publish anything. You
  create the business request, import, and publish as separate, deliberate
  actions.
- **One environment at a time** — imports, MCP tools, and the assistant all use
  the environment you're currently connected to. If something targets the wrong
  place, check which environment is connected in the top bar.
- **Stuck on a button?** If **Create BR and Import** or **Run Compare** won't
  proceed, look for the connect‑first popup — you probably need to connect to an
  environment first.
- **Assistant needs setup?** If the chat panel shows setup instructions instead
  of a conversation, the assistant provider still needs to be configured; the
  rest of the tool (Upload, DG Import, MCP Tools) keeps working in the meantime.

Happy cataloging!
