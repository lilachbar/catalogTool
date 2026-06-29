"""Chat UI, detached window, and MCP proxy routes."""

from __future__ import annotations

import urllib.parse

from flask import Flask, Response, jsonify, request

from catalog_tool.web.chat_proxy import proxy_to_chat_server
from catalog_tool.web.helpers import (
    catalogone_mcp_env_from_session,
    catalogone_mcp_env_proxy_headers,
)
from catalog_tool.client.catalog_one_client import derive_environment_label
from catalog_tool.web.chat_window import (
    DEFAULT_POPUP_HEIGHT,
    DEFAULT_POPUP_WIDTH,
    open_chat_app_window,
    resize_chat_app_window,
)
from catalog_tool.web.constants import WEB_ROOT
from catalog_tool.web.mcp_config import load_catalogone_mcp_config


def register(app: Flask) -> None:
    @app.get("/chat-manifest.webmanifest")
    def chat_manifest():
        manifest_path = WEB_ROOT / "static" / "chat-manifest.webmanifest"
        return Response(manifest_path.read_text(), mimetype="application/manifest+json")

    @app.post("/api/chat/open-window")
    def api_chat_open_window():
        """Open chat in browser app mode (no address bar) when supported on this OS."""
        data = request.get_json(silent=True) or {}
        chat_url = urllib.parse.urljoin(request.url_root, "chat")
        chat_session = str(data.get("session", "")).strip()
        if chat_session:
            chat_url = f"{chat_url}?s={urllib.parse.quote(chat_session, safe='')}"
        opened = open_chat_app_window(
            chat_url,
            width=int(data.get("width", DEFAULT_POPUP_WIDTH)),
            height=int(data.get("height", DEFAULT_POPUP_HEIGHT)),
            left=int(data["left"]) if data.get("left") is not None else None,
            top=int(data["top"]) if data.get("top") is not None else None,
        )
        return jsonify({"opened": opened, "url": chat_url})

    @app.post("/api/chat/resize-window")
    def api_chat_resize_window():
        """Resize the detached chat window to match the docked panel (macOS)."""
        data = request.get_json(silent=True) or {}
        resized = resize_chat_app_window(
            width=int(data.get("width", DEFAULT_POPUP_WIDTH)),
            height=int(data.get("height", DEFAULT_POPUP_HEIGHT)),
            left=int(data["left"]) if data.get("left") is not None else None,
            top=int(data["top"]) if data.get("top") is not None else None,
        )
        return jsonify({"resized": resized})

    @app.get("/api/chat/health")
    def api_chat_health():
        return proxy_to_chat_server("/health")

    @app.get("/api/mcp/config")
    def api_mcp_config():
        """Fast MCP install check — does not require the Node chat server."""
        payload = load_catalogone_mcp_config()
        catalogone_env = catalogone_mcp_env_from_session()
        if catalogone_env:
            payload["credentialsSource"] = "connected_session"
            payload["activeEnvironment"] = {
                "label": derive_environment_label(catalogone_env["C1_APIGW_URL"]),
                "apigw_url": catalogone_env["C1_APIGW_URL"],
            }
        else:
            payload["credentialsSource"] = "mcp_json"
        return jsonify(payload)

    @app.get("/api/mcp/env")
    def api_mcp_env():
        """Return catalogone C1_* env derived from the active Connect session."""
        catalogone_env = catalogone_mcp_env_from_session()
        if not catalogone_env:
            return jsonify({"configured": False, "catalogoneEnv": None})
        return jsonify(
            {
                "configured": True,
                "credentialsSource": "connected_session",
                "environment_label": derive_environment_label(catalogone_env["C1_APIGW_URL"]),
                "apigw_url": catalogone_env["C1_APIGW_URL"],
                "catalogoneEnv": catalogone_env,
            }
        )

    @app.get("/api/mcp/status")
    def api_mcp_status():
        qs = request.query_string.decode()
        path = "/api/mcp/status"
        if qs:
            path = f"{path}?{qs}"
        return proxy_to_chat_server(path, extra_headers=catalogone_mcp_env_proxy_headers())

    @app.get("/api/mcp/tools")
    def api_mcp_tools():
        return proxy_to_chat_server("/api/mcp/tools", extra_headers=catalogone_mcp_env_proxy_headers())

    @app.post("/api/mcp/call")
    def api_mcp_call():
        data = request.get_json(silent=True) or {}
        catalogone_env = catalogone_mcp_env_from_session()
        if catalogone_env:
            data["catalogoneEnv"] = catalogone_env
        return proxy_to_chat_server(
            "/api/mcp/call",
            method="POST",
            timeout=180,
            json_body=data,
        )

    @app.post("/api/chat")
    def api_chat():
        """Proxy chat requests to the Node chat server (Vercel AI SDK). Keys stay server-side."""
        return proxy_to_chat_server("/api/chat", method="POST", stream=True)
