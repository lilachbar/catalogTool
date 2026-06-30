"""HTTP client for CatalogOne authoring APIs."""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import http.cookiejar
import html as html_lib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from catalog_tool.client.entity_api import resolve_entity_get_spec


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


def keycloak_matches_apigw(
    apigw_url: str,
    keycloak_url: str,
    keycloak_realm: str = "",
) -> bool:
    """Return True when Keycloak settings belong to the same cluster as the APIGW URL."""
    env_label = derive_environment_label(apigw_url)
    env_core = env_label.replace("-authoring", "").lower()
    if not env_core:
        return True
    url = (keycloak_url or "").lower()
    realm = (keycloak_realm or "").lower()
    return env_core in url or env_core in realm


def resolve_keycloak_config(
    apigw_url: str,
    keycloak_url: str = "",
    keycloak_realm: str = "",
) -> tuple[str, str]:
    """Derive Keycloak URL/realm from APIGW when missing or pointing at another cluster."""
    apigw_url = normalize_apigw_url(apigw_url)
    url = (keycloak_url or "").strip()
    realm = (keycloak_realm or "").strip()

    if not re.search(r"amd-apigw-([^.]+)\.apps\.", apigw_url):
        return url, realm

    derived_url = derive_keycloak_url(apigw_url)
    derived_realm = derive_keycloak_realm(apigw_url)
    if not url or not keycloak_matches_apigw(apigw_url, url, realm):
        return derived_url, derived_realm
    return url, realm or derived_realm


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


