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
DEVELOPMENT_ENV_NAMES = {"development", "dev", "local"}


def _strip_wrapping_quotes(raw_value: str) -> str:
    """Trim whitespace and optional matching single/double quotes."""
    normalized_value = raw_value.strip()
    while (
        len(normalized_value) >= 2
        and normalized_value[0] == normalized_value[-1]
        and normalized_value[0] in {"'", '"'}
    ):
        normalized_value = normalized_value[1:-1].strip()
    return normalized_value


def resolve_council_env(
    raw_council_env: str | None,
    raw_app_env: str | None,
    raw_environment: str | None,
) -> str:
    """Resolve runtime environment from supported env var fallbacks."""
    raw_value = raw_council_env or raw_app_env or raw_environment or "production"
    return _strip_wrapping_quotes(raw_value).lower()


def _parse_cors_origins(raw_origins: str | None) -> list[str]:
    """Parse a comma-separated list of CORS origins."""
    if not raw_origins:
        return []

    normalized_origins_value = _strip_wrapping_quotes(raw_origins)
    if not normalized_origins_value:
        return []

    parsed_origins: list[str] = []
    seen_origins: set[str] = set()
    for origin in normalized_origins_value.split(","):
        normalized_origin = _strip_wrapping_quotes(origin).rstrip("/")
        if not normalized_origin:
            continue
        if normalized_origin == "*":
            raise ValueError(
                "CORS_ALLOW_ORIGINS does not support '*' when credentials are enabled."
            )
        if normalized_origin not in seen_origins:
            parsed_origins.append(normalized_origin)
            seen_origins.add(normalized_origin)
    return parsed_origins


def resolve_council_env_prefix(environment: str) -> str:
    """Map resolved runtime environment to env var prefix."""
    if environment in DEVELOPMENT_ENV_NAMES:
        return "DEVELOPMENT"
    return "PRODUCTION"


def _parse_council_models(
    raw_models: str | None,
    fallback_models: list[str],
) -> list[str]:
    """Parse a comma-separated model list with fallback."""
    if not raw_models:
        return list(fallback_models)

    normalized_models_value = _strip_wrapping_quotes(raw_models)
    if not normalized_models_value:
        return list(fallback_models)

    parsed_models: list[str] = []
    seen_models: set[str] = set()
    for model in normalized_models_value.split(","):
        normalized_model = _strip_wrapping_quotes(model)
        if not normalized_model:
            continue
        if normalized_model in seen_models:
            continue
        parsed_models.append(normalized_model)
        seen_models.add(normalized_model)

    if parsed_models:
        return parsed_models
    return list(fallback_models)


def resolve_council_models_for_plan(
    plan: str | None,
    free_models: list[str],
    pro_models: list[str],
) -> list[str]:
    """Resolve model list from normalized account plan text."""
    normalized_plan = plan.strip().lower() if isinstance(plan, str) else "free"
    if normalized_plan == "pro":
        return list(pro_models)
    return list(free_models)


def resolve_cors_allow_origins(
    raw_origins: str | None,
    environment: str,
) -> list[str]:
    """
    Resolve CORS origins using env overrides and environment-aware defaults.

    Development defaults to localhost origins for convenience.
    Production defaults to no cross-origin access unless explicitly configured.
    """
    parsed_origins = _parse_cors_origins(raw_origins)
    if parsed_origins:
        return parsed_origins
    if environment in DEVELOPMENT_ENV_NAMES:
        return ["http://localhost:5173", "http://localhost:3000"]
    return []


COUNCIL_ENV = resolve_council_env(
    os.getenv("COUNCIL_ENV"),
    os.getenv("APP_ENV"),
    os.getenv("ENVIRONMENT"),
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

if COUNCIL_ENV in DEVELOPMENT_ENV_NAMES:
    COUNCIL_MODELS = DEVELOPMENT_COUNCIL_MODELS
    DEFAULT_CHAIRMAN_MODEL = "openai/gpt-5-nano"
else:
    COUNCIL_MODELS = PRODUCTION_COUNCIL_MODELS
    DEFAULT_CHAIRMAN_MODEL = "google/gemini-3-pro-preview"

COUNCIL_ENV_PREFIX = resolve_council_env_prefix(COUNCIL_ENV)
FREE_COUNCIL_MODELS = _parse_council_models(
    os.getenv(f"{COUNCIL_ENV_PREFIX}_FREE_COUNCIL_MODELS"),
    COUNCIL_MODELS,
)
PRO_COUNCIL_MODELS = _parse_council_models(
    os.getenv(f"{COUNCIL_ENV_PREFIX}_PRO_COUNCIL_MODELS"),
    COUNCIL_MODELS,
)


def get_council_models_for_plan(plan: str | None) -> list[str]:
    """Return council models configured for account plan."""
    return resolve_council_models_for_plan(
        plan,
        FREE_COUNCIL_MODELS,
        PRO_COUNCIL_MODELS,
    )

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = os.getenv("CHAIRMAN_MODEL") or DEFAULT_CHAIRMAN_MODEL
CORS_ALLOW_ORIGINS = resolve_cors_allow_origins(
    os.getenv("CORS_ALLOW_ORIGINS"),
    COUNCIL_ENV,
)

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
