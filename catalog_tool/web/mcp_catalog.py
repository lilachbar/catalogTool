"""CatalogOne catalog operations via catalogone MCP tools (preferred over direct API)."""

from __future__ import annotations

import json
from typing import Any

from catalog_tool.web.mcp_client import McpToolError, call_mcp_tool


def _require_env(catalogone_env: dict[str, str] | None) -> dict[str, str]:
    if not catalogone_env:
        raise RuntimeError(
            "CatalogOne connection required — connect in the sidebar and ensure "
            "the chat server (./run_web.sh) is running for MCP tools."
        )
    return catalogone_env


def _unwrap_tool_result(result: Any) -> Any:
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result
    return result


def _mcp_error_payload(result: Any) -> dict[str, Any] | None:
    if not isinstance(result, dict):
        return None
    if result.get("error"):
        return result
    if result.get("statusCode") and int(result["statusCode"]) >= 400:
        return result
    return None


def _call_catalog_mcp(
    tool_name: str,
    arguments: dict[str, Any],
    *,
    catalogone_env: dict[str, str],
    timeout: int = 180,
) -> Any:
    result = call_mcp_tool(
        tool_name,
        arguments,
        catalogone_env=catalogone_env,
        timeout=timeout,
    )
    payload = _unwrap_tool_result(result)
    error = _mcp_error_payload(payload)
    if error:
        message = str(error.get("error") or error.get("message") or f"MCP {tool_name} failed")
        status = error.get("statusCode")
        if status:
            message = f"{message} ({status})"
        raise McpToolError(message, payload={"result": payload, "tool": tool_name})
    return payload


def create_business_request_via_mcp(
    *,
    name: str,
    catalogone_env: dict[str, str],
) -> str:
    payload = _call_catalog_mcp(
        "create_business_request",
        {"name": name},
        catalogone_env=catalogone_env,
    )
    if not isinstance(payload, dict):
        raise McpToolError(
            "Unexpected create_business_request MCP response",
            payload={"result": payload},
        )
    br_id = (payload.get("id") or payload.get("businessRequestId") or "").strip()
    if not br_id:
        raise McpToolError(
            "create_business_request did not return a business request ID",
            payload={"result": payload},
        )
    return br_id


def get_business_request_via_mcp(
    *,
    business_request_id: str,
    catalogone_env: dict[str, str],
) -> dict[str, Any]:
    payload = _call_catalog_mcp(
        "get_business_request",
        {"brId": business_request_id},
        catalogone_env=catalogone_env,
    )
    if isinstance(payload, dict):
        return payload
    raise McpToolError(
        "Unexpected get_business_request MCP response",
        payload={"result": payload},
    )


def publish_business_request_via_mcp(
    *,
    business_request_id: str,
    catalogone_env: dict[str, str],
) -> dict[str, Any]:
    return _call_catalog_mcp(
        "publish_business_request",
        {"brId": business_request_id, "confirmed": True},
        catalogone_env=catalogone_env,
        timeout=300,
    )


def create_generic_element_entry_via_mcp(
    *,
    entry: dict[str, Any],
    business_request_id: str,
    catalogone_env: dict[str, str],
) -> dict[str, Any]:
    return _call_catalog_mcp(
        "create_entity",
        {
            "entityType": "genericElementEntry",
            "businessRequestId": business_request_id,
            "body": entry,
        },
        catalogone_env=catalogone_env,
    )


class McpCatalogAdapter:
    """Adapter so br_compare can load entities via get_entity_details MCP."""

    def __init__(self, catalogone_env: dict[str, str]):
        env = _require_env(catalogone_env)
        self._env = env
        apigw = env.get("C1_APIGW_URL", "")
        self.connection = type("Conn", (), {"apigw_url": apigw, "username": env.get("C1_USERNAME", "")})()

    def ensure_business_request_local_context(self, business_request_id: str) -> None:
        try:
            _call_catalog_mcp(
                "custom_api_request",
                {
                    "method": "POST",
                    "basePath": "catalogManagement/businessRequestManagement/v1",
                    "endpoint": f"businessRequest/{business_request_id}/localContext",
                    "body": {},
                    "confirmed": True,
                },
                catalogone_env=self._env,
            )
        except McpToolError as exc:
            if "already exists" in str(exc).lower():
                return
            raise

    def get_entity_in_business_request(
        self,
        entity_type: str,
        entity_id: str,
        business_request_id: str,
    ) -> dict[str, Any] | None:
        return self._get_entity(entity_type, entity_id, business_request_id=business_request_id)

    def get_entity_published(
        self,
        entity_type: str,
        entity_id: str,
    ) -> dict[str, Any] | None:
        return self._get_entity(entity_type, entity_id, business_request_id=None)

    def search_entity_audit_records(
        self,
        entity_id: str,
        entity_type: str,
        *,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        payload = _call_catalog_mcp(
            "custom_api_request",
            {
                "method": "POST",
                "basePath": "entitySearchServices/v1",
                "endpoint": "audit/search",
                "body": {
                    "entityId": entity_id,
                    "entityType": entity_type,
                    "limit": limit,
                },
                "confirmed": True,
            },
            catalogone_env=self._env,
        )
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if isinstance(payload, dict):
            records = payload.get("records") or payload.get("items") or payload.get("data")
            if isinstance(records, list):
                return [item for item in records if isinstance(item, dict)]
        return []

    def audit_compare_entities(
        self,
        *,
        business_request_id: str,
        entity_id: str,
        entity_type: str,
        source_audit_id: str,
        target_audit_id: str,
    ) -> Any:
        return _call_catalog_mcp(
            "custom_api_request",
            {
                "method": "POST",
                "basePath": "entitySearchServices/v1",
                "endpoint": "audit/compare",
                "body": {
                    "businessRequestId": business_request_id,
                    "entityId": entity_id,
                    "entityType": entity_type,
                    "sourceAuditId": source_audit_id,
                    "targetAuditId": target_audit_id,
                },
                "confirmed": True,
            },
            catalogone_env=self._env,
        )

    def _get_entity(
        self,
        entity_type: str,
        entity_id: str,
        *,
        business_request_id: str | None,
    ) -> dict[str, Any] | None:
        args: dict[str, Any] = {
            "entityType": entity_type,
            "entityId": entity_id,
        }
        if business_request_id:
            args["businessRequestId"] = business_request_id
        try:
            payload = _call_catalog_mcp(
                "get_entity_details",
                args,
                catalogone_env=self._env,
            )
        except McpToolError as exc:
            if "404" in str(exc):
                return None
            raise
        if isinstance(payload, dict):
            return payload
        return None
