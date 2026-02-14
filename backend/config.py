"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("SUPABASE_PROJECT_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_API_KEY_SECRET") or os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

# Runtime environment (development | production)
COUNCIL_ENV = (
    (
        os.getenv("COUNCIL_ENV")
        or os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or "production"
    )
    .strip()
    .lower()
)

DEVELOPMENT_COUNCIL_MODELS = [
    "openai/gpt-5-nano",
    "google/gemini-2.5-flash-lite",
    "anthropic/claude-3-haiku",
    "x-ai/grok-4.1-fast",
]

PRODUCTION_COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]

if COUNCIL_ENV in {"development", "dev", "local"}:
    COUNCIL_MODELS = DEVELOPMENT_COUNCIL_MODELS
    DEFAULT_CHAIRMAN_MODEL = "openai/gpt-5-nano"
else:
    COUNCIL_MODELS = PRODUCTION_COUNCIL_MODELS
    DEFAULT_CHAIRMAN_MODEL = "google/gemini-3-pro-preview"

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = os.getenv("CHAIRMAN_MODEL") or DEFAULT_CHAIRMAN_MODEL

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Stripe configuration
STRIPE_SECRET_KEY = os.getenv("STRIPE_API_KEY_SECRET")
STRIPE_PUBLIC_KEY = os.getenv("STRIPE_API_KEY_PUBLIC")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Pricing (BRL cents)
PRO_PLAN_PRICE_BRL_CENTS = int(os.getenv("PRO_PLAN_PRICE_BRL_CENTS") or "9000")

# Daily token quota for PRO accounts
PRO_DAILY_TOKEN_CREDITS = int(os.getenv("PRO_DAILY_TOKEN_CREDITS") or "200000")

# Daily conversation quota for FREE accounts (1 query = 1 new conversation started)
FREE_DAILY_QUERY_LIMIT = int(os.getenv("FREE_DAILY_QUERY_LIMIT") or "3")