def _format_http_error(
    exc: urllib.error.HTTPError,
    service: str,
    *,
    keycloak_url: str | None = None,
    keycloak_realm: str | None = None,
) -> str:
    if exc.code == 401:
        return (
            f"{service} rejected the login (HTTP 401 Unauthorized). "
            "Check username, password, and realm."
        )
    hint = ""
    if exc.code in {502, 503, 504}:
        if keycloak_url:
            host = urllib.parse.urlparse(keycloak_url).netloc or keycloak_url
            realm_note = f" (realm: {keycloak_realm})" if keycloak_realm else ""
            hint = (
                f" Keycloak at {host}{realm_note} may be down or unreachable from your network."
                " Use the *-runtime host (not *-authoring-runtime). Confirm VPN/cluster access."
            )
        else:
            hint = " Confirm VPN/network access to the environment's Keycloak *-runtime host."
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
            raise RuntimeError(
                _format_http_error(
                    exc,
                    "Keycloak",
                    keycloak_url=self.keycloak_url(),
                    keycloak_realm=self.keycloak_realm(),
                )
            ) from exc
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
        """Create a business request via direct REST.

        Retained as a fallback/reference implementation. The web app uses
        ``create_business_request_via_mcp`` in ``catalog_tool.web.mcp_catalog``.
        """
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
        """Push a genericElementEntry via direct REST.

        Retained as a fallback/reference implementation. The web app uses
        ``create_generic_element_entry_via_mcp`` in ``catalog_tool.web.mcp_catalog``.
        """
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
        """Fetch a business request via direct REST.

        Retained as a fallback/reference implementation. The web app uses
        ``get_business_request_via_mcp`` in ``catalog_tool.web.mcp_catalog``.
        """
        status, body = self._api_request(
            "GET",
            f"/catalogManagement/businessRequestManagement/v1/businessRequest/{business_request_id}",
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Get business request failed ({status}): {body}")
        return json.loads(body)

    def _get_entity_snapshot(
        self,
        entity_type: str,
        entity_id: str,
        *,
        business_request_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Load an entity using the same CatalogOne API shape (with or without BR context)."""
        normalized = (entity_type or "").strip()
        spec = resolve_entity_get_spec(normalized)
        if spec is None:
            raise ValueError(
                f"Entity type {normalized!r} is not supported for BR compare yet"
            )

        query = ""
        if business_request_id:
            query = f"?businessRequestId={urllib.parse.quote(business_request_id)}"

        if spec.method == "POST":
            status, body = self._api_request(
                "POST",
                f"/{spec.api_base}/{spec.version}/{spec.post_path or spec.path_template}",
                query=query,
                body={spec.post_body_key: [entity_id]},
            )
        else:
            path = spec.path_template.format(entity_id=entity_id)
            status, body = self._api_request(
                "GET",
                f"/{spec.api_base}/{spec.version}/{path}",
                query=query,
            )

        if status == 404:
            return None
        if status < 200 or status >= 300:
            context = f" in BR {business_request_id}" if business_request_id else " in production"
            raise RuntimeError(f"Get entity{context} failed ({status}): {body}")

        parsed = json.loads(body) if body else None
        if isinstance(parsed, list):
            return parsed[0] if parsed else None
        return parsed if isinstance(parsed, dict) else None

    def get_entity_in_business_request(
        self,
        entity_type: str,
        entity_id: str,
        business_request_id: str,
    ) -> dict[str, Any] | None:
        """Load the entity as it exists in the business request (local import)."""
        return self._get_entity_snapshot(
            entity_type,
            entity_id,
            business_request_id=business_request_id,
        )

    def get_entity_published(
        self,
        entity_type: str,
        entity_id: str,
    ) -> dict[str, Any] | None:
        """Load the entity as it currently exists in production (no BR context)."""
        return self._get_entity_snapshot(entity_type, entity_id)

    def search_entity_audit_records(
        self,
        entity_id: str,
        entity_type: str,
        *,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Return audit history records for an entity, newest first."""
        body = {
            "types": [entity_type],
            "criteria": {
                "type": "BooleanCondition",
                "and": [
                    {
                        "type": "EqualityCondition",
                        "field": "entityId",
                        "value": entity_id,
                    },
                ],
            },
            "sortBy": [
                {"field": "publishMetaData.publishDateTime", "order": "desc"},
                {"field": "shareMetaData.shareDateTime", "order": "desc"},
            ],
        }
        status, text = self._api_request(
            "POST",
            "/entitySearchServices/v2/audit/search",
            query=f"?offset=0&limit={max(1, min(limit, 50))}",
            body=body,
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Audit search failed ({status}): {text}")
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []

    def audit_compare_entities(
        self,
        *,
        business_request_id: str,
        entity_id: str,
        entity_type: str,
        source_audit_id: str,
        target_audit_id: str,
    ) -> Any:
        """Compare two audit versions for an entity."""
        body = {
            "elementId": {"entityId": entity_id, "entityType": entity_type},
            "context": {
                "level": "LOCAL",
                "workstreamName": "production",
                "businessRequestID": business_request_id,
                "user": self.connection.username,
            },
            "sourceAuditId": source_audit_id,
            "targetAuditId": target_audit_id,
        }
        status, text = self._api_request(
            "POST",
            "/entitySearchServices/v1/audit/compare",
            body=body,
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Audit compare failed ({status}): {text}")
        return json.loads(text) if text else []

    def publish_business_request(
        self,
        business_request_id: str,
        *,
        force_publish: bool = False,
        publish_after: str | None = None,
    ) -> tuple[int, Any]:
        """Publish a business request via direct REST.

        Retained as a fallback/reference implementation. The web app uses
        ``publish_business_request_via_mcp`` in ``catalog_tool.web.mcp_catalog``.
        """
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

    def _raw_request(
        self,
        method: str,
        url: str,
        *,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 120,
    ) -> tuple[int, str]:
        request_headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
        }
        if headers:
            request_headers.update(headers)
        request = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers=request_headers,
        )
        try:
            with _direct_urlopen(request, timeout=timeout) as response:
                return response.status, response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")

    @staticmethod
    def _multipart_body(
        boundary: str,
        parts: list[tuple[str, str, str | None]],
        *,
        file_bytes: bytes | None = None,
    ) -> bytes:
        chunks: list[bytes] = []
        for name, value, filename in parts:
            if filename is not None:
                chunks.append(
                    (
                        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                        f'filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'
                    ).encode()
                )
                chunks.append(file_bytes or b"")
            else:
                chunks.append(
                    (
                        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
                        f"{value}\r\n"
                    ).encode()
                )
        chunks.append(f"--{boundary}--\r\n".encode())
        return b"".join(chunks)

    def ensure_business_request_local_context(self, business_request_id: str) -> None:
        """Ensure the current user has a local context on the BR (required for import)."""
        status, body = self._api_request(
            "POST",
            f"/catalogManagement/businessRequestManagement/v1/businessRequest/{business_request_id}/localContext",
            body={},
        )
        if status == 400 and "already exists" in body:
            return
        if status < 200 or status >= 300:
            raise RuntimeError(
                f"Failed to create BR local context ({status}): {body}"
            )

    def import_catalog_zip(
        self,
        zip_bytes: bytes,
        business_request_id: str,
        *,
        file_name: str = "import.zip",
    ) -> dict[str, Any]:
        """Import a CatalogOne export zip into a business request."""
        if not zip_bytes:
            raise ValueError("Zip file is empty")

        if not file_name.lower().endswith(".zip"):
            file_name = f"{Path(file_name).stem}.zip" if file_name else "import.zip"

        self.ensure_business_request_local_context(business_request_id)

        base_url = f"{self.connection.apigw_url.rstrip('/')}/catalogManagement/import/v1"
        upload_id = str(uuid.uuid4())
        br_id = business_request_id

        upload_boundary = f"----CatalogTool{int(time.time() * 1000)}"
        upload_body = self._multipart_body(
            upload_boundary,
            [
                ("businessRequestId", br_id, None),
                ("stage", "UPLOAD", None),
                ("uploadId", upload_id, None),
                ("offset", "0", None),
                ("file", "", "blob"),
                ("totalParts", "1", None),
            ],
            file_bytes=zip_bytes,
        )
        upload_status, upload_text = self._raw_request(
            "POST",
            f"{base_url}/uploadPart",
            data=upload_body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={upload_boundary}",
            },
        )
        if upload_status < 200 or upload_status >= 300:
            raise RuntimeError(f"Zip upload failed ({upload_status}): {upload_text}")

        job_boundary = f"----CatalogTool{int(time.time() * 1000)}J"
        job_body = self._multipart_body(
            job_boundary,
            [
                ("businessRequestId", br_id, None),
                ("stage", "UPLOAD", None),
                ("fileName", file_name, None),
                ("uploadId", upload_id, None),
                ("totalParts", "1", None),
            ],
        )
        job_status, job_text = self._raw_request(
            "POST",
            f"{base_url}/job",
            data=job_body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={job_boundary}",
            },
        )
        if job_status < 200 or job_status >= 300:
            raise RuntimeError(f"Import job creation failed ({job_status}): {job_text}")

        try:
            job_data = json.loads(job_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Import job response was not JSON: {job_text}") from exc

        job_id = job_data.get("id") or job_data.get("jobId")
        if not job_id:
            raise RuntimeError(f"Import job created but no job id in response: {job_text}")

        file_location = job_data.get("fileLocation") or f"imported/{upload_id}.zip"
        trigger_boundary = f"----CatalogTool{int(time.time() * 1000)}T"
        trigger_body = self._multipart_body(
            trigger_boundary,
            [
                ("businessRequestId", br_id, None),
                ("stage", "EXTERNAL", None),
                ("fileLocation ", file_location, None),
            ],
        )
        trigger_status, trigger_text = self._raw_request(
            "POST",
            f"{base_url}/job/{job_id}/triggerStage",
            data=trigger_body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={trigger_boundary}",
            },
        )

        job_final_state = ""
        final_status: dict[str, Any] | None = None
        for _ in range(10):
            time.sleep(2)
            poll_status, poll_text = self._raw_request(
                "GET",
                f"{base_url}/job/{job_id}",
            )
            if poll_status < 200 or poll_status >= 300:
                continue
            try:
                final_status = json.loads(poll_text)
            except json.JSONDecodeError:
                continue
            job_final_state = str(final_status.get("status") or "")
            if job_final_state in {"COMPLETED", "FAILED", "DONE"}:
                break

        if trigger_status >= 300:
            raise RuntimeError(
                f"Import trigger failed ({trigger_status}): {trigger_text}"
            )
        if job_final_state == "FAILED":
            raise RuntimeError(
                f"Import job {job_id} failed: {json.dumps(final_status or {}, ensure_ascii=False)}"
            )

        return {
            "job_id": job_id,
            "upload_id": upload_id,
            "file_name": file_name,
            "trigger_status": trigger_status,
            "job_status": job_final_state or "UNKNOWN",
            "job": final_status,
        }


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
        raise RuntimeError(
            _format_http_error(
                exc,
                "Keycloak SSO",
                keycloak_url=client.keycloak_url(),
                keycloak_realm=client.keycloak_realm(),
            )
        ) from exc

    action_match = re.search(r'action="([^"]+)"', page_html)
    if not action_match:
        raise RuntimeError("Could not find Keycloak login form for CatalogOne UI SSO")

    return KeycloakSsoLoginForm(
        action=html_lib.unescape(action_match.group(1)),
        username=connection.username,
        password=connection.password,
        redirect_uri=redirect_uri,
    )
