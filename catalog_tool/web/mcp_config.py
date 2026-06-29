"""Read catalogone MCP installation from ~/.cursor/mcp.json (no Node required)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _default_mcp_path() -> Path:
    return Path.home() / ".mcp-servers" / "catalogone-mcp" / "dist" / "index.js"


def load_catalogone_mcp_config() -> dict[str, Any]:
    """Return whether catalogone MCP is installed per Cursor mcp.json."""
    config_path = Path.home() / ".cursor" / "mcp.json"
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "configured": False,
            "source": str(config_path),
            "serverPath": None,
            "error": "catalogone MCP is not configured in ~/.cursor/mcp.json",
        }

    catalogone = (raw.get("mcpServers") or {}).get("catalogone") or {}
    command = catalogone.get("command")
    args = catalogone.get("args") or []
    script_path = args[-1] if args else str(_default_mcp_path())

    if not command:
        return {
            "configured": False,
            "source": str(config_path),
            "serverPath": script_path,
            "error": "mcpServers.catalogone is missing in ~/.cursor/mcp.json",
        }

    script = Path(script_path).expanduser()
    if not script.is_file():
        return {
            "configured": False,
            "source": str(config_path),
            "serverPath": str(script),
            "error": f"catalogone MCP script not found: {script}",
        }

    return {
        "configured": True,
        "source": str(config_path),
        "serverPath": str(script),
        "command": command,
    }
