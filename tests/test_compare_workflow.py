"""Compare workflow: HTML layout, API payload, and session entity resolution."""

from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from catalog_tool.br_compare import BrCompareReport, EntityCompareResult, compare_business_request
from catalog_tool.web.app import create_app
from catalog_tool.web.import_context import store_import_file, store_zip_analyze_entities


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "catalog_tool" / "web" / "templates" / "index.html"
APP_JS = ROOT / "catalog_tool" / "web" / "static" / "app.js"
STYLES_CSS = ROOT / "catalog_tool" / "web" / "static" / "styles.css"


def _zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "genericElementEntry/853233a3-df1a-4c95-9143-8d1a08e8ec9f.json",
            '{"id":"853233a3-df1a-4c95-9143-8d1a08e8ec9f"}',
        )
    return buffer.getvalue()


def _logged_in_session(session) -> None:
    session.clear()
    session["logged_in"] = True
    session["connection"] = {
        "apigw_url": "https://amd-apigw-eus1-dev01.runtime.internal.corp.amdocs.com",
        "keycloak_url": "https://keycloak.example.com",
        "keycloak_realm": "eus1-dev01",
        "username": "user",
        "password": "secret",
    }
    session["access_token"] = "token"


def test_compare_panel_spans_below_workbench():
    html = INDEX_HTML.read_text(encoding="utf-8")
    review_start = html.index('id="pushStepReview"')
    review_end = html.index('id="pushStepPublish"')
    review_block = html[review_start:review_end]
    assert 'id="brCompareResultsSection"' not in review_block

    workbench_idx = html.index('class="workflow-workbench"')
    compare_idx = html.index('id="brCompareResultsSection"')
    assert compare_idx > workbench_idx
    assert 'br-compare-results-full' in html
    assert 'id="brCompareReport"' in html
    assert 'class="br-compare-panel"' in html
    assert "brCompareToggleBtn" not in html
    assert 'id="pushWorkflowStatus"' not in html


def test_compare_js_uses_direct_render_not_wire_analyze_report():
    js = APP_JS.read_text(encoding="utf-8")
    show_fn = js[js.index("function showBrCompareReport"): js.index("async function runBrCompare")]
    assert "openCompareResultsPanel()" in show_fn
    assert "els.brCompareReport.innerHTML = panelHtml" in show_fn
    assert "wireAnalyzeReport" not in show_fn
    assert "syncCompareShellLayout" in js
    assert "has-compare-open" in js
    assert "getElementById(\"appPage\")" in js
    assert "function openCompareResultsPanel" in js
    assert "syncCompareResultsDock" not in js
    assert "has-compare-dock" not in js


def test_compare_css_does_not_use_dock_layout():
    css = STYLES_CSS.read_text(encoding="utf-8")
    assert "has-compare-dock" not in css
    assert ".br-compare-results-full" in css
    assert "has-compare-open" in css
    assert ".app-page-body .page" in css
    page_rule = css[css.index(".app-page-body .page"): css.index(".app-page-body .app-main")]
    assert "overflow-y: auto" in page_rule


@patch("catalog_tool.web.routes.catalog.compare_business_request")
@patch("catalog_tool.web.routes.catalog.client_from_session")
def test_compare_api_returns_entity_table_data(mock_client, mock_compare):
    with patch("catalog_tool.web.user_session.LDAP_AUTH_ENABLED", False):
        mock_client.return_value = object()
        report = BrCompareReport(
            compare_type="production",
            business_request_id="br-123",
            entity_count=1,
            identical=0,
            changed=0,
            new_in_br=0,
            missing_in_br=1,
            errors=0,
            entities=[
                EntityCompareResult(
                    entity_id="853233a3-df1a-4c95-9143-8d1a08e8ec9f",
                    entity_type="genericElementEntry",
                    title="Sample entry",
                    status="missing_in_br",
                    summary="Entity is not present in the business request.",
                )
            ],
        )
        mock_compare.return_value = report

        app = create_app()
        client = app.test_client()
        with client.session_transaction() as session:
            _logged_in_session(session)
            store_import_file(
                session,
                import_type="zip",
                filename="catalog-export.zip",
                data=_zip_bytes(),
            )

        response = client.post(
            "/api/business-request/br-123/compare",
            json={"compare_type": "production"},
        )
        assert response.status_code == 200
        body = response.get_json()
        assert body["status"] == "ok"
        assert body["summary"]["missing_in_br"] == 1
        assert len(body["entities"]) == 1
        assert body["entities"][0]["entity_type"] == "genericElementEntry"


@patch("catalog_tool.web.routes.catalog.compare_business_request")
@patch("catalog_tool.web.routes.catalog.client_from_session")
def test_compare_api_accepts_client_entity_payload(mock_client, mock_compare):
    with patch("catalog_tool.web.user_session.LDAP_AUTH_ENABLED", False):
        mock_client.return_value = object()
        mock_compare.return_value = BrCompareReport(
            compare_type="production",
            business_request_id="br-123",
            entity_count=1,
            identical=1,
            changed=0,
            new_in_br=0,
            missing_in_br=0,
            errors=0,
            entities=[
                EntityCompareResult(
                    entity_id="e1",
                    entity_type="promotion",
                    title="Promo",
                    status="identical",
                    summary="No differences.",
                )
            ],
        )

        app = create_app()
        client = app.test_client()
        with client.session_transaction() as session:
            _logged_in_session(session)

        entities = [
            {
                "entity_id": "e1",
                "entity_type": "promotion",
                "title": "Promo",
            }
        ]
        response = client.post(
            "/api/business-request/br-123/compare",
            json={"compare_type": "production", "entities": entities},
        )
        assert response.status_code == 200
        mock_compare.assert_called_once()
        assert mock_compare.call_args.kwargs["entities"] == entities


def test_compare_api_400_without_entities():
    with patch("catalog_tool.web.user_session.LDAP_AUTH_ENABLED", False):
        app = create_app()
        client = app.test_client()
        with client.session_transaction() as session:
            _logged_in_session(session)

        response = client.post(
            "/api/business-request/br-123/compare",
            json={"compare_type": "production"},
        )
        assert response.status_code == 400
        assert "No entities to compare" in response.get_json()["error"]


def test_build_br_compare_panel_html_includes_table_markers():
    """Sanity-check the shape of data the UI renders into a table."""
    report = BrCompareReport(
        compare_type="production",
        business_request_id="br-123",
        entity_count=2,
        identical=0,
        changed=1,
        new_in_br=0,
        missing_in_br=1,
        errors=0,
        entities=[
            EntityCompareResult(
                entity_id="e1",
                entity_type="promotion",
                title="Changed promo",
                status="changed",
                summary="2 field changes",
            ),
            EntityCompareResult(
                entity_id="e2",
                entity_type="genericElementEntry",
                title="Missing entry",
                status="missing_in_br",
                summary="Entity is not present in the business request.",
            ),
        ],
    )
    payload = report.to_dict()
    assert payload["summary"]["entity_count"] == 2
    assert len(payload["entities"]) == 2
    statuses = {item["status"] for item in payload["entities"]}
    assert statuses == {"changed", "missing_in_br"}
