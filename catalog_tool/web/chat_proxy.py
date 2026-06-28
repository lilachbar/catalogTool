"""Proxy chat and MCP requests to the Node server."""

from __future__ import annotations

import urllib.error
import urllib.request

from flask import Response, jsonify, request

from catalog_tool.settings import CHAT_SERVER_URL


def proxy_to_chat_server(
    subpath: str,
    *,
    method: str = "GET",
    timeout: int = 120,
    stream: bool = False,
) -> Response | tuple[Response, int]:
    upstream_url = f"{CHAT_SERVER_URL}{subpath}"
    headers = {"Cookie": request.headers.get("Cookie", "")}
    body = None
    if method.upper() != "GET":
        body = request.get_data()
        headers["Content-Type"] = request.content_type or "application/json"

    upstream_request = urllib.request.Request(
        upstream_url,
        data=body,
        headers=headers,
        method=method.upper(),
    )

    try:
        upstream = urllib.request.urlopen(upstream_request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        content_type = exc.headers.get("Content-Type", "application/json")
        return Response(payload, status=exc.code, content_type=content_type)
    except urllib.error.URLError as exc:
        return jsonify({"error": f"Chat server unavailable: {exc.reason}"}), 503

    if stream:
        def generate():
            while True:
                chunk = upstream.read(4096)
                if not chunk:
                    break
                yield chunk

        return Response(
            generate(),
            status=upstream.status,
            content_type=upstream.headers.get("Content-Type", "text/plain; charset=utf-8"),
        )

    payload = upstream.read()
    return Response(
        payload,
        status=upstream.status,
        content_type=upstream.headers.get("Content-Type", "application/json"),
    )
