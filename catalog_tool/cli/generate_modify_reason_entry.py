#!/usr/bin/env python3
"""Generate a sample modify-reason genericElementEntry JSON file."""

from __future__ import annotations

import json
import uuid

from catalog_tool.builders.modify_reason_entry import build_modify_reason_entry
from catalog_tool.tables import (
    ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON,
    SAMPLE_MODIFY_REASON_ROW,
)


def main() -> None:
    table = ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON
    row = SAMPLE_MODIFY_REASON_ROW
    entry_id = str(uuid.uuid4())
    entry = build_modify_reason_entry(row["name"], row["localized_name"], entry_id=entry_id)

    table.entries_dir.mkdir(parents=True, exist_ok=True)
    output_path = table.entries_dir / f"{entry_id}.json"
    output_path.write_text(
        json.dumps(entry, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(f"Wrote entry: {output_path}")
    print(f"  name:          {row['name']}")
    print(f"  localizedName: {row['localized_name']}")
    print()
    print("Push via web app: ./run_web.sh  (or ./scripts/run_web.sh)")
    print("Or via CatalogOne MCP: create_business_request → post_generic_element_entry")
    print()
    print("UI link:")
    print(f"  {table.build_designer_ui_url()}")


if __name__ == "__main__":
    main()
