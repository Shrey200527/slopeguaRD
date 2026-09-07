import json
from pathlib import Path
from typing import Any

from .config import load_config, path_from_config


LAYER_NAMES = ("risk_zones", "villages", "roads", "bridges", "infrastructure", "sensors", "terrain")


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


def process_osm(raw: dict) -> dict[str, list[dict]]:
    layers = {name: [] for name in ("villages", "roads", "bridges", "infrastructure")}
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
            layers["villages"].append(feature(geometry, properties))
        if tags.get("highway"):
            layers["roads"].append(feature(geometry, properties))
        if tags.get("bridge") or tags.get("man_made") == "bridge":
            layers["bridges"].append(feature(geometry, properties))
        if infrastructure_keys.intersection(tags) or tags.get("bridge") or tags.get("highway") == "construction":
            layers["infrastructure"].append(feature(geometry, properties))
    return layers


def read_collection(path: Path) -> dict:
    if not path.exists():
        return collection([])
    return json.loads(path.read_text(encoding="utf-8"))


def process(config: dict) -> list[Path]:
    raw_dir = path_from_config(config, "raw_dir")
    output_dir = path_from_config(config, "layers_dir")
    output_dir.mkdir(parents=True, exist_ok=True)
    layers = process_osm(read_collection(raw_dir / "osm.json"))
    layers["risk_zones"] = read_collection(raw_dir / "risk_zones.geojson").get("features", [])
    layers["sensors"] = read_collection(raw_dir / "sensors.geojson").get("features", [])
    layers["terrain"] = read_collection(raw_dir / "terrain.geojson").get("features", [])
    paths = []
    for name in LAYER_NAMES:
        output_path = output_dir / f"{name}.geojson"
        output_path.write_text(json.dumps(collection(layers[name]), indent=2), encoding="utf-8")
        paths.append(output_path)
    return paths


if __name__ == "__main__":
    process(load_config())
