"""Environment URLs and project paths."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
SAMPLES_DIR = PROJECT_ROOT / "samples"
DATA_DIR = PROJECT_ROOT / "data"
CATALOG_BASELINE_DIR = Path(
    os.environ.get("CATALOG_BASELINE_DIR", str(DATA_DIR / "catalog-baseline"))
)
CATALOG_PR_DIR = Path(os.environ.get("CATALOG_PR_DIR", str(DATA_DIR / "catalog-pr")))
_catalog_export_git_repo = os.environ.get("CATALOG_EXPORT_GIT_REPO", "").strip()
CATALOG_EXPORT_GIT_REPO = (
    Path(_catalog_export_git_repo) if _catalog_export_git_repo else None
)
ENVIRONMENTS_FIXTURE_FILE = PROJECT_ROOT / "tests" / "fixtures" / "environments.json"
ENVIRONMENTS_FILE = Path(
    os.environ.get("ENVIRONMENTS_FILE", str(DATA_DIR / "environments.json"))
)

ENVIRONMENT_NAME = "amo-il41-rel285-authoring"
OCP_DOMAIN = "ildelocpamo441.ocpd.corp.amdocs.com"
DEFAULT_LOCALE = "en-US"

CATALOG_GATEWAY_URL = os.environ.get(
    "CATALOG_GATEWAY_URL",
    f"https://amd-apigw-{ENVIRONMENT_NAME}.apps.{OCP_DOMAIN}",
)
CATALOG_UI_URL = os.environ.get(
    "CATALOG_UI_URL",
    f"https://c1-web-ui-{ENVIRONMENT_NAME}.apps.{OCP_DOMAIN}",
)
KEYCLOAK_URL = os.environ.get(
    "KEYCLOAK_URL",
    f"https://keycloak-amo-il41-rel285-runtime.apps.{OCP_DOMAIN}",
)
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", ENVIRONMENT_NAME)
DEFAULT_USERNAME = os.environ.get("C1_USERNAME", "k8k_runtimeapp")

FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "catalog-tool-dev-secret-change-me")
WEB_SERVER_HOST = os.environ.get("WEB_SERVER_HOST", "127.0.0.1")
WEB_SERVER_PORT = int(os.environ.get("PORT", "8080"))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
CHAT_SERVER_HOST = os.environ.get("CHAT_SERVER_HOST", "127.0.0.1").strip() or "127.0.0.1"
CHAT_SERVER_PORT = int(os.environ.get("CHAT_SERVER_PORT", "3001"))
CHAT_SERVER_URL = os.environ.get(
    "CHAT_SERVER_URL",
    f"http://{CHAT_SERVER_HOST}:{CHAT_SERVER_PORT}",
).rstrip("/")

# --- Amdocs LDAP (application login) ---
LDAP_AUTH_ENABLED = os.environ.get("LDAP_AUTH_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
LDAP_URI = os.environ.get("LDAP_URI", "ldap://corp.amdocs.com:389").strip()
LDAP_DOMAIN = os.environ.get("LDAP_DOMAIN", "corp.amdocs.com").strip()
LDAP_BIND_FORMAT = os.environ.get("LDAP_BIND_FORMAT", "upn").strip() or "upn"
LDAP_BIND_DN_TEMPLATE = os.environ.get("LDAP_BIND_DN_TEMPLATE", "").strip()
LDAP_USE_SSL = os.environ.get("LDAP_USE_SSL", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LDAP_TLS = os.environ.get("LDAP_TLS", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LDAP_RECEIVE_TIMEOUT = int(os.environ.get("LDAP_RECEIVE_TIMEOUT", "10"))
