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
    catalogone_mcp_env_from_session,
    client_from_session,
    derive_urls_payload,
    table_from_request,
    table_ui_url,
    tables_payload,
)
from catalog_tool.web.push_service import publish_business_request, push_to_catalog
from catalog_tool.web.import_context import (
    get_import_context,
    get_zip_analyze_entities,
    store_import_file,
)
from catalog_tool.web.mcp_client import McpToolError, import_catalog_data_via_mcp
from catalog_tool.br_compare import compare_business_request


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

    @app.post("/api/business-request")
    def api_create_business_request():
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        zip_upload = request.files.get("zip_file")
        if zip_upload or request.form.get("name"):
            name = (request.form.get("name") or "").strip()
            import_type = (request.form.get("import_type") or "").strip().lower()
        else:
            data = request.get_json(force=True) or {}
            name = (data.get("name") or "").strip()
            import_type = (data.get("import_type") or "").strip().lower()

        if not name:
            return jsonify({"error": "Business request name is required"}), 400

        if import_type and import_type not in {"zip", "excel"}:
            return jsonify({"error": "import_type must be zip or excel"}), 400

        business_request_id: str | None = None
        try:
            if import_type == "zip" and zip_upload and zip_upload.filename:
                zip_bytes = zip_upload.read()
                if not zip_bytes:
                    raise ValueError("Uploaded zip file is empty")
                store_import_file(
                    session,
                    import_type="zip",
                    filename=zip_upload.filename,
                    data=zip_bytes,
                )

            client = client_from_session()
            business_request_id = client.create_business_request(name=name)
            payload: dict = {
                "status": "ok",
                "business_request_id": business_request_id,
                "name": name,
            }

            if import_type == "zip":
                import_ctx = get_import_context(session)
                if not import_ctx or import_ctx.get("import_type") != "zip":
                    raise ValueError(
                        "No analyzed zip file found — upload and analyze again in Step 1"
                    )

                catalogone_env = catalogone_mcp_env_from_session()
                if not catalogone_env:
                    raise RuntimeError(
                        "CatalogOne connection required for MCP zip import"
                    )

                file_name = import_ctx["filename"]
                import_result = import_catalog_data_via_mcp(
                    business_request_id=business_request_id,
                    zip_path=import_ctx["path"],
                    file_name=file_name,
                    catalogone_env=catalogone_env,
                )
                payload["import_type"] = "zip"
                payload["import_source"] = "mcp"
                payload["zip_name"] = file_name
                payload["import"] = import_result
                payload["message"] = (
                    "Business request created and zip imported via MCP."
                )
            elif import_type == "excel":
                payload["import_type"] = "excel"
                payload["message"] = (
                    "Business request created. Import DG entries using Import entries to catalog."
                )
        except McpToolError as exc:
            err_payload: dict = {"error": str(exc), "mcp": exc.payload}
            if business_request_id:
                err_payload["business_request_id"] = business_request_id
                err_payload["import_failed"] = True
            return jsonify(err_payload), 502
        except (RuntimeError, ValueError) as exc:
            err_payload: dict = {"error": str(exc)}
            if business_request_id:
                err_payload["business_request_id"] = business_request_id
                err_payload["import_failed"] = True
            return jsonify(err_payload), 400
        except Exception as exc:
            err_payload: dict = {"error": str(exc)}
            if business_request_id:
                err_payload["business_request_id"] = business_request_id
                err_payload["import_failed"] = True
            return jsonify(err_payload), 500

        if import_type:
            return jsonify(payload)

        return jsonify(
            {
                "status": "ok",
                "business_request_id": business_request_id,
                "name": name,
            }
        )

    @app.get("/api/business-request/<business_request_id>")
    def api_get_business_request(business_request_id: str):
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        br_id = (business_request_id or "").strip()
        if not br_id:
            return jsonify({"error": "Business request ID is required"}), 400

        try:
            client = client_from_session()
            business_request = client.get_business_request(br_id)
        except (RuntimeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        return jsonify({"status": "ok", "business_request": business_request})

    @app.post("/api/business-request/<business_request_id>/compare")
    def api_compare_business_request(business_request_id: str):
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        br_id = (business_request_id or "").strip()
        if not br_id:
            return jsonify({"error": "Business request ID is required"}), 400

        data = request.get_json(force=True)
        compare_type = (data.get("compare_type") or "").strip().lower()
        if compare_type not in {"production", "audit"}:
            return jsonify({"error": "compare_type must be production or audit"}), 400

        entities = data.get("entities")
        if not isinstance(entities, list) or not entities:
            entities = get_zip_analyze_entities(session)
            if not entities:
                return jsonify(
                    {
                        "error": "No entities to compare — analyze a zip in Step 1 first",
                    }
                ), 400

        try:
            client = client_from_session()
            report = compare_business_request(
                client,
                business_request_id=br_id,
                compare_type=compare_type,
                entities=entities,
            )
        except (RuntimeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        return jsonify({"status": "ok", **report.to_dict()})

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
