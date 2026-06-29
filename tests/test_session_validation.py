"""Tests for CatalogOne session validation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from catalog_tool.web.app import create_app
from catalog_tool.web.helpers import clear_catalogone_login, validate_catalogone_session


def test_validate_catalogone_session_false_when_not_logged_in():
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        assert validate_catalogone_session() is False


def test_validate_catalogone_session_clears_missing_connection():
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        session["logged_in"] = True
        assert validate_catalogone_session() is False
        assert not session.get("logged_in")


@patch("catalog_tool.web.helpers.CatalogOneClient")
def test_validate_catalogone_session_refreshes_expired_token(mock_client_cls):
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        session["logged_in"] = True
        session["connection"] = {
            "apigw_url": "https://amd-apigw-eus1-dev01.runtime.internal.corp.amdocs.com",
            "keycloak_url": "https://keycloak.example.com",
            "keycloak_realm": "eus1-dev01",
            "username": "user",
            "password": "secret",
        }
        session["access_token"] = "expired-token"

        client = MagicMock()
        client._access_token = "expired-token"
        client._api_request.return_value = (401, "")
        client.login.return_value = "fresh-token"
        mock_client_cls.return_value = client

        assert validate_catalogone_session(refresh=True) is True
        assert session["access_token"] == "fresh-token"
        client.login.assert_called_once()


@patch("catalog_tool.web.helpers.CatalogOneClient")
def test_validate_catalogone_session_clears_on_failed_refresh(mock_client_cls):
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        session["logged_in"] = True
        session["connection"] = {
            "apigw_url": "https://amd-apigw-eus1-dev01.runtime.internal.corp.amdocs.com",
            "keycloak_url": "https://keycloak.example.com",
            "keycloak_realm": "eus1-dev01",
            "username": "user",
            "password": "bad",
        }
        session["access_token"] = "expired-token"

        client = MagicMock()
        client._access_token = "expired-token"
        client._api_request.return_value = (401, "")
        client.login.side_effect = RuntimeError("Keycloak rejected login")
        mock_client_cls.return_value = client

        assert validate_catalogone_session(refresh=True) is False
        assert not session.get("logged_in")
        assert not session.get("access_token")


def test_clear_catalogone_login_removes_catalogone_fields():
    app = create_app()
    with app.test_request_context():
        from flask import session

        session.clear()
        session["logged_in"] = True
        session["access_token"] = "token"
        session["connection"] = {"username": "user"}

        clear_catalogone_login()

        assert not session.get("logged_in")
        assert not session.get("access_token")
        assert not session.get("connection")
