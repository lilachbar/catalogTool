"""Register Flask route handlers."""

from __future__ import annotations

from flask import Flask

from catalog_tool.web.routes import auth, catalog, chat, chat_config, environments, excel_import, pages, user_auth, zip_import


def register_routes(app: Flask) -> None:
    user_auth.register(app)
    pages.register(app)
    auth.register(app)
    environments.register(app)
    catalog.register(app)
    zip_import.register(app)
    excel_import.register(app)
    chat.register(app)
    chat_config.register(app)
