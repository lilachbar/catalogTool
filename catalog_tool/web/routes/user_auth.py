"""LDAP user login routes (application gate)."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, render_template, request, url_for

from catalog_tool.auth.ldap import authenticate_ldap_user, normalize_username
from catalog_tool.settings import LDAP_AUTH_ENABLED
from catalog_tool.web.routes.chat_config import apply_chat_login_config
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
        reason = request.args.get("reason")
        if reason == "refresh":
            logout_app_user()
        elif LDAP_AUTH_ENABLED and current_app_user():
            return redirect(_safe_next_url(request.args.get("next")))
        return render_template(
            "login.html",
            ldap_enabled=LDAP_AUTH_ENABLED,
            next_url=_safe_next_url(request.args.get("next")),
            relogin_reason=reason,
        )

    @app.post("/api/user/login")
    def api_user_login():
        data = request.get_json(silent=True) or {}

        if not LDAP_AUTH_ENABLED:
            chat_provider = str(data.get("chat_provider") or "").strip().lower()
            api_key = str(data.get("api_key") or "").strip() or None
            chat_model = str(data.get("chat_model") or "").strip() or None
            chat_payload, chat_status = apply_chat_login_config(
                chat_provider, api_key, chat_model
            )
            if chat_status is not None and chat_status >= 400:
                return jsonify(chat_payload), chat_status
            return jsonify({
                "status": "ok",
                "username": "local",
                "ldap_bypass": True,
                "redirect": _safe_next_url(data.get("next")),
            })

        username = normalize_username(str(data.get("username") or ""))
        password = str(data.get("password") or "")

        result = authenticate_ldap_user(username, password)
        if not result.ok:
            return jsonify({"error": result.error}), 401

        login_app_user(result.username, result.display_name)

        chat_provider = str(data.get("chat_provider") or "").strip().lower()
        api_key = str(data.get("api_key") or "").strip() or None
        chat_model = str(data.get("chat_model") or "").strip() or None
        chat_configured = None

        chat_payload, chat_status = apply_chat_login_config(
            chat_provider, api_key, chat_model
        )
        if chat_status is not None and chat_status >= 400:
            logout_app_user()
            return jsonify(chat_payload), chat_status
        if chat_payload:
            chat_configured = chat_payload

        response = {
            "status": "ok",
            "username": result.username,
            "display_name": result.display_name,
            "redirect": _safe_next_url(data.get("next")),
        }
        if chat_configured:
            response["chatConfigured"] = chat_configured
        return jsonify(response)

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
