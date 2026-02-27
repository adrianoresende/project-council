"""Tests for OpenRouter user attribution propagation."""

import unittest
from unittest.mock import AsyncMock, patch

from backend import main, openrouter


class _RequestStub:
    async def is_disconnected(self):
        return False


class _FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": "ok",
                        "reasoning_details": None,
                    }
                }
            ],
            "usage": {
                "input_tokens": 1,
                "output_tokens": 1,
                "total_tokens": 2,
            },
        }


class OpenRouterPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_query_model_includes_user_when_present(self):
        captured: dict = {}

        class FakeAsyncClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                captured["url"] = url
                captured["headers"] = headers
                captured["json"] = json
                return _FakeResponse()

        with patch("backend.openrouter.httpx.AsyncClient", new=FakeAsyncClient):
            result = await openrouter.query_model(
                "openai/gpt-5.1",
                [{"role": "user", "content": "Hello"}],
                openrouter_user="  User@Example.COM  ",
            )

        self.assertEqual(result["content"], "ok")
        self.assertEqual(captured["json"].get("user"), "User@Example.COM")

    async def test_query_model_omits_user_when_blank(self):
        captured: dict = {}

        class FakeAsyncClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                captured["json"] = json
                return _FakeResponse()

        with patch("backend.openrouter.httpx.AsyncClient", new=FakeAsyncClient):
            await openrouter.query_model(
                "openai/gpt-5.1",
                [{"role": "user", "content": "Hello"}],
                openrouter_user="   ",
            )

        self.assertNotIn("user", captured["json"])

    async def test_query_models_parallel_forwards_openrouter_user(self):
        query_model_mock = AsyncMock(
            return_value={
                "content": "ok",
                "reasoning_details": None,
                "usage": main.empty_usage_summary(),
            }
        )

        with patch("backend.openrouter.query_model", new=query_model_mock):
            responses = await openrouter.query_models_parallel(
                ["m1", "m2"],
                [{"role": "user", "content": "Hello"}],
                session_id="conv-1",
                openrouter_user="user@example.com",
            )

        self.assertEqual(sorted(responses.keys()), ["m1", "m2"])
        self.assertEqual(query_model_mock.await_count, 2)
        for call in query_model_mock.await_args_list:
            self.assertEqual(call.kwargs.get("openrouter_user"), "user@example.com")


class OpenRouterUserIdentifierTests(unittest.TestCase):
    def test_resolve_openrouter_user_identifier_prefers_normalized_email(self):
        user = {"id": "user-1", "email": "  User+Tag@Example.COM  "}
        resolved = main._resolve_openrouter_user_identifier(user)
        self.assertEqual(resolved, "user+tag@example.com")

    def test_resolve_openrouter_user_identifier_falls_back_to_user_id(self):
        user = {"id": "  user-1  ", "email": "   "}
        resolved = main._resolve_openrouter_user_identifier(user)
        self.assertEqual(resolved, "user-1")

    def test_resolve_openrouter_user_identifier_returns_none_when_missing(self):
        resolved = main._resolve_openrouter_user_identifier({})
        self.assertIsNone(resolved)


class OpenRouterEndpointPropagationTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _free_user(email: str):
        return {
            "id": "user-free-1",
            "email": email,
            "user_metadata": {"plan": "free"},
            "app_metadata": {},
        }

    async def test_send_message_propagates_openrouter_user_to_all_stages(self):
        expected_user = "mixedcase@example.com"

        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5.1",
                    "response": "Stage 1",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "Stage 3",
                "usage": main.empty_usage_summary(),
            }
        )
        title_mock = AsyncMock(
            return_value={"title": "Test", "usage": main.empty_usage_summary()}
        )

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
            ),
            patch("backend.main._get_remaining_daily_queries", new=AsyncMock(return_value=3)),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Hello"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.generate_conversation_title", new=title_mock),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=AsyncMock(return_value=2)),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user("  MixedCase@Example.com  "),
            )

        self.assertEqual(
            stage1_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            stage2_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            stage3_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            title_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )

    async def test_send_message_stream_propagates_openrouter_user_to_all_stages(self):
        expected_user = "stream@example.com"

        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5.1",
                    "response": "Stage 1",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "Stage 3",
                "usage": main.empty_usage_summary(),
            }
        )
        title_mock = AsyncMock(
            return_value={"title": "Stream Title", "usage": main.empty_usage_summary()}
        )

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
            ),
            patch("backend.main._get_remaining_daily_queries", new=AsyncMock(return_value=3)),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Hello"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.generate_conversation_title", new=title_mock),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=AsyncMock(return_value=2)),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            response = await main.send_message_stream(
                conversation_id="conv-1",
                http_request=_RequestStub(),
                user_timezone="America/New_York",
                user=self._free_user("  Stream@Example.com  "),
            )
            async for _ in response.body_iterator:
                pass

        self.assertEqual(
            stage1_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            stage2_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            stage3_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )
        self.assertEqual(
            title_mock.await_args.kwargs.get("openrouter_user"),
            expected_user,
        )


if __name__ == "__main__":
    unittest.main()
