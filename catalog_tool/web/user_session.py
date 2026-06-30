"""Flask session helpers for LDAP app login (separate from CatalogOne connection)."""

from __future__ import annotations

from flask import Flask, jsonify, redirect, request, session, url_for

from catalog_tool.settings import LDAP_AUTH_ENABLED

APP_USER_SESSION_KEY = "app_user"
APP_USER_DISPLAY_KEY = "app_user_display"
USE_AGENTIC_SESSION_KEY = "use_agentic"


def is_app_user_authenticated() -> bool:
    if not LDAP_AUTH_ENABLED:
        return True
    return bool(session.get(APP_USER_SESSION_KEY))


def current_app_user() -> dict[str, str] | None:
    if not is_app_user_authenticated():
        return None
    username = session.get(APP_USER_SESSION_KEY)
    if not username and LDAP_AUTH_ENABLED:
        return None
    return {
        "username": username or "local",
        "display_name": session.get(APP_USER_DISPLAY_KEY) or username or "local",
    }


def login_app_user(username: str, display_name: str | None = None) -> None:
    session[APP_USER_SESSION_KEY] = username
    session[APP_USER_DISPLAY_KEY] = display_name or username
    session.permanent = True


def logout_app_user() -> None:
    session.pop(APP_USER_SESSION_KEY, None)
    session.pop(APP_USER_DISPLAY_KEY, None)
    session.pop(USE_AGENTIC_SESSION_KEY, None)


def is_agentic_enabled() -> bool:
    if USE_AGENTIC_SESSION_KEY in session:
        return bool(session.get(USE_AGENTIC_SESSION_KEY))

    try:
        from catalog_tool.env_file import normalize_chat_provider, read_env_file

        provider = normalize_chat_provider(read_env_file().get("CHAT_PROVIDER"))
        if provider == "none":
            return False
    except Exception:
        pass

    return True


def set_use_agentic(enabled: bool) -> None:
    session[USE_AGENTIC_SESSION_KEY] = bool(enabled)
    session.permanent = True


def register_auth_guard(app: Flask) -> None:
    """Redirect unauthenticated users to /login when LDAP auth is enabled."""

    @app.before_request
    def require_app_login():
        if not LDAP_AUTH_ENABLED:
            return None

        if is_app_user_authenticated():
            return None

        path = request.path or "/"
        if path.startswith("/static/"):
            return None
        if path in {"/login", "/api/user/login"}:
            return None
        if path in {"/api/chat/config", "/api/chat/providers", "/api/user/agentic"}:
            return None
        if path == "/api/user/session":
            return None

        if path.startswith("/api/"):
            return jsonify({"error": "LDAP login required", "login_url": "/login"}), 401

        next_url = request.full_path if request.query_string else request.path
        if next_url.endswith("?"):
            next_url = next_url[:-1]
        return redirect(url_for("user_login_page", next=next_url))

    @app.context_processor
    def inject_app_user():
        user = current_app_user()
        return {
            "app_user": user,
            "ldap_auth_enabled": LDAP_AUTH_ENABLED,
            "use_agentic": is_agentic_enabled(),
        }
