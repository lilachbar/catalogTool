"""Design-guide Excel import routes (analyze + JSON preview, never auto-publish)."""

from __future__ import annotations

from flask import Flask, jsonify, request

from catalog_tool.excel_dg.service import analyze_excel_dg


def register(app: Flask) -> None:
    @app.post("/api/excel/analyze")
    def api_excel_analyze():
        """Parse a WLS Actions & Reasons DG workbook and preview CatalogOne JSON + MCP steps."""
        upload = request.files.get("excel_file")
        if not upload or not upload.filename:
            return jsonify({"error": "excel_file is required"}), 400

        file_bytes = upload.read()
        if not file_bytes:
            return jsonify({"error": "Uploaded Excel file is empty"}), 400

        try:
            result = analyze_excel_dg(file_bytes, workbook_name=upload.filename)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except ImportError as exc:
            return jsonify({"error": str(exc)}), 500
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

        return jsonify(result)
