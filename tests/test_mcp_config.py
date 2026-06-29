"""Tests for catalogone MCP config detection."""

from __future__ import annotations

import json
from pathlib import Path

from catalog_tool.web.mcp_config import load_catalogone_mcp_config


def test_load_catalogone_mcp_config_missing_file(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "catalog_tool.web.mcp_config.Path.home",
        lambda: tmp_path,
    )
    result = load_catalogone_mcp_config()
    assert result["configured"] is False
    assert "not configured" in result["error"]


def test_load_catalogone_mcp_config_installed(monkeypatch, tmp_path):
    script = tmp_path / "dist" / "index.js"
    script.parent.mkdir(parents=True)
    script.write_text("// stub\n", encoding="utf-8")

    mcp_json = tmp_path / ".cursor" / "mcp.json"
    mcp_json.parent.mkdir(parents=True)
    mcp_json.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "catalogone": {
                        "command": "node",
                        "args": [str(script)],
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "catalog_tool.web.mcp_config.Path.home",
        lambda: tmp_path,
    )
    result = load_catalogone_mcp_config()
    assert result["configured"] is True
    assert result["serverPath"] == str(script)
