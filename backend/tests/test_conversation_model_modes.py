"""Storage tests for conversation model mode defaults and persistence."""

import unittest
from unittest.mock import AsyncMock, patch

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
