"""Build genericElementEntry payloads for name + localizedName tables."""

from __future__ import annotations

import uuid
from typing import Any

from catalog_tool.builders.fields import build_localized_name_field, build_string_field
from catalog_tool.settings import DEFAULT_LOCALE
from catalog_tool.tables import GenericElementTable


def build_name_localized_entry(
    table: GenericElementTable,
    name: str,
    localized_name: str,
    *,
    entry_id: str | None = None,
    extra_fields: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    entry_id = entry_id or str(uuid.uuid4())
    display_name = f"{name} | {localized_name}"
    fields: list[dict[str, Any]] = [
        build_string_field("name", name),
        build_localized_name_field(localized_name),
    ]
    if extra_fields:
        fields.extend(extra_fields)

    return {
        "id": entry_id,
        "localizedName": [{"locale": DEFAULT_LOCALE, "value": display_name}],
        "field": fields,
        "policy": [],
        "genericElement": {
            "id": table.generic_element_id,
            "name": table.generic_element_id,
        },
        "genericEntitySpecification": {
            "id": table.generic_entity_spec_id,
        },
    }
