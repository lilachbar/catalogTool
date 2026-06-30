"""Read and update the project .env file without destroying comments."""

from __future__ import annotations

import re
from pathlib import Path

from catalog_tool.settings import PROJECT_ROOT

ENV_FILE_PATH = PROJECT_ROOT / ".env"

# Keys managed by the login / chat configuration flow.
CHAT_ENV_KEYS = frozenset(
    {
        "CHAT_PROVIDER",
        "CHAT_MODE",
        "CURSOR_API_KEY",
        "CURSOR_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_MODEL",
    }
)

PROVIDER_API_KEY_VARS: dict[str, str] = {
    "cursor": "CURSOR_API_KEY",
    "openai": "OPENAI_API_KEY",
    "claude": "ANTHROPIC_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}

PROVIDER_MODEL_VARS: dict[str, str] = {
    "cursor": "CURSOR_MODEL",
    "openai": "OPENAI_MODEL",
    "claude": "ANTHROPIC_MODEL",
    "anthropic": "ANTHROPIC_MODEL",
}


def normalize_chat_mode(mode: str | None) -> str:
    normalized = (mode or "agent").strip().lower()
    if normalized not in {"agent", "plan", "ask"}:
        return "agent"
    return normalized


def normalize_chat_provider(provider: str | None) -> str | None:
    if not provider:
        return None
    normalized = provider.strip().lower()
    if normalized == "anthropic":
        return "claude"
    if normalized == "none":
        return "none"
    return normalized or None


def existing_api_key_for_provider(
    provider: str, env_values: dict[str, str] | None = None
) -> str:
    env_values = env_values if env_values is not None else read_env_file()
    normalized = normalize_chat_provider(provider)
    if not normalized:
        return ""
    key_var = PROVIDER_API_KEY_VARS.get(normalized)
    if not key_var:
        return ""
    return (env_values.get(key_var) or "").strip()


def collect_provider_config(env_values: dict[str, str] | None = None) -> dict:
    env_values = env_values if env_values is not None else read_env_file()
    provider = normalize_chat_provider(env_values.get("CHAT_PROVIDER"))
    providers: dict[str, dict[str, object]] = {}
    for provider_id in ("cursor", "openai", "claude"):
        key = existing_api_key_for_provider(provider_id, env_values)
        providers[provider_id] = {
            "configured": bool(key),
            "maskedApiKey": mask_api_key(key),
            "envVar": PROVIDER_API_KEY_VARS[provider_id],
        }
    if provider == "none":
        return {
            "configured": False,
            "provider": "none",
            "chatMode": normalize_chat_mode(env_values.get("CHAT_MODE")),
            "maskedApiKey": "",
            "providers": providers,
        }
    masked_key = ""
    if provider:
        masked_key = str(providers.get(provider, {}).get("maskedApiKey") or "")
    return {
        "configured": bool(provider and masked_key),
        "provider": provider,
        "chatMode": normalize_chat_mode(env_values.get("CHAT_MODE")),
        "maskedApiKey": masked_key,
        "providers": providers,
    }

_KEY_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def read_env_file(path: Path | None = None) -> dict[str, str]:
    target = path or ENV_FILE_PATH
    if not target.is_file():
        return {}
    values: dict[str, str] = {}
    for line in target.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _KEY_LINE.match(stripped)
        if match:
            values[match.group(1)] = match.group(2)
    return values


def upsert_env_vars(updates: dict[str, str], path: Path | None = None) -> Path:
    """Insert or replace keys in .env, preserving unrelated lines and comments."""
    target = path or ENV_FILE_PATH
    filtered = {key: value for key, value in updates.items() if key in CHAT_ENV_KEYS}
    if not filtered:
        return target

    if target.is_file():
        lines = target.read_text(encoding="utf-8").splitlines()
    else:
        lines = []

    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        match = _KEY_LINE.match(line.strip())
        if match and match.group(1) in filtered:
            key = match.group(1)
            output.append(f"{key}={filtered[key]}")
            seen.add(key)
            continue
        output.append(line)

    for key, value in filtered.items():
        if key not in seen:
            insert_at = len(output)
            last_chat_idx = -1
            for idx, line in enumerate(output):
                match = _KEY_LINE.match(line.strip())
                if match and match.group(1) in CHAT_ENV_KEYS:
                    last_chat_idx = idx
            if last_chat_idx >= 0:
                insert_at = last_chat_idx + 1
            output.insert(insert_at, f"{key}={value}")

    text = "\n".join(output)
    if text and not text.endswith("\n"):
        text += "\n"
    target.write_text(text, encoding="utf-8")
    return target


def mask_api_key(value: str) -> str:
    trimmed = (value or "").strip()
    if len(trimmed) <= 8:
        return "••••" if trimmed else ""
    return f"{trimmed[:4]}…{trimmed[-4:]}"
