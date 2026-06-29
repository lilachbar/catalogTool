"""Tests for CatalogOne URL derivation and HTTP error messages."""

from __future__ import annotations

import io
import urllib.error

from catalog_tool.client.catalog_one_client import (
    CatalogOneClient,
    CatalogOneConnectionConfig,
    _format_http_error,
    derive_keycloak_url,
)


def test_derive_keycloak_url_for_env25():
    apigw = (
        "https://amd-apigw-stack-service-prt-in10-env25-authoring"
        ".apps.indelocpprt410.ocpd.corp.amdocs.com"
    )
    assert derive_keycloak_url(apigw) == (
        "https://keycloak-stack-service-prt-in10-env25-runtime"
        ".apps.indelocpprt410.ocpd.corp.amdocs.com"
    )


def test_format_http_error_uses_environment_keycloak_host():
    exc = urllib.error.HTTPError(
        url="https://example.com/token",
        code=503,
        msg="Service Unavailable",
        hdrs=None,
        fp=io.BytesIO(b""),
    )
    message = _format_http_error(
        exc,
        "Keycloak",
        keycloak_url=(
            "https://keycloak-stack-service-prt-in10-env25-runtime"
            ".apps.indelocpprt410.ocpd.corp.amdocs.com"
        ),
        keycloak_realm="stack-service-prt-in10-env25-authoring",
    )
    assert "keycloak-stack-service-prt-in10-env25-runtime" in message
    assert "amo-il41-rel285" not in message
    assert "stack-service-prt-in10-env25-authoring" in message


def test_connection_uses_stored_keycloak_url():
    config = CatalogOneConnectionConfig(
        apigw_url=(
            "https://amd-apigw-stack-service-prt-in10-env25-authoring"
            ".apps.indelocpprt410.ocpd.corp.amdocs.com"
        ),
        username="user",
        password="pass",
        keycloak_url=(
            "https://keycloak-stack-service-prt-in10-env25-runtime"
            ".apps.indelocpprt410.ocpd.corp.amdocs.com"
        ),
        keycloak_realm="stack-service-prt-in10-env25-authoring",
    )
    client = CatalogOneClient(config)
    assert "prt-in10-env25-runtime" in client.keycloak_url()
    assert client.keycloak_realm() == "stack-service-prt-in10-env25-authoring"
