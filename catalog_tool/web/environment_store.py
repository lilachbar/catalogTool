"""Persist saved CatalogOne environments to a JSON file on disk."""

from __future__ import annotations

import base64
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from catalog_tool.settings import ENVIRONMENTS_FILE, ENVIRONMENTS_FIXTURE_FILE

MAX_ENVIRONMENTS = 12


def _empty_store() -> dict[str, Any]:
    return {
        "activeEnvironmentId": None,
        "environments": [],
    }


def _encode_password(password: str) -> str:
    if not password:
        return ""
    return base64.b64encode(password.encode("utf-8")).decode("ascii")


def _decode_password(stored: str) -> str:
    if not stored:
        return ""
    try:
        return base64.b64decode(stored, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        # Legacy files may still contain plain-text passwords.
        return stored


def ensure_store_file(path: Path | None = None) -> Path:
    """Create the environments file from the test fixture when missing."""
    target = path or ENVIRONMENTS_FILE
    if target.exists():
        return target

    target.parent.mkdir(parents=True, exist_ok=True)
    fixture = ENVIRONMENTS_FIXTURE_FILE
    if fixture.exists():
        shutil.copy(fixture, target)
    else:
        save_store(_empty_store(), path=target)
    return target


def load_store(path: Path | None = None) -> dict[str, Any]:
    target = ensure_store_file(path)
    try:
        raw = target.read_text(encoding="utf-8")
        if not raw.strip():
            return _empty_store()
        parsed = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return _empty_store()

    environments = parsed.get("environments")
    if not isinstance(environments, list):
        environments = []

    active_id = parsed.get("activeEnvironmentId")
    if active_id is not None and not isinstance(active_id, str):
        active_id = None

    normalized = [
        _normalize_environment(item, from_disk=True)
        for item in environments
        if isinstance(item, dict)
    ]
    normalized = normalized[:MAX_ENVIRONMENTS]

    if active_id and not any(item["id"] == active_id for item in normalized):
        active_id = normalized[0]["id"] if normalized else None

    return {
        "activeEnvironmentId": active_id,
        "environments": normalized,
    }


def save_store(store: dict[str, Any], path: Path | None = None) -> dict[str, Any]:
    target = path or ENVIRONMENTS_FILE
    target.parent.mkdir(parents=True, exist_ok=True)

    normalized = validate_store(store)
    disk_payload = {
        "activeEnvironmentId": normalized["activeEnvironmentId"],
        "environments": [_environment_for_disk(item) for item in normalized["environments"]],
    }
    payload = json.dumps(disk_payload, indent=2, sort_keys=False)
    payload += "\n"

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=target.parent,
        delete=False,
    ) as handle:
        handle.write(payload)
        temp_path = Path(handle.name)

    temp_path.replace(target)
    return normalized


def validate_store(store: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(store, dict):
        raise ValueError("Environment store must be a JSON object.")

    environments_raw = store.get("environments")
    if not isinstance(environments_raw, list):
        raise ValueError("environments must be an array.")

    environments = [
        _normalize_environment(item)
        for item in environments_raw
        if isinstance(item, dict)
    ][:MAX_ENVIRONMENTS]

    active_id = store.get("activeEnvironmentId")
    if active_id is not None and not isinstance(active_id, str):
        raise ValueError("activeEnvironmentId must be a string or null.")
    if active_id and not any(item["id"] == active_id for item in environments):
        active_id = environments[0]["id"] if environments else None

    return {
        "activeEnvironmentId": active_id,
        "environments": environments,
    }


def _environment_for_disk(environment: dict[str, Any]) -> dict[str, Any]:
    return {
        **environment,
        "password": _encode_password(environment.get("password") or ""),
    }


def _normalize_environment(raw: dict[str, Any], *, from_disk: bool = False) -> dict[str, Any]:
    env_id = str(raw.get("id") or "").strip()
    if not env_id:
        raise ValueError("Each environment requires an id.")

    required = ("apigw_url", "keycloak_url", "keycloak_realm", "username")
    for field in required:
        value = str(raw.get(field) or "").strip()
        if not value:
            raise ValueError(f"Environment {env_id} is missing {field}.")

    last_used = raw.get("last_used_at")
    if not isinstance(last_used, (int, float)):
        last_used = 0

    password_raw = str(raw.get("password") or "")
    password = _decode_password(password_raw) if from_disk else password_raw

    return {
        "id": env_id,
        "display_name": str(raw.get("display_name") or "").strip(),
        "label": str(raw.get("label") or "").strip(),
        "apigw_url": str(raw["apigw_url"]).strip(),
        "keycloak_url": str(raw["keycloak_url"]).strip(),
        "keycloak_realm": str(raw["keycloak_realm"]).strip(),
        "username": str(raw["username"]).strip(),
        "password": password,
        "last_used_at": int(last_used),
    }
