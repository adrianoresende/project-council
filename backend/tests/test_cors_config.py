"""Tests for CORS origin configuration parsing and defaults."""

import unittest

from backend import config


class CorsConfigTests(unittest.TestCase):
    def test_parse_cors_origins_trims_deduplicates_and_strips_trailing_slash(self):
        parsed = config._parse_cors_origins(
            " https://app.example.com/ ,https://app.example.com, http://localhost:5173/ "
        )
        self.assertEqual(
            parsed,
            ["https://app.example.com", "http://localhost:5173"],
        )

    def test_parse_cors_origins_rejects_wildcard(self):
        with self.assertRaises(ValueError):
            config._parse_cors_origins("*,https://app.example.com")

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


if __name__ == "__main__":
    unittest.main()
