"""Orchestrate catalog zip analyze + PR package workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from catalog_tool.zip_catalog.diff import diff_against_baseline, pr_candidates
from catalog_tool.zip_catalog.parser import parse_catalog_zip
from catalog_tool.zip_catalog.pr_package import create_pr_package, try_create_git_branch
from catalog_tool.zip_catalog.validate import validate_entities


def analyze_catalog_zip(
    zip_bytes: bytes,
    *,
    zip_name: str,
    baseline_dir: Path,
    pr_output_dir: Path,
    git_repo: Path | None = None,
    create_git_branch: bool = False,
) -> dict[str, Any]:
    entities = parse_catalog_zip(zip_bytes)
    validation = validate_entities(entities)
    diffs = diff_against_baseline(entities, baseline_dir)
    package = create_pr_package(
        zip_name=zip_name,
        diffs=diffs,
        validation=validation,
        output_root=pr_output_dir,
        baseline_dir=baseline_dir,
    )

    git_result = {"status": "skipped", "reason": "not requested"}
    if create_git_branch:
        git_result = try_create_git_branch(
            package.package_dir,
            git_repo=git_repo,
            branch_name=package.branch_name,
            commit_message=f"Catalog zip import: {zip_name}",
        )

    return {
        "status": "ok",
        "publish_blocked": True,
        "zip_name": zip_name,
        "entity_count": len(entities),
        "counts": {
            "new": sum(1 for item in diffs if item.status == "new"),
            "changed": sum(1 for item in diffs if item.status == "changed"),
            "unchanged": sum(1 for item in diffs if item.status == "unchanged"),
            "pr_files": len(package.files),
        },
        "pr_files": package.files,
        "branch_name": package.branch_name,
        "package_dir": str(package.package_dir),
        "summary_path": str(package.summary_path),
        "summary_markdown": package.summary_path.read_text(encoding="utf-8"),
        "findings": [
            {
                "kind": finding.kind,
                "message": finding.message,
                "entity_path": finding.entity_path,
                "field": finding.field,
            }
            for finding in validation.findings
        ],
        "entities": [
            {
                "path": item.entity.relative_path,
                "entity_type": item.entity.entity_type,
                "entity_id": item.entity.entity_id,
                "status": item.status,
                "title": _entity_title(item.entity.data),
                "included_in_pr": item.status in {"new", "changed"},
            }
            for item in diffs
        ],
        "has_blocking_issues": validation.has_blocking_issues,
        "git": git_result,
        "candidates": len(pr_candidates(diffs)),
    }


def _entity_title(data: dict) -> str:
    localized = data.get("localizedName")
    if isinstance(localized, list):
        for item in localized:
            if isinstance(item, dict) and item.get("value"):
                return str(item["value"])
    return str(data.get("id") or "")
