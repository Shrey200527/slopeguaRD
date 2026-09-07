import json
from pathlib import Path

import requests

from .config import load_config, path_from_config, require_bbox


VEGETATION_TAGS = (
    '["natural"~"^(wood|scrub|heath|grassland|wetland|fell|shrubbery)$"]',
    '["landuse"~"^(forest|meadow|orchard|plant_nursery|plantation)$"]',
)


def build_query(bbox: list[float]) -> str:
    west, south, east, north = bbox
    area = f"{south},{west},{north},{east}"
    selectors = "\n".join(f"  nwr{tag}({area});" for tag in VEGETATION_TAGS)
    return f"[out:json][timeout:600];(\n{selectors}\n);out geom tags;"


def element_geometry(element: dict) -> dict | None:
    if element.get("type") == "node" and element.get("lat") is not None:
        return {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
    points = element.get("geometry", [])
    if len(points) < 2:
        center = element.get("center")
        return {"type": "Point", "coordinates": [center["lon"], center["lat"]]} if center else None
    coordinates = [[point["lon"], point["lat"]] for point in points]
    if coordinates[0] == coordinates[-1] and len(coordinates) >= 4:
        return {"type": "Polygon", "coordinates": [coordinates]}
    return {"type": "LineString", "coordinates": coordinates}


def fetch(config: dict) -> Path:
    bbox = require_bbox(config)
    sources = config.get("sources", {})
    response = requests.post(
        sources.get("overpass_url", "https://overpass-api.de/api/interpreter"),
        data={"data": build_query(bbox)},
        headers={"User-Agent": sources.get("user_agent", "SlopeGuard-GIS/1.0"), "Accept": "application/json"},
        timeout=700,
    )
    response.raise_for_status()
    features = []
    for element in response.json().get("elements", []):
        geometry = element_geometry(element)
        if geometry:
            properties = {"osm_id": element.get("id"), "osm_type": element.get("type"), **element.get("tags", {})}
            properties["vegetation_density"] = "high" if properties.get("natural") in {"wood", "wetland"} or properties.get("landuse") in {"forest", "plantation"} else "medium"
            properties["source"] = "OpenStreetMap land-cover tags"
            features.append({"type": "Feature", "geometry": geometry, "properties": properties})
    output_path = path_from_config(config, "raw_dir") / "vegetation.geojson"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    return output_path


if __name__ == "__main__":
    fetch(load_config())
