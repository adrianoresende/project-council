"""OpenRouter service domain package."""

from .client import list_openrouter_models, query_model, query_models_parallel

__all__ = ["query_model", "query_models_parallel", "list_openrouter_models"]
