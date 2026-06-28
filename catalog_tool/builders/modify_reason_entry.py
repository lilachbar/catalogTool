"""Build genericElementEntry payloads for modify-reason table."""

from __future__ import annotations

from typing import Any

from catalog_tool.builders.generic_element_entry import build_name_localized_entry
from catalog_tool.tables import ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON


def build_modify_reason_entry(
    name: str,
    localized_name: str,
    *,
    entry_id: str | None = None,
) -> dict[str, Any]:
    return build_name_localized_entry(
        ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON,
        name,
        localized_name,
        entry_id=entry_id,
    )
