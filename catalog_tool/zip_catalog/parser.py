"""Parse CatalogOne export ZIP archives (entityType/entityId.json)."""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any, BinaryIO

_ENTITY_PATH_RE = re.compile(
    r"^([a-zA-Z][a-zA-Z0-9_-]*)/([0-9a-fA-F-]{36})\.json$"
)


@dataclass(frozen=True)
class CatalogZipEntity:
    entity_type: str
    entity_id: str
    archive_path: str
    data: dict[str, Any]

    @property
    def relative_path(self) -> str:
        return f"{self.entity_type}/{self.entity_id}.json"


def parse_catalog_zip(source: bytes | BinaryIO) -> list[CatalogZipEntity]:
    """Extract entity JSON files from a CatalogOne export zip."""
    if isinstance(source, (bytes, bytearray)):
        buffer: BinaryIO = BytesIO(source)
    else:
        buffer = source

    entities: list[CatalogZipEntity] = []
    seen_paths: set[str] = set()

    with zipfile.ZipFile(buffer) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            normalized = PurePosixPath(info.filename).as_posix().lstrip("./")
            match = _ENTITY_PATH_RE.match(normalized)
            if not match:
                continue
            if normalized in seen_paths:
                raise ValueError(f"Duplicate archive path: {normalized}")
            seen_paths.add(normalized)

            entity_type, file_id = match.groups()
            try:
                raw = archive.read(info)
                data = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise ValueError(f"Invalid JSON in {normalized}: {exc}") from exc
            if not isinstance(data, dict):
                raise ValueError(f"Expected JSON object in {normalized}")

            entities.append(
                CatalogZipEntity(
                    entity_type=entity_type,
                    entity_id=file_id,
                    archive_path=normalized,
                    data=data,
                )
            )

    if not entities:
        raise ValueError(
            "No catalog entities found. Expected paths like promotion/<uuid>.json"
        )
    return entities
