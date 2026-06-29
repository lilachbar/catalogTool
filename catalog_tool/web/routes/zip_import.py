"""Catalog ZIP import routes (analyze + PR package, never publish)."""

from __future__ import annotations

from flask import Flask, jsonify, request

from catalog_tool.settings import (
    CATALOG_BASELINE_DIR,
    CATALOG_EXPORT_GIT_REPO,
    CATALOG_PR_DIR,
)
from catalog_tool.zip_catalog.service import analyze_catalog_zip


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

        return jsonify(result)
