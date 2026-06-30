"""Business-request push and publish logic (via catalogone MCP tools)."""

from __future__ import annotations

import json
import uuid

from catalog_tool.builders.generic_element_entry import build_name_localized_entry
from catalog_tool.client.catalog_one_client import derive_catalog_ui_url
from catalog_tool.tables import GenericElementTable, get_catalog_table
from catalog_tool.web.helpers import table_ui_url
from catalog_tool.web.mcp_catalog import (
    create_business_request_via_mcp,
    create_generic_element_entry_via_mcp,
    get_business_request_via_mcp,
    publish_business_request_via_mcp,
)
from catalog_tool.web.mcp_client import McpToolError


def parse_entries(table: GenericElementTable, data: dict) -> list[dict]:
    mode = data.get("mode", "form")
    if mode == "json":
        raw = data.get("entries_json", "")
        if not (raw or "").strip():
            return []
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(parsed, dict):
            return [parsed]
        if isinstance(parsed, list):
            return parsed
        raise ValueError("JSON must be an object or array of genericElementEntry objects")

    rows = data.get("rows", [])
    if not rows:
        return []
    entries = []
    for row in rows:
        name = (row.get("name") or "").strip()
        localized_name = (row.get("localized_name") or "").strip()
        if not name or not localized_name:
            raise ValueError(f"Each row in {table.label} needs name and localized name")
        entries.append(
            build_name_localized_entry(
                table,
                name,
                localized_name,
                entry_id=row.get("id") or str(uuid.uuid4()),
            )
        )
    return entries


def collect_push_targets(data: dict) -> list[tuple[GenericElementTable, list[dict]]]:
    table_payloads = data.get("table_payloads")
    if table_payloads is not None:
        if not isinstance(table_payloads, list):
            raise ValueError("table_payloads must be an array")
        targets: list[tuple[GenericElementTable, list[dict]]] = []
        for payload in table_payloads:
            if not payload.get("include", True):
                continue
            table = get_catalog_table(payload.get("table_key"))
            entries = parse_entries(table, payload)
            if not entries:
                raise ValueError(f"{table.label} is included but has no rows or JSON entries")
            targets.append((table, entries))
        if not targets:
            raise ValueError("Include at least one table with rows or JSON entries")
        return targets

    table = get_catalog_table(data.get("table_key"))
    entries = parse_entries(table, data)
    if not entries:
        raise ValueError("Add at least one row or JSON entry to push")
    return [(table, entries)]


def _entry_display_name(entry: dict) -> str:
    return next(
        (
            parameter["value"][0]
            for field in entry.get("field", [])
            if field.get("name") == "name"
            for parameter in field["entry"][0]["parameter"]
            if parameter.get("key") == "value"
        ),
        "",
    )


def push_entry_results_mcp(
    *,
    entries: list[dict],
    business_request_id: str,
    catalogone_env: dict[str, str],
) -> list[dict]:
    results = []
    for entry in entries:
        try:
            body = create_generic_element_entry_via_mcp(
                entry=entry,
                business_request_id=business_request_id,
                catalogone_env=catalogone_env,
            )
            results.append(
                {
                    "entry_id": entry.get("id"),
                    "name": _entry_display_name(entry),
                    "status": 200,
                    "ok": True,
                    "body": body,
                    "source": "mcp:create_entity",
                }
            )
        except McpToolError as exc:
            results.append(
                {
                    "entry_id": entry.get("id"),
                    "name": _entry_display_name(entry),
                    "status": 502,
                    "ok": False,
                    "body": {"error": str(exc)},
                    "source": "mcp:create_entity",
                }
            )
    return results


def push_to_catalog(
    catalogone_env: dict[str, str],
    data: dict,
    *,
    apigw_url: str,
) -> dict:
    push_targets = collect_push_targets(data)
    business_request_id = (data.get("business_request_id") or "").strip()
    create_business_request = data.get("create_business_request", True)
    business_request_name = (data.get("business_request_name") or "").strip()

    if not business_request_id:
        if not create_business_request:
            raise ValueError("Provide a business request ID or enable create new BR")
        if not business_request_name:
            raise ValueError("Business request name is required when creating a new business request")
        business_request_id = create_business_request_via_mcp(
            name=business_request_name,
            catalogone_env=catalogone_env,
        )

    catalog_ui_url = derive_catalog_ui_url(apigw_url)
    table_results = []
    all_results = []
    for table, entries in push_targets:
        results = push_entry_results_mcp(
            entries=entries,
            business_request_id=business_request_id,
            catalogone_env=catalogone_env,
        )
        table_results.append(
            {
                "table_key": table.key,
                "table_id": table.generic_element_id,
                "table_label": table.label,
                "table_ui_url": table_ui_url(table, business_request_id, catalog_ui_url),
                "results": results,
            }
        )
        all_results.extend(results)

    failed = [result for result in all_results if not result["ok"]]
    first_table = push_targets[0][0]
    return {
        "status": "ok" if not failed else "partial",
        "business_request_id": business_request_id,
        "import_source": "mcp",
        "table_key": first_table.key,
        "table_id": first_table.generic_element_id,
        "table_ui_url": table_ui_url(first_table, business_request_id, catalog_ui_url),
        "tables": table_results,
        "results": all_results,
    }


def publish_business_request(
    catalogone_env: dict[str, str],
    data: dict,
    *,
    apigw_url: str,
) -> dict:
    business_request_id = (data.get("business_request_id") or "").strip()
    if not business_request_id:
        raise ValueError("Business request ID is required to publish")

    table = get_catalog_table(data.get("table_key"))
    publish_business_request_via_mcp(
        business_request_id=business_request_id,
        catalogone_env=catalogone_env,
    )
    business_request = get_business_request_via_mcp(
        business_request_id=business_request_id,
        catalogone_env=catalogone_env,
    )
    catalog_ui_url = derive_catalog_ui_url(apigw_url)
    return {
        "status": "ok",
        "ok": True,
        "import_source": "mcp",
        "body": {"tool": "publish_business_request"},
        "business_request_id": business_request_id,
        "business_request_status": business_request.get("status"),
        "published_at": business_request.get("publishedAt"),
        "published_by": business_request.get("publishedBy"),
        "table_key": table.key,
        "table_id": table.generic_element_id,
        "table_ui_url": table_ui_url(
            table,
            business_request_id,
            catalog_ui_url,
        ),
    }
