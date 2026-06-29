"""Session-scoped import file context (zip vs excel) for analyze → create BR flows."""

from __future__ import annotations

import os
import tempfile
import zipfile
from io import BytesIO
from typing import Any

IMPORT_SESSION_KEY = "catalog_import_context"

ZIP_EXTENSIONS = (".zip",)
EXCEL_EXTENSIONS = (".xlsx", ".xlsm")


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
    path = ctx.get("path")
    if path and os.path.isfile(path):
        try:
            os.remove(path)
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
    return ctx


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
