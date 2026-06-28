"""CatalogOne generic element table definitions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from catalog_tool.settings import CATALOG_UI_URL, SAMPLES_DIR


@dataclass(frozen=True)
class GenericElementTable:
    key: str
    label: str
    generic_element_id: str
    generic_entity_spec_id: str
    ui_entity_type: str
    entries_subdirectory: str
    description: str = ""

    @property
    def entries_dir(self) -> Path:
        return SAMPLES_DIR / self.entries_subdirectory

    def build_designer_ui_url(
        self,
        catalog_ui_url: str = CATALOG_UI_URL,
        business_request_id: str | None = None,
    ) -> str:
        url = (
            f"{catalog_ui_url.rstrip('/')}/designerLayout"
            f"?entityType={self.ui_entity_type}"
            f"&entityId={self.generic_element_id}"
            f"&tab=opened&workspaces=GENERIC_ENTITY%2CTOOLBOX&sizes=12%2C0"
            f"&params=%7B%7D%2C%7B%22entityType%22%3A%22{self.ui_entity_type}%22%2C"
            f"%22entityId%22%3A%22{self.generic_element_id}%22%2C"
            f"%22container%22%3Anull%2C%22panel%22%3A%22DETAILS%22%7D"
            f"&leftPanel=%7B%7D"
        )
        if business_request_id:
            url += f"&businessRequestId={quote(business_request_id.strip())}"
        return url


ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON = GenericElementTable(
    key="modify_reason",
    label="Modify Reason",
    generic_element_id="OrderCaptureProductConfiguratorModifyReason",
    generic_entity_spec_id="OrderCaptureProductConfiguratorModifyReasonSpec",
    ui_entity_type="productconfiguratortable",
    entries_subdirectory="modify_reason_entries",
    description="Order Capture product configurator modify reasons",
)

ORDER_CAPTURE_PRODUCT_CONFIGURATOR_ACTION = GenericElementTable(
    key="action",
    label="Action",
    generic_element_id="OrderCaptureProductConfiguratorAction",
    generic_entity_spec_id="OrderCaptureProductConfiguratorActionSpec",
    ui_entity_type="productconfiguratortable",
    entries_subdirectory="action_entries",
    description="Order Capture product configurator actions",
)

CATALOG_TABLES: dict[str, GenericElementTable] = {
    ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON.key: ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON,
    ORDER_CAPTURE_PRODUCT_CONFIGURATOR_ACTION.key: ORDER_CAPTURE_PRODUCT_CONFIGURATOR_ACTION,
}

DEFAULT_TABLE_KEY = ORDER_CAPTURE_PRODUCT_CONFIGURATOR_MODIFY_REASON.key


def get_catalog_table(table_key: str | None) -> GenericElementTable:
    key = (table_key or DEFAULT_TABLE_KEY).strip()
    table = CATALOG_TABLES.get(key)
    if not table:
        known = ", ".join(sorted(CATALOG_TABLES))
        raise ValueError(f"Unknown table {table_key!r}. Supported tables: {known}")
    return table


SAMPLE_MODIFY_REASON_ROW = {
    "name": "POV-CATTOOL-001",
    "localized_name": "Catalog Tool POV - Test Modify Reason",
}

SAMPLE_ACTION_ROW = {
    "name": "POV-CATTOOL-ACT-001",
    "localized_name": "Catalog Tool POV - Test Action",
}

SAMPLE_MODIFY_REASON_ENTRY_ID = "853233a3-df1a-4c95-9143-8d1a08e8ec9f"
SAMPLE_ACTION_ENTRY_ID = "b79f67dd-757f-4727-9975-f3d0881d498f"
