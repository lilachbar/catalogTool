"""Tests for MCP client helpers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from catalog_tool.web.mcp_client import McpToolError, call_mcp_tool, import_catalog_data_via_mcp


def test_call_mcp_tool_returns_parsed_result():
    payload = json.dumps(
        {
            "status": "ok",
            "toolName": "import_catalog_data",
            "result": {"jobId": "abc"},
        }
    ).encode()

    mock_response = MagicMock()
    mock_response.read.return_value = payload
    mock_response.__enter__ = MagicMock(return_value=mock_response)
    mock_response.__exit__ = MagicMock(return_value=False)

    with patch("catalog_tool.web.mcp_client.urllib.request.urlopen", return_value=mock_response):
        result = call_mcp_tool(
            "import_catalog_data",
            {"businessRequestId": "br-1", "zipPath": "/tmp/a.zip", "confirmed": True},
            catalogone_env={"C1_APIGW_URL": "https://example.test"},
        )

    assert result == {"jobId": "abc"}


def test_call_mcp_tool_raises_on_http_error():
    import urllib.error

    error_body = json.dumps({"error": "Job creation failed"}).encode()
    http_error = urllib.error.HTTPError(
        "http://127.0.0.1:3001/api/mcp/call",
        500,
        "Internal Server Error",
        hdrs=None,
        fp=MagicMock(read=MagicMock(return_value=error_body)),
    )

    with patch("catalog_tool.web.mcp_client.urllib.request.urlopen", side_effect=http_error):
        with pytest.raises(McpToolError, match="Job creation failed"):
            call_mcp_tool("import_catalog_data", {"businessRequestId": "br-1", "zipPath": "/tmp/a.zip"})


def test_import_catalog_data_via_mcp_passes_required_arguments():
    with patch("catalog_tool.web.mcp_client.call_mcp_tool", return_value={"jobId": "job-1"}) as mocked:
        result = import_catalog_data_via_mcp(
            business_request_id="br-1",
            zip_path="/tmp/import.zip",
            file_name="import.zip",
            catalogone_env={"C1_USERNAME": "user"},
        )

    assert result == {"jobId": "job-1"}
    mocked.assert_called_once_with(
        "import_catalog_data",
        {
            "businessRequestId": "br-1",
            "zipPath": "/tmp/import.zip",
            "fileName": "import.zip",
            "confirmed": True,
        },
        catalogone_env={"C1_USERNAME": "user"},
        timeout=180,
    )
