"""Tests for BR compare helpers."""

from __future__ import annotations

from catalog_tool.br_compare import compare_business_request, _summarize_production_changes, FieldChange


class FakeClient:
    connection = type("Conn", (), {"username": "tester"})()

    def __init__(self, *, local=None, published=None, audits=None, audit_compare=None):
        self._local = local
        self._published = published
        self._audits = audits or []
        self._audit_compare = audit_compare or []

    def get_entity_in_business_request(self, entity_type, entity_id, business_request_id):
        return self._local

    def get_entity_published(self, entity_type, entity_id):
        return self._published

    def search_entity_audit_records(self, entity_id, entity_type, *, limit=10):
        return self._audits

    def audit_compare_entities(self, **kwargs):
        return self._audit_compare

    def ensure_business_request_local_context(self, business_request_id):
        return None


def test_summarize_single_valid_for_change():
    changes = [
        FieldChange(
            path="validFor.endDateTime",
            baseline="2025-07-23T05:00:00Z",
            current="2026-07-30T05:00:00Z",
            change="modified",
        )
    ]
    summary = _summarize_production_changes(changes)
    assert "1 difference" in summary
    assert "Expiration date" in summary


def test_production_compare_identical():
    entity = {
        "field": [{"name": "name", "entry": [{"parameter": [{"key": "value", "value": ["A"]}]}]}],
    }
    client = FakeClient(local=entity, published=entity)
    report = compare_business_request(
        client,
        business_request_id="br-1",
        compare_type="production",
        entities=[{"entity_id": "e1", "entity_type": "genericElementEntry", "title": "Entry"}],
    )
    assert report.identical == 1
    assert report.entities[0].status == "identical"


def test_production_compare_promotion_type_supported():
    client = FakeClient(
        local={"id": "promo-1", "localizedName": [{"value": "Promo"}]},
        published={"id": "promo-1", "localizedName": [{"value": "Promo"}]},
    )
    report = compare_business_request(
        client,
        business_request_id="br-1",
        compare_type="production",
        entities=[{"entity_id": "promo-1", "entity_type": "promotion", "title": "Promo"}],
    )
    assert report.identical == 1


def test_production_compare_new_in_br():
    client = FakeClient(local={"field": []}, published=None)
    report = compare_business_request(
        client,
        business_request_id="br-1",
        compare_type="production",
        entities=[{"entity_id": "e1", "entity_type": "genericElementEntry", "title": "Entry"}],
    )
    assert report.new_in_br == 1
    assert report.entities[0].status == "new_in_br"


def test_audit_compare_uses_audit_api_when_multiple_versions():
    client = FakeClient(
        local={"field": [{"name": "name"}]},
        published={"field": [{"name": "name"}]},
        audits=[{"id": "audit-new"}, {"id": "audit-old"}],
        audit_compare=[
            {
                "uiPath": "name",
                "displayDetails": {
                    "fieldValues": {
                        "oldestData": {"label": "Old", "action": "NO_CHANGE"},
                        "newestData": {"label": "New", "action": "MODIFIED"},
                    }
                },
            }
        ],
    )
    report = compare_business_request(
        client,
        business_request_id="br-1",
        compare_type="audit",
        entities=[{"entity_id": "e1", "entity_type": "genericElementEntry", "title": "Entry"}],
    )
    assert report.changed == 1
    assert report.entities[0].field_changes[0].path == "name"
