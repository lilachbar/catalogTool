"""Authentication and session routes."""

from __future__ import annotations

from flask import Flask, jsonify, request, session

from catalog_tool.client.catalog_one_client import CatalogOneClient, derive_catalog_ui_url, derive_environment_label
from catalog_tool.web.helpers import connection_from_request, validate_catalogone_session
from catalog_tool.web.import_context import clear_import_context
from catalog_tool.web.user_session import (
    APP_USER_DISPLAY_KEY,
    APP_USER_SESSION_KEY,
)


def register(app: Flask) -> None:
    @app.post("/api/login")
    def api_login():
        data = request.get_json(force=True)
        connection = connection_from_request(data)
        if not connection.username or not connection.password:
            return jsonify({"error": "Username and password are required"}), 400

        client = CatalogOneClient(connection)
        try:
            access_token = client.login()
        except Exception as exc:
            return jsonify({"error": str(exc)}), 401

        session["connection"] = {
            "apigw_url": connection.apigw_url,
            "keycloak_url": connection.keycloak_url or client.keycloak_url(),
            "keycloak_realm": connection.keycloak_realm or client.keycloak_realm(),
            "username": connection.username,
            "password": connection.password,
            "keycloak_client_id": connection.keycloak_client_id,
        }
        session["access_token"] = access_token
        session["logged_in"] = True

        return jsonify(
            {
                "status": "ok",
                "username": connection.username,
                "apigw_url": connection.apigw_url,
                "keycloak_url": client.keycloak_url(),
                "realm": client.keycloak_realm(),
                "environment_label": derive_environment_label(connection.apigw_url),
                "catalog_ui_url": derive_catalog_ui_url(connection.apigw_url),
                "normalized_apigw_url": connection.apigw_url,
                "token_preview": f"{access_token[:16]}...",
            }
        )

    @app.post("/api/logout")
    def api_logout():
        """Disconnect from CatalogOne only — preserve LDAP app login."""
        app_user = session.get(APP_USER_SESSION_KEY)
        app_user_display = session.get(APP_USER_DISPLAY_KEY)
        clear_import_context(session)
        session.clear()
        if app_user:
            session[APP_USER_SESSION_KEY] = app_user
            session[APP_USER_DISPLAY_KEY] = app_user_display
        return jsonify({"status": "ok"})

    @app.get("/api/session")
    def api_session():
        if not session.get("logged_in"):
            return jsonify({"logged_in": False})

        if not validate_catalogone_session(refresh=True):
            return jsonify({"logged_in": False})

        connection = session.get("connection", {})
        apigw_url = connection.get("apigw_url", "")
        return jsonify(
            {
                "logged_in": True,
                "username": connection.get("username"),
                "apigw_url": apigw_url,
                "keycloak_url": connection.get("keycloak_url"),
                "realm": connection.get("keycloak_realm"),
                "environment_label": derive_environment_label(apigw_url) if apigw_url else "",
            }
        )
