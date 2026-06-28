"""Saved environment store API."""

from __future__ import annotations

from flask import Flask, jsonify, request

from catalog_tool.web.environment_store import load_store, save_store


def register(app: Flask) -> None:
    @app.get("/api/environments")
    def api_get_environments():
        """Return saved environments from the on-disk store (not Flask session)."""
        return jsonify(load_store())

    @app.put("/api/environments")
    def api_put_environments():
        """Persist the full environment store to disk."""
        data = request.get_json(force=True)
        try:
            store = save_store(data)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"status": "ok", **store})
