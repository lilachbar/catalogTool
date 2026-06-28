"""Reusable genericElementEntry field builders."""

from __future__ import annotations

from typing import Any

from catalog_tool.settings import DEFAULT_LOCALE


def build_string_field(field_name: str, value: str) -> dict[str, Any]:
    return {
        "name": field_name,
        "entry": [
            {
                "parameter": [
                    {"key": "value", "valueType": "String", "value": [value]}
                ],
                "field": [],
            }
        ],
    }


def build_localized_name_field(value: str, locale: str = DEFAULT_LOCALE) -> dict[str, Any]:
    return {
        "name": "localizedName",
        "entry": [
            {
                "parameter": [
                    {
                        "key": "value",
                        "valueType": "localizedString",
                        "value": [{"locale": locale, "value": value}],
                    }
                ],
                "field": [],
            }
        ],
    }
