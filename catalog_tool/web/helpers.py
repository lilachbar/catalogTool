"""Shared helpers for Flask route handlers."""

from __future__ import annotations

import urllib.parse

from flask import request, session

from catalog_tool.client.catalog_one_client import (
    CatalogOneClient,
    CatalogOneConnectionConfig,
    derive_catalog_ui_url,
    derive_environment_label,
    derive_keycloak_url,
    normalize_apigw_url,
)
from catalog_tool.settings import CATALOG_GATEWAY_URL, CATALOG_UI_URL, KEYCLOAK_REALM, KEYCLOAK_URL
from catalog_tool.tables import CATALOG_TABLES, DEFAULT_TABLE_KEY, GenericElementTable, get_catalog_table


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


def client_from_session() -> CatalogOneClient:
    payload = session.get("connection")
    if not payload:
        raise RuntimeError("Not logged in")
    client = CatalogOneClient(CatalogOneConnectionConfig(**payload))
    token = session.get("access_token")
    if not token:
        raise RuntimeError("Session expired — log in again")
    client.restore_access_token(token)
    return client


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
