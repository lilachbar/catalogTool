"""LDAP user login routes (application gate)."""

from __future__ import annotations

from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, render_template, request, url_for

from catalog_tool.auth.ldap import authenticate_ldap_user, normalize_username
from catalog_tool.settings import LDAP_AUTH_ENABLED
from catalog_tool.web.routes.chat_config import apply_agentic_selection
from catalog_tool.web.user_session import (
    current_app_user,
    is_agentic_enabled,
    login_app_user,
    logout_app_user,
    set_use_agentic,
)


def _safe_next_url(raw: str | None) -> str:
    if not raw:
        return "/"
    parsed = urlparse(raw)
    if parsed.netloc or not raw.startswith("/"):
        return "/"
    return raw


def _resolve_agentic_provider(chat_provider: str | None) -> tuple[bool, str]:
    normalized = str(chat_provider or "none").strip().lower()
    if normalized in {"", "none"}:
        return False, ""
    return True, normalized


def _apply_agentic_chat_config(
    chat_provider: str | None,
    api_key: str | None,
    chat_model: str | None,
) -> tuple[dict | None, int | None]:
    return apply_agentic_selection(chat_provider, api_key, chat_model)


def _persist_agentic_selection(
    chat_provider: str | None,
    api_key: str | None,
    chat_model: str | None,
) -> tuple[bool, dict | None, int | None]:
    use_agentic, _provider = _resolve_agentic_provider(chat_provider)
    chat_payload, chat_status = _apply_agentic_chat_config(
        chat_provider or "none",
        api_key if use_agentic else None,
        chat_model if use_agentic else None,
    )
    if chat_status is not None and chat_status >= 400:
        return use_agentic, chat_payload, chat_status
    set_use_agentic(use_agentic)
    return use_agentic, chat_payload, chat_status


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
        api_key = str(data.get("api_key") or "").strip() or None
        chat_model = str(data.get("chat_model") or "").strip() or None

        if not LDAP_AUTH_ENABLED:
            use_agentic, chat_payload, chat_status = _persist_agentic_selection(
                data.get("chat_provider"),
                api_key,
                chat_model,
            )
            if chat_status is not None and chat_status >= 400:
                return jsonify(chat_payload), chat_status
            response = {
                "status": "ok",
                "username": "local",
                "ldap_bypass": True,
                "use_agentic": use_agentic,
                "redirect": _safe_next_url(data.get("next")),
            }
            if chat_payload:
                response["chatConfigured"] = chat_payload
            return jsonify(response)

        username = normalize_username(str(data.get("username") or ""))
        password = str(data.get("password") or "")

        result = authenticate_ldap_user(username, password)
        if not result.ok:
            return jsonify({"error": result.error}), 401

        login_app_user(result.username, result.display_name)

        use_agentic, chat_payload, chat_status = _persist_agentic_selection(
            data.get("chat_provider"),
            api_key,
            chat_model,
        )
        if chat_status is not None and chat_status >= 400:
            logout_app_user()
            return jsonify(chat_payload), chat_status

        response = {
            "status": "ok",
            "username": result.username,
            "display_name": result.display_name,
            "use_agentic": use_agentic,
            "redirect": _safe_next_url(data.get("next")),
        }
        if chat_payload:
            response["chatConfigured"] = chat_payload
        return jsonify(response)

    @app.post("/api/user/logout")
    def api_user_logout():
        logout_app_user()
        return jsonify({"status": "ok", "redirect": url_for("user_login_page")})

    @app.get("/api/user/session")
    def api_user_session():
        user = current_app_user()
        payload = {
            "ldap_enabled": LDAP_AUTH_ENABLED,
            "use_agentic": is_agentic_enabled(),
        }
        if not user:
            payload["authenticated"] = False
            return jsonify(payload)
        payload.update(
            {
                "authenticated": True,
                "username": user["username"],
                "display_name": user["display_name"],
            }
        )
        return jsonify(payload)

    @app.post("/api/user/agentic")
    def api_user_agentic():
        if LDAP_AUTH_ENABLED and not current_app_user():
            return jsonify({"error": "LDAP login required"}), 401

        data = request.get_json(silent=True) or {}
        api_key = str(data.get("api_key") or "").strip() or None
        chat_model = str(data.get("chat_model") or "").strip() or None

        use_agentic, chat_payload, chat_status = _persist_agentic_selection(
            data.get("chat_provider"),
            api_key,
            chat_model,
        )
        if chat_status is not None and chat_status >= 400:
            return jsonify(chat_payload), chat_status

        response = {
            "status": "ok",
            "use_agentic": use_agentic,
            "chat_provider": str(data.get("chat_provider") or "none").strip().lower(),
        }
        if chat_payload:
            response["chatConfigured"] = chat_payload
        return jsonify(response)
