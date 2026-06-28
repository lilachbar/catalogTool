"""Environment URLs and project paths."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = PROJECT_ROOT / "samples"
DATA_DIR = PROJECT_ROOT / "data"
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
CHAT_SERVER_URL = os.environ.get("CHAT_SERVER_URL", "http://127.0.0.1:3001").rstrip("/")
