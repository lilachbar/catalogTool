"""Catalog merge, publish, and UI launch routes."""

from __future__ import annotations

import json

from flask import Flask, jsonify, redirect, render_template, request, session

from catalog_tool.client.catalog_one_client import (
    CatalogOneConnectionConfig,
    derive_catalog_ui_url,
    normalize_apigw_url,
    prepare_keycloak_sso_login_form,
)
from catalog_tool.settings import CATALOG_GATEWAY_URL
from catalog_tool.web.helpers import (
    catalog_ui_launch_path,
    catalog_ui_url_for_request,
    client_from_session,
    derive_urls_payload,
    table_from_request,
    table_ui_url,
    tables_payload,
)
from catalog_tool.web.push_service import publish_business_request, push_to_catalog


def register(app: Flask) -> None:
    @app.get("/api/tables")
    def api_tables():
        return jsonify({"tables": tables_payload()})

    @app.get("/api/derive-urls")
    def api_derive_urls():
        apigw_url = (request.args.get("apigw_url") or "").strip()
        if not apigw_url:
            return jsonify({"error": "apigw_url is required"}), 400
        try:
            return jsonify(derive_urls_payload(apigw_url))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.get("/api/table-ui-url")
    def api_table_ui_url():
        business_request_id = (request.args.get("business_request_id") or "").strip() or None
        catalog_ui_url = catalog_ui_url_for_request()
        try:
            table = table_from_request()
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        resolved_table_ui_url = table_ui_url(table, business_request_id, catalog_ui_url)
        payload = {
            "table_key": table.key,
            "table_id": table.generic_element_id,
            "table_ui_url": resolved_table_ui_url,
            "business_request_id": business_request_id,
            "catalog_ui_url": catalog_ui_url,
        }
        if session.get("logged_in"):
            payload["launch_url"] = catalog_ui_launch_path(
                business_request_id,
                table_key=table.key,
            )
        return jsonify(payload)

    @app.get("/launch/catalog-ui")
    def launch_catalog_ui():
        if not session.get("logged_in"):
            return redirect("/")

        connection_payload = session.get("connection") or {}
        business_request_id = (request.args.get("business_request_id") or "").strip() or None
        try:
            table = table_from_request()
        except ValueError as exc:
            return render_template(
                "catalog_ui_launch.html",
                error=str(exc),
                login_form=None,
                target_url="/",
            )

        catalog_ui_url = derive_catalog_ui_url(
            normalize_apigw_url(connection_payload.get("apigw_url", CATALOG_GATEWAY_URL))
        )
        resolved_table_ui_url = table_ui_url(table, business_request_id, catalog_ui_url)
        connection = CatalogOneConnectionConfig(**connection_payload)

        try:
            login_form = prepare_keycloak_sso_login_form(connection, resolved_table_ui_url)
        except Exception as exc:
            return render_template(
                "catalog_ui_launch.html",
                error=str(exc),
                login_form=None,
                target_url=resolved_table_ui_url,
            )

        return render_template(
            "catalog_ui_launch.html",
            error=None,
            login_form=login_form,
            target_url=resolved_table_ui_url,
        )

    @app.post("/api/push")
    def api_push():
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        data = request.get_json(force=True)
        try:
            client = client_from_session()
            result = push_to_catalog(client, data)
        except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
        return jsonify(result)

    @app.post("/api/publish")
    def api_publish():
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        data = request.get_json(force=True)
        try:
            client = client_from_session()
            result = publish_business_request(client, data)
        except (RuntimeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
        return jsonify(result)
