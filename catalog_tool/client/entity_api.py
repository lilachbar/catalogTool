"""CatalogOne entity type → REST API mapping for read operations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EntityGetSpec:
    api_base: str
    path_template: str
    version: str = "v1"
    method: str = "GET"
    post_path: str | None = None
    post_body_key: str = "idList"


# Mirrors catalogone-mcp ENTITY_ENDPOINTS + getEntityBase routing.
ENTITY_GET_SPECS: dict[str, EntityGetSpec] = {
    "productOffering": EntityGetSpec(
        "catalogManagement/authoring",
        "productOffering/{entity_id}/details",
    ),
    "productOfferingType": EntityGetSpec(
        "catalogManagement/authoring",
        "productOfferingType/{entity_id}/details",
    ),
    "productSpec": EntityGetSpec(
        "catalogManagement/authoring",
        "productSpec/{entity_id}/details",
    ),
    "productSpecificationType": EntityGetSpec(
        "catalogManagement/authoring",
        "productSpecificationType/{entity_id}/details",
    ),
    "productOfferingGroup": EntityGetSpec(
        "catalogManagement/authoring",
        "productOfferingGroup/{entity_id}",
    ),
    "productOfferingRelationship": EntityGetSpec(
        "catalogManagement/authoring",
        "productOfferingRelationship/{entity_id}/details",
    ),
    "variantGroup": EntityGetSpec(
        "catalogManagement/authoring",
        "variantGroup/{entity_id}/details",
    ),
    "productOfferingTermPolicy": EntityGetSpec(
        "catalogManagement/authoring",
        "productOfferingTermPolicy/{entity_id}/details",
    ),
    "category": EntityGetSpec(
        "catalogManagement/authoring/resourceAPI",
        "category/{entity_id}",
    ),
    "productOfferingCategory": EntityGetSpec(
        "catalogManagement/authoring/resourceAPI",
        "productOfferingCategory/{entity_id}",
    ),
    "promotion": EntityGetSpec(
        "catalogManagement/promotion",
        "promotion/{entity_id}",
    ),
    "promotionGroup": EntityGetSpec(
        "catalogManagement/promotion",
        "promotionGroup/{entity_id}",
    ),
    "stackablePromotionGroup": EntityGetSpec(
        "catalogManagement/promotion",
        "promotionGroup/{entity_id}",
    ),
    "promotionType": EntityGetSpec(
        "catalogManagement/promotion",
        "promotionType/{entity_id}",
    ),
    "businessRule": EntityGetSpec(
        "catalogManagement/businessRule",
        "rule/{entity_id}",
    ),
    "productConfigurationRule": EntityGetSpec(
        "catalogManagement/product-configuration-rule-command",
        "productConfigurationRule/{entity_id}",
    ),
    "genericElement": EntityGetSpec(
        "catalogManagement/genericEntity",
        "genericElement/{entity_id}",
    ),
    "genericElementEntry": EntityGetSpec(
        "catalogManagement/genericEntity",
        "genericElementEntry/get",
        method="POST",
        post_path="genericElementEntry/get",
        post_body_key="idList",
    ),
    "genericEntitySpecification": EntityGetSpec(
        "catalogManagement/genericEntity",
        "genericEntitySpecification/{entity_id}",
    ),
    "policy": EntityGetSpec(
        "catalogManagement/pricing",
        "policy/{entity_id}",
    ),
    "priceGroup": EntityGetSpec(
        "catalogManagement/pricing",
        "priceGroup/{entity_id}",
    ),
    "priceEvent": EntityGetSpec(
        "catalogManagement/pricing",
        "priceEvent/{entity_id}",
    ),
}


def resolve_entity_get_spec(entity_type: str) -> EntityGetSpec | None:
    normalized = (entity_type or "").strip()
    if not normalized:
        return None
    if normalized in ENTITY_GET_SPECS:
        return ENTITY_GET_SPECS[normalized]
    lowered = normalized.lower()
    for key, spec in ENTITY_GET_SPECS.items():
        if key.lower() == lowered:
            return spec
    return None
