"""Saved environment store API."""

from __future__ import annotations

from flask import Flask, jsonify, request

from catalog_tool.web.environment_store import load_user_store, save_user_store
from catalog_tool.web.user_session import current_app_user


def _store_username() -> str:
    user = current_app_user()
    return user["username"] if user else "local"


def register(app: Flask) -> None:
    @app.get("/api/environments")
    def api_get_environments():
        """Return saved environments for the signed-in app user."""
        username = _store_username()
        store = load_user_store(username)
        response = jsonify({**store, "owner": username})
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.put("/api/environments")
    def api_put_environments():
        """Persist environments for the signed-in app user only."""
        username = _store_username()
        data = request.get_json(force=True)
        try:
            store = save_user_store(username, data)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"status": "ok", "owner": username, **store})
