"""Compare imported BR entities against production or audit baselines."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from catalog_tool.client.catalog_one_client import CatalogOneClient

CompareType = Literal["production", "audit"]


@dataclass
class FieldChange:
    path: str
    baseline: Any
    current: Any
    change: str


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

    def to_dict(self) -> dict[str, Any]:
        return {
            "compare_type": self.compare_type,
            "business_request_id": self.business_request_id,
            "summary": {
                "entity_count": self.entity_count,
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
                            "baseline": change.baseline,
                            "current": change.current,
                            "change": change.change,
                        }
                        for change in item.field_changes
                    ],
                    "audit_versions": item.audit_versions,
                    "error": item.error,
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
) -> BrCompareReport:
    """Compare entities in a BR against production or audit baselines."""
    if compare_type not in {"production", "audit"}:
        raise ValueError("compare_type must be production or audit")

    client.ensure_business_request_local_context(business_request_id)

    results: list[EntityCompareResult] = []
    for entity in entities:
        entity_id = (entity.get("entity_id") or "").strip()
        entity_type = (entity.get("entity_type") or "").strip()
        title = (entity.get("title") or entity_id).strip()
        if not entity_id or not entity_type:
            continue
        if compare_type == "production":
            results.append(
                _compare_entity_production(
                    client,
                    business_request_id=business_request_id,
                    entity_id=entity_id,
                    entity_type=entity_type,
                    title=title,
                )
            )
        else:
            results.append(
                _compare_entity_audit(
                    client,
                    business_request_id=business_request_id,
                    entity_id=entity_id,
                    entity_type=entity_type,
                    title=title,
                )
            )

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

    try:
        published = client.get_entity_published(entity_type, entity_id)
    except Exception as exc:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="errors",
            summary="Could not load production baseline.",
            error=str(exc),
        )

    if published is None:
        changes = _flatten_entity(local)
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="new_in_br",
            summary="No production version found — entity exists only in this business request.",
            field_changes=[
                FieldChange(path=path, baseline=None, current=value, change="added")
                for path, value in sorted(changes.items())
            ][:20],
        )

    field_changes = _diff_entities(published, local)
    if not field_changes:
        return EntityCompareResult(
            entity_id=entity_id,
            entity_type=entity_type,
            title=title,
            status="identical",
            summary="Matches production — no differences detected.",
        )

    return EntityCompareResult(
        entity_id=entity_id,
        entity_type=entity_type,
        title=title,
        status="changed",
        summary=_summarize_production_changes(field_changes),
        field_changes=field_changes,
    )


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


def _humanize_field_path(path: str) -> str:
    known = {
        "validFor.endDateTime": "Expiration date",
        "validFor.startDateTime": "Start date",
        "localizedName": "Name",
        "description": "Description",
    }
    if path in known:
        return known[path]
    if path.startswith("validFor."):
        return path.replace("validFor.", "Valid for ").replace("DateTime", " date")
    return path.rsplit(".", 1)[-1]


def _field_changes_from_audit_compare(payload: Any) -> list[FieldChange]:
    if not isinstance(payload, list):
        return []

    changes: list[FieldChange] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        ui_path = str(item.get("uiPath") or item.get("path") or "field")
        display = item.get("displayDetails") or {}
        field_values = display.get("fieldValues") or {}
        oldest = field_values.get("oldestData") or {}
        newest = field_values.get("newestData") or {}
        action = newest.get("action") or oldest.get("action") or "MODIFIED"
        if action in {"NO_CHANGE", "IDENTICAL"}:
            continue
        changes.append(
            FieldChange(
                path=ui_path,
                baseline=oldest.get("label") or oldest.get("value") or oldest,
                current=newest.get("label") or newest.get("value") or newest,
                change=str(action).lower(),
            )
        )
    return changes


def _diff_entities(baseline: Any, current: Any) -> list[FieldChange]:
    base_flat = _flatten_entity(baseline)
    current_flat = _flatten_entity(current)
    changes: list[FieldChange] = []
    paths = sorted(set(base_flat) | set(current_flat))
    for path in paths:
        base_val = base_flat.get(path)
        cur_val = current_flat.get(path)
        if base_val == cur_val:
            continue
        if path not in base_flat:
            changes.append(FieldChange(path=path, baseline=None, current=cur_val, change="added"))
        elif path not in current_flat:
            changes.append(FieldChange(path=path, baseline=base_val, current=None, change="removed"))
        else:
            changes.append(
                FieldChange(path=path, baseline=base_val, current=cur_val, change="modified")
            )
    return changes


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
