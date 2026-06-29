"""Tests for DG Excel import parsing and planning."""

from __future__ import annotations

import io
from pathlib import Path

import openpyxl
import pytest

from catalog_tool.excel_dg.service import analyze_excel_dg

FIXTURE_PATH = Path("/Users/liorba/Downloads/WLS_Actions and Reasons_PI29.xlsx")


def _mini_workbook_bytes() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Modify_Reasons"
    ws.append(
        [
            "Product (internal use)",
            "Action Type (Internal use)",
            "Reason_Code",
            "Reason_Code_Description",
        ]
    )
    ws.append(["AIA", "Cancel", "NSCA-CSCM", "Changed mind"])

    action = wb.create_sheet("Add")
    action.append([None, "General Details"])
    action.append(
        [
            "Request ID",
            "Order_Action (Localized Name)",
            "Reason_Code",
            "Reason_Description",
            "productType",
        ]
    )
    action.append([None, "add", "WNS-NEW", "New service", "WIRELESS"])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def test_analyze_mini_workbook() -> None:
    result = analyze_excel_dg(_mini_workbook_bytes(), workbook_name="mini.xlsx")
    assert result["status"] == "ok"
    assert result["summary"]["modify_reason_entries"] == 1
    assert result["summary"]["action_entries"] == 1
    assert len(result["planned_entries"]) == 2
    assert result["planned_entries"][0]["generic_element_entry"]["field"]
    assert len(result["mcp_plan"]) >= 4


@pytest.mark.skipif(not FIXTURE_PATH.is_file(), reason="user DG workbook not available")
def test_analyze_wls_pi29_workbook() -> None:
    payload = FIXTURE_PATH.read_bytes()
    result = analyze_excel_dg(payload, workbook_name=FIXTURE_PATH.name)
    assert result["summary"]["modify_reason_entries"] >= 200
    assert result["summary"]["action_entries"] >= 100
    assert result["summary"]["policy_directives"] >= 100
    assert result["publish_blocked"] is True
