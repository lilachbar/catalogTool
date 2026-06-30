"""Persist saved CatalogOne environments to per-user JSON files on disk."""

from __future__ import annotations

import base64
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from catalog_tool.client.catalog_one_client import derive_environment_label, resolve_keycloak_config
from catalog_tool.settings import (
    DATA_DIR,
    ENVIRONMENTS_FILE,
    ENVIRONMENTS_FIXTURE_FILE,
    LDAP_AUTH_ENABLED,
)

MAX_ENVIRONMENTS = 12
ENVIRONMENTS_DIR = DATA_DIR / "environments"
LEGACY_CLAIM_MARKER = ENVIRONMENTS_DIR / ".legacy_claimed"
_SAFE_USERNAME_RE = re.compile(r"[^a-z0-9._-]+")


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


def safe_username(username: str | None) -> str:
    """Filesystem-safe id for per-user environment files."""
    value = (username or "local").strip().lower()
    value = _SAFE_USERNAME_RE.sub("_", value).strip("._-")
    return (value[:64] or "local")


def user_store_path(username: str | None) -> Path:
    return ENVIRONMENTS_DIR / f"{safe_username(username)}.json"


def load_user_store(username: str | None) -> dict[str, Any]:
    """Load environments owned by the given app user."""
    path = user_store_path(username)
    if not path.exists():
        _bootstrap_user_store(username, path)
    else:
        _maybe_migrate_legacy_into_user_store(username, path)
    store = load_store(path, bootstrap_fixture=False)
    return _repair_user_store(username, path, store)


def _repair_user_store(
    username: str | None,
    path: Path,
    store: dict[str, Any],
) -> dict[str, Any]:
    """Persist label/keycloak/display fixes when on-disk values drift from APIGW."""
    repaired = validate_store(store)
    if not path.exists():
        return repaired

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return repaired

    raw_envs = raw.get("environments")
    if not isinstance(raw_envs, list):
        return save_store(repaired, path=path)

    fixed_envs = repaired.get("environments") or []
    if len(raw_envs) != len(fixed_envs):
        return save_store(repaired, path=path)

    repair_fields = ("label", "display_name", "keycloak_url", "keycloak_realm")
    for raw_item, fixed in zip(raw_envs, fixed_envs):
        if not isinstance(raw_item, dict) or not isinstance(fixed, dict):
            return save_store(repaired, path=path)
        for field in repair_fields:
            if str(raw_item.get(field) or "").strip() != str(fixed.get(field) or "").strip():
                return save_store(repaired, path=path)

    return repaired


def save_user_store(username: str | None, store: dict[str, Any]) -> dict[str, Any]:
    """Persist environments for the given app user."""
    path = user_store_path(username)
    return save_store(store, path=path)


def _legacy_store_claimed_by(username: str | None) -> bool:
    """Return True when this user may import the legacy shared environments file."""
    safe = safe_username(username)
    if not ENVIRONMENTS_FILE.exists() or not ENVIRONMENTS_FILE.is_file():
        return False
    if not LDAP_AUTH_ENABLED:
        return safe == "local"
    if not LEGACY_CLAIM_MARKER.exists():
        return True
    return LEGACY_CLAIM_MARKER.read_text(encoding="utf-8").strip() == safe


def _import_legacy_store(username: str | None, path: Path) -> bool:
    """Copy the legacy shared store into a user file when allowed."""
    if not _legacy_store_claimed_by(username):
        return False
    shutil.copy(ENVIRONMENTS_FILE, path)
    if LDAP_AUTH_ENABLED and not LEGACY_CLAIM_MARKER.exists():
        LEGACY_CLAIM_MARKER.write_text(safe_username(username), encoding="utf-8")
    return True


