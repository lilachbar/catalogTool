"""Tests for session import file context."""

from __future__ import annotations

import io
import zipfile

import pytest

from catalog_tool.web.import_context import (
    clear_import_context,
    load_import_bytes,
    store_import_file,
)


def _zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "promotion/00000000-0000-4000-8000-000000000001.json",
            '{"id":"00000000-0000-4000-8000-000000000001"}',
        )
    return buffer.getvalue()


def test_store_and_load_zip_import_context():
    session: dict = {}
    store_import_file(
        session,
        import_type="zip",
        filename="catalog-export.zip",
        data=_zip_bytes(),
    )

    filename, payload = load_import_bytes(session, expected_type="zip")
    assert filename == "catalog-export.zip"
    assert payload.startswith(b"PK")

    clear_import_context(session)
    assert session == {}


def test_rejects_excel_filename_for_zip_import():
    session: dict = {}
    with pytest.raises(ValueError, match="\\.zip"):
        store_import_file(
            session,
            import_type="zip",
            filename="workbook.xlsx",
            data=_zip_bytes(),
        )


def test_import_type_mismatch():
    session: dict = {}
    store_import_file(
        session,
        import_type="zip",
        filename="catalog-export.zip",
        data=_zip_bytes(),
    )

    with pytest.raises(ValueError, match="Import type mismatch"):
        load_import_bytes(session, expected_type="excel")
