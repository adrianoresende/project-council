"""Tests for council model configuration parsing and resolution."""

import importlib
import os
import unittest
from unittest.mock import patch

from backend import config


class ModelConfigTests(unittest.TestCase):
    def test_parse_council_model_list_trims_quotes_and_deduplicates(self):
        parsed = config._parse_council_model_list(
            ' "openai/gpt-5.1" , , \'google/gemini-3-pro-preview\' ,'
            ' openai/gpt-5.1, "x-ai/grok-4" '
        )
        self.assertEqual(
            parsed,
            [
                "openai/gpt-5.1",
                "google/gemini-3-pro-preview",
                "x-ai/grok-4",
            ],
        )

    def test_parse_council_model_list_strips_wrapping_quotes_from_full_value(self):
        parsed = config._parse_council_model_list(
            '"openai/gpt-5.1, google/gemini-3-pro-preview"'
        )
        self.assertEqual(
            parsed,
            ["openai/gpt-5.1", "google/gemini-3-pro-preview"],
        )

    def test_resolve_production_council_models_falls_back_when_values_missing_or_empty(self):
        free_models, pro_models = config.resolve_production_council_models(
            None,
            "  ",
            ["model-a", "model-b", "model-a"],
        )
        self.assertEqual(free_models, ["model-a", "model-b"])
        self.assertEqual(pro_models, ["model-a", "model-b"])

    def test_resolve_production_council_models_prefers_explicit_values_per_plan(self):
        free_models, pro_models = config.resolve_production_council_models(
            "model-free-a, model-free-b, model-free-a",
            "model-pro-a, model-pro-b",
            ["fallback-a", "fallback-b"],
        )
        self.assertEqual(free_models, ["model-free-a", "model-free-b"])
        self.assertEqual(pro_models, ["model-pro-a", "model-pro-b"])

    def test_get_council_models_for_plan_uses_development_models_for_dev_env(self):
        with patch.dict(
            os.environ,
            {
                "COUNCIL_ENV": "development",
                "PRODUCTION_FREE_COUNCIL_MODELS": "",
                "PRODUCTION_PRO_COUNCIL_MODELS": "",
            },
            clear=False,
        ):
            importlib.reload(config)
            try:
                models = config.get_council_models_for_plan(
                    "pro", environment='"development"'
                )
                self.assertEqual(models, config.DEVELOPMENT_COUNCIL_MODELS)
            finally:
                importlib.reload(config)

    def test_get_council_models_for_plan_honors_explicit_production_pro_models_in_dev(self):
        with patch.dict(
            os.environ,
            {
                "COUNCIL_ENV": "development",
                "PRODUCTION_PRO_COUNCIL_MODELS": (
                    "openai/gpt-5-nano,google/gemini-2.5-flash-lite"
                ),
            },
            clear=False,
        ):
            importlib.reload(config)
            try:
                self.assertEqual(
                    config.get_council_models_for_plan("pro"),
                    ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
                )
            finally:
                importlib.reload(config)

    def test_get_council_models_for_plan_uses_env_backed_production_lists(self):
        with patch.dict(
            os.environ,
            {
                "COUNCIL_ENV": "production",
                "PRODUCTION_FREE_COUNCIL_MODELS": (
                    " openai/gpt-5-nano, google/gemini-2.5-flash-lite, "
                    "openai/gpt-5-nano "
                ),
                "PRODUCTION_PRO_COUNCIL_MODELS": (
                    '"openai/gpt-5.1, anthropic/claude-sonnet-4.5, openai/gpt-5.1"'
                ),
            },
            clear=False,
        ):
            importlib.reload(config)
            try:
                self.assertEqual(
                    config.PRODUCTION_FREE_COUNCIL_MODELS,
                    ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
                )
                self.assertEqual(
                    config.PRODUCTION_PRO_COUNCIL_MODELS,
                    ["openai/gpt-5.1", "anthropic/claude-sonnet-4.5"],
                )
                self.assertEqual(
                    config.get_council_models_for_plan("free", environment="production"),
                    ["openai/gpt-5-nano", "google/gemini-2.5-flash-lite"],
                )
                self.assertEqual(
                    config.get_council_models_for_plan("pro", environment="production"),
                    ["openai/gpt-5.1", "anthropic/claude-sonnet-4.5"],
                )
            finally:
                importlib.reload(config)


if __name__ == "__main__":
    unittest.main()
