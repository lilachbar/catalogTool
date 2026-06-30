"""Session-scoped import file context (zip vs excel) for analyze → create BR flows."""

from __future__ import annotations

import json
import os
import tempfile
import zipfile
from io import BytesIO
from typing import Any

IMPORT_SESSION_KEY = "catalog_import_context"

ZIP_EXTENSIONS = (".zip",)
EXCEL_EXTENSIONS = (".xlsx", ".xlsm")
ENTITIES_SIDECAR_SUFFIX = ".entities.json"


def _mark_session_modified(session: dict[str, Any]) -> None:
    if hasattr(session, "modified"):
        session.modified = True


def _extension(name: str) -> str:
    lower = (name or "").lower()
    for ext in ZIP_EXTENSIONS + EXCEL_EXTENSIONS:
        if lower.endswith(ext):
            return ext
    return ""


def clear_import_context(session: dict[str, Any]) -> None:
    ctx = session.pop(IMPORT_SESSION_KEY, None)
    if not ctx:
        return
    for key in ("path", "entities_path"):
        file_path = ctx.get(key)
        if file_path and os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass


def store_import_file(
    session: dict[str, Any],
    *,
    import_type: str,
    filename: str,
    data: bytes,
) -> dict[str, str]:
    """Persist uploaded bytes for a later import step. Replaces any prior import context."""
    if not data:
        raise ValueError("Uploaded file is empty")

    import_type = (import_type or "").strip().lower()
    if import_type not in {"zip", "excel"}:
        raise ValueError(f"Unsupported import type: {import_type}")

    ext = _extension(filename)
    if import_type == "zip":
        if ext not in ZIP_EXTENSIONS:
            raise ValueError("CatalogOne zip import requires a .zip file")
        if not zipfile.is_zipfile(BytesIO(data)):
            raise ValueError("Uploaded file is not a valid zip archive")
    elif import_type == "excel":
        if ext not in EXCEL_EXTENSIONS:
            raise ValueError("DG import requires an .xlsx or .xlsm workbook")

    prior_ctx = get_import_context(session)
    prior_entities = get_zip_analyze_entities(session)
    prior_filename = (prior_ctx or {}).get("filename")

    clear_import_context(session)

    suffix = ext or (".zip" if import_type == "zip" else ".xlsx")
    fd, path = tempfile.mkstemp(prefix="catalog-import-", suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
    except Exception:
        os.close(fd)
        if os.path.isfile(path):
            os.remove(path)
        raise

    ctx = {
        "import_type": import_type,
        "filename": os.path.basename(filename) or f"import{suffix}",
        "path": path,
    }
    session[IMPORT_SESSION_KEY] = ctx
    _mark_session_modified(session)

    if import_type == "zip":
        ensure_zip_entity_refs(
            session,
            path,
            prior_entities=prior_entities,
            prior_filename=prior_filename,
            new_filename=ctx["filename"],
        )

    return ctx


def ensure_zip_entity_refs(
    session: dict[str, Any],
    zip_path: str,
    *,
    prior_entities: list[dict[str, Any]] | None = None,
    prior_filename: str | None = None,
    new_filename: str | None = None,
) -> list[dict[str, Any]]:
    """Parse entity refs from a stored zip, restoring prior analyze refs when parse fails."""
    try:
        return store_zip_entity_refs_from_path(session, zip_path)
    except ValueError:
        if (
            prior_entities
            and prior_filename
            and new_filename
            and prior_filename == new_filename
        ):
            store_zip_analyze_entities(session, prior_entities)
            return prior_entities
        raise


def store_zip_analyze_entities(session: dict[str, Any], entities: list[dict[str, Any]]) -> None:
    """Persist analyzed entity list beside the import file — not in the session cookie."""
    ctx = get_import_context(session)
    if not ctx:
        return

    entities_path = f"{ctx['path']}{ENTITIES_SIDECAR_SUFFIX}"
    with open(entities_path, "w", encoding="utf-8") as handle:
        json.dump(entities, handle, separators=(",", ":"))

    ctx["entities_path"] = entities_path
    session[IMPORT_SESSION_KEY] = ctx
    _mark_session_modified(session)


def store_zip_entity_refs_from_path(session: dict[str, Any], zip_path: str) -> list[dict[str, Any]]:
    """Parse a stored zip and persist entity refs for compare (no full validation)."""
    from catalog_tool.zip_catalog.parser import parse_catalog_zip
    from catalog_tool.zip_catalog.service import _entity_title

    with open(zip_path, "rb") as handle:
        parsed = parse_catalog_zip(handle.read())

    entities = [
        {
            "entity_id": item.entity_id,
            "entity_type": item.entity_type,
            "title": _entity_title(item.data) or item.entity_id,
        }
        for item in parsed
        if item.entity_id and item.entity_type
    ]
    store_zip_analyze_entities(session, entities)
    return entities


def resolve_compare_entities(
    session: dict[str, Any],
    entities: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Entity list for BR compare — request body, sidecar, or zip parse."""
    if isinstance(entities, list) and entities:
        normalized: list[dict[str, Any]] = []
        for item in entities:
            if not isinstance(item, dict):
                continue
            entity_id = (item.get("entity_id") or "").strip()
            entity_type = (item.get("entity_type") or "").strip()
            if not entity_id or not entity_type:
                continue
            normalized.append(
                {
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                    "title": (item.get("title") or entity_id).strip(),
                }
            )
        if normalized:
            return normalized

    sidecar = get_zip_analyze_entities(session)
    if sidecar:
        return sidecar

    ctx = get_import_context(session)
    if ctx and ctx.get("import_type") == "zip" and ctx.get("path"):
        try:
            return store_zip_entity_refs_from_path(session, ctx["path"])
        except (OSError, ValueError):
            return []

    return []


def get_zip_analyze_entities(session: dict[str, Any]) -> list[dict[str, Any]] | None:
    ctx = get_import_context(session)
    if not ctx:
        return None

    entities_path = ctx.get("entities_path")
    if not entities_path or not os.path.isfile(entities_path):
        return None

    try:
        with open(entities_path, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None

    return payload if isinstance(payload, list) else None


def get_import_context(session: dict[str, Any]) -> dict[str, str] | None:
    ctx = session.get(IMPORT_SESSION_KEY)
    if not isinstance(ctx, dict):
        return None
    path = ctx.get("path")
    if not path or not os.path.isfile(path):
        return None
    return ctx


def load_import_bytes(session: dict[str, Any], *, expected_type: str) -> tuple[str, bytes]:
    ctx = get_import_context(session)
    if not ctx:
        raise ValueError("No analyzed import file found — upload and analyze again in Step 1")

    import_type = ctx.get("import_type", "")
    if import_type != expected_type:
        raise ValueError(
            f"Import type mismatch: Step 1 analyzed a {import_type or 'unknown'} file, "
            f"but this action requires {expected_type}"
        )

    with open(ctx["path"], "rb") as handle:
        return ctx["filename"], handle.read()
