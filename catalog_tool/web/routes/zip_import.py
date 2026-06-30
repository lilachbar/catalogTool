"""Catalog ZIP import routes (analyze + PR package, never publish)."""

from __future__ import annotations

from flask import Flask, jsonify, request, session

from catalog_tool.settings import (
    CATALOG_BASELINE_DIR,
    CATALOG_EXPORT_GIT_REPO,
    CATALOG_PR_DIR,
)
from catalog_tool.zip_catalog.service import analyze_catalog_zip
from catalog_tool.web.helpers import client_from_session
from catalog_tool.web.import_context import (
    clear_import_context,
    load_import_bytes,
    store_import_file,
    store_zip_analyze_entities,
)


def register(app: Flask) -> None:
    @app.post("/api/zip/analyze")
    def api_zip_analyze():
        """Analyze a CatalogOne export zip and build a delta-only PR package."""
        upload = request.files.get("zip_file")
        if not upload or not upload.filename:
            return jsonify({"error": "zip_file is required"}), 400

        zip_bytes = upload.read()
        if not zip_bytes:
            return jsonify({"error": "Uploaded zip file is empty"}), 400

        try:
            import_ctx = store_import_file(
                session,
                import_type="zip",
                filename=upload.filename,
                data=zip_bytes,
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        create_git = request.form.get("create_git_branch", "").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

        try:
            result = analyze_catalog_zip(
                zip_bytes,
                zip_name=upload.filename,
                baseline_dir=CATALOG_BASELINE_DIR,
                pr_output_dir=CATALOG_PR_DIR,
                git_repo=CATALOG_EXPORT_GIT_REPO,
                create_git_branch=create_git,
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        result["import_type"] = "zip"
        result["import_filename"] = import_ctx["filename"]
        store_zip_analyze_entities(
            session,
            [
                {
                    "entity_id": item.get("entity_id"),
                    "entity_type": item.get("entity_type"),
                    "title": item.get("title"),
                }
                for item in result.get("entities") or []
                if item.get("entity_id") and item.get("entity_type")
            ],
        )
        return jsonify(result)

    @app.post("/api/zip/import")
    def api_zip_import():
        """Import an analyzed CatalogOne export zip into a business request."""
        if not session.get("logged_in"):
            return jsonify({"error": "Log in first"}), 401

        upload = request.files.get("zip_file")
        business_request_id = (request.form.get("business_request_id") or "").strip()
        if not business_request_id:
            return jsonify({"error": "business_request_id is required"}), 400

        if upload and upload.filename:
            zip_bytes = upload.read()
            if not zip_bytes:
                return jsonify({"error": "Uploaded zip file is empty"}), 400
            try:
                store_import_file(
                    session,
                    import_type="zip",
                    filename=upload.filename,
                    data=zip_bytes,
                )
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400
            file_name = upload.filename
        else:
            try:
                file_name, zip_bytes = load_import_bytes(session, expected_type="zip")
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

        try:
            client = client_from_session()
            import_result = client.import_catalog_zip(
                zip_bytes,
                business_request_id,
                file_name=file_name,
            )
        except (RuntimeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        return jsonify(
            {
                "status": "ok",
                "business_request_id": business_request_id,
                "zip_name": file_name,
                "import": import_result,
            }
        )
