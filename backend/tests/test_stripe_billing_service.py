"""Tests for Stripe billing services and API-layer delegation."""

import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from backend import main
from backend.services.stripe import billing


class StripeBillingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_pro_checkout_session_rejects_invalid_urls(self):
        with self.assertRaises(HTTPException) as raised:
            await billing.create_pro_checkout_session(
                success_url="/relative/success",
                cancel_url="https://example.com/cancel",
                user_id="user-1",
                user_email="user@example.com",
                pro_price_brl_cents=9000,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "Invalid success_url or cancel_url.")

    async def test_create_pro_checkout_session_returns_stable_contract(self):
        stripe_request_mock = AsyncMock(
            return_value={"id": "cs_test_123", "url": "https://stripe.example/checkout"}
        )

        with patch(
            "backend.services.stripe.billing.stripe_request",
            new=stripe_request_mock,
        ):
            payload = await billing.create_pro_checkout_session(
                success_url="https://app.example/success",
                cancel_url="https://app.example/cancel",
                user_id="user-1",
                user_email="user@example.com",
                pro_price_brl_cents=9000,
            )

        self.assertEqual(
            payload,
            {
                "session_id": "cs_test_123",
                "checkout_url": "https://stripe.example/checkout",
            },
        )
        self.assertEqual(stripe_request_mock.await_args.args, ("POST", "/v1/checkout/sessions"))
        submitted_payload = stripe_request_mock.await_args.kwargs["data"]
        self.assertEqual(submitted_payload["client_reference_id"], "user-1")
        self.assertEqual(submitted_payload["metadata[user_id]"], "user-1")
        self.assertEqual(submitted_payload["metadata[plan]"], "pro")
        self.assertEqual(submitted_payload["customer_email"], "user@example.com")

    async def test_confirm_checkout_session_rejects_foreign_session(self):
        with patch(
            "backend.services.stripe.billing.stripe_request",
            new=AsyncMock(return_value={"metadata": {"user_id": "someone-else"}}),
        ):
            with self.assertRaises(HTTPException) as raised:
                await billing.confirm_checkout_session(
                    session_id="cs_foreign",
                    user_id="user-1",
                )

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(
            raised.exception.detail,
            "Checkout session does not belong to this user.",
        )

    async def test_confirm_checkout_session_links_owned_session(self):
        stripe_request_mock = AsyncMock(return_value={"metadata": {"user_id": "user-1"}})
        reconcile_mock = AsyncMock(return_value={"plan": "pro"})

        with (
            patch(
                "backend.services.stripe.billing.stripe_request",
                new=stripe_request_mock,
            ),
            patch(
                "backend.services.stripe.billing.reconcile_checkout_session_to_plan",
                new=reconcile_mock,
            ),
        ):
            payload = await billing.confirm_checkout_session(
                session_id=" cs_123 ",
                user_id="user-1",
            )

        self.assertEqual(
            payload,
            {
                "session_id": "cs_123",
                "plan": "pro",
                "linked": True,
            },
        )
        self.assertEqual(
            stripe_request_mock.await_args.args,
            ("GET", "/v1/checkout/sessions/cs_123"),
        )
        self.assertEqual(
            stripe_request_mock.await_args.kwargs["params"],
            {"expand[]": "subscription"},
        )
        reconcile_mock.assert_awaited_once()

    async def test_reconcile_checkout_session_to_plan_updates_user_and_storage(self):
        update_plan_mock = AsyncMock()
        upsert_payment_mock = AsyncMock()
        stripe_request_mock = AsyncMock(return_value={"current_period_end": 1735689600})

        checkout_session = {
            "id": "cs_123",
            "mode": "subscription",
            "status": "complete",
            "payment_status": "paid",
            "customer": "cus_123",
            "subscription": "sub_123",
            "metadata": {"user_id": "user-1"},
        }

        with (
            patch(
                "backend.services.stripe.billing.update_user_plan_metadata",
                new=update_plan_mock,
            ),
            patch(
                "backend.services.stripe.billing.storage.upsert_billing_payment",
                new=upsert_payment_mock,
            ),
            patch(
                "backend.services.stripe.billing.stripe_request",
                new=stripe_request_mock,
            ),
        ):
            result = await billing.reconcile_checkout_session_to_plan(
                checkout_session,
                event_type="checkout.session.completed",
                stripe_event_id="evt_123",
            )

        self.assertEqual(result["user_id"], "user-1")
        self.assertEqual(result["plan"], "pro")
        self.assertEqual(result["payment_status"], "paid")
        update_plan_mock.assert_awaited_once_with(
            "user-1",
            "pro",
            stripe_customer_id="cus_123",
            stripe_subscription_id="sub_123",
        )
        self.assertEqual(
            stripe_request_mock.await_args.args,
            ("GET", "/v1/subscriptions/sub_123"),
        )
        upsert_kwargs = upsert_payment_mock.await_args.kwargs
        self.assertEqual(upsert_kwargs["event_type"], "checkout.session.completed")
        self.assertEqual(upsert_kwargs["stripe_event_id"], "evt_123")
        self.assertIsNotNone(upsert_kwargs["paid_at"])
        self.assertEqual(
            upsert_kwargs["next_payment_at"],
            "2025-01-01T00:00:00+00:00",
        )

    async def test_process_stripe_webhook_acknowledges_payload_mismatch(self):
        webhook_payload = json.dumps(
            {
                "id": "evt_123",
                "type": "checkout.session.completed",
                "data": {"object": {"id": "cs_123"}},
            }
        ).encode("utf-8")

        with (
            patch("backend.services.stripe.billing.STRIPE_WEBHOOK_SECRET", ""),
            patch("backend.services.stripe.billing.verify_stripe_signature", return_value=True),
            patch(
                "backend.services.stripe.billing.reconcile_checkout_session_to_plan",
                new=AsyncMock(side_effect=HTTPException(status_code=400, detail="bad payload")),
            ),
        ):
            result = await billing.process_stripe_webhook(webhook_payload, None)

        self.assertEqual(result, {"received": True, "processed": False})


class StripeApiLayerDelegationTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_pro_checkout_session_endpoint_delegates_to_service(self):
        create_checkout_mock = AsyncMock(
            return_value={
                "session_id": "cs_endpoint",
                "checkout_url": "https://stripe.example/endpoint",
            }
        )
        user = {"id": "user-1", "email": "user@example.com"}

        with patch(
            "backend.main.create_stripe_pro_checkout_session",
            new=create_checkout_mock,
        ):
            result = await main.create_pro_checkout_session(
                main.CreateProCheckoutSessionRequest(
                    success_url="https://app.example/success",
                    cancel_url="https://app.example/cancel",
                ),
                user=user,
            )

        self.assertEqual(
            result,
            {
                "session_id": "cs_endpoint",
                "checkout_url": "https://stripe.example/endpoint",
            },
        )
        create_checkout_mock.assert_awaited_once_with(
            success_url="https://app.example/success",
            cancel_url="https://app.example/cancel",
            user_id="user-1",
            user_email="user@example.com",
            pro_price_brl_cents=main.PRO_PLAN_PRICE_BRL_CENTS,
        )

    async def test_confirm_checkout_session_endpoint_delegates_to_service(self):
        confirm_mock = AsyncMock(
            return_value={"session_id": "cs_123", "plan": "pro", "linked": True}
        )

        with patch(
            "backend.main.confirm_stripe_checkout_session",
            new=confirm_mock,
        ):
            result = await main.confirm_checkout_session(
                main.ConfirmCheckoutSessionRequest(session_id="cs_123"),
                user={"id": "user-1"},
            )

        self.assertEqual(result, {"session_id": "cs_123", "plan": "pro", "linked": True})
        confirm_mock.assert_awaited_once_with(session_id="cs_123", user_id="user-1")

    async def test_stripe_webhook_endpoint_delegates_to_service(self):
        process_webhook_mock = AsyncMock(return_value={"received": True})

        class _RequestStub:
            async def body(self):
                return b'{"id":"evt_123"}'

        with patch(
            "backend.main.process_stripe_webhook",
            new=process_webhook_mock,
        ):
            result = await main.stripe_webhook(
                request=_RequestStub(),
                stripe_signature="t=1,v1=sig",
            )

        self.assertEqual(result, {"received": True})
        process_webhook_mock.assert_awaited_once_with(
            b'{"id":"evt_123"}',
            "t=1,v1=sig",
        )
