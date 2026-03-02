"""Tests for admin role checks and admin foundation API contracts."""

import unittest
from unittest.mock import AsyncMock, call, patch

from fastapi import HTTPException

from backend import main


def _build_supabase_user(
    *,
    user_id: str,
    email: str,
    role: str = "user",
    plan: str = "free",
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> dict:
    billing = {"plan": plan}
    if stripe_customer_id is not None:
        billing["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id is not None:
        billing["stripe_subscription_id"] = stripe_subscription_id

    return {
        "id": user_id,
        "email": email,
        "created_at": "2026-02-20T10:00:00+00:00",
        "last_sign_in_at": "2026-02-20T11:00:00+00:00",
        "user_metadata": {"plan": plan},
        "app_metadata": {
            "role": role,
            "billing": billing,
        },
    }


class AdminRoleGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_current_admin_user_allows_normalized_admin_role(self):
        user = {"id": "admin-1", "app_metadata": {"role": " ADMIN "}}
        result = await main.get_current_admin_user(user=user)
        self.assertIs(result, user)

    async def test_get_current_admin_user_rejects_non_admin_role(self):
        user = {"id": "user-1", "app_metadata": {"role": "user"}}
        with self.assertRaises(HTTPException) as raised:
            await main.get_current_admin_user(user=user)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, "Admin access required.")

    async def test_get_current_admin_user_rejects_unknown_role(self):
        user = {"id": "user-2", "app_metadata": {"role": "manager"}}
        with self.assertRaises(HTTPException) as raised:
            await main.get_current_admin_user(user=user)
        self.assertEqual(raised.exception.status_code, 403)


class AdminUsersContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_admin_users_returns_sorted_rows_with_customer_id_contract(self):
        users = [
            _build_supabase_user(
                user_id="user-z",
                email="zeta@example.com",
                role="ADMIN",
                plan="pro",
                stripe_customer_id="cus_123",
                stripe_subscription_id="sub_123",
            ),
            _build_supabase_user(
                user_id="user-a",
                email="alpha@example.com",
                role="manager",
                plan="free",
                stripe_subscription_id="sub_only",
            ),
        ]

        with patch("backend.main.list_users_admin", new=AsyncMock(return_value=users)):
            rows = await main.get_admin_users(_={"id": "admin-1"})

        self.assertEqual([row["email"] for row in rows], ["alpha@example.com", "zeta@example.com"])
        self.assertEqual(rows[0]["user_id"], "user-a")
        self.assertEqual(rows[0]["role"], "user")
        self.assertIsNone(rows[0]["stripe_customer_id"])
        self.assertEqual(rows[1]["user_id"], "user-z")
        self.assertEqual(rows[1]["role"], "admin")
        self.assertEqual(rows[1]["stripe_customer_id"], "cus_123")

    async def test_get_admin_system_models_returns_plan_specific_model_lists(self):
        with patch(
            "backend.main.get_council_models_for_plan",
            side_effect=[
                ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
                ["openai/gpt-5.1", "anthropic/claude-sonnet-4.5"],
            ],
        ) as get_models_mock:
            payload = await main.get_admin_system_models(_={"id": "admin-1"})

        self.assertEqual(
            payload["free_models"],
            ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
        )
        self.assertEqual(
            payload["pro_models"],
            ["openai/gpt-5.1", "anthropic/claude-sonnet-4.5"],
        )
        get_models_mock.assert_has_calls([call("free"), call("pro")])

    async def test_get_admin_user_rejects_blank_user_id(self):
        with self.assertRaises(HTTPException) as raised:
            await main.get_admin_user("   ", _={"id": "admin-1"})
        self.assertEqual(raised.exception.status_code, 400)

    async def test_get_admin_user_returns_single_user_contract(self):
        target_user = _build_supabase_user(
            user_id="target-user",
            email="target@example.com",
            role="admin",
            plan="pro",
            stripe_customer_id="cus_target",
        )
        get_user_mock = AsyncMock(return_value=target_user)

        with patch("backend.main.get_user_by_id_admin", new=get_user_mock):
            payload = await main.get_admin_user(" target-user ", _={"id": "admin-1"})

        get_user_mock.assert_awaited_once_with("target-user")
        self.assertEqual(payload["user_id"], "target-user")
        self.assertEqual(payload["email"], "target@example.com")
        self.assertEqual(payload["role"], "admin")
        self.assertEqual(payload["plan"], "pro")
        self.assertEqual(payload["stripe_customer_id"], "cus_target")

    async def test_update_admin_user_role_normalizes_request(self):
        updated_user = _build_supabase_user(
            user_id="target-user",
            email="target@example.com",
            role="admin",
            plan="free",
        )
        update_role_mock = AsyncMock(return_value=updated_user)

        with patch("backend.main.update_user_role_metadata", new=update_role_mock):
            row = await main.update_admin_user_role(
                " target-user ",
                main.AdminUserRoleUpdateRequest(role="ADMIN"),
                _={"id": "admin-1"},
            )

        update_role_mock.assert_awaited_once_with("target-user", "admin")
        self.assertEqual(row["user_id"], "target-user")
        self.assertEqual(row["role"], "admin")

    async def test_update_admin_user_plan_normalizes_request(self):
        updated_user = _build_supabase_user(
            user_id="target-user",
            email="target@example.com",
            role="user",
            plan="pro",
            stripe_customer_id="cus_next",
        )
        update_plan_mock = AsyncMock(return_value=updated_user)

        with patch("backend.main.update_user_plan_metadata", new=update_plan_mock):
            row = await main.update_admin_user_plan(
                "target-user",
                main.AdminUserPlanUpdateRequest(plan="PRO"),
                _={"id": "admin-1"},
            )

        update_plan_mock.assert_awaited_once_with("target-user", "pro")
        self.assertEqual(row["plan"], "pro")
        self.assertEqual(row["stripe_customer_id"], "cus_next")

    async def test_update_admin_user_plan_rejects_blank_user_id(self):
        with self.assertRaises(HTTPException) as raised:
            await main.update_admin_user_plan(
                "  ",
                main.AdminUserPlanUpdateRequest(plan="pro"),
                _={"id": "admin-1"},
            )
        self.assertEqual(raised.exception.status_code, 400)

    async def test_reset_admin_user_quota_uses_plan_specific_limits(self):
        scenarios = [
            ("free", main.FREE_DAILY_QUERY_LIMIT, "queries"),
            ("pro", main.PRO_DAILY_TOKEN_CREDITS, "tokens"),
        ]

        for plan, expected_limit, expected_unit in scenarios:
            with self.subTest(plan=plan):
                target_user = _build_supabase_user(
                    user_id="target-user",
                    email="target@example.com",
                    role="user",
                    plan=plan,
                )
                get_user_mock = AsyncMock(return_value=target_user)
                reset_quota_mock = AsyncMock(return_value=expected_limit)

                with (
                    patch("backend.main.get_user_by_id_admin", new=get_user_mock),
                    patch("backend.main.storage.reset_account_daily_credits", new=reset_quota_mock),
                ):
                    payload = await main.reset_admin_user_quota(
                        " target-user ",
                        _={"id": "admin-1"},
                    )

                get_user_mock.assert_awaited_once_with("target-user")
                reset_quota_mock.assert_awaited_once_with("target-user", expected_limit)
                self.assertEqual(payload["user_id"], "target-user")
                self.assertEqual(payload["plan"], plan)
                self.assertEqual(payload["limit"], expected_limit)
                self.assertEqual(payload["unit"], expected_unit)
                self.assertEqual(payload["credits"], expected_limit)

    async def test_reset_admin_user_quota_returns_storage_result_credits(self):
        target_user = _build_supabase_user(
            user_id="target-user",
            email="target@example.com",
            role="user",
            plan="pro",
        )
        get_user_mock = AsyncMock(return_value=target_user)
        reset_quota_mock = AsyncMock(return_value=199999)

        with (
            patch("backend.main.get_user_by_id_admin", new=get_user_mock),
            patch("backend.main.storage.reset_account_daily_credits", new=reset_quota_mock),
        ):
            payload = await main.reset_admin_user_quota("target-user", _={"id": "admin-1"})

        reset_quota_mock.assert_awaited_once_with("target-user", main.PRO_DAILY_TOKEN_CREDITS)
        self.assertEqual(payload["credits"], 199999)


if __name__ == "__main__":
    unittest.main()
