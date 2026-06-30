"""Tests for login chat provider configuration."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from catalog_tool.web.routes.chat_config import (
    _normalize_api_key,
    _provider_env_updates,
    apply_chat_model_selection,
)


class ChatConfigUpdatesTests(unittest.TestCase):
    def test_switching_provider_only_changes_chat_provider(self) -> None:
        env_values = {
            "CHAT_PROVIDER": "cursor",
            "CURSOR_API_KEY": "crsr_saved_cursor_key_value",
            "OPENAI_API_KEY": "sk-proj-openai_saved_key_value",
        }

        updates = _provider_env_updates(
            "openai",
            "sk-proj-openai_saved_key_value",
            None,
            env_values=env_values,
        )

        self.assertEqual(updates, {"CHAT_PROVIDER": "openai"})
        self.assertNotIn("CURSOR_API_KEY", updates)
        self.assertNotIn("OPENAI_API_KEY", updates)

    def test_new_openai_key_updates_only_openai_vars(self) -> None:
        env_values = {
            "CHAT_PROVIDER": "cursor",
            "CURSOR_API_KEY": "crsr_saved_cursor_key_value",
        }

        updates = _provider_env_updates(
            "openai",
            "sk-proj-brand_new_openai_key_value",
            None,
            env_values=env_values,
        )

        self.assertEqual(
            updates,
            {
                "CHAT_PROVIDER": "openai",
                "OPENAI_API_KEY": "sk-proj-brand_new_openai_key_value",
            },
        )
        self.assertNotIn("CURSOR_API_KEY", updates)

    def test_masked_api_key_is_not_written_to_env_updates(self) -> None:
        env_values = {
            "CHAT_PROVIDER": "cursor",
            "CURSOR_API_KEY": "crsr_saved_cursor_key_value",
        }
        masked = "crsr…7890"

        updates = _provider_env_updates(
            "cursor",
            masked,
            None,
            env_values=env_values,
        )

        self.assertEqual(updates, {"CHAT_PROVIDER": "cursor"})
        self.assertNotIn("CURSOR_API_KEY", updates)

    def test_normalize_api_key_rejects_masked_values(self) -> None:
        self.assertEqual(_normalize_api_key("crsr…7890"), "")
        self.assertEqual(_normalize_api_key("••••"), "")
        self.assertEqual(_normalize_api_key("sk-p…key"), "")


class ChatModelSelectionTests(unittest.TestCase):
    @patch("catalog_tool.web.routes.chat_config._reload_node_env")
    @patch("catalog_tool.web.routes.chat_config._reload_python_env")
    @patch("catalog_tool.web.routes.chat_config.upsert_env_vars")
    @patch("catalog_tool.web.routes.chat_config.read_env_file")
    def test_persists_explicit_model_to_env(
        self,
        mock_read_env,
        mock_upsert,
        mock_reload_python,
        mock_reload_node,
    ) -> None:
        mock_read_env.return_value = {
            "CHAT_PROVIDER": "cursor",
            "CURSOR_MODEL": "auto",
        }
        mock_reload_node.return_value = {"ok": True}

        payload, status = apply_chat_model_selection("claude-sonnet-4-5")

        self.assertEqual(status, 200)
        self.assertEqual(payload["model"], "claude-sonnet-4-5")
        self.assertEqual(payload["modelVar"], "CURSOR_MODEL")
        mock_upsert.assert_called_once_with({"CURSOR_MODEL": "claude-sonnet-4-5"})
        mock_reload_python.assert_called_once()
        mock_reload_node.assert_called_once()

    @patch("catalog_tool.web.routes.chat_config._reload_node_env")
    @patch("catalog_tool.web.routes.chat_config._reload_python_env")
    @patch("catalog_tool.web.routes.chat_config.upsert_env_vars")
    @patch("catalog_tool.web.routes.chat_config.read_env_file")
    def test_auto_uses_default_model(
        self,
        mock_read_env,
        mock_upsert,
        mock_reload_python,
        mock_reload_node,
    ) -> None:
        mock_read_env.return_value = {
            "CHAT_PROVIDER": "openai",
            "OPENAI_MODEL": "gpt-4o-mini",
        }
        mock_reload_node.return_value = {"ok": True}

        payload, status = apply_chat_model_selection("auto", default_model="gpt-4o")

        self.assertEqual(status, 200)
        self.assertEqual(payload["model"], "gpt-4o")
        mock_upsert.assert_called_once_with({"OPENAI_MODEL": "gpt-4o"})

    @patch("catalog_tool.web.routes.chat_config.upsert_env_vars")
    @patch("catalog_tool.web.routes.chat_config.read_env_file")
    def test_skips_write_when_unchanged(self, mock_read_env, mock_upsert) -> None:
        mock_read_env.return_value = {
            "CHAT_PROVIDER": "cursor",
            "CURSOR_MODEL": "claude-sonnet-4-5",
        }

        payload, status = apply_chat_model_selection("claude-sonnet-4-5")

        self.assertEqual(status, 200)
        self.assertTrue(payload.get("unchanged"))
        mock_upsert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
