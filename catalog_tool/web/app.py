#!/usr/bin/env python3
"""CatalogOne push web application."""

from __future__ import annotations

from flask import Flask

from catalog_tool.settings import FLASK_DEBUG, FLASK_SECRET_KEY, WEB_SERVER_HOST, WEB_SERVER_PORT
from catalog_tool.web.constants import WEB_ROOT
from catalog_tool.web.routes import register_routes
from catalog_tool.web.user_session import register_auth_guard


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(WEB_ROOT / "templates"),
        static_folder=str(WEB_ROOT / "static"),
    )
    app.secret_key = FLASK_SECRET_KEY
    register_auth_guard(app)
    register_routes(app)
    return app


app = create_app()


def main() -> None:
    app.run(host=WEB_SERVER_HOST, port=WEB_SERVER_PORT, debug=FLASK_DEBUG)


if __name__ == "__main__":
    main()
