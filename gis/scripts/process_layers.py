import json
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


def collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def feature(geometry: dict, properties: dict) -> dict:
    properties.setdefault("source", "unknown")
    return {"type": "Feature", "geometry": geometry, "properties": properties}


def element_geometry(element: dict) -> dict | None:
    if element.get("type") == "node" and element.get("lat") is not None:
        return {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
    if element.get("geometry"):
        coordinates = [[point["lon"], point["lat"]] for point in element["geometry"]]
        if len(coordinates) >= 2:
            return {"type": "LineString", "coordinates": coordinates}
    center = element.get("center")
    if center:
        return {"type": "Point", "coordinates": [center["lon"], center["lat"]]}
    return None


def point_from_element(element: dict) -> tuple[float, float] | None:
    if element.get("type") == "node" and element.get("lat") is not None:
        return float(element["lat"]), float(element["lon"])
    center = element.get("center")
    if center:
        return float(center["lat"]), float(center["lon"])
    geometry = element.get("geometry", [])
    if geometry:
        middle = geometry[len(geometry) // 2]
        return float(middle["lat"]), float(middle["lon"])
    return None


def osm_id(element: dict) -> str:
    return f"osm-{element.get('type', 'feature')}-{element.get('id', 'unknown')}"


def process_osm(raw: dict) -> dict[str, list[dict]]:
    layers = {name: [] for name in ("villages", "roads", "bridges", "critical_infrastructure")}
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
        properties = {"osm_id": element.get("id"), "osm_type": element.get("type"), **tags, "source": "OpenStreetMap"}
        place = tags.get("place")
        if place in {"village", "town", "city", "hamlet", "isolated_dwelling"}:
            point = point_from_element(element)
            if point:
                latitude, longitude = point
                layers["villages"].append(feature(
                    {"type": "Point", "coordinates": [longitude, latitude]},
                    {**properties, "village_id": osm_id(element), "name": tags.get("name", "Unnamed settlement"),
                     "latitude": latitude, "longitude": longitude, "population": parse_population(tags.get("population")),
                    },
                ))
        if tags.get("highway"):
            layers["roads"].append(feature(
                geometry,
                {**properties, "road_id": osm_id(element), "name": tags.get("name", "Unnamed road"),
                 "road_type": tags.get("highway", "unknown"), "status": tags.get("access", "unknown")},
            ))
        if tags.get("bridge") or tags.get("man_made") == "bridge":
            point = point_from_element(element)
            if point:
                latitude, longitude = point
                layers["bridges"].append(feature(
                    {"type": "Point", "coordinates": [longitude, latitude]},
                    {**properties, "bridge_id": osm_id(element), "name": tags.get("name", "Unnamed bridge"),
                     "latitude": latitude, "longitude": longitude, "status": tags.get("access", "unknown"),
                     "criticality": tags.get("importance", "unknown")},
                ))
        if infrastructure_keys.intersection(tags) or tags.get("bridge") or tags.get("highway") == "construction":
            point = point_from_element(element)
            if point:
                latitude, longitude = point
                asset_type = tags.get("amenity") or tags.get("healthcare") or tags.get("emergency") or tags.get("man_made") or "infrastructure"
                layers["critical_infrastructure"].append(feature(
                    {"type": "Point", "coordinates": [longitude, latitude]},
                    {**properties, "asset_id": osm_id(element), "name": tags.get("name", "Unnamed asset"), "type": asset_type,
                     "latitude": latitude, "longitude": longitude, "criticality": tags.get("importance", "unknown"),
                     "status": tags.get("access", "unknown")},
                ))
    return layers


def parse_population(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        population = int(str(value).replace(",", "").strip())
    except ValueError:
        return None
    return population if population >= 0 else None


def normalize_external(features: list[dict], layer_name: str) -> list[dict]:
    normalized = []
    for index, item in enumerate(features, start=1):
        properties = dict(item.get("properties") or {})
        geometry = item.get("geometry")
        coordinates = geometry.get("coordinates") if geometry else None
        longitude = latitude = None
        if geometry and geometry.get("type") == "Point" and coordinates:
            longitude, latitude = coordinates[:2]
        if layer_name == "sensors":
            properties = {"device_id": properties.get("device_id", properties.get("id", f"sensor-{index}")),
                          "zone_id": properties.get("zone_id"), "latitude": properties.get("latitude", latitude),
                          "longitude": properties.get("longitude", longitude), "status": properties.get("status", "unknown"), **properties}
        elif layer_name == "historical_landslides":
            properties = {"slide_id": properties.get("slide_id", properties.get("id", f"slide-{index}")),
                          "latitude": properties.get("latitude", latitude), "longitude": properties.get("longitude", longitude),
                          "district": properties.get("district"), "state": properties.get("state"),
                          "activity": properties.get("activity"), "triggering": properties.get("triggering"),
                          "material": properties.get("material"), "movement_type": properties.get("movement_type"), **properties}
        normalized.append(feature(geometry, properties))
    return normalized


def point_in_bbox(item: dict, bbox: list[float] | None) -> bool:
    if not bbox or item.get("geometry", {}).get("type") != "Point":
        return True
    west, south, east, north = bbox
    longitude, latitude = item["geometry"]["coordinates"][:2]
    return west <= longitude <= east and south <= latitude <= north


def read_collection(path: Path) -> dict:
    if not path.exists():
        return collection([])
    return json.loads(path.read_text(encoding="utf-8"))


def process(config: dict) -> list[Path]:
    raw_dir = path_from_config(config, "raw_dir")
    output_dir = path_from_config(config, "layers_dir")
    output_dir.mkdir(parents=True, exist_ok=True)
    layers = process_osm(read_collection(raw_dir / "osm.json"))
    layers["zones"] = read_collection(output_dir / "zones.geojson").get("features", [])
    zone_id = (layers["zones"][0].get("properties") or {}).get("zone_id") if layers["zones"] else None
    for layer_name in ("villages", "roads", "bridges", "critical_infrastructure"):
        for item in layers[layer_name]:
            item["properties"]["zone_id"] = zone_id
    layers["sensors"] = normalize_external(read_collection(raw_dir / "sensors.geojson").get("features", []), "sensors")
    layers["historical_landslides"] = normalize_external(read_collection(raw_dir / "historical_landslides.geojson").get("features", []), "historical_landslides")
    for item in layers["sensors"] + layers["historical_landslides"]:
        item["properties"]["zone_id"] = item["properties"].get("zone_id") or zone_id
    layers["terrain"] = read_collection(raw_dir / "terrain.geojson").get("features", [])
    layers["vegetation"] = read_collection(raw_dir / "vegetation.geojson").get("features", [])
    layers["risk_zones"] = read_collection(raw_dir / "risk_zones.geojson").get("features", [])
    for layer_name in ("terrain", "vegetation", "risk_zones"):
        for item in layers[layer_name]:
            item.setdefault("properties", {})["zone_id"] = item.get("properties", {}).get("zone_id") or zone_id
    for layer_name in ("villages", "bridges", "critical_infrastructure", "sensors", "historical_landslides"):
        layers[layer_name] = [item for item in layers[layer_name] if point_in_bbox(item, config.get("bbox"))]
    paths = []
    for name in LAYER_NAMES:
        output_path = output_dir / f"{name}.geojson"
        output_path.write_text(json.dumps(collection(layers[name]), indent=2), encoding="utf-8")
        paths.append(output_path)
    return paths


if __name__ == "__main__":
    process(load_config())
