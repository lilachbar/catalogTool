"""Tests for catalog zip import."""

from __future__ import annotations

import json
import tempfile
import zipfile
from pathlib import Path

import pytest

from catalog_tool.zip_catalog.parser import parse_catalog_zip
from catalog_tool.zip_catalog.service import analyze_catalog_zip
from catalog_tool.zip_catalog.validate import validate_entities


def _build_zip(entries: dict[str, dict]) -> bytes:
    import io

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for path, data in entries.items():
            archive.writestr(path, json.dumps(data))
    return buffer.getvalue()


def test_parse_catalog_zip_extracts_entity() -> None:
    entity_id = "d4004905-45ef-49a5-8313-b1ede9a68c42"
    payload = {
        "id": entity_id,
        "localizedName": [{"locale": "en-US", "value": "Test promo"}],
    }
    entities = parse_catalog_zip(
        _build_zip({f"promotion/{entity_id}.json": payload})
    )
    assert len(entities) == 1
    assert entities[0].entity_type == "promotion"


def test_validate_detects_id_mismatch() -> None:
    entity_id = "d4004905-45ef-49a5-8313-b1ede9a68c42"
    payload = {
        "id": "00000000-0000-0000-0000-000000000001",
        "localizedName": [{"locale": "en-US", "value": "Test promo"}],
    }
    entities = parse_catalog_zip(
        _build_zip({f"promotion/{entity_id}.json": payload})
    )
    report = validate_entities(entities)
    assert any(finding.kind == "error" for finding in report.findings)


def test_analyze_creates_pr_package_for_new_entity() -> None:
    entity_id = "d4004905-45ef-49a5-8313-b1ede9a68c42"
    payload = {
        "id": entity_id,
        "localizedName": [{"locale": "en-US", "value": "Test promo"}],
        "description": [{"locale": "en-US", "value": "Desc"}],
    }
    zip_bytes = _build_zip({f"promotion/{entity_id}.json": payload})

    with tempfile.TemporaryDirectory() as temp_dir:
        baseline = Path(temp_dir) / "baseline"
        output = Path(temp_dir) / "pr"
        baseline.mkdir()
        result = analyze_catalog_zip(
            zip_bytes,
            zip_name="sample.zip",
            baseline_dir=baseline,
            pr_output_dir=output,
        )
        assert result["counts"]["new"] == 1
        assert result["publish_blocked"] is True
        assert (Path(result["package_dir"]) / f"promotion/{entity_id}.json").is_file()
