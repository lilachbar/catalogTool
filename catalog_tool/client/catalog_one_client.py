"""HTTP client for CatalogOne authoring APIs."""

from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
import http.cookiejar
import html as html_lib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class CatalogOneConnectionConfig:
    apigw_url: str
    username: str
    password: str
    keycloak_url: str = ""
    keycloak_realm: str = ""
    keycloak_client_id: str = "apigw"


def normalize_authoring_env_name(env_name: str) -> str:
    """Authoring hosts (APIGW, C1 web UI) use -authoring; Keycloak uses -runtime."""
    env_name = re.sub(r"-runtime$", "", env_name)
    if not env_name.endswith("-authoring"):
        env_name = f"{env_name}-authoring"
    return env_name


def normalize_apigw_url(apigw_url: str) -> str:
    """Ensure API gateway URL uses the -authoring host segment."""
    url = apigw_url.rstrip("/")
    match = re.search(r"https://amd-apigw-([^.]+)\.apps\.(.+)$", url)
    if not match:
        return url
    env_name, domain = match.groups()
    env_name = normalize_authoring_env_name(env_name)
    return f"https://amd-apigw-{env_name}.apps.{domain.rstrip('/')}"


def derive_keycloak_url(apigw_url: str) -> str:
    match = re.search(r"amd-apigw-([^.]+)\.apps\.(.+)$", normalize_apigw_url(apigw_url))
    if not match:
        raise ValueError("Could not derive Keycloak URL from API gateway URL")
    env_name, domain = match.groups()
    runtime_name = env_name.replace("-authoring", "")
    return f"https://keycloak-{runtime_name}-runtime.apps.{domain.rstrip('/')}"


def derive_keycloak_realm(apigw_url: str) -> str:
    match = re.search(r"amd-apigw-([^.]+)\.", normalize_apigw_url(apigw_url))
    if match:
        return match.group(1)
    return "amo-il41-rel285-authoring"


def derive_catalog_ui_url(apigw_url: str) -> str:
    """C1 web UI uses the same -authoring host as APIGW (prefix swap only)."""
    return normalize_apigw_url(apigw_url).replace("amd-apigw-", "c1-web-ui-", 1)


def derive_environment_label(apigw_url: str) -> str:
    match = re.search(r"amd-apigw-([^.]+)\.", normalize_apigw_url(apigw_url))
    if match:
        return match.group(1)
    return apigw_url.rstrip("/")


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _direct_opener() -> urllib.request.OpenerDirector:
    """Bypass HTTP(S)_PROXY — internal CatalogOne hosts must be reached directly."""
    https_handler = urllib.request.HTTPSHandler(context=_ssl_context())
    http_handler = urllib.request.HTTPHandler()
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        https_handler,
        http_handler,
    )


def _direct_urlopen(request: urllib.request.Request, *, timeout: int = 30):
    return _direct_opener().open(request, timeout=timeout)


def _format_http_error(exc: urllib.error.HTTPError, service: str) -> str:
    if exc.code == 401:
        return (
            f"{service} rejected the login (HTTP 401 Unauthorized). "
            "Check username, password, and realm."
        )
    hint = ""
    if exc.code in {502, 503, 504}:
        hint = (
            " Use Keycloak URL: keycloak-amo-il41-rel285-runtime (not -authoring-runtime)."
            " Confirm VPN/network access."
        )
    return f"{service} returned HTTP {exc.code} {exc.reason}.{hint}"


