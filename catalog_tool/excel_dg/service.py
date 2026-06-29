"""Analyze DG Excel workbooks and produce CatalogOne import previews."""

from __future__ import annotations

from pathlib import Path

from catalog_tool.excel_dg.parser import parse_excel_workbook
from catalog_tool.excel_dg.planner import build_excel_dg_plan


def analyze_excel_dg(source: bytes, *, workbook_name: str) -> dict:
    if not source:
        raise ValueError("Uploaded Excel file is empty")

    if not workbook_name.lower().endswith((".xlsx", ".xlsm")):
        raise ValueError("Only .xlsx / .xlsm workbooks are supported")

    rows, sheet_names = parse_excel_workbook(source)
    if not rows:
        raise ValueError("No DG reason rows were found in the workbook")

    display_name = Path(workbook_name).name
    return build_excel_dg_plan(rows, sheet_names, display_name)
