"""Build a PR-ready package containing only zip delta files."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from catalog_tool.zip_catalog.diff import EntityDiff, pr_candidates
from catalog_tool.zip_catalog.validate import ZipValidationReport

_SAFE_SLUG_RE = re.compile(r"[^a-zA-Z0-9._-]+")


@dataclass(frozen=True)
class PrPackageResult:
    package_dir: Path
    branch_name: str
    summary_path: Path
    manifest_path: Path
    files: list[str]
    git: dict[str, str]


def _slugify(value: str) -> str:
    slug = _SAFE_SLUG_RE.sub("-", value).strip("-").lower()
    return slug[:80] or "catalog-zip-import"


def build_summary_markdown(
    *,
    zip_name: str,
    diffs: list[EntityDiff],
    validation: ZipValidationReport,
    publish_blocked: bool = True,
) -> str:
    candidates = pr_candidates(diffs)
    lines = [
        f"# Catalog zip import — {zip_name}",
        "",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## Delta summary",
        "",
        f"- **New entities:** {sum(1 for d in diffs if d.status == 'new')}",
        f"- **Changed entities:** {sum(1 for d in diffs if d.status == 'changed')}",
        f"- **Unchanged (excluded from PR):** {sum(1 for d in diffs if d.status == 'unchanged')}",
        f"- **Files in PR package:** {len(candidates)}",
        "",
    ]
    if publish_blocked:
        lines.extend(
            [
                "> **Publish blocked** — this package is for review only. "
                "No CatalogOne publish was performed.",
                "",
            ]
        )

    if candidates:
        lines.extend(["## Included files", ""])
        for item in candidates:
            name = _localized_title(item.entity.data)
            lines.append(f"- `{item.entity.relative_path}` — **{item.status}** — {name}")
        lines.append("")

    grouped: dict[str, list] = {
        "error": [],
        "duplicate": [],
        "typo": [],
        "warning": [],
    }
    for finding in validation.findings:
        grouped.setdefault(finding.kind, []).append(finding)

    for kind, title in (
        ("error", "Errors"),
        ("duplicate", "Duplicates"),
        ("typo", "Possible typos / inconsistencies"),
        ("warning", "Warnings"),
    ):
        items = grouped.get(kind) or []
        if not items:
            continue
        lines.extend([f"## {title}", ""])
        for finding in items:
            prefix = f"`{finding.entity_path}`" if finding.entity_path else ""
            field = f" ({finding.field})" if finding.field else ""
            lines.append(f"- {prefix}{field}: {finding.message}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _localized_title(data: dict) -> str:
    localized = data.get("localizedName")
    if isinstance(localized, list):
        for item in localized:
            if isinstance(item, dict) and item.get("value"):
                return str(item["value"])
    return str(data.get("id") or "entity")


def create_pr_package(
    *,
    zip_name: str,
    diffs: list[EntityDiff],
    validation: ZipValidationReport,
    output_root: Path,
    baseline_dir: Path,
) -> PrPackageResult:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    branch_name = f"catalog-zip/{timestamp}-{_slugify(Path(zip_name).stem)}"
    package_dir = output_root / branch_name
    if package_dir.exists():
        shutil.rmtree(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)

    included_files: list[str] = []
    for item in pr_candidates(diffs):
        target = package_dir / item.entity.relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(item.entity.data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        included_files.append(item.entity.relative_path)

    summary_path = package_dir / "PR_SUMMARY.md"
    summary_path.write_text(
        build_summary_markdown(
            zip_name=zip_name,
            diffs=diffs,
            validation=validation,
            publish_blocked=True,
        ),
        encoding="utf-8",
    )

    manifest = {
        "zip_name": zip_name,
        "branch_name": branch_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "publish_blocked": True,
        "baseline_dir": str(baseline_dir),
        "files": included_files,
        "counts": {
            "new": sum(1 for d in diffs if d.status == "new"),
            "changed": sum(1 for d in diffs if d.status == "changed"),
            "unchanged": sum(1 for d in diffs if d.status == "unchanged"),
        },
        "findings": [
            {
                "kind": finding.kind,
                "message": finding.message,
                "entity_path": finding.entity_path,
                "field": finding.field,
            }
            for finding in validation.findings
        ],
    }
    manifest_path = package_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    return PrPackageResult(
        package_dir=package_dir,
        branch_name=branch_name,
        summary_path=summary_path,
        manifest_path=manifest_path,
        files=included_files,
        git={"status": "not_configured"},
    )


def try_create_git_branch(
    package_dir: Path,
    *,
    git_repo: Path | None,
    branch_name: str,
    commit_message: str,
) -> dict[str, str]:
    if not git_repo or not git_repo.is_dir():
        return {"status": "skipped", "reason": "CATALOG_EXPORT_GIT_REPO not set"}
    git_dir = git_repo / ".git"
    if not git_dir.exists():
        return {"status": "skipped", "reason": f"{git_repo} is not a git repository"}

    for relative in package_dir.rglob("*"):
        if not relative.is_file():
            continue
        if relative.name in {"PR_SUMMARY.md", "manifest.json"}:
            continue
        rel = relative.relative_to(package_dir)
        target = git_repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(relative, target)

    summary_src = package_dir / "PR_SUMMARY.md"
    if summary_src.is_file():
        shutil.copy2(summary_src, git_repo / "PR_SUMMARY.md")

    def run(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            cwd=git_repo,
            check=True,
            capture_output=True,
            text=True,
        )

    try:
        run("git", "checkout", "-b", branch_name)
        run("git", "add", "-A")
        run("git", "commit", "-m", commit_message)
        push = subprocess.run(
            ["git", "push", "-u", "origin", branch_name],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )
        if push.returncode != 0:
            return {
                "status": "committed_local",
                "branch": branch_name,
                "reason": (push.stderr or push.stdout or "git push failed").strip(),
            }
        return {"status": "pushed", "branch": branch_name}
    except subprocess.CalledProcessError as exc:
        return {
            "status": "failed",
            "reason": (exc.stderr or exc.stdout or str(exc)).strip(),
        }