class CatalogOneClient:
    def __init__(self, connection: CatalogOneConnectionConfig):
        self.connection = connection
        self._access_token: str | None = None

    def keycloak_url(self) -> str:
        if self.connection.keycloak_url:
            return self.connection.keycloak_url.rstrip("/")
        return derive_keycloak_url(self.connection.apigw_url)

    def keycloak_realm(self) -> str:
        if self.connection.keycloak_realm:
            return self.connection.keycloak_realm
        return derive_keycloak_realm(self.connection.apigw_url)

    def login(self) -> str:
        token_url = (
            f"{self.keycloak_url()}/auth/realms/{self.keycloak_realm()}"
            "/protocol/openid-connect/token"
        )
        payload = {
            "grant_type": "password",
            "client_id": self.connection.keycloak_client_id,
            "username": self.connection.username,
            "password": self.connection.password,
        }
        request = urllib.request.Request(
            token_url,
            data=urllib.parse.urlencode(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            with _direct_urlopen(request, timeout=30) as response:
                self._access_token = json.loads(response.read().decode("utf-8"))["access_token"]
        except urllib.error.HTTPError as exc:
            raise RuntimeError(_format_http_error(exc, "Keycloak")) from exc
        return self._access_token

    @property
    def access_token(self) -> str:
        if not self._access_token:
            raise RuntimeError("Not logged in")
        return self._access_token

    def restore_access_token(self, token: str) -> None:
        self._access_token = token

    def _gateway_url(self, path: str, query: str = "") -> str:
        return f"{self.connection.apigw_url.rstrip('/')}{path}{query}"

    def _api_request(
        self,
        method: str,
        path: str,
        *,
        query: str = "",
        body: Any | None = None,
        timeout: int = 60,
    ) -> tuple[int, str]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self._gateway_url(path, query),
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with _direct_urlopen(request, timeout=timeout) as response:
                return response.status, response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")

    def create_business_request(
        self,
        *,
        name: str = "Catalog Tool Web Push",
        request_type: str = "default",
        due_days: int = 30,
    ) -> str:
        due_date = (datetime.now(timezone.utc) + timedelta(days=due_days)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        status, body = self._api_request(
            "POST",
            "/catalogManagement/businessRequestManagement/v1/businessRequest",
            body={
                "name": [{"locale": "en-US", "value": name}],
                "dueDate": due_date,
                "type": request_type,
            },
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Create business request failed ({status}): {body}")
        return json.loads(body)["id"]

    def post_generic_element_entry(
        self,
        entry: dict[str, Any],
        business_request_id: str,
    ) -> tuple[int, Any]:
        query = f"?businessRequestId={urllib.parse.quote(business_request_id)}"
        status, body = self._api_request(
            "POST",
            "/catalogManagement/genericEntity/v1/genericElementEntry",
            query=query,
            body=entry,
        )
        try:
            parsed: Any = json.loads(body) if body else None
        except json.JSONDecodeError:
            parsed = body
        return status, parsed

    def get_business_request(self, business_request_id: str) -> dict[str, Any]:
        status, body = self._api_request(
            "GET",
            f"/catalogManagement/businessRequestManagement/v1/businessRequest/{business_request_id}",
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Get business request failed ({status}): {body}")
        return json.loads(body)

    def publish_business_request(
        self,
        business_request_id: str,
        *,
        force_publish: bool = False,
        publish_after: str | None = None,
    ) -> tuple[int, Any]:
        params: dict[str, str] = {
            "businessRequestId": business_request_id,
            "forcePublish": "true" if force_publish else "false",
        }
        if publish_after:
            params["publishAfter"] = publish_after
        query = f"?{urllib.parse.urlencode(params)}"
        status, body = self._api_request(
            "POST",
            "/catalogManagement/releaseManagement/v1/releaseQueue/publish",
            query=query,
        )
        try:
            parsed: Any = json.loads(body) if body else None
        except json.JSONDecodeError:
            parsed = body or None
        return status, parsed


@dataclass(frozen=True)
class KeycloakSsoLoginForm:
    action: str
    username: str
    password: str
    redirect_uri: str


def prepare_keycloak_sso_login_form(
    connection: CatalogOneConnectionConfig,
    redirect_uri: str,
) -> KeycloakSsoLoginForm:
    """Fetch Keycloak login form action for browser SSO into CatalogOne UI."""
    client = CatalogOneClient(connection)
    auth_params = {
        "client_id": connection.keycloak_client_id,
        "response_type": "code",
        "scope": "openid",
        "redirect_uri": redirect_uri,
    }
    auth_url = (
        f"{client.keycloak_url()}/auth/realms/{client.keycloak_realm()}"
        f"/protocol/openid-connect/auth?{urllib.parse.urlencode(auth_params)}"
    )

    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar),
        urllib.request.HTTPSHandler(context=_ssl_context()),
        urllib.request.ProxyHandler({}),
    )

    try:
        with opener.open(auth_url, timeout=30) as response:
            page_html = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_format_http_error(exc, "Keycloak SSO")) from exc

    action_match = re.search(r'action="([^"]+)"', page_html)
    if not action_match:
        raise RuntimeError("Could not find Keycloak login form for CatalogOne UI SSO")

    return KeycloakSsoLoginForm(
        action=html_lib.unescape(action_match.group(1)),
        username=connection.username,
        password=connection.password,
        redirect_uri=redirect_uri,
    )


@dataclass(frozen=True)
class KeycloakSsoLoginForm:
    action: str
    username: str
    password: str
    redirect_uri: str


def prepare_keycloak_sso_login_form(
    connection: CatalogOneConnectionConfig,
    redirect_uri: str,
) -> KeycloakSsoLoginForm:
    """Fetch Keycloak login form action for browser SSO into CatalogOne UI."""
    client = CatalogOneClient(connection)
    auth_params = {
        "client_id": connection.keycloak_client_id,
        "response_type": "code",
        "scope": "openid",
        "redirect_uri": redirect_uri,
    }
    auth_url = (
        f"{client.keycloak_url()}/auth/realms/{client.keycloak_realm()}"
        f"/protocol/openid-connect/auth?{urllib.parse.urlencode(auth_params)}"
    )

    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cookie_jar),
        urllib.request.HTTPSHandler(context=_ssl_context()),
        urllib.request.ProxyHandler({}),
    )

    try:
        with opener.open(auth_url, timeout=30) as response:
            page_html = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_format_http_error(exc, "Keycloak SSO")) from exc

    action_match = re.search(r'action="([^"]+)"', page_html)
    if not action_match:
        raise RuntimeError("Could not find Keycloak login form for CatalogOne UI SSO")

    return KeycloakSsoLoginForm(
        action=html_lib.unescape(action_match.group(1)),
        username=connection.username,
        password=connection.password,
        redirect_uri=redirect_uri,
    )
