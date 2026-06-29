"""LDAP user login routes (application gate)."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, render_template, request, url_for

from catalog_tool.auth.ldap import authenticate_ldap_user, normalize_username
from catalog_tool.settings import LDAP_AUTH_ENABLED
from catalog_tool.web.user_session import (
    current_app_user,
    login_app_user,
    logout_app_user,
)


def _safe_next_url(raw: str | None) -> str:
    if not raw:
        return "/"
    parsed = urlparse(raw)
    if parsed.netloc or not raw.startswith("/"):
        return "/"
    return raw


def register(app: Flask) -> None:
    @app.get("/login")
    def user_login_page():
        if LDAP_AUTH_ENABLED and current_app_user():
            return redirect(_safe_next_url(request.args.get("next")))
        return render_template(
            "login.html",
            ldap_enabled=LDAP_AUTH_ENABLED,
            next_url=_safe_next_url(request.args.get("next")),
        )

    @app.post("/api/user/login")
    def api_user_login():
        if not LDAP_AUTH_ENABLED:
            return jsonify({"status": "ok", "username": "local", "ldap_bypass": True})

        data = request.get_json(silent=True) or {}
        username = normalize_username(str(data.get("username") or ""))
        password = str(data.get("password") or "")

        result = authenticate_ldap_user(username, password)
        if not result.ok:
            return jsonify({"error": result.error}), 401

        login_app_user(result.username, result.display_name)
        return jsonify(
            {
                "status": "ok",
                "username": result.username,
                "display_name": result.display_name,
                "redirect": _safe_next_url(data.get("next")),
            }
        )

    @app.post("/api/user/logout")
    def api_user_logout():
        logout_app_user()
        return jsonify({"status": "ok", "redirect": url_for("user_login_page")})

    @app.get("/api/user/session")
    def api_user_session():
        user = current_app_user()
        if not user:
            return jsonify({"authenticated": False, "ldap_enabled": LDAP_AUTH_ENABLED})
        return jsonify(
            {
                "authenticated": True,
                "ldap_enabled": LDAP_AUTH_ENABLED,
                "username": user["username"],
                "display_name": user["display_name"],
            }
        )
