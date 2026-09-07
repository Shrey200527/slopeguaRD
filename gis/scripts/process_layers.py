import json
import math
from pathlib import Path
from typing import Any

from .config import load_config, path_from_config


LAYER_NAMES = (
    "zones",
    "villages",
    "roads",
    "bridges",
    "critical_infrastructure",
    "sensors",
    "historical_landslides",
    "vegetation",
    "terrain",
    "risk_zones",
)


# Road classes that should contribute to road exposure counts.
# Excludes OSM features such as footways, bus stops, platforms, etc.
ROAD_TYPES = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "service",
    "living_street",
    "track",
}


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": features,
    }


def feature(geometry: dict, properties: dict) -> dict:
    properties.setdefault("source", "unknown")
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": properties,
    }


def element_geometry(element: dict) -> dict | None:
    if element.get("type") == "node" and element.get("lat") is not None:
        return {
            "type": "Point",
            "coordinates": [element["lon"], element["lat"]],
        }

    if element.get("geometry"):
        coordinates = [
            [point["lon"], point["lat"]]
            for point in element["geometry"]
        ]

        if len(coordinates) >= 2:
            return {
                "type": "LineString",
                "coordinates": coordinates,
            }

    center = element.get("center")

    if center:
        return {
            "type": "Point",
            "coordinates": [center["lon"], center["lat"]],
        }

    return None


