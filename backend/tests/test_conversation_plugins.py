"""Regression tests for conversation-level plugin resolution."""

import unittest
from unittest.mock import AsyncMock, patch

from backend import main


class ConversationPluginResolutionTests(unittest.TestCase):
    def test_resolve_stage_plugins_returns_none_when_no_plugin_is_enabled(self):
        plugins = main._resolve_stage_plugins(
            {"id": "conv-1", "web_search_enabled": False},
            needs_pdf_parser=False,
        )
        self.assertIsNone(plugins)

    def test_resolve_stage_plugins_includes_web_search_when_enabled(self):
        plugins = main._resolve_stage_plugins(
            {"id": "conv-1", "web_search_enabled": True},
            needs_pdf_parser=False,
        )
        self.assertEqual(plugins, main.WEB_SEARCH_PLUGIN)

    def test_resolve_stage_plugins_merges_web_search_and_pdf_parser(self):
        plugins = main._resolve_stage_plugins(
            {"id": "conv-1", "web_search_enabled": True},
            needs_pdf_parser=True,
        )
        self.assertEqual(plugins, main.WEB_SEARCH_PLUGIN + main.PDF_TEXT_PLUGIN)


class ConversationPluginPropagationTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _free_user():
        return {
            "id": "user-free-1",
            "email": "free@example.com",
            "user_metadata": {"plan": "free"},
            "app_metadata": {},
        }

    @staticmethod
    def _request_stub():
        class RequestStub:
            async def is_disconnected(self):
                return False

        return RequestStub()

    async def test_send_message_passes_web_search_plugin_to_stage_calls(self):
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5.1",
                    "response": "stage1",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "final",
                "usage": main.empty_usage_summary(),
            }
        )

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [],
                        "web_search_enabled": True,
                    }
                ),
            ),
            patch(
                "backend.main._get_remaining_daily_queries",
                new=AsyncMock(return_value=3),
            ),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Hello"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch(
                "backend.main.generate_conversation_title",
                new=AsyncMock(
                    return_value={"title": "Test", "usage": main.empty_usage_summary()}
                ),
            ),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=AsyncMock(return_value=2)),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=AsyncMock(return_value=([], {}))),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        self.assertEqual(stage1_mock.await_args.kwargs.get("plugins"), main.WEB_SEARCH_PLUGIN)
        self.assertEqual(stage3_mock.await_args.kwargs.get("plugins"), main.WEB_SEARCH_PLUGIN)

    async def test_send_message_stream_merges_web_search_and_pdf_plugins(self):
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5.1",
                    "response": "stage1",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "final",
                "usage": main.empty_usage_summary(),
            }
        )

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [],
                        "web_search_enabled": True,
                    }
                ),
            ),
            patch(
                "backend.main._get_remaining_daily_queries",
                new=AsyncMock(return_value=3),
            ),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], True)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Hello"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch(
                "backend.main.generate_conversation_title",
                new=AsyncMock(
                    return_value={"title": "Test", "usage": main.empty_usage_summary()}
                ),
            ),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=AsyncMock(return_value=2)),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=AsyncMock(return_value=([], {}))),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            response = await main.send_message_stream(
                conversation_id="conv-1",
                http_request=self._request_stub(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )
            async for _ in response.body_iterator:
                pass

        expected_plugins = main.WEB_SEARCH_PLUGIN + main.PDF_TEXT_PLUGIN
        self.assertEqual(stage1_mock.await_args.kwargs.get("plugins"), expected_plugins)
        self.assertEqual(stage3_mock.await_args.kwargs.get("plugins"), expected_plugins)


if __name__ == "__main__":
    unittest.main()
