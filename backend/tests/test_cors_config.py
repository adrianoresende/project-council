"""Tests for CORS origin configuration parsing and defaults."""

import unittest

from backend import config


class CorsConfigTests(unittest.TestCase):
    def test_resolve_council_env_strips_wrapping_quotes(self):
        resolved = config.resolve_council_env('"development"', None, None)
        self.assertEqual(resolved, "development")

    def test_resolve_council_env_keeps_existing_fallback_behavior(self):
        resolved = config.resolve_council_env(None, "dev", None)
        self.assertEqual(resolved, "dev")

    def test_parse_cors_origins_trims_deduplicates_and_strips_trailing_slash(self):
        parsed = config._parse_cors_origins(
            " https://app.example.com/ ,https://app.example.com, http://localhost:5173/ "
        )
        self.assertEqual(
            parsed,
            ["https://app.example.com", "http://localhost:5173"],
        )

    def test_parse_cors_origins_strips_wrapping_quotes(self):
        parsed = config._parse_cors_origins(
            "\"https://app.example.com/\" , 'http://localhost:5173/'"
        )
        self.assertEqual(
            parsed,
            ["https://app.example.com", "http://localhost:5173"],
        )

    def test_parse_cors_origins_strips_wrapping_quotes_from_full_value(self):
        parsed = config._parse_cors_origins(
            '"https://app.example.com/,http://localhost:5173/"'
        )
        self.assertEqual(
            parsed,
            ["https://app.example.com", "http://localhost:5173"],
        )

    def test_parse_cors_origins_rejects_wildcard(self):
        with self.assertRaises(ValueError):
            config._parse_cors_origins("*,https://app.example.com")

    def test_parse_cors_origins_rejects_quoted_wildcard(self):
        with self.assertRaises(ValueError):
            config._parse_cors_origins('"*"')

    def test_resolve_cors_allow_origins_uses_development_defaults(self):
        resolved = config.resolve_cors_allow_origins("", "development")
        self.assertEqual(
            resolved,
            ["http://localhost:5173", "http://localhost:3000"],
        )

    def test_resolve_cors_allow_origins_requires_explicit_production_origins(self):
        resolved = config.resolve_cors_allow_origins("", "production")
        self.assertEqual(resolved, [])

    def test_resolve_cors_allow_origins_prefers_explicit_values(self):
        resolved = config.resolve_cors_allow_origins(
            "https://a.example.com/, https://b.example.com",
            "production",
        )
        self.assertEqual(
            resolved,
            ["https://a.example.com", "https://b.example.com"],
        )

    def test_resolve_council_env_prefix_uses_development_for_dev_aliases(self):
        for env_name in ("development", "dev", "local"):
            with self.subTest(env_name=env_name):
                self.assertEqual(
                    config.resolve_council_env_prefix(env_name),
                    "DEVELOPMENT",
                )

    def test_resolve_council_env_prefix_defaults_to_production(self):
        self.assertEqual(config.resolve_council_env_prefix("production"), "PRODUCTION")
        self.assertEqual(config.resolve_council_env_prefix("staging"), "PRODUCTION")

    def test_parse_council_models_trims_deduplicates_and_strips_quotes(self):
        parsed = config._parse_council_models(
            '"openai/gpt-oss-120b, google/gemini-2.0-flash, openai/gpt-oss-120b"',
            ["fallback/model"],
        )
        self.assertEqual(
            parsed,
            ["openai/gpt-oss-120b", "google/gemini-2.0-flash"],
        )

    def test_parse_council_models_uses_fallback_for_empty_values(self):
        fallback = ["fallback/model-a", "fallback/model-b"]
        self.assertEqual(config._parse_council_models("", fallback), fallback)
        self.assertEqual(config._parse_council_models('""', fallback), fallback)
        self.assertEqual(config._parse_council_models(" ,, ", fallback), fallback)

    def test_resolve_council_models_for_plan_selects_pro_models(self):
        resolved = config.resolve_council_models_for_plan(
            "PRO",
            ["free/model"],
            ["pro/model"],
        )
        self.assertEqual(resolved, ["pro/model"])

    def test_resolve_council_models_for_plan_defaults_to_free_models(self):
        free_models = ["free/model-1", "free/model-2"]
        pro_models = ["pro/model"]
        self.assertEqual(
            config.resolve_council_models_for_plan("free", free_models, pro_models),
            free_models,
        )
        self.assertEqual(
            config.resolve_council_models_for_plan("enterprise", free_models, pro_models),
            free_models,
        )
        self.assertEqual(
            config.resolve_council_models_for_plan(None, free_models, pro_models),
            free_models,
        )


if __name__ == "__main__":
    unittest.main()
