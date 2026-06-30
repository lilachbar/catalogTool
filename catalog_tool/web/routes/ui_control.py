"""Browser UI context and action queue for the agentic assistant."""

from __future__ import annotations

import uuid

from flask import Flask, jsonify, request, session

PAGE_CONTEXT_KEY = "catalog_tool_page_context"
UI_ACTION_QUEUE_KEY = "catalog_tool_ui_action_queue"


def _action_queue() -> list[dict]:
    queue = session.get(UI_ACTION_QUEUE_KEY)
    return queue if isinstance(queue, list) else []


def register(app: Flask) -> None:
    @app.post("/api/ui-control/context")
    def api_ui_control_store_context():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "pageContext object is required"}), 400
        session[PAGE_CONTEXT_KEY] = payload
        session.modified = True
        return jsonify({"ok": True})

    @app.get("/api/ui-control/context")
    def api_ui_control_get_context():
        payload = session.get(PAGE_CONTEXT_KEY)
        return jsonify(payload if isinstance(payload, dict) else {})

    @app.post("/api/ui-control/queue")
    def api_ui_control_queue_action():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "action object is required"}), 400

        action_id = str(uuid.uuid4())
        queue = _action_queue()
        queue.append(
            {
                "id": action_id,
                "action": payload,
                "status": "pending",
                "result": None,
            }
        )
        session[UI_ACTION_QUEUE_KEY] = queue[-20:]
        session.modified = True
        return jsonify({"id": action_id, "status": "queued"})

    @app.get("/api/ui-control/pending")
    def api_ui_control_pending_action():
        for item in _action_queue():
            if item.get("status") == "pending":
                return jsonify({"id": item.get("id"), "action": item.get("action")})
        return jsonify({})

    @app.post("/api/ui-control/complete")
    def api_ui_control_complete_action():
        data = request.get_json(silent=True) or {}
        action_id = (data.get("id") or "").strip()
        if not action_id:
            return jsonify({"error": "Action id is required"}), 400

        queue = _action_queue()
        updated = False
        for item in queue:
            if item.get("id") == action_id:
                item["status"] = "done"
                item["result"] = data.get("result")
                updated = True
                break

        if not updated:
            return jsonify({"error": "Action not found"}), 404

        session[UI_ACTION_QUEUE_KEY] = queue
        session.modified = True
        return jsonify({"ok": True})

    @app.get("/api/ui-control/result/<action_id>")
    def api_ui_control_action_result(action_id: str):
        for item in _action_queue():
            if item.get("id") == action_id:
                if item.get("status") == "done":
                    return jsonify({"status": "done", "result": item.get("result")})
                return jsonify({"status": "pending"})
        return jsonify({"status": "missing"}), 404
