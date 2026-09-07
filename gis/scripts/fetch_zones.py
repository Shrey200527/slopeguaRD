import hashlib
import json
import re
from pathlib import Path

import requests

from .config import load_config, path_from_config, require_bbox


def stable_zone_id(area_name: str | None, bbox: list[float]) -> str:
    if area_name:
        slug = re.sub(r"[^a-z0-9]+", "-", area_name.lower()).strip("-")
        return f"zone-{slug[:48]}"
    digest = hashlib.sha1(",".join(f"{value:.6f}" for value in bbox).encode()).hexdigest()[:12]
    return f"zone-bbox-{digest}"


def bbox_polygon(bbox: list[float]) -> dict:
    west, south, east, north = bbox
    return {
        "type": "Polygon",
        "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }


def fetch(config: dict, area_name: str | None = None) -> Path:
    bbox = require_bbox(config)
    zone_id = stable_zone_id(area_name, bbox)
    # The exact selected BBOX is authoritative: Overpass returns features
    # intersecting that box, including features near administrative borders.
    geometry = bbox_polygon(bbox)
    source = "runtime bounding box"
    output = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": geometry,
            "properties": {"zone_id": zone_id, "name": area_name or "Selected area", "source": source},
        }],
    }
    output_path = path_from_config(config, "layers_dir") / "zones.geojson"
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    return output_path


if __name__ == "__main__":
    fetch(load_config())
