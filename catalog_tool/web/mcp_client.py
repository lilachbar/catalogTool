"""Call catalogone MCP tools via the Node chat server."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from catalog_tool.settings import CHAT_SERVER_URL


class McpToolError(RuntimeError):
    """Raised when an MCP tool call fails."""

    def __init__(self, message: str, *, payload: dict[str, Any] | None = None):
        super().__init__(message)
        self.payload = payload or {}


def call_mcp_tool(
    tool_name: str,
    arguments: dict[str, Any],
    *,
    catalogone_env: dict[str, str] | None = None,
    timeout: int = 180,
) -> Any:
    """Invoke a catalogone MCP tool and return the parsed tool result."""
    body: dict[str, Any] = {
        "toolName": tool_name,
        "arguments": arguments,
    }
    if catalogone_env:
        body["catalogoneEnv"] = catalogone_env

    request = urllib.request.Request(
        f"{CHAT_SERVER_URL}/api/mcp/call",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise McpToolError(
                f"MCP tool {tool_name} failed ({exc.code})",
            ) from exc
        message = payload.get("error") or f"MCP tool {tool_name} failed ({exc.code})"
        raise McpToolError(message, payload=payload) from exc
    except urllib.error.URLError as exc:
        raise McpToolError(
            f"Chat server unavailable for MCP import ({exc.reason}). "
            "Ensure ./run_web.sh started the chat server on port 3001.",
        ) from exc

    if payload.get("status") == "error":
        raise McpToolError(
            payload.get("error") or f"MCP tool {tool_name} failed",
            payload=payload,
        )

    return payload.get("result", payload)


def import_catalog_data_via_mcp(
    *,
    business_request_id: str,
    zip_path: str,
    file_name: str,
    catalogone_env: dict[str, str],
) -> Any:
    """Import a zip file into a business request using MCP import_catalog_data."""
    result = call_mcp_tool(
        "import_catalog_data",
        {
            "businessRequestId": business_request_id,
            "zipPath": zip_path,
            "fileName": file_name,
            "confirmed": True,
        },
        catalogone_env=catalogone_env,
        timeout=180,
    )

    if isinstance(result, dict) and result.get("error"):
        raise McpToolError(
            str(result["error"]),
            payload={"result": result},
        )

    return result
