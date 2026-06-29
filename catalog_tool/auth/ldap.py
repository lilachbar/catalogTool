"""Amdocs corporate LDAP / Active Directory authentication."""

from __future__ import annotations

import re
from dataclasses import dataclass

from catalog_tool.settings import (
    LDAP_BIND_DN_TEMPLATE,
    LDAP_BIND_FORMAT,
    LDAP_DOMAIN,
    LDAP_RECEIVE_TIMEOUT,
    LDAP_TLS,
    LDAP_URI,
    LDAP_USE_SSL,
)

_USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{2,64}$")


@dataclass(frozen=True)
class LdapAuthResult:
    ok: bool
    username: str = ""
    display_name: str = ""
    error: str = ""


def normalize_username(username: str) -> str:
    """Strip domain prefix/suffix; keep Amdocs login id."""
    value = (username or "").strip()
    if not value:
        return ""

    if "\\" in value:
        value = value.rsplit("\\", 1)[-1]
    if "@" in value:
        value = value.split("@", 1)[0]
    return value.lower()


def build_bind_dn(username: str) -> str:
    normalized = normalize_username(username)
    if not normalized:
        raise ValueError("Username is required.")

    bind_format = LDAP_BIND_FORMAT.lower()
    if bind_format == "dn":
        if not LDAP_BIND_DN_TEMPLATE:
            raise ValueError("LDAP_BIND_DN_TEMPLATE is required when LDAP_BIND_FORMAT=dn.")
        return LDAP_BIND_DN_TEMPLATE.format(username=normalized)

    if bind_format == "sam":
        domain = LDAP_DOMAIN.split(".", 1)[0].upper()
        return f"{domain}\\{normalized}"

    # upn — default for Amdocs Active Directory
    domain = LDAP_DOMAIN or "corp.amdocs.com"
    return f"{normalized}@{domain}"


def authenticate_ldap_user(username: str, password: str) -> LdapAuthResult:
    """Validate credentials against corporate LDAP (simple bind)."""
    normalized = normalize_username(username)
    if not normalized:
        return LdapAuthResult(ok=False, error="Username is required.")
    if not _USERNAME_RE.match(normalized):
        return LdapAuthResult(ok=False, error="Invalid username format.")
    if not password:
        return LdapAuthResult(ok=False, error="Password is required.")
    if not LDAP_URI:
        return LdapAuthResult(ok=False, error="LDAP is not configured (set LDAP_URI in .env).")

    try:
        from ldap3 import ALL, Connection, Server, Tls
        from ldap3.core.exceptions import LDAPException
    except ImportError:
        return LdapAuthResult(
            ok=False,
            error="ldap3 is not installed. Run: pip install ldap3",
        )

    bind_user = build_bind_dn(normalized)
    tls = None
    if LDAP_TLS and not LDAP_USE_SSL:
        tls = Tls()

    try:
        server = Server(
            LDAP_URI,
            use_ssl=LDAP_USE_SSL,
            get_info=ALL,
            connect_timeout=LDAP_RECEIVE_TIMEOUT,
            tls=tls,
        )
        connection = Connection(
            server,
            user=bind_user,
            password=password,
            auto_bind=False,
            receive_timeout=LDAP_RECEIVE_TIMEOUT,
        )
        if not connection.bind():
            message = connection.result.get("description") or "Invalid username or password."
            return LdapAuthResult(ok=False, error=message)

        display_name = normalized
        try:
            if connection.search(
                search_base=_search_base_from_bind(bind_user),
                search_filter=f"(sAMAccountName={normalized})",
                attributes=["displayName", "cn"],
                size_limit=1,
            ) and connection.entries:
                entry = connection.entries[0]
                display_name = str(
                    getattr(entry, "displayName", None)
                    or getattr(entry, "cn", None)
                    or normalized
                )
        except LDAPException:
            display_name = normalized

        connection.unbind()
        return LdapAuthResult(ok=True, username=normalized, display_name=display_name)
    except LDAPException as exc:
        return LdapAuthResult(ok=False, error=str(exc))
    except Exception as exc:
        return LdapAuthResult(ok=False, error=f"LDAP connection failed: {exc}")


def _search_base_from_bind(bind_user: str) -> str:
    if LDAP_BIND_FORMAT.lower() == "dn" and LDAP_BIND_DN_TEMPLATE:
        parts = LDAP_BIND_DN_TEMPLATE.split(",", 1)
        if len(parts) == 2:
            return parts[1]
    domain = LDAP_DOMAIN or "corp.amdocs.com"
    pieces = [f"DC={piece}" for piece in domain.split(".") if piece]
    return ",".join(pieces) if pieces else domain
