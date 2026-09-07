from pathlib import Path

import requests

from .config import load_config, path_from_config


def fetch(config: dict) -> Path:
    url = config.get("sources", {}).get("sensors_geojson_url")
    raw_dir = path_from_config(config, "raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    output_path = raw_dir / "sensors.geojson"
    if not url:
        output_path.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
        return output_path
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    output_path.write_text(response.text, encoding="utf-8")
    return output_path


if __name__ == "__main__":
    fetch(load_config())