def point_from_element(element: dict) -> tuple[float, float] | None:
    """
    Extract latitude/longitude from a raw OSM element.
    Used only while processing raw OSM data.
    """
    if element.get("type") == "node" and element.get("lat") is not None:
        return (
            float(element["lat"]),
            float(element["lon"]),
        )

    center = element.get("center")

    if center:
        return (
            float(center["lat"]),
            float(center["lon"]),
        )

    geometry = element.get("geometry", [])

    if geometry:
        middle = geometry[len(geometry) // 2]
        return (
            float(middle["lat"]),
            float(middle["lon"]),
        )

    return None


def point_from_feature(feature_data: dict) -> tuple[float, float] | None:
    """
    Extract a representative latitude/longitude from an existing
    GeoJSON feature.

    Point      -> point coordinates
    LineString -> midpoint coordinate
    """
    geometry = feature_data.get("geometry") or {}
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if not coordinates:
        return None

    if geometry_type == "Point":
        longitude, latitude = coordinates[:2]
        return float(latitude), float(longitude)

    if geometry_type == "LineString":
        middle = coordinates[len(coordinates) // 2]
        longitude, latitude = middle[:2]
        return float(latitude), float(longitude)

    return None


def osm_id(element: dict) -> str:
    return (
        f"osm-{element.get('type', 'feature')}-"
        f"{element.get('id', 'unknown')}"
    )


def process_osm(raw: dict) -> dict[str, list[dict]]:
    layers = {
        name: []
        for name in (
            "villages",
            "roads",
            "bridges",
            "critical_infrastructure",
        )
    }

    infrastructure_keys = {
        "amenity",
        "emergency",
        "healthcare",
        "power",
        "public_transport",
        "man_made",
        "waterway",
    }

    for element in raw.get("elements", []):
        tags = element.get("tags", {})
        geometry = element_geometry(element)

        if not geometry:
            continue

        properties = {
            "osm_id": element.get("id"),
            "osm_type": element.get("type"),
            **tags,
            "source": "OpenStreetMap",
        }

        # ---------------------------------------------------------
        # Villages / settlements
        # ---------------------------------------------------------
        place = tags.get("place")

        if place in {
            "village",
            "town",
            "city",
            "hamlet",
            "isolated_dwelling",
        }:
            point = point_from_element(element)

            if point:
                latitude, longitude = point

                layers["villages"].append(
                    feature(
                        {
                            "type": "Point",
                            "coordinates": [longitude, latitude],
                        },
                        {
                            **properties,
                            "village_id": osm_id(element),
                            "name": tags.get(
                                "name",
                                "Unnamed settlement",
                            ),
                            "latitude": latitude,
                            "longitude": longitude,
                            "population": parse_population(
                                tags.get("population")
                            ),
                        },
                    )
                )

        # ---------------------------------------------------------
        # Roads
        # ---------------------------------------------------------
        highway_type = tags.get("highway")

        if highway_type in ROAD_TYPES:
            layers["roads"].append(
                feature(
                    geometry,
                    {
                        **properties,
                        "road_id": osm_id(element),
                        "name": tags.get(
                            "name",
                            "Unnamed road",
                        ),
                        "road_type": highway_type,
                        "status": tags.get(
                            "access",
                            "unknown",
                        ),
                    },
                )
            )

        # ---------------------------------------------------------
        # Bridges
        # ---------------------------------------------------------
        if (
            tags.get("bridge")
            or tags.get("man_made") == "bridge"
        ):
            point = point_from_element(element)

            if point:
                latitude, longitude = point

                layers["bridges"].append(
                    feature(
                        {
                            "type": "Point",
                            "coordinates": [longitude, latitude],
                        },
                        {
                            **properties,
                            "bridge_id": osm_id(element),
                            "name": tags.get(
                                "name",
                                "Unnamed bridge",
                            ),
                            "latitude": latitude,
                            "longitude": longitude,
                            "status": tags.get(
                                "access",
                                "unknown",
                            ),
                            "criticality": tags.get(
                                "importance",
                                "unknown",
                            ),
                        },
                    )
                )

        # ---------------------------------------------------------
        # Critical infrastructure
        # ---------------------------------------------------------
        if (
            infrastructure_keys.intersection(tags)
            or tags.get("bridge")
            or tags.get("highway") == "construction"
        ):
            point = point_from_element(element)

            if point:
                latitude, longitude = point

                asset_type = (
                    tags.get("amenity")
                    or tags.get("healthcare")
                    or tags.get("emergency")
                    or tags.get("man_made")
                    or "infrastructure"
                )

                layers["critical_infrastructure"].append(
                    feature(
                        {
                            "type": "Point",
                            "coordinates": [longitude, latitude],
                        },
                        {
                            **properties,
                            "asset_id": osm_id(element),
                            "name": tags.get(
                                "name",
                                "Unnamed asset",
                            ),
                            "type": asset_type,
                            "latitude": latitude,
                            "longitude": longitude,
                            "criticality": tags.get(
                                "importance",
                                "unknown",
                            ),
                            "status": tags.get(
                                "access",
                                "unknown",
                            ),
                        },
                    )
                )

    return layers


def parse_population(value: Any) -> int | None:
    if value in (None, ""):
        return None

    try:
        population = int(
            str(value).replace(",", "").strip()
        )
    except ValueError:
        return None

    return population if population >= 0 else None


def normalize_external(
    features: list[dict],
    layer_name: str,
) -> list[dict]:
    normalized = []

    for index, item in enumerate(features, start=1):
        properties = dict(
            item.get("properties") or {}
        )

        geometry = item.get("geometry")
        coordinates = (
            geometry.get("coordinates")
            if geometry
            else None
        )

        longitude = None
        latitude = None

        if (
            geometry
            and geometry.get("type") == "Point"
            and coordinates
        ):
            longitude, latitude = coordinates[:2]

        if layer_name == "sensors":
            properties = {
                "device_id": properties.get(
                    "device_id",
                    properties.get(
                        "id",
                        f"sensor-{index}",
                    ),
                ),
                "zone_id": properties.get("zone_id"),
                "latitude": properties.get(
                    "latitude",
                    latitude,
                ),
                "longitude": properties.get(
                    "longitude",
                    longitude,
                ),
                "status": properties.get(
                    "status",
                    "unknown",
                ),
                **properties,
            }

        elif layer_name == "historical_landslides":
            properties = {
                "slide_id": properties.get(
                    "slide_id",
                    properties.get(
                        "id",
                        f"slide-{index}",
                    ),
                ),
                "latitude": properties.get(
                    "latitude",
                    latitude,
                ),
                "longitude": properties.get(
                    "longitude",
                    longitude,
                ),
                "district": properties.get("district"),
                "state": properties.get("state"),
                "activity": properties.get("activity"),
                "triggering": properties.get(
                    "triggering"
                ),
                "material": properties.get("material"),
                "movement_type": properties.get(
                    "movement_type"
                ),
                **properties,
            }

        normalized.append(
            feature(
                geometry,
                properties,
            )
        )

    return normalized


def point_in_bbox(
    item: dict,
    bbox: list[float] | None,
) -> bool:
    if (
        not bbox
        or item.get("geometry", {}).get("type")
        != "Point"
    ):
        return True

    west, south, east, north = bbox

    longitude, latitude = (
        item["geometry"]["coordinates"][:2]
    )

    return (
        west <= longitude <= east
        and south <= latitude <= north
    )


def read_collection(path: Path) -> dict:
    if not path.exists():
        return collection([])

    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def distance_sq(
    latitude: float,
    longitude: float,
    zone_latitude: float,
    zone_longitude: float,
) -> float:
    """
    Approximate squared geographic distance in km^2.

    Suitable for assigning nearby regional features to
    the nearest operational monitoring zone.
    """
    lat_scale = 111.0

    lon_scale = (
        111.0
        * math.cos(
            math.radians(zone_latitude)
        )
    )

    dy = (
        latitude - zone_latitude
    ) * lat_scale

    dx = (
        longitude - zone_longitude
    ) * lon_scale

    return (
        dx * dx
        + dy * dy
    )


def assign_zone(
    latitude: float,
    longitude: float,
    zones: list[dict],
) -> str | None:
    """
    Assign a geographic feature to the nearest
    canonical operational monitoring zone.
    """
    candidates = []

    for zone in zones:
        properties = (
            zone.get("properties")
            or {}
        )

        zone_id = properties.get(
            "zone_id"
        )

        zone_latitude = properties.get(
            "latitude"
        )

        zone_longitude = properties.get(
            "longitude"
        )

        if (
            zone_id
            and isinstance(
                zone_latitude,
                (int, float),
            )
            and isinstance(
                zone_longitude,
                (int, float),
            )
        ):
            candidates.append(
                (
                    distance_sq(
                        latitude,
                        longitude,
                        zone_latitude,
                        zone_longitude,
                    ),
                    zone_id,
                )
            )

    if not candidates:
        return None

    return min(
        candidates,
        key=lambda item: item[0],
    )[1]


def process(config: dict) -> list[Path]:
    raw_dir = path_from_config(
        config,
        "raw_dir",
    )

    output_dir = path_from_config(
        config,
        "layers_dir",
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # -------------------------------------------------------------
    # Process OSM source data
    # -------------------------------------------------------------
    layers = process_osm(
        read_collection(
            raw_dir / "osm.json"
        )
    )

    # -------------------------------------------------------------
    # Load canonical operational monitoring zones
    # -------------------------------------------------------------
    layers["zones"] = read_collection(
        output_dir / "zones.geojson"
    ).get("features", [])

    zones = layers["zones"]

    # -------------------------------------------------------------
    # Assign OSM-derived features to nearest zone
    # -------------------------------------------------------------
    for layer_name in (
        "villages",
        "roads",
        "bridges",
        "critical_infrastructure",
    ):
        for item in layers[layer_name]:
            point = point_from_feature(item)

            if point:
                latitude, longitude = point

                zone_id = assign_zone(
                    latitude,
                    longitude,
                    zones,
                )

                item.setdefault(
                    "properties",
                    {},
                )["zone_id"] = zone_id

    # -------------------------------------------------------------
    # External sensor layer
    # -------------------------------------------------------------
    layers["sensors"] = normalize_external(
        read_collection(
            raw_dir / "sensors.geojson"
        ).get("features", []),
        "sensors",
    )

    for item in layers["sensors"]:
        properties = item.setdefault(
            "properties",
            {},
        )

        # Preserve an explicitly supplied zone_id.
        if properties.get("zone_id"):
            continue

        latitude = properties.get(
            "latitude"
        )
        longitude = properties.get(
            "longitude"
        )

        if (
            latitude is not None
            and longitude is not None
        ):
            properties["zone_id"] = assign_zone(
                float(latitude),
                float(longitude),
                zones,
            )

    # -------------------------------------------------------------
    # Historical landslide layer
    # -------------------------------------------------------------
    layers["historical_landslides"] = normalize_external(
        read_collection(
            raw_dir / "historical_landslides.geojson"
        ).get("features", []),
        "historical_landslides",
    )

    for item in layers["historical_landslides"]:
        properties = item.setdefault(
            "properties",
            {},
        )

        # Preserve an explicitly supplied zone_id.
        if properties.get("zone_id"):
            continue

        latitude = properties.get(
            "latitude"
        )
        longitude = properties.get(
            "longitude"
        )

        if (
            latitude is not None
            and longitude is not None
        ):
            properties["zone_id"] = assign_zone(
                float(latitude),
                float(longitude),
                zones,
            )

    # -------------------------------------------------------------
    # Optional/reference layers
    # -------------------------------------------------------------
    layers["terrain"] = read_collection(
        raw_dir / "terrain.geojson"
    ).get("features", [])

    layers["vegetation"] = read_collection(
        raw_dir / "vegetation.geojson"
    ).get("features", [])

    layers["risk_zones"] = read_collection(
        raw_dir / "risk_zones.geojson"
    ).get("features", [])

    # Do not invent a zone assignment for these layers.
    # Preserve explicitly provided zone IDs only.
    for layer_name in (
        "terrain",
        "vegetation",
        "risk_zones",
    ):
        for item in layers[layer_name]:
            properties = item.setdefault(
                "properties",
                {},
            )

            if properties.get("zone_id"):
                continue

            point = point_from_feature(item)

            if point:
                latitude, longitude = point

                properties["zone_id"] = assign_zone(
                    latitude,
                    longitude,
                    zones,
                )

    # -------------------------------------------------------------
    # Apply configured bounding-box filtering
    # -------------------------------------------------------------
    for layer_name in (
        "villages",
        "bridges",
        "critical_infrastructure",
        "sensors",
        "historical_landslides",
    ):
        layers[layer_name] = [
            item
            for item in layers[layer_name]
            if point_in_bbox(
                item,
                config.get("bbox"),
            )
        ]

    # -------------------------------------------------------------
    # Write final GeoJSON layers
    # -------------------------------------------------------------
    paths = []

    for name in LAYER_NAMES:
        output_path = (
            output_dir
            / f"{name}.geojson"
        )

        output_path.write_text(
            json.dumps(
                collection(
                    layers[name]
                ),
                indent=2,
            ),
            encoding="utf-8",
        )

        paths.append(output_path)

    return paths


if __name__ == "__main__":
    process(
        load_config()
    )