"""Storage tests for conversation model mode defaults and persistence."""

import unittest
from fastapi import HTTPException
from unittest.mock import AsyncMock, Mock, patch

from backend import main
from backend.services.supabase import storage


class ConversationModelSelectionStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_conversation_defaults_to_council_mode(self):
        created_row = {
            "id": "conv-1",
            "created_at": "2026-03-05T15:00:00+00:00",
            "title": "New Conversation",
            "archived": False,
        }

        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(return_value=[created_row]),
        ) as rest_request_mock:
            conversation = await storage.create_conversation("conv-1", "user-1")

        rest_request_mock.assert_awaited_once_with(
            "POST",
            "conversations",
            json_body={
                "id": "conv-1",
                "user_id": "user-1",
                "title": "New Conversation",
                "archived": False,
                "model_mode": "council",
                "selected_model": None,
                "selected_model_title": None,
            },
            prefer="return=representation",
        )
        self.assertEqual(conversation["model_mode"], "council")
        self.assertIsNone(conversation["selected_model"])
        self.assertIsNone(conversation["selected_model_title"])

    async def test_create_conversation_normalizes_single_mode_selection(self):
        created_row = {
            "id": "conv-2",
            "created_at": "2026-03-05T15:00:00+00:00",
            "title": "New Conversation",
            "archived": False,
            "model_mode": "single",
            "selected_model": "openai/gpt-5.1",
            "selected_model_title": "GPT-5.1",
        }

        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(return_value=[created_row]),
        ) as rest_request_mock:
            conversation = await storage.create_conversation(
                "conv-2",
                "user-2",
                model_mode=" SINGLE ",
                selected_model=" openai/gpt-5.1 ",
                selected_model_title=" GPT-5.1 ",
            )

        rest_request_mock.assert_awaited_once_with(
            "POST",
            "conversations",
            json_body={
                "id": "conv-2",
                "user_id": "user-2",
                "title": "New Conversation",
                "archived": False,
                "model_mode": "single",
                "selected_model": "openai/gpt-5.1",
                "selected_model_title": "GPT-5.1",
            },
            prefer="return=representation",
        )
        self.assertEqual(conversation["model_mode"], "single")
        self.assertEqual(conversation["selected_model"], "openai/gpt-5.1")

    async def test_get_conversation_applies_model_defaults_when_fields_missing(self):
        conversation_row = {
            "id": "conv-3",
            "created_at": "2026-03-05T15:00:00+00:00",
            "title": "No Model Fields Yet",
            "archived": False,
        }

        with (
            patch(
                "backend.services.supabase.storage._get_conversation_row",
                new=AsyncMock(return_value=conversation_row),
            ),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=[]),
            ),
        ):
            conversation = await storage.get_conversation("conv-3", "user-3")

        self.assertIsNotNone(conversation)
        self.assertEqual(conversation["model_mode"], "council")
        self.assertIsNone(conversation["selected_model"])
        self.assertIsNone(conversation["selected_model_title"])
        self.assertEqual(conversation["messages"], [])

    async def test_get_conversation_keeps_single_mode_selection(self):
        conversation_row = {
            "id": "conv-4",
            "created_at": "2026-03-05T15:00:00+00:00",
            "title": "Single Model Chat",
            "archived": False,
            "model_mode": "single",
            "selected_model": "anthropic/claude-sonnet-4.5",
            "selected_model_title": "Claude Sonnet 4.5",
        }

        with (
            patch(
                "backend.services.supabase.storage._get_conversation_row",
                new=AsyncMock(return_value=conversation_row),
            ),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=[]),
            ),
        ):
            conversation = await storage.get_conversation("conv-4", "user-4")

        self.assertIsNotNone(conversation)
        self.assertEqual(conversation["model_mode"], "single")
        self.assertEqual(
            conversation["selected_model"],
            "anthropic/claude-sonnet-4.5",
        )

    async def test_list_conversations_includes_model_selection_and_skips_drafts(self):
        conversation_rows = [
            {
                "id": "conv-1",
                "created_at": "2026-03-05T15:00:00+00:00",
                "title": "Visible conversation",
                "archived": False,
                "model_mode": "single",
                "selected_model": "openai/gpt-5.1",
                "selected_model_title": "GPT-5.1",
            },
            {
                "id": "conv-2",
                "created_at": "2026-03-05T16:00:00+00:00",
                "title": "Draft conversation",
                "archived": False,
            },
        ]
        message_rows = [
            {
                "conversation_id": "conv-1",
                "role": "user",
                "stage1": None,
                "stage2": None,
                "stage3": None,
                "cost": 0,
                "total_tokens": 0,
            }
        ]

        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(side_effect=[conversation_rows, message_rows]),
        ):
            conversations = await storage.list_conversations("user-1")

        self.assertEqual(len(conversations), 1)
        self.assertEqual(conversations[0]["id"], "conv-1")
        self.assertEqual(conversations[0]["model_mode"], "single")
        self.assertEqual(conversations[0]["selected_model"], "openai/gpt-5.1")

    async def test_update_conversation_model_selection_clears_selection_for_council_mode(self):
        with (
            patch(
                "backend.services.supabase.storage._get_conversation_row",
                new=AsyncMock(return_value={"id": "conv-5"}),
            ),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=None),
            ) as rest_request_mock,
        ):
            payload = await storage.update_conversation_model_selection(
                "conv-5",
                "user-5",
                model_mode="council",
                selected_model="openai/gpt-5.1",
                selected_model_title="GPT-5.1",
            )

        rest_request_mock.assert_awaited_once_with(
            "PATCH",
            "conversations",
            params={"id": "eq.conv-5", "user_id": "eq.user-5"},
            json_body={
                "model_mode": "council",
                "selected_model": None,
                "selected_model_title": None,
            },
            prefer="return=minimal",
        )
        self.assertEqual(payload["model_mode"], "council")
        self.assertIsNone(payload["selected_model"])

    async def test_update_conversation_model_selection_persists_single_mode(self):
        with (
            patch(
                "backend.services.supabase.storage._get_conversation_row",
                new=AsyncMock(return_value={"id": "conv-6"}),
            ),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=None),
            ) as rest_request_mock,
        ):
            payload = await storage.update_conversation_model_selection(
                "conv-6",
                "user-6",
                model_mode=" SINGLE ",
                selected_model=" openai/gpt-5.1 ",
                selected_model_title=" GPT-5.1 ",
            )

        rest_request_mock.assert_awaited_once_with(
            "PATCH",
            "conversations",
            params={"id": "eq.conv-6", "user_id": "eq.user-6"},
            json_body={
                "model_mode": "single",
                "selected_model": "openai/gpt-5.1",
                "selected_model_title": "GPT-5.1",
            },
            prefer="return=minimal",
        )
        self.assertEqual(payload["model_mode"], "single")
        self.assertEqual(payload["selected_model"], "openai/gpt-5.1")

    async def test_update_conversation_model_selection_raises_when_conversation_missing(self):
        with (
            patch(
                "backend.services.supabase.storage._get_conversation_row",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=None),
            ) as rest_request_mock,
        ):
            with self.assertRaises(ValueError) as raised:
                await storage.update_conversation_model_selection(
                    "missing-conversation",
                    "user-7",
                    model_mode="single",
                    selected_model="openai/gpt-5.1",
                )

        self.assertIn("not found", str(raised.exception))
        rest_request_mock.assert_not_awaited()


