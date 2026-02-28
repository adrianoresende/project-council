"""Tests for free-plan daily query limit semantics."""

from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, Mock, call, patch

from fastapi import HTTPException

from backend import main, storage


class StorageDailyQuotaTimezoneTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_account_daily_credits_resets_at_local_midnight_boundary(self):
        now_utc = datetime(2026, 2, 20, 8, 30, tzinfo=timezone.utc)
        # 07:59 UTC is still previous day in America/Los_Angeles.
        row = {
            "user_id": "user-1",
            "credits": 1,
            "updated_at": "2026-02-20T07:59:00+00:00",
        }

        with (
            patch("backend.storage._now_utc", return_value=now_utc),
            patch("backend.storage._ensure_credit_account", new=AsyncMock()),
            patch("backend.storage._get_credit_row", new=AsyncMock(return_value=row)),
            patch("backend.storage._set_credit_row", new=AsyncMock()) as set_credit_row_mock,
        ):
            remaining = await storage.get_account_daily_credits(
                "user-1",
                3,
                timezone_name="America/Los_Angeles",
            )

        self.assertEqual(remaining, 3)
        set_credit_row_mock.assert_awaited_once_with("user-1", 3, now_utc)

    async def test_get_account_daily_credits_keeps_balance_within_same_local_day(self):
        now_utc = datetime(2026, 2, 20, 8, 30, tzinfo=timezone.utc)
        # 08:05 UTC is the same local day in America/Los_Angeles as 08:30 UTC.
        row = {
            "user_id": "user-1",
            "credits": 2,
            "updated_at": "2026-02-20T08:05:00+00:00",
        }

        with (
            patch("backend.storage._now_utc", return_value=now_utc),
            patch("backend.storage._ensure_credit_account", new=AsyncMock()),
            patch("backend.storage._get_credit_row", new=AsyncMock(return_value=row)),
            patch("backend.storage._set_credit_row", new=AsyncMock()) as set_credit_row_mock,
        ):
            remaining = await storage.get_account_daily_credits(
                "user-1",
                3,
                timezone_name="America/Los_Angeles",
            )

        self.assertEqual(remaining, 2)
        set_credit_row_mock.assert_not_awaited()


class FreePlanQuotaEndpointTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _free_user():
        return {
            "id": "user-free-1",
            "email": "free@example.com",
            "user_metadata": {"plan": "free"},
            "app_metadata": {},
        }

    @staticmethod
    def _pro_user():
        return {
            "id": "user-pro-1",
            "email": "pro@example.com",
            "user_metadata": {"plan": "pro"},
            "app_metadata": {},
        }

    @staticmethod
    def _request_stub():
        class RequestStub:
            async def is_disconnected(self):
                return False

        return RequestStub()

    async def test_send_message_first_execution_consumes_after_stage1_success(self):
        consume_mock = AsyncMock(return_value=2)
        add_user_message_mock = AsyncMock()
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5.1",
                    "response": "ok",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "final",
                "usage": main.empty_usage_summary(),
            }
        )
        ordered_calls = Mock()
        ordered_calls.attach_mock(stage1_mock, "stage1")
        ordered_calls.attach_mock(consume_mock, "consume")
        ordered_calls.attach_mock(add_user_message_mock, "add_user")

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
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
            patch("backend.main.storage.add_user_message", new=add_user_message_mock),
            patch(
                "backend.main.generate_conversation_title",
                new=AsyncMock(
                    return_value={"title": "Test", "usage": main.empty_usage_summary()}
                ),
            ),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            response = await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        self.assertEqual(response["credits"], 2)
        consume_mock.assert_awaited_once()
        consume_args = consume_mock.await_args
        self.assertEqual(consume_args.args[:3], ("user-free-1", 1, main.FREE_DAILY_QUERY_LIMIT))
        self.assertEqual(consume_args.kwargs.get("timezone_name"), "America/New_York")

        call_names = [entry[0] for entry in ordered_calls.mock_calls]
        self.assertIn("consume", call_names)
        self.assertIn("stage1", call_names)
        self.assertIn("add_user", call_names)
        self.assertLess(call_names.index("stage1"), call_names.index("consume"))
        self.assertLess(call_names.index("consume"), call_names.index("add_user"))

    async def test_send_message_first_execution_does_not_consume_when_stage1_has_no_successes(self):
        consume_mock = AsyncMock(return_value=2)
        add_user_message_mock = AsyncMock()

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
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
            patch("backend.main.storage.add_user_message", new=add_user_message_mock),
            patch(
                "backend.main.generate_conversation_title",
                new=AsyncMock(
                    return_value={"title": "Test", "usage": main.empty_usage_summary()}
                ),
            ),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch("backend.main.stage1_collect_responses", new=AsyncMock(return_value=[])),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            response = await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        consume_mock.assert_not_awaited()
        add_user_message_mock.assert_awaited_once()
        self.assertEqual(response["credits"], 3)

    async def test_send_message_first_execution_consume_failure_does_not_persist_user_message(self):
        consume_mock = AsyncMock(side_effect=ValueError("limit reached"))
        add_user_message_mock = AsyncMock()
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
            patch(
                "backend.main._get_remaining_daily_queries",
                new=AsyncMock(return_value=1),
            ),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Hello"),
            patch("backend.main.storage.add_user_message", new=add_user_message_mock),
            patch("backend.main.generate_conversation_title", new=title_mock),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch(
                "backend.main.stage1_collect_responses",
                new=AsyncMock(
                    return_value=[
                        {
                            "model": "openai/gpt-5.1",
                            "response": "ok",
                            "usage": main.empty_usage_summary(),
                        }
                    ]
                ),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message(
                    conversation_id="conv-1",
                    http_request=object(),
                    user_timezone="America/New_York",
                    user=self._free_user(),
                )

        self.assertEqual(raised.exception.status_code, 402)
        add_user_message_mock.assert_not_awaited()
        title_mock.assert_not_awaited()

    async def test_send_message_first_execution_limit_returns_structured_payload(self):
        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
            ),
            patch(
                "backend.main._get_remaining_daily_queries",
                new=AsyncMock(return_value=0),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message(
                    conversation_id="conv-1",
                    http_request=object(),
                    user_timezone="America/Sao_Paulo",
                    user=self._free_user(),
                )

        detail = raised.exception.detail
        self.assertEqual(raised.exception.status_code, 402)
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("code"), main.FREE_PLAN_LIMIT_ERROR_CODE)
        self.assertEqual(detail.get("plan"), "free")
        self.assertEqual(detail.get("unit"), "queries")
        self.assertEqual(detail.get("limit"), main.FREE_DAILY_QUERY_LIMIT)
        self.assertEqual(detail.get("remaining"), 0)
        self.assertEqual(detail.get("action"), "wait_until_reset")
        self.assertEqual(detail.get("timezone"), "America/Sao_Paulo")
        self.assertIsInstance(detail.get("reset_at"), str)

    async def test_send_message_existing_conversation_continues_without_new_query_consumption(self):
        consume_mock = AsyncMock(return_value=999)
        remaining_mock = AsyncMock(return_value=0)

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Continue", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch("backend.main._get_remaining_daily_queries", new=remaining_mock),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Continue"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch("backend.main.stage1_collect_responses", new=AsyncMock(return_value=[])),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
        ):
            response = await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        consume_mock.assert_not_awaited()
        self.assertEqual(remaining_mock.await_count, 1)
        self.assertEqual(response["credits"], 0)

    async def test_send_message_stream_limit_returns_structured_payload(self):
        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Hello", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
            ),
            patch(
                "backend.main._get_remaining_daily_queries",
                new=AsyncMock(return_value=0),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message_stream(
                    conversation_id="conv-1",
                    http_request=object(),
                    user_timezone="Europe/Madrid",
                    user=self._free_user(),
                )

        detail = raised.exception.detail
        self.assertEqual(raised.exception.status_code, 402)
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("code"), main.FREE_PLAN_LIMIT_ERROR_CODE)
        self.assertEqual(detail.get("timezone"), "Europe/Madrid")
        self.assertIsInstance(detail.get("reset_at"), str)

    async def test_send_message_stream_first_execution_does_not_consume_when_stage1_has_no_successes(self):
        consume_mock = AsyncMock(return_value=2)
        stage2_mock = AsyncMock(return_value=([], {}))
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5.1",
                "response": "No model answered in stage 1.",
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
                new=AsyncMock(return_value={"id": "conv-1", "messages": []}),
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
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch(
                "backend.main.generate_conversation_title",
                new=AsyncMock(
                    return_value={"title": "Test", "usage": main.empty_usage_summary()}
                ),
            ),
            patch("backend.main.storage.update_conversation_title", new=AsyncMock()),
            patch("backend.main.stage1_collect_responses", new=AsyncMock(return_value=[])),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
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

        consume_mock.assert_not_awaited()

    async def test_send_message_routes_free_plan_through_free_council_models(self):
        selected_models = ["openai/gpt-oss-120b", "google/gemini-2.0-flash"]
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-oss-120b",
                    "response": "ok",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Continue", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch("backend.main._get_remaining_daily_queries", new=AsyncMock(return_value=2)),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Continue"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch(
                "backend.main.stage3_synthesize_final",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-oss-120b",
                        "response": "final",
                        "usage": main.empty_usage_summary(),
                    }
                ),
            ),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
            patch(
                "backend.main.get_council_models_for_plan",
                return_value=selected_models,
            ) as resolve_models_mock,
        ):
            await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        resolve_models_mock.assert_called_once_with("free")
        self.assertEqual(stage1_mock.await_args.kwargs.get("council_models"), selected_models)
        self.assertEqual(stage2_mock.await_args.kwargs.get("council_models"), selected_models)

    async def test_send_message_routes_pro_plan_through_pro_council_models(self):
        selected_models = ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"]
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-5-nano",
                    "response": "ok",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))
        consume_mock = AsyncMock(return_value=199999)

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Continue", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch("backend.main._get_remaining_daily_tokens", new=AsyncMock(return_value=200000)),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Continue"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch(
                "backend.main.stage3_synthesize_final",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-5-nano",
                        "response": "final",
                        "usage": main.empty_usage_summary(),
                    }
                ),
            ),
            patch("backend.main.storage.consume_account_tokens", new=consume_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
            patch(
                "backend.main.get_council_models_for_plan",
                return_value=selected_models,
            ) as resolve_models_mock,
        ):
            await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._pro_user(),
            )

        resolve_models_mock.assert_called_once_with("pro")
        self.assertEqual(stage1_mock.await_args.kwargs.get("council_models"), selected_models)
        self.assertEqual(stage2_mock.await_args.kwargs.get("council_models"), selected_models)
        consume_mock.assert_awaited_once()

    async def test_send_message_stream_routes_free_plan_through_free_council_models(self):
        selected_models = ["openai/gpt-oss-120b", "google/gemini-2.0-flash"]
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-oss-120b",
                    "response": "ok",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))

        with (
            patch(
                "backend.main.extract_message_content_and_files",
                new=AsyncMock(return_value=("Continue", [])),
            ),
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(
                    return_value={
                        "id": "conv-1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch("backend.main._get_remaining_daily_queries", new=AsyncMock(return_value=2)),
            patch(
                "backend.main.prepare_uploaded_files_for_model",
                new=AsyncMock(return_value=([], [], False)),
            ),
            patch("backend.main.resolve_message_prompt", return_value="Continue"),
            patch("backend.main.storage.add_user_message", new=AsyncMock()),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch(
                "backend.main.stage3_synthesize_final",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-oss-120b",
                        "response": "final",
                        "usage": main.empty_usage_summary(),
                    }
                ),
            ),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
            patch(
                "backend.main.get_council_models_for_plan",
                return_value=selected_models,
            ) as resolve_models_mock,
        ):
            response = await main.send_message_stream(
                conversation_id="conv-1",
                http_request=self._request_stub(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )
            async for _ in response.body_iterator:
                pass

        resolve_models_mock.assert_called_once_with("free")
        self.assertEqual(stage1_mock.await_args.kwargs.get("council_models"), selected_models)
        self.assertEqual(stage2_mock.await_args.kwargs.get("council_models"), selected_models)


if __name__ == "__main__":
    unittest.main()
