"""Register Flask route handlers."""

from __future__ import annotations

from flask import Flask

from catalog_tool.web.routes import auth, catalog, chat, environments, pages


def register_routes(app: Flask) -> None:
    pages.register(app)
    auth.register(app)
    environments.register(app)
    catalog.register(app)
    chat.register(app)
