"""Compare imported BR entities against production or audit baselines."""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Literal

from catalog_tool.client.catalog_one_client import CatalogOneClient

CompareType = Literal["production", "audit"]
DEFAULT_COMPARE_ENTITY_LIMIT = 100
DEFAULT_COMPARE_MAX_WORKERS = 8


@dataclass
class FieldChange:
    path: str
    baseline: Any
    current: Any
    change: str
    label: str = ""

    def __post_init__(self) -> None:
        if not self.label:
            self.label = _humanize_field_path(self.path)


@dataclass
class EntityCompareResult:
    entity_id: str
    entity_type: str
    title: str
    status: str
    summary: str
    field_changes: list[FieldChange] = field(default_factory=list)
    audit_versions: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)


@dataclass
class BrCompareReport:
    compare_type: CompareType
    business_request_id: str
    entity_count: int
    identical: int
    changed: int
    new_in_br: int
    missing_in_br: int
    errors: int
    entities: list[EntityCompareResult] = field(default_factory=list)
    total_entity_count: int = 0
    truncated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "compare_type": self.compare_type,
            "business_request_id": self.business_request_id,
            "summary": {
                "entity_count": self.entity_count,
                "total_entity_count": self.total_entity_count or self.entity_count,
                "truncated": self.truncated,
                "identical": self.identical,
                "changed": self.changed,
                "new_in_br": self.new_in_br,
                "missing_in_br": self.missing_in_br,
                "errors": self.errors,
            },
            "entities": [
                {
                    "entity_id": item.entity_id,
                    "entity_type": item.entity_type,
                    "title": item.title,
                    "status": item.status,
                    "summary": item.summary,
                    "field_changes": [
                        {
                            "path": change.path,
                            "label": change.label,
                            "baseline": change.baseline,
                            "current": change.current,
                            "change": change.change,
                        }
                        for change in item.field_changes
                    ],
                    "audit_versions": item.audit_versions,
                    "error": item.error,
                    "diagnostics": item.diagnostics,
                }
                for item in self.entities
            ],
        }


def compare_business_request(
    client: CatalogOneClient,
    *,
    business_request_id: str,
    compare_type: CompareType,
    entities: list[dict[str, str]],
    max_entities: int = DEFAULT_COMPARE_ENTITY_LIMIT,
    max_workers: int = DEFAULT_COMPARE_MAX_WORKERS,
) -> BrCompareReport:
    """Compare entities in a BR against production or audit baselines."""
    if compare_type not in {"production", "audit"}:
        raise ValueError("compare_type must be production or audit")

    client.ensure_business_request_local_context(business_request_id)

    normalized: list[dict[str, str]] = []
    for entity in entities:
        entity_id = (entity.get("entity_id") or "").strip()
        entity_type = (entity.get("entity_type") or "").strip()
        title = (entity.get("title") or entity_id).strip()
        if entity_id and entity_type:
            normalized.append(
                {
                    "entity_id": entity_id,
                    "entity_type": entity_type,
                    "title": title,
                }
            )

    total_entity_count = len(normalized)
    truncated = False
    if max_entities > 0 and len(normalized) > max_entities:
        normalized = normalized[:max_entities]
        truncated = True

    results: list[EntityCompareResult] = []
    if normalized:
        compare_fn = (
            _compare_entity_production
            if compare_type == "production"
            else _compare_entity_audit
        )
        worker_count = min(max_workers, len(normalized))
        with ThreadPoolExecutor(max_workers=worker_count) as pool:
            futures = [
                pool.submit(
                    compare_fn,
                    client,
                    business_request_id=business_request_id,
                    entity_id=item["entity_id"],
                    entity_type=item["entity_type"],
                    title=item["title"],
                )
                for item in normalized
            ]
            for future in as_completed(futures):
                results.append(future.result())

    counts = {"identical": 0, "changed": 0, "new_in_br": 0, "missing_in_br": 0, "errors": 0}
    for item in results:
        key = item.status if item.status in counts else "errors"
        counts[key] += 1

    return BrCompareReport(
        compare_type=compare_type,
        business_request_id=business_request_id,
        entity_count=len(results),
        identical=counts["identical"],
        changed=counts["changed"],
        new_in_br=counts["new_in_br"],
        missing_in_br=counts["missing_in_br"],
        errors=counts["errors"],
        entities=results,
        total_entity_count=total_entity_count,
        truncated=truncated,
    )


