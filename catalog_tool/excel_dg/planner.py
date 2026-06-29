"""Build CatalogOne import plans and JSON previews from DG Excel rows."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from catalog_tool.builders.generic_element_entry import build_name_localized_entry
from catalog_tool.excel_dg.parser import DgRow, REFERENCE_SHEETS
from catalog_tool.tables import (
    ORDER_CAPTURE_PRODUCT_CONFIGURATOR_ACTION,
    ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON,
)


def _entry_preview(row: DgRow) -> dict[str, Any]:
    table = (
        ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON
        if row.category == "modify_reason"
        else ORDER_CAPTURE_PRODUCT_CONFIGURATOR_ACTION
    )
    localized = row.reason_description or row.reason_code
    entry = build_name_localized_entry(
        table,
        row.reason_code,
        localized,
    )
    return {
        "table_key": table.key,
        "table_label": table.label,
        "generic_element_id": table.generic_element_id,
        "reason_code": row.reason_code,
        "sheet": row.sheet,
        "order_action": row.order_action,
        "product_type": row.product_type,
        "request_id": row.request_id,
        "dg_attributes": row.attributes,
        "generic_element_entry": entry,
    }


def _findings(rows: list[DgRow], sheet_names: list[str]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    codes = [row.reason_code for row in rows if row.category in {"modify_reason", "action"}]
    duplicates = [code for code, count in Counter(codes).items() if count > 1]
    if duplicates:
        findings.append(
            {
                "kind": "duplicate_reason_code",
                "message": (
                    f"{len(duplicates)} reason codes appear on multiple sheets "
                    f"(e.g. {', '.join(sorted(duplicates)[:5])})."
                ),
            }
        )

    ignored = [name for name in sheet_names if name in REFERENCE_SHEETS]
    if ignored:
        findings.append(
            {
                "kind": "reference_sheets",
                "message": (
                    "Reference-only tabs were noted but not turned into catalog entries: "
                    + ", ".join(ignored)
                ),
            }
        )

    policy_count = sum(1 for row in rows if row.category == "policy")
    if policy_count:
        findings.append(
            {
                "kind": "policy_sheets",
                "message": (
                    f"{policy_count} proration policy directives were parsed for review; "
                    "map these to price policies separately."
                ),
            }
        )

    missing_desc = sum(
        1 for row in rows if row.category in {"modify_reason", "action"} and not row.reason_description
    )
    if missing_desc:
        findings.append(
            {
                "kind": "missing_description",
                "message": f"{missing_desc} reason rows have no description text.",
            }
        )

    return findings


def build_mcp_plan(
    *,
    workbook_name: str,
    modify_reason_count: int,
    action_count: int,
    sample_codes: list[str],
) -> list[dict[str, Any]]:
    br_name = f"DG import — {workbook_name}"
    steps: list[dict[str, Any]] = [
        {
            "step": 1,
            "phase": "prepare",
            "tool": "create_business_request",
            "arguments": {"name": br_name},
            "note": "Create a draft BR in the connected CatalogOne environment.",
        },
        {
            "step": 2,
            "phase": "validate",
            "tool": "search_catalog",
            "arguments": {
                "query": sample_codes[0] if sample_codes else "WNS-NEW",
                "entityTypes": ["genericElementEntry"],
            },
            "note": "Check whether reason codes from the DG already exist before posting.",
        },
    ]

    step_no = 3
    if modify_reason_count:
        steps.append(
            {
                "step": step_no,
                "phase": "import",
                "tool": "call_catalogone_mcp",
                "arguments": {
                    "toolName": "search_by_ids",
                    "arguments": {"ids": sample_codes[:10]},
                },
                "note": (
                    f"Resolve existing Modify Reason entries ({modify_reason_count} planned). "
                    "Repeat search per batch of IDs."
                ),
            }
        )
        step_no += 1

    steps.extend(
        [
            {
                "step": step_no,
                "phase": "import",
                "tool": "catalog_tool_api",
                "arguments": {
                    "method": "POST",
                    "path": "/api/push",
                    "body": {
                        "table_key": "modify_reason",
                        "create_business_request": False,
                        "entries": "<see planned_entries.generic_element_entry>",
                    },
                },
                "note": (
                    f"Post {modify_reason_count} Modify Reason and {action_count} Action "
                    "genericElementEntry payloads (preview JSON below). Uses connected session."
                ),
            },
            {
                "step": step_no + 1,
                "phase": "validate",
                "tool": "validate_business_request",
                "arguments": {"brId": "<business_request_id>"},
                "note": "Validate the BR after all entries are posted.",
            },
            {
                "step": step_no + 2,
                "phase": "publish",
                "tool": "publish_business_request",
                "arguments": {"brId": "<business_request_id>"},
                "note": "Optional — only when you explicitly choose to publish.",
            },
        ]
    )
    return steps


def build_excel_dg_plan(rows: list[DgRow], sheet_names: list[str], workbook_name: str) -> dict[str, Any]:
    modify_rows = [row for row in rows if row.category == "modify_reason"]
    action_rows = [row for row in rows if row.category == "action"]
    policy_rows = [row for row in rows if row.category == "policy"]

    by_sheet: dict[str, int] = defaultdict(int)
    for row in rows:
        by_sheet[row.sheet] += 1

    planned_entries = [_entry_preview(row) for row in modify_rows + action_rows]
    sample_codes = [row.reason_code for row in (modify_rows + action_rows)[:15]]

    return {
        "status": "ok",
        "publish_blocked": True,
        "workbook_name": workbook_name,
        "sheet_names": sheet_names,
        "summary": {
            "total_rows_parsed": len(rows),
            "modify_reason_entries": len(modify_rows),
            "action_entries": len(action_rows),
            "policy_directives": len(policy_rows),
            "unique_reason_codes": len({row.reason_code for row in modify_rows + action_rows}),
            "rows_per_sheet": dict(sorted(by_sheet.items())),
        },
        "findings": _findings(rows, sheet_names),
        "planned_entries": planned_entries,
        "policy_directives": [
            {
                "sheet": row.sheet,
                "policyName": row.attributes.get("policyName", ""),
                "action": row.order_action,
                "reason": row.reason_code,
                "prorationDirective": row.attributes.get("prorationDirective", ""),
                "product_type": row.product_type,
            }
            for row in policy_rows
        ],
        "mcp_plan": build_mcp_plan(
            workbook_name=workbook_name,
            modify_reason_count=len(modify_rows),
            action_count=len(action_rows),
            sample_codes=sample_codes,
        ),
    }
