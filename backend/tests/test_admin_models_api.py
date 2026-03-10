"""Storage contract tests for managed admin models."""

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from backend import main
from backend.services.supabase import storage


class ManagedModelsStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_app_model_normalizes_payload_and_returns_contract(self):
        now_utc = datetime(2026, 3, 5, 12, 30, tzinfo=timezone.utc)
        created_row = {
            "id": 7,
            "title": "GPT-5.1",
            "model": "openai/gpt-5.1",
            "category": "openai",
            "active": True,
            "created_at": "2026-03-05T12:30:00+00:00",
            "updated_at": "2026-03-05T12:30:00+00:00",
        }

        with (
            patch("backend.services.supabase.storage._now_utc", return_value=now_utc),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=[created_row]),
            ) as rest_request_mock,
        ):
            row = await storage.create_app_model(
                "  GPT-5.1  ",
                "  openai/gpt-5.1  ",
                "  openai  ",
            )

        rest_request_mock.assert_awaited_once_with(
            "POST",
            "app_models",
            json_body={
                "title": "GPT-5.1",
                "model": "openai/gpt-5.1",
                "category": "openai",
                "active": True,
                "updated_at": now_utc.isoformat(),
            },
            prefer="return=representation",
        )
        self.assertEqual(row["id"], 7)
        self.assertEqual(row["title"], "GPT-5.1")
        self.assertEqual(row["model"], "openai/gpt-5.1")
        self.assertEqual(row["category"], "openai")
        self.assertTrue(row["active"])

    async def test_list_active_app_models_filters_active_rows(self):
        rows = [
            {
                "id": 1,
                "title": "Flash",
                "model": "google/gemini-2.5-flash",
                "category": "google",
                "active": True,
                "created_at": "2026-03-05T12:30:00+00:00",
                "updated_at": "2026-03-05T12:30:00+00:00",
            }
        ]

        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(return_value=rows),
        ) as rest_request_mock:
            result = await storage.list_active_app_models()

        rest_request_mock.assert_awaited_once_with(
            "GET",
            "app_models",
            params={
                "select": "id,title,model,category,active,created_at,updated_at",
                "order": "active.desc,category.asc,title.asc,id.asc",
                "active": "eq.true",
            },
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["model"], "google/gemini-2.5-flash")

    async def test_get_app_model_by_model_ignores_blank_lookup(self):
        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(return_value=[]),
        ) as rest_request_mock:
            row = await storage.get_app_model_by_model("   ")

        self.assertIsNone(row)
        rest_request_mock.assert_not_awaited()

    async def test_update_app_model_persists_updated_timestamp(self):
        now_utc = datetime(2026, 3, 6, 8, 10, tzinfo=timezone.utc)
        updated_row = {
            "id": 4,
            "title": "Claude Sonnet 4.5",
            "model": "anthropic/claude-sonnet-4.5",
            "category": "anthropic",
            "active": False,
            "created_at": "2026-03-01T12:30:00+00:00",
            "updated_at": "2026-03-06T08:10:00+00:00",
        }

        with (
            patch("backend.services.supabase.storage._now_utc", return_value=now_utc),
            patch(
                "backend.services.supabase.storage._rest_request",
                new=AsyncMock(return_value=[updated_row]),
            ) as rest_request_mock,
        ):
            row = await storage.update_app_model(
                4,
                title=" Claude Sonnet 4.5 ",
                category=" anthropic ",
                active=False,
            )

        rest_request_mock.assert_awaited_once_with(
            "PATCH",
            "app_models",
            params={"id": "eq.4"},
            json_body={
                "title": "Claude Sonnet 4.5",
                "category": "anthropic",
                "active": False,
                "updated_at": now_utc.isoformat(),
            },
            prefer="return=representation",
        )
        self.assertIsNotNone(row)
        self.assertFalse(row["active"])
        self.assertEqual(row["category"], "anthropic")

    async def test_update_app_model_rejects_empty_patch(self):
        with self.assertRaises(ValueError) as raised:
            await storage.update_app_model(2)

        self.assertIn("At least one field", str(raised.exception))

    async def test_delete_app_model_returns_false_when_row_missing(self):
        with patch(
            "backend.services.supabase.storage._rest_request",
            new=AsyncMock(return_value=[]),
        ) as rest_request_mock:
            deleted = await storage.delete_app_model(99)

        rest_request_mock.assert_awaited_once_with(
            "DELETE",
            "app_models",
            params={"id": "eq.99"},
            prefer="return=representation",
        )
        self.assertFalse(deleted)


class ManagedModelsApiContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_admin_models_returns_storage_rows(self):
        rows = [
            {
                "id": 1,
                "title": "GPT-5.1",
                "model": "openai/gpt-5.1",
                "category": "openai",
                "active": True,
                "created_at": "2026-03-05T12:30:00+00:00",
                "updated_at": "2026-03-05T12:30:00+00:00",
            }
        ]
        list_models_mock = AsyncMock(return_value=rows)

        with patch("backend.main.storage.list_app_models", new=list_models_mock):
            payload = await main.get_admin_models(_={"id": "admin-1"})

        list_models_mock.assert_awaited_once_with()
        self.assertEqual(payload, rows)

    async def test_create_admin_model_rejects_duplicate_model_id(self):
        request = main.CreateAppModelRequest(
            title="GPT-5.1",
            model="openai/gpt-5.1",
            category="openai",
        )

        with (
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(return_value={"id": 3}),
            ),
            patch(
                "backend.main.storage.create_app_model",
                new=AsyncMock(),
            ) as create_model_mock,
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.create_admin_model(request, _={"id": "admin-1"})

        self.assertEqual(raised.exception.status_code, 409)
        create_model_mock.assert_not_awaited()

    async def test_create_admin_model_persists_payload(self):
        request = main.CreateAppModelRequest(
            title=" Claude Sonnet 4.5 ",
            model=" anthropic/claude-sonnet-4.5 ",
            category=" anthropic ",
            active=False,
        )
        created_row = {
            "id": 5,
            "title": "Claude Sonnet 4.5",
            "model": "anthropic/claude-sonnet-4.5",
            "category": "anthropic",
            "active": False,
            "created_at": "2026-03-05T12:30:00+00:00",
            "updated_at": "2026-03-05T12:30:00+00:00",
        }

        with (
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "backend.main.storage.create_app_model",
                new=AsyncMock(return_value=created_row),
            ) as create_model_mock,
        ):
            payload = await main.create_admin_model(request, _={"id": "admin-1"})

        create_model_mock.assert_awaited_once_with(
            " Claude Sonnet 4.5 ",
            " anthropic/claude-sonnet-4.5 ",
            " anthropic ",
            active=False,
        )
        self.assertEqual(payload["id"], 5)
        self.assertFalse(payload["active"])

    async def test_update_admin_model_returns_404_when_row_missing(self):
        request = main.UpdateAppModelRequest(title="Updated")

        with patch(
            "backend.main.storage.update_app_model",
            new=AsyncMock(return_value=None),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_admin_model(4, request, _={"id": "admin-1"})

        self.assertEqual(raised.exception.status_code, 404)

    async def test_update_admin_model_rejects_model_id_conflict(self):
        request = main.UpdateAppModelRequest(model="openai/gpt-5.1")

        with patch(
            "backend.main.storage.get_app_model_by_model",
            new=AsyncMock(return_value={"id": 99, "model": "openai/gpt-5.1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_admin_model(4, request, _={"id": "admin-1"})

        self.assertEqual(raised.exception.status_code, 409)

    async def test_delete_admin_model_returns_deleted_contract(self):
        delete_model_mock = AsyncMock(return_value=True)

        with patch("backend.main.storage.delete_app_model", new=delete_model_mock):
            payload = await main.delete_admin_model(7, _={"id": "admin-1"})

        delete_model_mock.assert_awaited_once_with(7)
        self.assertEqual(payload, {"id": 7, "deleted": True})

    async def test_delete_admin_model_returns_404_for_missing_row(self):
        delete_model_mock = AsyncMock(return_value=False)

        with patch("backend.main.storage.delete_app_model", new=delete_model_mock):
            with self.assertRaises(HTTPException) as raised:
                await main.delete_admin_model(7, _={"id": "admin-1"})

        self.assertEqual(raised.exception.status_code, 404)

    async def test_list_models_returns_active_rows(self):
        rows = [
            {
                "id": 8,
                "title": "Gemini Flash",
                "model": "google/gemini-2.5-flash",
                "category": "google",
                "active": True,
                "created_at": "2026-03-05T12:30:00+00:00",
                "updated_at": "2026-03-05T12:30:00+00:00",
            }
        ]
        list_active_mock = AsyncMock(return_value=rows)

        with patch("backend.main.storage.list_active_app_models", new=list_active_mock):
            payload = await main.list_models(user={"id": "user-1"})

        list_active_mock.assert_awaited_once_with()
        self.assertEqual(payload, rows)


class ConversationModelSelectionApiContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_conversation_model_rejects_invalid_mode(self):
        request = main.ConversationModelSelectionRequest(
            model_mode="hybrid",
            selected_model="openai/gpt-5.1",
        )

        with patch(
            "backend.main.get_owned_conversation",
            new=AsyncMock(return_value={"id": "conv-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_conversation_model_selection(
                    "conv-1",
                    request,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("model_mode", str(raised.exception.detail))

    async def test_update_conversation_model_requires_selected_model_in_single_mode(self):
        request = main.ConversationModelSelectionRequest(
            model_mode="single",
            selected_model="   ",
        )

        with patch(
            "backend.main.get_owned_conversation",
            new=AsyncMock(return_value={"id": "conv-1"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_conversation_model_selection(
                    "conv-1",
                    request,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("selected_model is required", str(raised.exception.detail))

    async def test_update_conversation_model_rejects_unavailable_single_model(self):
        request = main.ConversationModelSelectionRequest(
            model_mode="single",
            selected_model=" openai/gpt-5.1 ",
        )

        with (
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1"}),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(return_value=None),
            ) as get_model_mock,
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_conversation_model_selection(
                    "conv-1",
                    request,
                    user={"id": "user-1"},
                )

        get_model_mock.assert_awaited_once_with("openai/gpt-5.1")
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("not available", str(raised.exception.detail))

    async def test_update_conversation_model_rejects_inactive_single_model(self):
        request = main.ConversationModelSelectionRequest(
            model_mode="single",
            selected_model="openai/gpt-5.1",
        )

        with (
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1"}),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(
                    return_value={
                        "id": 10,
                        "title": "GPT-5.1",
                        "model": "openai/gpt-5.1",
                        "category": "openai",
                        "active": False,
                    }
                ),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await main.update_conversation_model_selection(
                    "conv-1",
                    request,
                    user={"id": "user-1"},
                )

        self.assertEqual(raised.exception.status_code, 400)

    async def test_update_conversation_model_persists_single_mode_selection(self):
        request = main.ConversationModelSelectionRequest(
            model_mode=" single ",
            selected_model=" openai/gpt-5.1 ",
        )
        update_result = {
            "id": "conv-1",
            "model_mode": "single",
            "selected_model": "openai/gpt-5.1",
            "selected_model_title": "GPT-5.1",
        }

        with (
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1"}),
            ),
            patch(
                "backend.main.storage.get_app_model_by_model",
                new=AsyncMock(
                    return_value={
                        "id": 3,
                        "title": "GPT-5.1",
                        "model": "openai/gpt-5.1",
                        "category": "openai",
                        "active": True,
                    }
                ),
            ),
            patch(
                "backend.main.storage.update_conversation_model_selection",
                new=AsyncMock(return_value=update_result),
            ) as update_selection_mock,
        ):
            payload = await main.update_conversation_model_selection(
                "conv-1",
                request,
                user={"id": "user-1"},
            )

        update_selection_mock.assert_awaited_once_with(
            "conv-1",
            "user-1",
            model_mode="single",
            selected_model="openai/gpt-5.1",
            selected_model_title="GPT-5.1",
        )
        self.assertEqual(payload, update_result)

    async def test_update_conversation_model_council_mode_clears_selection(self):
        request = main.ConversationModelSelectionRequest(
            model_mode=" council ",
            selected_model="openai/gpt-5.1",
        )
        update_result = {
            "id": "conv-1",
            "model_mode": "council",
            "selected_model": None,
            "selected_model_title": None,
        }

        with (
            patch(
                "backend.main.get_owned_conversation",
                new=AsyncMock(return_value={"id": "conv-1"}),
            ),
            patch(
                "backend.main.storage.update_conversation_model_selection",
                new=AsyncMock(return_value=update_result),
            ) as update_selection_mock,
        ):
            payload = await main.update_conversation_model_selection(
                "conv-1",
                request,
                user={"id": "user-1"},
            )

        update_selection_mock.assert_awaited_once_with(
            "conv-1",
            "user-1",
            model_mode="council",
            selected_model=None,
            selected_model_title=None,
        )
        self.assertEqual(payload["model_mode"], "council")
