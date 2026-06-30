"""Tests for on-disk environment persistence."""

from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from catalog_tool.web.environment_store import load_store, save_store, validate_store


class EnvironmentStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = (
            Path(__file__).resolve().parent / "fixtures" / "environments.json"
        )
        self.assertTrue(self.fixture_path.exists(), "fixture file must exist")

    def test_fixture_loads_valid_store(self) -> None:
        store = load_store(self.fixture_path)
        self.assertEqual(store["activeEnvironmentId"], "test-env-il41")
        self.assertEqual(len(store["environments"]), 1)
        self.assertEqual(store["environments"][0]["username"], "k8k_runtimeapp")

    def test_save_and_reload_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            store = load_store(self.fixture_path)
            store["environments"][0]["display_name"] = "Updated label"
            save_store(store, path=temp_path)

            reloaded = load_store(temp_path)
            self.assertEqual(reloaded["environments"][0]["display_name"], "Updated label")

    def test_load_store_fixes_mismatched_display_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            temp_path.write_text(
                json.dumps(
                    {
                        "activeEnvironmentId": "env-il18",
                        "environments": [
                            {
                                "id": "env-il18",
                                "display_name": "il41-rel285 (test fixture)",
                                "label": "amo-il18-rel292-authoring",
                                "apigw_url": "https://amd-apigw-amo-il18-rel292-authoring.apps.example.com",
                                "keycloak_url": "https://keycloak-amo-il18-rel292-runtime.apps.example.com",
                                "keycloak_realm": "amo-il18-rel292-authoring",
                                "username": "k8k_runtimeapp",
                                "password": "",
                                "last_used_at": 0,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            store = load_store(temp_path, bootstrap_fixture=False)
            self.assertEqual(store["environments"][0]["display_name"], "il18-rel292")

    def test_load_store_fixes_mismatched_keycloak(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            temp_path.write_text(
                json.dumps(
                    {
                        "activeEnvironmentId": "env-il18",
                        "environments": [
                            {
                                "id": "env-il18",
                                "display_name": "il18-rel292",
                                "label": "amo-il18-rel292-authoring",
                                "apigw_url": "https://amd-apigw-amo-il18-rel292-authoring.apps.ildelocpamo418.ocpd.corp.amdocs.com",
                                "keycloak_url": "https://keycloak-amo-il41-rel285-runtime.apps.ildelocpamo441.ocpd.corp.amdocs.com",
                                "keycloak_realm": "amo-il41-rel285-authoring",
                                "username": "k8k_runtimeapp",
                                "password": "",
                                "last_used_at": 0,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            store = load_store(temp_path, bootstrap_fixture=False)
            env = store["environments"][0]
            self.assertEqual(
                env["keycloak_url"],
                "https://keycloak-amo-il18-rel292-runtime.apps.ildelocpamo418.ocpd.corp.amdocs.com",
            )
            self.assertEqual(env["keycloak_realm"], "amo-il18-rel292-authoring")

    def test_load_store_repairs_stale_label_from_apigw(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            temp_path.write_text(
                json.dumps(
                    {
                        "activeEnvironmentId": "env-il41",
                        "environments": [
                            {
                                "id": "env-il41",
                                "display_name": "il41-rel285",
                                "label": "amo-il18-rel292-authoring",
                                "apigw_url": "https://amd-apigw-amo-il41-rel285-authoring.apps.ildelocpamo441.ocpd.corp.amdocs.com",
                                "keycloak_url": "https://keycloak-amo-il41-rel285-runtime.apps.ildelocpamo441.ocpd.corp.amdocs.com",
                                "keycloak_realm": "amo-il41-rel285-authoring",
                                "username": "k8k_runtimeapp",
                                "password": "",
                                "last_used_at": 0,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            store = load_store(temp_path, bootstrap_fixture=False)
            self.assertEqual(store["environments"][0]["label"], "amo-il41-rel285-authoring")
            self.assertEqual(store["environments"][0]["display_name"], "il41-rel285")

    def test_validate_store_rejects_invalid_payload(self) -> None:
        with self.assertRaises(ValueError):
            validate_store({"environments": "not-a-list"})

    def test_validate_store_caps_environment_count(self) -> None:
        environments = [
            {
                "id": f"env-{index}",
                "display_name": f"Env {index}",
                "label": f"env-{index}",
                "apigw_url": f"https://apigw-{index}.example.com",
                "keycloak_url": f"https://keycloak-{index}.example.com",
                "keycloak_realm": f"realm-{index}",
                "username": "user",
                "password": "",
                "last_used_at": index,
            }
            for index in range(20)
        ]
        validated = validate_store(
            {"activeEnvironmentId": "env-0", "environments": environments}
        )
        self.assertEqual(len(validated["environments"]), 12)

    def test_missing_file_bootstraps_from_fixture_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            fixture_data = json.loads(self.fixture_path.read_text(encoding="utf-8"))
            copied = load_store(temp_path)
            self.assertEqual(copied["activeEnvironmentId"], fixture_data["activeEnvironmentId"])
            self.assertEqual(len(copied["environments"]), len(fixture_data["environments"]))
            self.assertTrue(temp_path.exists())

    def test_password_is_base64_on_disk_and_plain_in_memory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "environments.json"
            store = load_store(self.fixture_path)
            store["environments"][0]["password"] = "Run100"
            save_store(store, path=temp_path)

            on_disk = json.loads(temp_path.read_text(encoding="utf-8"))
            self.assertEqual(
                on_disk["environments"][0]["password"],
                base64.b64encode(b"Run100").decode("ascii"),
            )

            reloaded = load_store(temp_path)
            self.assertEqual(reloaded["environments"][0]["password"], "Run100")


if __name__ == "__main__":
    unittest.main()
