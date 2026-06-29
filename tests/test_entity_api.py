"""Tests for entity API registry."""

from __future__ import annotations

from catalog_tool.client.entity_api import resolve_entity_get_spec


def test_resolve_promotion_spec():
    spec = resolve_entity_get_spec("promotion")
    assert spec is not None
    assert spec.api_base == "catalogManagement/promotion"
    assert spec.path_template == "promotion/{entity_id}"


def test_resolve_generic_element_entry_uses_post():
    spec = resolve_entity_get_spec("genericElementEntry")
    assert spec is not None
    assert spec.method == "POST"
    assert spec.post_path == "genericElementEntry/get"
