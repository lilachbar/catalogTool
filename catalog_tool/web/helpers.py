"""Shared helpers for Flask route handlers."""

from __future__ import annotations

import base64
import json
import urllib.parse

from flask import request, session

from catalog_tool.client.catalog_one_client import (
    CatalogOneClient,
    CatalogOneConnectionConfig,
    derive_catalog_ui_url,
    derive_environment_label,
    derive_keycloak_realm,
    derive_keycloak_url,
    normalize_apigw_url,
)
from catalog_tool.settings import CATALOG_GATEWAY_URL, CATALOG_UI_URL, KEYCLOAK_REALM, KEYCLOAK_URL
from catalog_tool.tables import CATALOG_TABLES, DEFAULT_TABLE_KEY, GenericElementTable, get_catalog_table
from catalog_tool.web.import_context import clear_import_context


def table_from_request(*, json_body: dict | None = None) -> GenericElementTable:
    table_key = (request.args.get("table_key") or "").strip()
    if not table_key and json_body is not None:
        table_key = (json_body.get("table_key") or "").strip()
    return get_catalog_table(table_key or DEFAULT_TABLE_KEY)


def tables_payload() -> list[dict[str, str]]:
    return [
        {
            "key": table.key,
            "label": table.label,
            "id": table.generic_element_id,
            "description": table.description,
        }
        for table in CATALOG_TABLES.values()
    ]


def connection_from_request(data: dict) -> CatalogOneConnectionConfig:
    apigw_url = normalize_apigw_url(data.get("apigw_url", CATALOG_GATEWAY_URL))
    keycloak_url = data.get("keycloak_url", KEYCLOAK_URL)
    try:
        derived_keycloak_url = derive_keycloak_url(apigw_url)
        if not keycloak_url or "-authoring-runtime" in keycloak_url:
            keycloak_url = derived_keycloak_url
    except ValueError:
        pass

    return CatalogOneConnectionConfig(
        apigw_url=apigw_url,
        keycloak_url=keycloak_url,
        keycloak_realm=data.get("keycloak_realm", KEYCLOAK_REALM),
        username=data.get("username", ""),
        password=data.get("password", ""),
    )


def client_from_session(*, refresh: bool = True) -> CatalogOneClient:
    if refresh:
        if not validate_catalogone_session(refresh=True):
            raise RuntimeError(
                "CatalogOne session expired — connect again in the sidebar."
            )
    elif not session.get("logged_in"):
        raise RuntimeError("Not logged in")

    payload = session.get("connection")
    if not payload:
        raise RuntimeError("Not logged in")
    client = CatalogOneClient(CatalogOneConnectionConfig(**payload))
    token = session.get("access_token")
    if not token:
        raise RuntimeError("Session expired — log in again")
    client.restore_access_token(token)
    return client


def clear_catalogone_login() -> None:
    """Clear CatalogOne connection state while preserving LDAP app login."""
    session.pop("logged_in", None)
    session.pop("access_token", None)
    session.pop("connection", None)


def validate_catalogone_session(*, refresh: bool = True) -> bool:
    """Return True only when the session has a working CatalogOne token."""
    if not session.get("logged_in"):
        return False

    payload = session.get("connection")
    if not payload or not payload.get("username"):
        clear_catalogone_login()
        return False

    client = CatalogOneClient(CatalogOneConnectionConfig(**payload))
    token = session.get("access_token")
    if token:
        client.restore_access_token(token)

    def token_is_valid() -> bool:
        if not client._access_token:
            return False
        status, _ = client._api_request(
            "POST",
            "/entitySearchServices/v1/search/ids",
            body={
                "entityType": "promotion",
                "ids": ["00000000-0000-0000-0000-000000000000"],
            },
            timeout=20,
        )
        return status != 401

    if token and token_is_valid():
        return True

    if refresh and payload.get("password"):
        try:
            session["access_token"] = client.login()
            session["logged_in"] = True
            return True
        except Exception:
            pass

    clear_catalogone_login()
    return False


def catalogone_mcp_env_from_session() -> dict[str, str] | None:
    """Map the active web session connection to catalogone MCP C1_* env vars."""
    if not session.get("logged_in"):
        return None
    conn = session.get("connection") or {}
    apigw_url = (conn.get("apigw_url") or "").strip()
    if not apigw_url:
        return None

    apigw_url = normalize_apigw_url(apigw_url)
    keycloak_url = (conn.get("keycloak_url") or "").strip()
    if not keycloak_url or "-authoring-runtime" in keycloak_url:
        try:
            keycloak_url = derive_keycloak_url(apigw_url)
        except ValueError:
            keycloak_url = KEYCLOAK_URL

    return {
        "C1_APIGW_URL": apigw_url,
        "C1_WEB_UI_URL": derive_catalog_ui_url(apigw_url),
        "C1_KEYCLOAK_URL": keycloak_url,
        "C1_KEYCLOAK_REALM": conn.get("keycloak_realm") or derive_keycloak_realm(apigw_url),
        "C1_USERNAME": conn.get("username", ""),
        "C1_PASSWORD": conn.get("password", ""),
        **(
            {"C1_TOKEN": session.get("access_token")}
            if session.get("access_token")
            else {}
        ),
    }


def catalogone_mcp_env_proxy_headers() -> dict[str, str]:
    """Forward session catalogone credentials to the Node MCP proxy."""
    env = catalogone_mcp_env_from_session()
    if not env:
        return {}
    encoded = base64.b64encode(json.dumps(env, separators=(",", ":")).encode("utf-8")).decode("ascii")
    return {"X-Catalogone-Env": encoded}


def catalog_ui_url_for_request() -> str:
    apigw_url = (request.args.get("apigw_url") or "").strip()
    if not apigw_url and session.get("logged_in"):
        apigw_url = (session.get("connection") or {}).get("apigw_url", "")
    if apigw_url:
        return derive_catalog_ui_url(normalize_apigw_url(apigw_url))
    return CATALOG_UI_URL


def table_ui_url(
    table: GenericElementTable,
    business_request_id: str | None,
    catalog_ui_url: str,
) -> str:
    return table.build_designer_ui_url(
        catalog_ui_url=catalog_ui_url,
        business_request_id=business_request_id,
    )


def catalog_ui_launch_path(
    business_request_id: str | None = None,
    *,
    table_key: str | None = None,
) -> str:
    params: dict[str, str] = {}
    if business_request_id:
        params["business_request_id"] = business_request_id
    if table_key:
        params["table_key"] = table_key
    query = urllib.parse.urlencode(params)
    return f"/launch/catalog-ui?{query}" if query else "/launch/catalog-ui"


def derive_urls_payload(apigw_url: str) -> dict[str, str]:
    normalized = normalize_apigw_url(apigw_url)
    return {
        "apigw_url": normalized,
        "keycloak_url": derive_keycloak_url(normalized),
        "catalog_ui_url": derive_catalog_ui_url(normalized),
        "environment_label": derive_environment_label(normalized),
    }
