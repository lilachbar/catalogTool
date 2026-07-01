"""Vite asset integration for Flask templates.

Bridges the incremental React/TypeScript/Tailwind frontend (built by Vite) with
the existing Jinja templates. Templates call ``{{ vite_assets('main.tsx') }}``
to emit the correct ``<link>``/``<script>`` tags.

Two modes:

* **Dev** (``VITE_DEV=1``): point at the running Vite dev server
  (``npm run dev:ui``) so the app gets Hot Module Replacement.
* **Prod** (default): read the build manifest produced by ``npm run build``
  under ``static/dist/.vite/manifest.json`` and emit the hashed asset URLs.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from flask import Flask
from markupsafe import Markup

from catalog_tool.web.constants import WEB_ROOT

DIST_DIR = WEB_ROOT / "static" / "dist"
MANIFEST_PATH = DIST_DIR / ".vite" / "manifest.json"
STATIC_DIST_URL = "/static/dist"
DEFAULT_ENTRY = "main.tsx"


def _dev_enabled() -> bool:
    return os.environ.get("VITE_DEV", "").strip().lower() in {"1", "true", "yes", "on"}


def _dev_server() -> str:
    return os.environ.get("VITE_DEV_SERVER", "http://localhost:5173").rstrip("/")


@lru_cache(maxsize=1)
def _load_manifest_cached() -> dict:
    if not MANIFEST_PATH.exists():
        return {}
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_manifest(*, use_cache: bool) -> dict:
    if use_cache:
        return _load_manifest_cached()
    if not MANIFEST_PATH.exists():
        return {}
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _resolve_entry(manifest: dict, entry: str) -> dict | None:
    if entry in manifest:
        return manifest[entry]
    # Fall back to the first entry chunk if the exact key is not present.
    for chunk in manifest.values():
        if isinstance(chunk, dict) and chunk.get("isEntry"):
            return chunk
    return None


def _dev_tags(entry: str) -> Markup:
    server = _dev_server()
    return Markup(
        f'<script type="module" src="{server}/@vite/client"></script>\n'
        f'<script type="module" src="{server}/{entry}"></script>'
    )


def _prod_tags(entry: str, *, use_cache: bool) -> Markup:
    manifest = _load_manifest(use_cache=use_cache)
    chunk = _resolve_entry(manifest, entry)
    if not chunk:
        return Markup(
            f"<!-- vite: missing build for '{entry}'. Run `npm run build`. -->"
        )

    tags: list[str] = []
    for css_file in chunk.get("css", []):
        tags.append(f'<link rel="stylesheet" href="{STATIC_DIST_URL}/{css_file}">')
    file = chunk.get("file")
    if file:
        tags.append(f'<script type="module" src="{STATIC_DIST_URL}/{file}"></script>')
    return Markup("\n".join(tags))


def vite_assets(entry: str = DEFAULT_ENTRY) -> Markup:
    """Return the markup that loads a Vite entry (dev server or built manifest)."""
    if _dev_enabled():
        return _dev_tags(entry)
    # Only cache the manifest when Flask debug/reload is off.
    use_cache = os.environ.get("FLASK_DEBUG", "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }
    return _prod_tags(entry, use_cache=use_cache)


def register_vite(app: Flask) -> None:
    """Expose ``vite_assets`` (and dev flag) to Jinja templates."""
    app.jinja_env.globals["vite_assets"] = vite_assets
    app.jinja_env.globals["vite_dev"] = _dev_enabled
