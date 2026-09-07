import json
from pathlib import Path

import requests

from .config import load_config, path_from_config, require_bbox


def build_query(bbox: list[float]) -> str:
    west, south, east, north = bbox
    area = f"{south},{west},{north},{east}"
    return f"""[out:json][timeout:180];
(
  nwr[place~\"^(village|town|city|hamlet|isolated_dwelling)$\"]({area});
  nwr[amenity]({area});
  nwr[emergency]({area});
  nwr[healthcare]({area});
  nwr[power]({area});
  nwr[public_transport]({area});
  nwr[man_made~\"^(water_tower|communications_tower|works)$\"]({area});
  nwr[waterway]({area});
  nwr[bridge]({area});
);
out center tags;"""


def fetch(config: dict) -> Path:
    bbox = require_bbox(config)
    endpoint = config["sources"]["overpass_url"]
    response = requests.post(
        endpoint,
        data={"data": build_query(bbox)},
        headers={
            "User-Agent": config.get("sources", {}).get("user_agent", "SlopeGuard-GIS/1.0"),
            "Accept": "application/json",
        },
        timeout=240,
    )
    response.raise_for_status()
    raw_dir = path_from_config(config, "raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    output_path = raw_dir / "osm.json"
    output_path.write_text(response.text, encoding="utf-8")
    return output_path


if __name__ == "__main__":
    fetch(load_config())
