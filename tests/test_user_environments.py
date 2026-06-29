"""Tests for per-user environment isolation."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from catalog_tool.web.app import create_app
from catalog_tool.web.environment_store import (
    load_user_store,
    save_user_store,
    user_store_path,
)
from catalog_tool.web.user_session import APP_USER_DISPLAY_KEY, APP_USER_SESSION_KEY


class UserEnvironmentStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name) / "data"
        self.environments_dir = self.data_dir / "environments"
        self.legacy_file = self.data_dir / "environments.json"
        self.legacy_marker = self.environments_dir / ".legacy_claimed"
        self.fixture_path = (
            Path(__file__).resolve().parent / "fixtures" / "environments.json"
        )
        self.legacy_file.parent.mkdir(parents=True, exist_ok=True)
        self.legacy_file.write_text(
            self.fixture_path.read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _store_patches(self):
        return patch.multiple(
            "catalog_tool.web.environment_store",
            DATA_DIR=self.data_dir,
            ENVIRONMENTS_DIR=self.environments_dir,
            ENVIRONMENTS_FILE=self.legacy_file,
            LEGACY_CLAIM_MARKER=self.legacy_marker,
            LDAP_AUTH_ENABLED=True,
        )

    def test_users_have_isolated_stores(self) -> None:
        with self._store_patches():
            alice_store = load_user_store("alice")
            self.assertEqual(len(alice_store["environments"]), 1)

            bob_store = load_user_store("bob")
            self.assertEqual(bob_store["environments"], [])

            alice_store["environments"][0]["display_name"] = "Alice env"
            save_user_store("alice", alice_store)

            reloaded_alice = load_user_store("alice")
            reloaded_bob = load_user_store("bob")
            self.assertEqual(
                reloaded_alice["environments"][0]["display_name"],
                "Alice env",
            )
            self.assertEqual(reloaded_bob["environments"], [])

    def test_legacy_file_claimed_once_for_ldap_users(self) -> None:
        with self._store_patches():
            first = load_user_store("alice")
            self.assertEqual(len(first["environments"]), 1)
            self.assertTrue(self.legacy_marker.exists())

            second = load_user_store("bob")
            self.assertEqual(second["environments"], [])

    def test_user_store_path_sanitizes_username(self) -> None:
        with self._store_patches():
            path = user_store_path("CORP\\Alice.User")
            self.assertEqual(path.name, "corp_alice.user.json")


class UserEnvironmentRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name) / "data"
        self.environments_dir = self.data_dir / "environments"
        self.legacy_file = self.data_dir / "environments.json"
        self.legacy_marker = self.environments_dir / ".legacy_claimed"
        self.legacy_file.parent.mkdir(parents=True, exist_ok=True)
        self.legacy_file.write_text(
            json.dumps({"activeEnvironmentId": None, "environments": []}),
            encoding="utf-8",
        )
        self.app = create_app()
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _store_patches(self):
        return patch.multiple(
            "catalog_tool.web.environment_store",
            DATA_DIR=self.data_dir,
            ENVIRONMENTS_DIR=self.environments_dir,
            ENVIRONMENTS_FILE=self.legacy_file,
            LEGACY_CLAIM_MARKER=self.legacy_marker,
            LDAP_AUTH_ENABLED=True,
        )

    def test_api_returns_only_current_user_environments(self) -> None:
        env_payload = {
            "activeEnvironmentId": "env-alice",
            "environments": [
                {
                    "id": "env-alice",
                    "display_name": "Alice",
                    "label": "alice",
                    "apigw_url": "https://apigw.example.com",
                    "keycloak_url": "https://keycloak.example.com",
                    "keycloak_realm": "realm",
                    "username": "alice",
                    "password": "secret",
                    "last_used_at": 1,
                }
            ],
        }
        bob_payload = {
            "activeEnvironmentId": "env-bob",
            "environments": [
                {
                    **env_payload["environments"][0],
                    "id": "env-bob",
                    "display_name": "Bob",
                    "label": "bob",
                }
            ],
        }

        with self._store_patches():
            save_user_store("alice", env_payload)

        with self._store_patches():
            save_user_store("bob", bob_payload)

        with self._store_patches():
            with self.client.session_transaction() as sess:
                sess[APP_USER_SESSION_KEY] = "alice"
                sess[APP_USER_DISPLAY_KEY] = "alice"
            response = self.client.get("/api/environments")
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertEqual(data["owner"], "alice")
            self.assertEqual(len(data["environments"]), 1)
            self.assertEqual(data["environments"][0]["id"], "env-alice")

        with self._store_patches():
            with self.client.session_transaction() as sess:
                sess[APP_USER_SESSION_KEY] = "bob"
                sess[APP_USER_DISPLAY_KEY] = "bob"
            response = self.client.get("/api/environments")
            data = response.get_json()
            self.assertEqual(data["owner"], "bob")
            self.assertEqual(data["environments"][0]["id"], "env-bob")


if __name__ == "__main__":
    unittest.main()