def _bootstrap_user_store(username: str | None, path: Path) -> None:
    """Create a new user store, optionally migrating a legacy shared file once."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if _import_legacy_store(username, path):
        return
    save_store(_empty_store(), path=path)


def _maybe_migrate_legacy_into_user_store(username: str | None, path: Path) -> None:
    """If the user file exists but is empty, import legacy shared data once."""
    store = load_store(path, bootstrap_fixture=False)
    if store.get("environments"):
        return
    _import_legacy_store(username, path)


def ensure_store_file(path: Path, *, bootstrap_fixture: bool = True) -> Path:
    """Create the environments file from the test fixture when missing."""
    target = path
    if target.exists():
        return target

    target.parent.mkdir(parents=True, exist_ok=True)
    if bootstrap_fixture:
        fixture = ENVIRONMENTS_FIXTURE_FILE
        if fixture.exists():
            shutil.copy(fixture, target)
        else:
            save_store(_empty_store(), path=target)
    else:
        save_store(_empty_store(), path=target)
    return target


def load_store(path: Path | None = None, *, bootstrap_fixture: bool = True) -> dict[str, Any]:
    target = path or ENVIRONMENTS_FILE
    if not target.exists():
        ensure_store_file(target, bootstrap_fixture=bootstrap_fixture)
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


def _friendly_environment_label(technical_label: str) -> str:
    value = (technical_label or "").strip()
    match = re.match(r"^amo-(il\d+-rel\d+)-authoring$", value, re.IGNORECASE)
    if match:
        return match.group(1)
    if value.endswith("-authoring"):
        return value[: -len("-authoring")]
    return value


def _display_name_matches_environment(
    display_name: str,
    apigw_url: str,
    technical_label: str,
) -> bool:
    custom = (display_name or "").strip()
    derived = (technical_label or derive_environment_label(apigw_url)).strip()
    if not custom:
        return False
    if not derived:
        return True
    dn = custom.lower()
    core = derived.replace("-authoring", "").lower()
    if core and core in dn:
        return True
    return any(part in dn for part in core.split("-") if len(part) > 2)


def _display_name_looks_mismatched(
    display_name: str,
    apigw_url: str,
    technical_label: str,
) -> bool:
    custom = (display_name or "").strip()
    if not custom:
        return False
    if _display_name_matches_environment(custom, apigw_url, technical_label):
        return False

    derived = (technical_label or derive_environment_label(apigw_url)).strip()
    core = derived.replace("-authoring", "").lower()
    foreign_clusters = re.findall(r"il\d+-rel\d+", custom, re.IGNORECASE)
    if not foreign_clusters:
        return False
    return any(cluster.lower() not in core for cluster in foreign_clusters)


def _resolve_environment_display_name(
    raw: dict[str, Any],
    *,
    technical_label: str,
    apigw_url: str,
) -> str:
    custom = str(raw.get("display_name") or "").strip()
    if custom and not _display_name_looks_mismatched(custom, apigw_url, technical_label):
        return custom
    if not custom:
        return _friendly_environment_label(technical_label) or technical_label
    return _friendly_environment_label(technical_label) or technical_label


def _normalize_environment(raw: dict[str, Any], *, from_disk: bool = False) -> dict[str, Any]:
    env_id = str(raw.get("id") or "").strip()
    if not env_id:
        raise ValueError("Each environment requires an id.")

    apigw_url = str(raw.get("apigw_url") or "").strip()
    if not apigw_url:
        raise ValueError(f"Environment {env_id} is missing apigw_url.")

    for field in ("keycloak_url", "keycloak_realm", "username"):
        value = str(raw.get(field) or "").strip()
        if not value:
            raise ValueError(f"Environment {env_id} is missing {field}.")

    last_used = raw.get("last_used_at")
    if not isinstance(last_used, (int, float)):
        last_used = 0

    password_raw = str(raw.get("password") or "")
    password = _decode_password(password_raw) if from_disk else password_raw

    technical_label = derive_environment_label(apigw_url)
    keycloak_url, keycloak_realm = resolve_keycloak_config(
        apigw_url,
        str(raw.get("keycloak_url") or "").strip(),
        str(raw.get("keycloak_realm") or "").strip(),
    )
    display_name = _resolve_environment_display_name(
        raw,
        technical_label=technical_label,
        apigw_url=apigw_url,
    )

    return {
        "id": env_id,
        "display_name": display_name,
        "label": technical_label,
        "apigw_url": apigw_url,
        "keycloak_url": keycloak_url,
        "keycloak_realm": keycloak_realm,
        "username": str(raw["username"]).strip(),
        "password": password,
        "last_used_at": int(last_used),
    }