def _compare_entity_production(
    client: CatalogOneClient,
    *,
    business_request_id: str,
    entity_id: str,
    entity_type: str,
    title: str,
) -> EntityCompareResult:
    try:
        local = client.get_entity_in_business_request(
            entity_type, entity_id, business_request_id
        )
    except Exception as exc:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="errors",
            summary="Could not load entity from business request.",
            error=str(exc),
        )

    if local is None:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="missing_in_br",
            summary="Entity is not present in the business request.",
        )

    prod_status: int | None = None
    prod_path: str | None = None
    try:
        if hasattr(client, "get_entity_published_with_status"):
            prod_status, prod_path, published = client.get_entity_published_with_status(
                entity_type, entity_id
            )
        else:
            published = client.get_entity_published(entity_type, entity_id)
    except Exception as exc:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="errors",
            summary="Could not load production baseline.",
            error=str(exc),
            diagnostics=_production_diagnostics(prod_status, prod_path),
        )

    diagnostics = _production_diagnostics(prod_status, prod_path)

    if published is None:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="new_in_br",
            summary="New — not in production (added by this business request).",
            diagnostics=diagnostics,
        )

    field_changes = _diff_entities(published, local)
    if not field_changes:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="identical",
            summary="Matches production — no differences detected.",
            diagnostics=diagnostics,
        )

    return EntityCompareResult(
        entity_id=entity_id,
        entity_type=entity_type,
        title=title,
        status="changed",
        summary=_summarize_production_changes(field_changes),
        field_changes=field_changes,
        diagnostics=diagnostics,
    )


def _production_diagnostics(status: int | None, path: str | None) -> dict[str, Any]:
    if status is None and path is None:
        return {}
    diagnostics: dict[str, Any] = {}
    if status is not None:
        diagnostics["production_status"] = status
    if path is not None:
        diagnostics["production_path"] = path
    return diagnostics


def _compare_entity_audit(
    client: CatalogOneClient,
    *,
    business_request_id: str,
    entity_id: str,
    entity_type: str,
    title: str,
) -> EntityCompareResult:
    try:
        audits = client.search_entity_audit_records(entity_id, entity_type)
    except Exception as exc:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="errors",
            summary="Could not load audit history.",
            error=str(exc),
        )

    audit_versions = [
        {
            "id": record.get("id"),
            "operation": record.get("operation"),
            "published_at": (record.get("publishMetaData") or {}).get("publishDateTime"),
            "published_by": (record.get("publishMetaData") or {}).get("publishedUserName"),
            "business_request_name": (
                (record.get("publishMetaData") or {})
                .get("sourceContext", {})
                .get("businessRequestName")
            ),
            "is_latest": record.get("isLatestVersion"),
        }
        for record in audits
    ]

    if not audits:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="new_in_br",
            summary="No audit history found for this entity.",
            audit_versions=audit_versions,
        )

    if len(audits) >= 2:
        newest = audits[0]
        previous = audits[1]
        try:
            compare_payload = client.audit_compare_entities(
                business_request_id=business_request_id,
                entity_id=entity_id,
                entity_type=entity_type,
                source_audit_id=str(newest["id"]),
                target_audit_id=str(previous["id"]),
            )
            field_changes = _field_changes_from_audit_compare(compare_payload)
            status = "identical" if not field_changes else "changed"
            summary = (
                "Matches previous audit version."
                if not field_changes
                else f"{len(field_changes)} change(s) since previous audit version."
            )
            return EntityCompareResult(
                entity_id=entity_id,
                entity_type=entity_type,
                title=title,
                status=status,
                summary=summary,
                field_changes=field_changes,
                audit_versions=audit_versions,
            )
        except Exception as exc:
            return EntityCompareResult(
                entity_id=entity_id,
                entity_type=entity_type,
                title=title,
                status="errors",
                summary="Audit compare failed.",
                audit_versions=audit_versions,
                error=str(exc),
            )

    production_result = _compare_entity_production(
        client,
        business_request_id=business_request_id,
        entity_id=entity_id,
        entity_type=entity_type,
        title=title,
    )
    production_result.audit_versions = audit_versions
    if production_result.status == "identical":
        production_result.summary = (
            "Single audit record — matches the published audit baseline."
        )
    elif production_result.status == "changed":
        production_result.summary = (
            f"Single audit record — {len(production_result.field_changes)} "
            "difference(s) vs published audit baseline."
        )
    return production_result


