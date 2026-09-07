import json
from pathlib import Path

import requests

from .config import load_config, path_from_config


def fetch(config: dict) -> Path:
    sources = config.get("sources", {})
    raw_dir = path_from_config(config, "raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    output_path = raw_dir / "terrain.geojson"
    source_url = sources.get("terrain_geojson_url")
    if source_url:
        response = requests.get(source_url, timeout=120)
        response.raise_for_status()
        output_path.write_text(response.text, encoding="utf-8")
        return output_path

    points = sources.get("terrain_sample_points", [])
    elevation_url = sources.get("elevation_url")
    if not points or not elevation_url:
        output_path.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
        return output_path

    locations = "|".join(f"{point['lat']},{point['lon']}" for point in points)
    response = requests.get(f"{elevation_url}?locations={locations}", timeout=120)
    response.raise_for_status()
    results = response.json().get("results", [])
    features = []
    for result in results:
        location = result.get("location", {})
        if "lat" not in location or "lng" not in location:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [location["lng"], location["lat"]]},
            "properties": {"elevation_m": result.get("elevation"), "source": elevation_url},
        })
    output_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    return output_path


if __name__ == "__main__":
    fetch(load_config())
