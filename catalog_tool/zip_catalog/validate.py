"""Validate CatalogOne zip entities and collect user-facing findings."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from catalog_tool.zip_catalog.parser import CatalogZipEntity

FindingKind = Literal["error", "warning", "duplicate", "typo"]

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


@dataclass
class ZipFinding:
    kind: FindingKind
    message: str
    entity_path: str = ""
    field: str = ""


@dataclass
class ZipValidationReport:
    findings: list[ZipFinding] = field(default_factory=list)

    @property
    def errors(self) -> list[ZipFinding]:
        return [item for item in self.findings if item.kind == "error"]

    @property
    def has_blocking_issues(self) -> bool:
        return bool(self.errors)


def _localized_values(node: Any) -> list[str]:
    if isinstance(node, list):
        values: list[str] = []
        for item in node:
            if isinstance(item, dict):
                value = str(item.get("value") or "").strip()
                if value:
                    values.append(value)
        return values
    return []


def _walk_strings(node: Any, path: str = "") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for key, value in node.items():
            child_path = f"{path}.{key}" if path else key
            if key in {"localizedName", "localizedValue", "description"} and isinstance(
                value, list
            ):
                for index, entry in enumerate(value):
                    if isinstance(entry, dict):
                        text = str(entry.get("value") or "")
                        found.append((f"{child_path}[{index}].value", text))
            else:
                found.extend(_walk_strings(value, child_path))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(_walk_strings(item, f"{path}[{index}]"))
    return found


def validate_entities(entities: list[CatalogZipEntity]) -> ZipValidationReport:
    report = ZipValidationReport()
    ids_by_type: dict[str, list[str]] = {}
    names_by_type: dict[str, list[tuple[str, str]]] = {}

    for entity in entities:
        path = entity.relative_path
        json_id = str(entity.data.get("id") or "").strip()
        if not json_id:
            report.findings.append(
                ZipFinding("error", "Missing top-level id", path, "id")
            )
        elif json_id.lower() != entity.entity_id.lower():
            report.findings.append(
                ZipFinding(
                    "error",
                    f"Filename id {entity.entity_id} does not match JSON id {json_id}",
                    path,
                    "id",
                )
            )
        elif not _UUID_RE.match(json_id):
            report.findings.append(
                ZipFinding("error", f"Invalid UUID format: {json_id}", path, "id")
            )

        display_names = _localized_values(entity.data.get("localizedName"))
        if not display_names:
            report.findings.append(
                ZipFinding("error", "localizedName is empty", path, "localizedName")
            )
        else:
            bucket = names_by_type.setdefault(entity.entity_type, [])
            for name in display_names:
                for other_path, other_name in bucket:
                    if name.lower() == other_name.lower():
                        report.findings.append(
                            ZipFinding(
                                "duplicate",
                                f'Duplicate {entity.entity_type} name "{name}" '
                                f"(also in {other_path})",
                                path,
                                "localizedName",
                            )
                        )
                bucket.append((path, name))

        ids_by_type.setdefault(entity.entity_type, []).append(json_id or entity.entity_id)

        descriptions = _localized_values(entity.data.get("description"))
        if not descriptions:
            report.findings.append(
                ZipFinding("warning", "description is empty", path, "description")
            )

        for field_path, text in _walk_strings(entity.data):
            if field_path.endswith(".value") and text == "":
                report.findings.append(
                    ZipFinding(
                        "warning",
                        f"Empty localized text at {field_path}",
                        path,
                        field_path,
                    )
                )

        _detect_label_typos(entity, report)

    for entity_type, ids in ids_by_type.items():
        if len(ids) != len(set(id.lower() for id in ids)):
            report.findings.append(
                ZipFinding(
                    "duplicate",
                    f"Duplicate {entity_type} id in zip",
                    entity_type,
                    "id",
                )
            )

    return report


def _detect_label_typos(entity: CatalogZipEntity, report: ZipValidationReport) -> None:
    """Flag likely typos when similar labels differ by a short suffix/prefix."""
    for policy_index, policy in enumerate(entity.data.get("policy") or []):
        if not isinstance(policy, dict):
            continue
        policy_labels = _localized_values(policy.get("localizedName"))
        for characteristic in policy.get("characteristic") or []:
            if not isinstance(characteristic, dict):
                continue
            char_labels = _localized_values(characteristic.get("localizedName"))
            for policy_label in policy_labels:
                for char_label in char_labels:
                    if _likely_typo_pair(policy_label, char_label):
                        report.findings.append(
                            ZipFinding(
                                "typo",
                                (
                                    f'Possible typo/inconsistency in policy[{policy_index}]: '
                                    f'policy localizedName "{policy_label}" vs '
                                    f'characteristic localizedName "{char_label}"'
                                ),
                                entity.relative_path,
                                "localizedName",
                            )
                        )

    labels = [
        text.strip()
        for _, text in _walk_strings(entity.data)
        if text.strip() and "localized" in _.lower()
    ]
    seen: set[str] = set()
    for left in labels:
        for right in labels:
            if left >= right or right in seen:
                continue
            if _likely_typo_pair(left, right):
                report.findings.append(
                    ZipFinding(
                        "typo",
                        f'Possible typo/inconsistency: "{left}" vs "{right}"',
                        entity.relative_path,
                        "localizedName",
                    )
                )
        seen.add(left)


def _likely_typo_pair(left: str, right: str) -> bool:
    if left == right:
        return False
    shorter, longer = sorted((left, right), key=len)
    if not shorter or not longer.startswith(shorter[: max(8, len(shorter) - 3)]):
        return False
    if abs(len(longer) - len(shorter)) > 4:
        return False
    return longer.startswith(shorter) or shorter in longer
