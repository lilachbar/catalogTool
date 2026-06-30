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


def _looks_like_masked_key(value: str) -> bool:
    return "…" in value or "•" in value


def resolve_chat_api_key(
    provider: str,
    api_key: str | None = None,
    env_values: dict[str, str] | None = None,
) -> str:
    trimmed = _normalize_api_key(api_key or "")
    if trimmed:
        return trimmed
    return existing_api_key_for_provider(provider, env_values)


def _normalize_api_key(value: str) -> str:
    cleaned = (value or "").strip().lstrip("\ufeff").strip().strip('"').strip("'")
    normalized = "".join(cleaned.split())
    if _looks_like_masked_key(normalized):
        return ""
    return normalized


def _provider_env_updates(
    provider: str,
    api_key: str,
    model: str | None,
    env_values: dict[str, str] | None = None,
) -> dict[str, str]:
    provider = provider.strip().lower()
    env_values = env_values if env_values is not None else read_env_file()
    normalized = normalize_chat_provider(provider) or provider
    updates: dict[str, str] = {"CHAT_PROVIDER": normalized}
    resolved_key = resolve_chat_api_key(normalized, api_key, env_values)

    if normalized == "cursor":
        if resolved_key and resolved_key != existing_api_key_for_provider("cursor", env_values):
            updates["CURSOR_API_KEY"] = resolved_key
        if model and model.strip() != (env_values.get("CURSOR_MODEL") or "").strip():
            updates["CURSOR_MODEL"] = model.strip()
    elif normalized == "openai":
        if resolved_key and resolved_key != existing_api_key_for_provider("openai", env_values):
            updates["OPENAI_API_KEY"] = resolved_key
        if model and model.strip() != (env_values.get("OPENAI_MODEL") or "").strip():
            updates["OPENAI_MODEL"] = model.strip()
    elif normalized in {"claude", "anthropic"}:
        updates["CHAT_PROVIDER"] = "claude"
        if resolved_key and resolved_key != existing_api_key_for_provider("claude", env_values):
            updates["ANTHROPIC_API_KEY"] = resolved_key
        if model and model.strip() != (env_values.get("ANTHROPIC_MODEL") or "").strip():
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
    if api_key:
        submitted = resolve_chat_api_key(target_provider or "", api_key, env_values)
        if submitted and submitted != existing_api_key_for_provider(
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

    env_values = read_env_file()
    resolved_key = resolve_chat_api_key(normalized, api_key, env_values)
    if not resolved_key:
        return {"error": f"API key is required for {normalized}."}, 400

    if not needs_chat_reconfigure(normalized, api_key, model):
        current_provider = normalize_chat_provider(env_values.get("CHAT_PROVIDER"))
        if normalized != current_provider:
            return configure_chat_provider(normalized, resolved_key, model)
        return None, None

    return configure_chat_provider(normalized, resolved_key, model)


def configure_chat_provider(provider: str, api_key: str, model: str | None = None) -> tuple[dict, int]:
    try:
        updates = _provider_env_updates(provider, api_key, model)
    except ValueError as exc:
        return {"error": str(exc)}, 400

    resolved_key = resolve_chat_api_key(provider, api_key)

    validate_response = proxy_to_chat_server(
        "/api/configure",
        method="POST",
        json_body={
            "provider": updates["CHAT_PROVIDER"],
            "api_key": resolved_key,
            "model": model,
        },
        timeout=30,
    )
    if isinstance(validate_response, tuple):
        return {"error": "Chat server unavailable during validation."}, 503
    if validate_response.status_code >= 400:
        try:
            payload = json.loads(validate_response.get_data(as_text=True))
        except json.JSONDecodeError:
            payload = {}
        return {
            "error": payload.get("error") or "API key validation failed.",
        }, validate_response.status_code

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


def apply_chat_model_selection(
    model: str | None,
    *,
    default_model: str | None = None,
) -> tuple[dict, int]:
    """Persist the user's model choice to .env for the active chat provider."""
    env_values = read_env_file()
    provider = normalize_chat_provider(env_values.get("CHAT_PROVIDER"))
    if not provider:
        return {"error": "No chat provider configured in .env."}, 400

    model_var = PROVIDER_MODEL_VARS.get(provider)
    if not model_var:
        return {"error": f"No model variable for provider {provider}."}, 400

    selected = (model or "").strip()
    if not selected or selected == "auto":
        resolved = (default_model or env_values.get(model_var) or "").strip()
    else:
        resolved = selected

    if not resolved:
        return {"error": "Model is required."}, 400

    current = (env_values.get(model_var) or "").strip()
    if resolved == current:
        return {"ok": True, "model": resolved, "modelVar": model_var, "unchanged": True}, 200

    upsert_env_vars({model_var: resolved})
    _reload_python_env()
    os.environ[model_var] = resolved

    node_reload = _reload_node_env()
    if not node_reload.get("ok"):
        return {
            "error": "Saved to .env but could not reload the chat server. Restart ./run_web.sh.",
            "nodeReload": node_reload,
        }, 503

    return {"ok": True, "model": resolved, "modelVar": model_var}, 200


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

        resolved_key = resolve_chat_api_key(provider, api_key)
        if not resolved_key:
            return jsonify({"error": "API key is required."}), 400

        payload, status = configure_chat_provider(provider, api_key, model)
        return jsonify(payload), status

    @app.post("/api/chat/model")
    def api_chat_model():
        data = request.get_json(silent=True) or {}
        model = str(data.get("model") or "").strip() or None
        default_model = str(data.get("default_model") or "").strip() or None
        payload, status = apply_chat_model_selection(model, default_model=default_model)
        return jsonify(payload), status
