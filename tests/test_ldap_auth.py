"""Tests for LDAP username normalization and bind DN building."""

from __future__ import annotations

from catalog_tool.auth.ldap import build_bind_dn, normalize_username


def test_normalize_username_strips_domain():
    assert normalize_username("CORP\\liorba") == "liorba"
    assert normalize_username("liorba@corp.amdocs.com") == "liorba"
    assert normalize_username("  LiorBa  ") == "liorba"


def test_build_bind_dn_upn(monkeypatch):
    monkeypatch.setattr("catalog_tool.auth.ldap.LDAP_BIND_FORMAT", "upn")
    monkeypatch.setattr("catalog_tool.auth.ldap.LDAP_DOMAIN", "corp.amdocs.com")
    assert build_bind_dn("liorba") == "liorba@corp.amdocs.com"


def test_build_bind_dn_sam(monkeypatch):
    monkeypatch.setattr("catalog_tool.auth.ldap.LDAP_BIND_FORMAT", "sam")
    monkeypatch.setattr("catalog_tool.auth.ldap.LDAP_DOMAIN", "corp.amdocs.com")
    assert build_bind_dn("liorba") == "CORP\\liorba"
