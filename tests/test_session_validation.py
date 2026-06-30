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


@patch("catalog_tool.web.helpers.validate_catalogone_session")
def test_client_from_session_refreshes_before_use(mock_validate):
    app = create_app()
    with app.test_request_context():
        from flask import session

        from catalog_tool.web.helpers import client_from_session

        session.clear()
        session["logged_in"] = True
        session["connection"] = {
            "apigw_url": "https://amd-apigw-eus1-dev01.runtime.internal.corp.amdocs.com",
            "keycloak_url": "https://keycloak.example.com",
            "keycloak_realm": "eus1-dev01",
            "username": "user",
            "password": "secret",
        }
        session["access_token"] = "fresh-token"
        mock_validate.return_value = True

        client = client_from_session()
        mock_validate.assert_called_once_with(refresh=True)
        assert client.access_token == "fresh-token"


@patch("catalog_tool.web.helpers.validate_catalogone_session")
def test_client_from_session_raises_when_refresh_fails(mock_validate):
    app = create_app()
    with app.test_request_context():
        from flask import session

        from catalog_tool.web.helpers import client_from_session

        session.clear()
        session["logged_in"] = True
        mock_validate.return_value = False

        try:
            client_from_session()
            raise AssertionError("expected RuntimeError")
        except RuntimeError as exc:
            assert "expired" in str(exc).lower()