def _summarize_production_changes(field_changes: list[FieldChange]) -> str:
    if not field_changes:
        return "Matches production — no differences detected."
    if len(field_changes) == 1:
        only = field_changes[0]
        label = _humanize_field_path(only.path)
        return f"1 difference vs production: {label} changed in your BR import."
    labels = [_humanize_field_path(change.path) for change in field_changes[:3]]
    suffix = f" and {len(field_changes) - 3} more" if len(field_changes) > 3 else ""
    return (
        f"{len(field_changes)} differences vs production: "
        f"{', '.join(labels)}{suffix}."
    )


_KNOWN_FIELD_LABELS = {
    "code": "Code",
    "name": "Name",
    "localizedname": "Name",
    "displayname": "Display name",
    "description": "Description",
    "localizeddescription": "Description",
    "validfor.enddatetime": "Expires on",
    "validfor.startdatetime": "Effective from",
    "enddatetime": "Expires on",
    "startdatetime": "Effective from",
    "priority": "Priority",
    "status": "Status",
    "lifecyclestatus": "Lifecycle status",
    "value": "Value",
    "benefits": "Benefits",
}


def _spaced_label(text: str) -> str:
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", text).replace("_", " ").strip()
    spaced = spaced.replace("DateTime", "date").replace("Date Time", "date")
    if not spaced:
        return text
    return spaced[:1].upper() + spaced[1:]


def _humanize_field_path(path: str) -> str:
    if not path:
        return "—"

    # Drop positional list indices (e.g. localizedName[0].value -> localizedName.value)
    cleaned = re.sub(r"\[\d+\]", "", path)

    lowered = cleaned.lower()
    if lowered in _KNOWN_FIELD_LABELS:
        return _KNOWN_FIELD_LABELS[lowered]

    last = cleaned.rsplit(".", 1)[-1]

    # Identity-matched row: word[identity] -> prefer the identity's own label.
    bracket = re.match(r"^([A-Za-z0-9_]*)\[([^\]]+)\]$", last)
    if bracket:
        base, ident = bracket.group(1), bracket.group(2)
        if ident.lower() in _KNOWN_FIELD_LABELS:
            return _KNOWN_FIELD_LABELS[ident.lower()]
        if base.lower() in _KNOWN_FIELD_LABELS:
            return _KNOWN_FIELD_LABELS[base.lower()]
        if ident and not ident.isdigit():
            return _spaced_label(ident)
        return _spaced_label(base) if base else last

    if last.lower() in _KNOWN_FIELD_LABELS:
        return _KNOWN_FIELD_LABELS[last.lower()]

    return _spaced_label(last)


def _field_changes_from_audit_compare(payload: Any) -> list[FieldChange]:
    if not isinstance(payload, list):
        return []

    changes: list[FieldChange] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        ui_path = str(item.get("uiPath") or item.get("path") or "field")
        display = item.get("displayDetails") or {}
        field_label = str(
            display.get("displayName")
            or display.get("label")
            or item.get("displayName")
            or ui_path
        )
        field_values = display.get("fieldValues") or {}
        oldest = field_values.get("oldestData") or {}
        newest = field_values.get("newestData") or {}
        action = newest.get("action") or oldest.get("action") or "MODIFIED"
        if action in {"NO_CHANGE", "IDENTICAL"}:
            continue
        changes.append(
            FieldChange(
                path=ui_path,
                label=field_label,
                baseline=oldest.get("label") or oldest.get("value") or oldest,
                current=newest.get("label") or newest.get("value") or newest,
                change=str(action).lower(),
            )
        )
    return changes


_IDENTITY_KEYS = ("id", "name", "key", "code")
_SKIP_KEYS = {"policy", "uniqueIds"}


def _diff_entities(baseline: Any, current: Any) -> list[FieldChange]:
    """Structural diff of two entity snapshots (production baseline vs BR local).

    Lists (inner tables) are matched by a stable identity key (``id``/``name``/
    ``key``/``code``) instead of positional index, so added, removed, or
    reordered rows are detected correctly. A row present in production but
    missing from the BR is reported concisely as "not in local"; a row present
    only in the BR is expanded so its new content is visible.
    """
    return _diff_values(baseline, current, "")


def _diff_values(baseline: Any, current: Any, path: str) -> list[FieldChange]:
    if _canonical(baseline) == _canonical(current):
        return []
    if isinstance(baseline, dict) and isinstance(current, dict):
        return _diff_dicts(baseline, current, path)
    if isinstance(baseline, list) and isinstance(current, list):
        return _diff_lists(baseline, current, path)
    return [
        FieldChange(
            path=path or "value",
            baseline=_display_value(baseline),
            current=_display_value(current),
            change="modified",
        )
    ]


