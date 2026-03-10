"""Storage contract tests for managed admin models."""

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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
