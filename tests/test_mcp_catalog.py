"""Tests for MCP catalog gateway helpers."""

from __future__ import annotations

from unittest.mock import patch
import unittest

from catalog_tool.web.mcp_catalog import (
    McpCatalogAdapter,
    create_business_request_via_mcp,
    _unwrap_tool_result,
)
from catalog_tool.web.mcp_client import McpToolError


def test_unwrap_tool_result_parses_json_string():
    assert _unwrap_tool_result('{"id":"br-1"}') == {"id": "br-1"}


def test_create_business_request_via_mcp_returns_id():
    env = {"C1_APIGW_URL": "https://example.test/apigw"}
    with patch(
        "catalog_tool.web.mcp_catalog.call_mcp_tool",
        return_value={"id": "br-123"},
    ) as mocked:
        br_id = create_business_request_via_mcp(name="Test BR", catalogone_env=env)
    assert br_id == "br-123"
    mocked.assert_called_once()
    assert mocked.call_args.args[0] == "create_business_request"


def test_mcp_adapter_get_entity_returns_none_on_404():
    env = {"C1_APIGW_URL": "https://example.test/apigw"}
    adapter = McpCatalogAdapter(env)
    with patch(
        "catalog_tool.web.mcp_catalog._call_catalog_mcp",
        side_effect=McpToolError("not found (404)", payload={}),
    ):
        assert adapter.get_entity_published("promotion", "e1") is None


def test_create_business_request_via_mcp_raises_without_id():
    env = {"C1_APIGW_URL": "https://example.test/apigw"}
    with patch(
        "catalog_tool.web.mcp_catalog.call_mcp_tool",
        return_value={"status": "ok"},
    ):
        with self.assertRaises(McpToolError):
            create_business_request_via_mcp(name="Test BR", catalogone_env=env)


if __name__ == "__main__":
    unittest.main()
