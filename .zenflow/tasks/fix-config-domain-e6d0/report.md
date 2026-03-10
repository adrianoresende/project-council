## Implementation Summary

- Updated `frontend/vite.config.js` to remove the hardcoded Railway hostname and support preview host allowlisting via:
  - localhost defaults (`localhost`, `127.0.0.1`)
  - `RAILWAY_PUBLIC_DOMAIN` fallback
  - optional `VITE_PREVIEW_ALLOWED_HOSTS` override (for `app.X.com`)
- Updated `website/vite.config.js` with the same preview host allowlisting behavior so `www.X.com` works in Railway preview.
- Added `website/railway.toml` so the website can be deployed as its own Railway service from the `website` directory.
- Updated Railway deployment docs in `README.md` for a 3-service setup:
  - app domain: `app.X.com`
  - website domain: `www.X.com`
  - domain-specific env var examples and wiring checklist
- Updated `.env.example` CORS localhost default to `5173` and added a production example for app/www origins.

## Verification

- `uv run python -m unittest backend.tests.test_cors_config` passed.
- `node --check frontend/vite.config.js` passed.
- `node --check website/vite.config.js` passed.
