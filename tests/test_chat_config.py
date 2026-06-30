"""Tests for login chat provider configuration."""

from __future__ import annotations

import unittest

from catalog_tool.web.routes.chat_config import _provider_env_updates


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


if __name__ == "__main__":
    unittest.main()
