"""Tests for .env read/update helpers used by chat configuration."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from catalog_tool.env_file import (
    collect_provider_config,
    existing_api_key_for_provider,
    upsert_env_vars,
)
from catalog_tool.web.routes.chat_config import apply_chat_login_config, needs_chat_reconfigure


class EnvFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env_path = Path(self.temp_dir.name) / ".env"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_upsert_preserves_other_provider_keys(self) -> None:
        self.env_path.write_text(
            "\n".join(
                [
                    "CHAT_PROVIDER=cursor",
                    "CURSOR_API_KEY=crsr_old_key_value_1234567890",
                    "OPENAI_API_KEY=sk-openai-existing-key",
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        upsert_env_vars(
            {
                "CHAT_PROVIDER": "openai",
                "OPENAI_API_KEY": "sk-openai-new-key",
            },
            path=self.env_path,
        )

        text = self.env_path.read_text(encoding="utf-8")
        self.assertIn("CURSOR_API_KEY=crsr_old_key_value_1234567890", text)
        self.assertIn("OPENAI_API_KEY=sk-openai-new-key", text)
        self.assertIn("CHAT_PROVIDER=openai", text)

    def test_collect_provider_config_reports_all_saved_keys(self) -> None:
        with patch(
            "catalog_tool.env_file.read_env_file",
            return_value={
                "CHAT_PROVIDER": "cursor",
                "CURSOR_API_KEY": "crsr_1234567890abcdef",
                "ANTHROPIC_API_KEY": "sk-ant-existing-key",
            },
        ):
            config = collect_provider_config()

        self.assertTrue(config["configured"])
        self.assertEqual(config["provider"], "cursor")
        self.assertTrue(config["providers"]["cursor"]["configured"])
        self.assertTrue(config["providers"]["claude"]["configured"])
        self.assertFalse(config["providers"]["openai"]["configured"])

    def test_existing_api_key_for_provider(self) -> None:
        env_values = {
            "OPENAI_API_KEY": "sk-test",
        }
        self.assertEqual(existing_api_key_for_provider("openai", env_values), "sk-test")
        self.assertEqual(existing_api_key_for_provider("claude", env_values), "")

    def test_needs_chat_reconfigure_detects_provider_switch(self) -> None:
        with patch(
            "catalog_tool.web.routes.chat_config.read_env_file",
            return_value={
                "CHAT_PROVIDER": "cursor",
                "CURSOR_API_KEY": "crsr_saved",
            },
        ):
            self.assertTrue(needs_chat_reconfigure("openai"))
            self.assertFalse(needs_chat_reconfigure("cursor"))
            self.assertTrue(needs_chat_reconfigure("cursor", api_key="crsr_new"))

    def test_apply_chat_login_config_uses_saved_key_when_blank(self) -> None:
        with patch(
            "catalog_tool.web.routes.chat_config.read_env_file",
            return_value={
                "CHAT_PROVIDER": "openai",
                "OPENAI_API_KEY": "sk-saved",
            },
        ), patch(
            "catalog_tool.web.routes.chat_config.configure_chat_provider",
            return_value=({"ok": True}, 200),
        ) as configure_mock:
            payload, status = apply_chat_login_config("openai", "")

        self.assertIsNone(payload)
        self.assertIsNone(status)
        configure_mock.assert_not_called()

        with patch(
            "catalog_tool.web.routes.chat_config.read_env_file",
            return_value={
                "CHAT_PROVIDER": "cursor",
                "CURSOR_API_KEY": "crsr_saved",
                "OPENAI_API_KEY": "sk-saved",
            },
        ), patch(
            "catalog_tool.web.routes.chat_config.configure_chat_provider",
            return_value=({"ok": True}, 200),
        ) as configure_mock:
            payload, status = apply_chat_login_config("openai", "")

        self.assertEqual(payload, {"ok": True})
        self.assertEqual(status, 200)
        configure_mock.assert_called_once_with("openai", "sk-saved", None)


if __name__ == "__main__":
    unittest.main()
