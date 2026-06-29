"""Tests for session-derived catalogone MCP environment overrides."""

from __future__ import annotations

from catalog_tool.web.app import create_app
from catalog_tool.web.helpers import (
    catalogone_mcp_env_from_session,
    catalogone_mcp_env_proxy_headers,
)


def test_catalogone_mcp_env_from_session_when_logged_out():
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        assert catalogone_mcp_env_from_session() is None
        assert catalogone_mcp_env_proxy_headers() == {}


def test_catalogone_mcp_env_from_session_maps_connection():
    app = create_app()
    with app.test_request_context():
        from flask import session

        session["logged_in"] = True
        session["connection"] = {
            "apigw_url": "https://k8k-runtimeapp-amo-il41-rel285-authoring.corp.amdocs.com",
            "keycloak_url": "https://keycloak-amo-il41-rel285-authoring.corp.amdocs.com",
            "keycloak_realm": "amo-il41-rel285-authoring",
            "username": "cataloguser",
            "password": "secret",
        }

        env = catalogone_mcp_env_from_session()
        assert env is not None
        assert env["C1_APIGW_URL"].endswith("-authoring.corp.amdocs.com")
        assert env["C1_USERNAME"] == "cataloguser"
        assert env["C1_PASSWORD"] == "secret"
        assert env["C1_KEYCLOAK_REALM"] == "amo-il41-rel285-authoring"

        headers = catalogone_mcp_env_proxy_headers()
        assert "X-Catalogone-Env" in headers