class ConversationModelModeExecutionTests(unittest.IsolatedAsyncioTestCase):
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

    async def test_send_message_single_mode_skips_council_stages(self):
        stage1_mock = AsyncMock()
        stage2_mock = AsyncMock()
        stage3_mock = AsyncMock()
        single_query_mock = AsyncMock(
            return_value={
                "content": "Single answer",
                "usage": main.empty_usage_summary(),
            }
        )
        add_assistant_mock = AsyncMock()
        resolve_council_models_mock = Mock(
            return_value=["openai/gpt-oss-120b", "google/gemini-2.0-flash"]
        )
        resolve_chairman_model_mock = Mock(return_value="openai/gpt-5-nano")

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
                        "model_mode": "single",
                        "selected_model": "openai/gpt-5.1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-5.1",
                        "title": "GPT-5.1",
                        "active": True,
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
            patch("backend.main.query_model", new=single_query_mock),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=add_assistant_mock),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
            patch(
                "backend.main.get_council_models_for_plan",
                new=resolve_council_models_mock,
            ),
            patch(
                "backend.main.get_chairman_model_for_plan",
                new=resolve_chairman_model_mock,
            ),
        ):
            response = await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        stage1_mock.assert_not_awaited()
        stage2_mock.assert_not_awaited()
        stage3_mock.assert_not_awaited()
        resolve_council_models_mock.assert_not_called()
        resolve_chairman_model_mock.assert_not_called()
        single_query_mock.assert_awaited_once()
        self.assertEqual(response["stage1"], [])
        self.assertEqual(response["stage2"], [])
        self.assertEqual(response["stage3"].get("workflow_mode"), "single")
        self.assertEqual(response["metadata"].get("workflow_mode"), "single")
        assistant_args = add_assistant_mock.await_args.args
        self.assertEqual(assistant_args[2], [])
        self.assertEqual(assistant_args[3], [])
        self.assertEqual(assistant_args[4].get("workflow_mode"), "single")

    async def test_send_message_council_mode_uses_three_stage_pipeline(self):
        stage1_mock = AsyncMock(
            return_value=[
                {
                    "model": "openai/gpt-oss-120b",
                    "response": "Stage 1",
                    "usage": main.empty_usage_summary(),
                }
            ]
        )
        stage2_mock = AsyncMock(return_value=([], {}))
        stage3_mock = AsyncMock(
            return_value={
                "model": "openai/gpt-5-nano",
                "response": "Stage 3",
                "usage": main.empty_usage_summary(),
            }
        )
        single_query_mock = AsyncMock()
        resolve_council_models_mock = Mock(
            return_value=["openai/gpt-oss-120b", "google/gemini-2.0-flash"]
        )
        resolve_chairman_model_mock = Mock(return_value="openai/gpt-5-nano")

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
                        "model_mode": "council",
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
            patch("backend.main.query_model", new=single_query_mock),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
            patch("backend.main.stage2_collect_rankings", new=stage2_mock),
            patch("backend.main.stage3_synthesize_final", new=stage3_mock),
            patch("backend.main.storage.add_assistant_message", new=AsyncMock()),
            patch("backend.main.storage.get_conversation", new=AsyncMock(return_value={})),
            patch(
                "backend.main.get_council_models_for_plan",
                new=resolve_council_models_mock,
            ),
            patch(
                "backend.main.get_chairman_model_for_plan",
                new=resolve_chairman_model_mock,
            ),
        ):
            response = await main.send_message(
                conversation_id="conv-1",
                http_request=object(),
                user_timezone="America/New_York",
                user=self._free_user(),
            )

        resolve_council_models_mock.assert_called_once_with("free")
        resolve_chairman_model_mock.assert_called_once_with("free")
        stage1_mock.assert_awaited_once()
        stage2_mock.assert_awaited_once()
        stage3_mock.assert_awaited_once()
        single_query_mock.assert_not_awaited()
        self.assertEqual(response["metadata"].get("workflow_mode"), "council")

    async def test_send_message_single_mode_requires_selected_model(self):
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
                        "model_mode": "single",
                        "selected_model": "   ",
                        "messages": [],
                    }
                ),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message(
                    conversation_id="conv-1",
                    http_request=object(),
                    user=self._free_user(),
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Selected model is required", str(raised.exception.detail))

    async def test_send_message_single_mode_rejects_inactive_model(self):
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
                        "model_mode": "single",
                        "selected_model": "openai/gpt-5.1",
                        "messages": [],
                    }
                ),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-5.1",
                        "active": False,
                    }
                ),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message(
                    conversation_id="conv-1",
                    http_request=object(),
                    user=self._free_user(),
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("not available", str(raised.exception.detail))

    async def test_send_message_stream_single_mode_emits_stage3_only(self):
        stage1_mock = AsyncMock()
        stage2_mock = AsyncMock()
        stage3_mock = AsyncMock()
        single_query_mock = AsyncMock(
            return_value={
                "content": "Single answer",
                "usage": main.empty_usage_summary(),
            }
        )
        chunks: list[str] = []

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
                        "model_mode": "single",
                        "selected_model": "openai/gpt-5.1",
                        "messages": [{"role": "user", "content": "Earlier message"}],
                    }
                ),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(
                    return_value={
                        "model": "openai/gpt-5.1",
                        "title": "GPT-5.1",
                        "active": True,
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
            patch("backend.main.query_model", new=single_query_mock),
            patch("backend.main.stage1_collect_responses", new=stage1_mock),
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
            async for chunk in response.body_iterator:
                chunks.append(chunk)

        combined = "".join(chunks)
        self.assertIn('"type": "stage3_start"', combined)
        self.assertIn('"type": "stage3_complete"', combined)
        self.assertNotIn('"type": "stage1_start"', combined)
        self.assertNotIn('"type": "stage2_start"', combined)
        stage1_mock.assert_not_awaited()
        stage2_mock.assert_not_awaited()
        stage3_mock.assert_not_awaited()
        single_query_mock.assert_awaited_once()

    async def test_send_message_stream_single_mode_rejects_inactive_model(self):
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
                        "model_mode": "single",
                        "selected_model": "openai/gpt-5.1",
                        "messages": [],
                    }
                ),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(return_value=None),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.send_message_stream(
                    conversation_id="conv-1",
                    http_request=self._request_stub(),
                    user=self._free_user(),
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("not available", str(raised.exception.detail))
