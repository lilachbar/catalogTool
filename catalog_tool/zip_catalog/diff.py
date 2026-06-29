"""Diff catalog zip entities against an on-disk baseline."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from catalog_tool.zip_catalog.parser import CatalogZipEntity


@dataclass(frozen=True)
class EntityDiff:
    entity: CatalogZipEntity
    status: str  # new | changed | unchanged
    baseline_path: str | None = None


def _normalize_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _normalize_json(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_normalize_json(item) for item in value]
    return value


def _canonical_json(data: dict[str, Any]) -> str:
    return json.dumps(_normalize_json(data), sort_keys=True, separators=(",", ":"))


def load_baseline_entity(baseline_dir: Path, entity: CatalogZipEntity) -> dict[str, Any] | None:
    path = baseline_dir / entity.relative_path
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def diff_against_baseline(
    entities: list[CatalogZipEntity],
    baseline_dir: Path,
) -> list[EntityDiff]:
    results: list[EntityDiff] = []
    for entity in entities:
        baseline = load_baseline_entity(baseline_dir, entity)
        if baseline is None:
            results.append(EntityDiff(entity=entity, status="new"))
            continue
        if _canonical_json(entity.data) == _canonical_json(baseline):
            results.append(
                EntityDiff(
                    entity=entity,
                    status="unchanged",
                    baseline_path=str(baseline_dir / entity.relative_path),
                )
            )
        else:
            results.append(
                EntityDiff(
                    entity=entity,
                    status="changed",
                    baseline_path=str(baseline_dir / entity.relative_path),
                )
            )
    return results


def pr_candidates(diffs: list[EntityDiff]) -> list[EntityDiff]:
    return [item for item in diffs if item.status in {"new", "changed"}]