def _diff_dicts(baseline: dict, current: dict, path: str) -> list[FieldChange]:
    changes: list[FieldChange] = []
    for key in sorted(set(baseline) | set(current)):
        if key in _SKIP_KEYS:
            continue
        child = f"{path}.{key}" if path else str(key)
        if key in baseline and key in current:
            changes.extend(_diff_values(baseline[key], current[key], child))
        elif key in current:
            changes.extend(_added_changes(child, current[key]))
        else:
            changes.append(_missing_in_local(child, baseline[key]))
    return changes


def _diff_lists(baseline: list, current: list, path: str) -> list[FieldChange]:
    base_by_id = _index_by_identity(baseline)
    cur_by_id = _index_by_identity(current)
    changes: list[FieldChange] = []

    if base_by_id is not None and cur_by_id is not None:
        ordered = list(base_by_id) + [i for i in cur_by_id if i not in base_by_id]
        for ident in ordered:
            child = f"{path}[{ident}]"
            if ident in base_by_id and ident in cur_by_id:
                changes.extend(_diff_values(base_by_id[ident], cur_by_id[ident], child))
            elif ident in cur_by_id:
                changes.extend(_added_changes(child, cur_by_id[ident]))
            else:
                changes.append(_missing_in_local(child, base_by_id[ident]))
        return changes

    # No stable identity — fall back to positional comparison.
    for index in range(max(len(baseline), len(current))):
        child = f"{path}[{index}]"
        if index < len(baseline) and index < len(current):
            changes.extend(_diff_values(baseline[index], current[index], child))
        elif index < len(current):
            changes.extend(_added_changes(child, current[index]))
        else:
            changes.append(_missing_in_local(child, baseline[index]))
    return changes


def _index_by_identity(items: list) -> dict[str, Any] | None:
    """Index list items by a stable identity, or None if not uniquely identifiable."""
    indexed: dict[str, Any] = {}
    for item in items:
        if not isinstance(item, dict):
            return None
        ident = _identity_of(item)
        if ident is None or ident in indexed:
            return None
        indexed[ident] = item
    return indexed or None


def _identity_of(item: dict) -> str | None:
    for key in _IDENTITY_KEYS:
        value = item.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value).strip()
    return None


def _added_changes(path: str, value: Any) -> list[FieldChange]:
    """Expand a BR-only value into per-leaf "added" changes so the content shows."""
    if isinstance(value, (dict, list)):
        leaves = _flatten_entity(value, path)
        if leaves:
            return [
                FieldChange(path=leaf, baseline=None, current=leaf_value, change="added")
                for leaf, leaf_value in sorted(leaves.items())
            ]
    return [FieldChange(path=path, baseline=None, current=_display_value(value), change="added")]


def _missing_in_local(path: str, value: Any) -> FieldChange:
    """A production value with no counterpart in the BR — reported concisely."""
    return FieldChange(
        path=path,
        baseline=_display_value(value),
        current=None,
        change="not_in_local",
    )


def _display_value(value: Any) -> Any:
    if isinstance(value, dict):
        return _readable_name(value) or _identity_of(value) or json.dumps(
            _canonical(value), sort_keys=True, ensure_ascii=False
        )
    if isinstance(value, list):
        count = len(value)
        return f"{count} item{'s' if count != 1 else ''}"
    return _normalize_scalar(value)


def _readable_name(value: dict) -> str | None:
    localized = value.get("localizedName")
    if isinstance(localized, list) and localized:
        first = localized[0]
        if isinstance(first, dict) and first.get("value"):
            return str(first["value"]).strip()
    name = value.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return None


def _canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _canonical(v) for k, v in value.items() if k not in _SKIP_KEYS}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    if isinstance(value, str):
        return value.strip()
    return value


def _flatten_entity(value: Any, prefix: str = "") -> dict[str, Any]:
    flat: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"policy", "uniqueIds"}:
                continue
            path = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(child, (dict, list)):
                flat.update(_flatten_entity(child, path))
            else:
                flat[path] = _normalize_scalar(child)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            path = f"{prefix}[{index}]"
            if isinstance(child, (dict, list)):
                flat.update(_flatten_entity(child, path))
            else:
                flat[path] = _normalize_scalar(child)
    elif prefix:
        flat[prefix] = _normalize_scalar(value)
    return flat


def _normalize_scalar(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return json.dumps(value, sort_keys=True, ensure_ascii=False)
