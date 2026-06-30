"""Configure chat provider credentials in .env (login flow)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from catalog_tool.env_file import (
    ENV_FILE_PATH,
    PROVIDER_MODEL_VARS,
    collect_provider_config,
    existing_api_key_for_provider,
    normalize_chat_provider,
    read_env_file,
    upsert_env_vars,
)
from catalog_tool.settings import CHAT_SERVER_URL, PROJECT_ROOT
from catalog_tool.web.chat_proxy import proxy_to_chat_server


def _provider_env_updates(provider: str, api_key: str, model: str | None) -> dict[str, str]:
    provider = provider.strip().lower()
    updates: dict[str, str] = {"CHAT_PROVIDER": provider}

    if provider == "cursor":
        updates["CURSOR_API_KEY"] = api_key.strip()
        if model:
            updates["CURSOR_MODEL"] = model.strip()
    elif provider == "openai":
        updates["OPENAI_API_KEY"] = api_key.strip()
        if model:
            updates["OPENAI_MODEL"] = model.strip()
    elif provider in {"claude", "anthropic"}:
        updates["CHAT_PROVIDER"] = "claude"
        updates["ANTHROPIC_API_KEY"] = api_key.strip()
        if model:
            updates["ANTHROPIC_MODEL"] = model.strip()
    else:
        raise ValueError(f"Unknown provider: {provider}")

    return updates


def _reload_python_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env", override=True)


def _reload_node_env() -> dict:
    url = f"{CHAT_SERVER_URL}/api/reload-env"
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return {"ok": False, "error": str(exc.reason)}


def needs_chat_reconfigure(
    provider: str,
    api_key: str | None = None,
    model: str | None = None,
) -> bool:
    env_values = read_env_file()
    target_provider = normalize_chat_provider(provider)
    current_provider = normalize_chat_provider(env_values.get("CHAT_PROVIDER"))
    if target_provider != current_provider:
        return True
    if api_key and api_key.strip() != existing_api_key_for_provider(
        target_provider or "", env_values
    ):
        return True
    if model:
        model_var = PROVIDER_MODEL_VARS.get(target_provider or "")
        if model_var and model.strip() != (env_values.get(model_var) or "").strip():
            return True
    return False


def apply_chat_login_config(
    provider: str | None,
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[dict | None, int | None]:
    """Validate and persist chat settings submitted at login, when needed."""
    normalized = normalize_chat_provider(provider)
    if not normalized:
        return None, None

    resolved_key = resolve_chat_api_key(normalized, api_key)
    if not resolved_key:
        return {"error": f"API key is required for {normalized}."}, 400

    if not needs_chat_reconfigure(normalized, api_key, model):
        return None, None

    return configure_chat_provider(normalized, resolved_key, model)


def resolve_chat_api_key(provider: str, api_key: str | None = None) -> str:
    trimmed = (api_key or "").strip()
    if trimmed:
        return trimmed
    return existing_api_key_for_provider(provider)


def configure_chat_provider(provider: str, api_key: str, model: str | None = None) -> tuple[dict, int]:
    try:
        updates = _provider_env_updates(provider, api_key, model)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    upsert_env_vars(updates)
    _reload_python_env()
    for key, value in updates.items():
        os.environ[key] = value

    node_reload = _reload_node_env()
    if not node_reload.get("ok"):
        return {
            "error": "Saved to .env but could not reload the chat server. Restart ./run_web.sh.",
            "nodeReload": node_reload,
        }, 503

    health_response = proxy_to_chat_server("/health", timeout=30)
    if isinstance(health_response, tuple):
        return {"error": "Chat server unavailable after configuration."}, 503

    health = json.loads(health_response.get_data(as_text=True))
    if not health.get("chatReady"):
        chat_key = health.get("chatKey") or {}
        return {
            "error": chat_key.get("message") or "API key validation failed.",
            "chatKey": chat_key,
        }, 400

    return {
        "ok": True,
        "provider": updates["CHAT_PROVIDER"],
        "chatReady": True,
        "chatProvider": health.get("chatProvider"),
    }, 200


def register(app: Flask) -> None:
    @app.get("/api/chat/providers")
    def api_chat_providers():
        return proxy_to_chat_server("/api/providers")

    @app.get("/api/chat/models")
    def api_chat_models():
        return proxy_to_chat_server("/api/models")

    @app.get("/api/chat/config")
    def api_chat_config():
        payload = collect_provider_config()
        payload["envFile"] = str(ENV_FILE_PATH)
        return jsonify(payload)

    @app.post("/api/chat/configure")
    def api_chat_configure():
        data = request.get_json(silent=True) or {}
        provider = str(data.get("provider") or "").strip().lower()
        api_key = str(data.get("api_key") or "").strip()
        model = str(data.get("model") or "").strip() or None

        if not provider:
            return jsonify({"error": "AI provider is required."}), 400
        if not api_key:
            return jsonify({"error": "API key is required."}), 400

        payload, status = configure_chat_provider(provider, api_key, model)
        return jsonify(payload), status
