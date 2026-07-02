"""HTML page routes."""

from __future__ import annotations

from flask import Flask, render_template, request

from catalog_tool.settings import (
    CATALOG_GATEWAY_URL,
    CATALOG_UI_URL,
    DEFAULT_USERNAME,
    KEYCLOAK_REALM,
    KEYCLOAK_URL,
)
from catalog_tool.tables import DEFAULT_TABLE_KEY, get_catalog_table
from catalog_tool.web.constants import WEB_ROOT
from catalog_tool.web.helpers import tables_payload
from catalog_tool.web.markdown_lite import render_markdown

USER_GUIDE_PATH = WEB_ROOT.parent.parent / "docs" / "USER_GUIDE.md"


def register(app: Flask) -> None:
    @app.get("/")
    def index_page():
        default_table = get_catalog_table(DEFAULT_TABLE_KEY)
        return render_template(
            "index.html",
            defaults={
                "apigw_url": CATALOG_GATEWAY_URL,
                "keycloak_url": KEYCLOAK_URL,
                "keycloak_realm": KEYCLOAK_REALM,
                "username": DEFAULT_USERNAME,
                "catalog_ui_url": CATALOG_UI_URL,
                "table_key": default_table.key,
                "table_id": default_table.generic_element_id,
                "table_ui_url": default_table.build_designer_ui_url(),
                "tables": tables_payload(),
            },
        )

    @app.get("/chat")
    def chat_popup_page():
        """Standalone chat window — can be moved to another monitor."""
        return render_template("chat_popup.html")

    @app.get("/guide")
    def user_guide_page():
        """Human-friendly, rendered user guide (functionality-focused)."""
        try:
            markdown_text = USER_GUIDE_PATH.read_text(encoding="utf-8")
        except OSError:
            markdown_text = "# User guide\n\nThe guide could not be loaded."
        body_html, toc = render_markdown(markdown_text)
        theme = request.args.get("theme", "").lower()
        if theme not in {"light", "dark"}:
            theme = ""
        return render_template(
            "guide.html",
            guide_body=body_html,
            guide_toc=toc,
            guide_theme=theme,
        )
