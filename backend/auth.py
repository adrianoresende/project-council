"""Compatibility wrapper for Supabase auth service."""

from .services.supabase.auth import (
    ROLE_ADMIN,
    ROLE_USER,
    VALID_USER_ROLES,
    ensure_default_user_role_metadata,
    get_user_by_id_admin,
    get_user_from_token,
    list_users_admin,
    login_user,
    normalize_user_role,
    register_user,
    update_user_plan_metadata,
    update_user_role_metadata,
)

__all__ = [
    "ROLE_ADMIN",
    "ROLE_USER",
    "VALID_USER_ROLES",
    "register_user",
    "login_user",
    "get_user_from_token",
    "get_user_by_id_admin",
    "ensure_default_user_role_metadata",
    "list_users_admin",
    "normalize_user_role",
    "update_user_plan_metadata",
    "update_user_role_metadata",
]
