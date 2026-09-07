from pathlib import Path
from typing import Any

import requests
import yaml


GIS_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GEOCODING_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_USER_AGENT = "SlopeGuard-GIS/1.0"


def validate_bbox(bbox: Any) -> list[float]:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        raise ValueError("bbox must contain four numbers: west south east north")
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in bbox):
        raise ValueError("bbox must contain four numeric coordinates: west south east north")
    west, south, east, north = (float(value) for value in bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("bbox must be valid WGS84 coordinates: west < east and south < north")
    return [west, south, east, north]


def load_config(path: str | Path = GIS_ROOT / "config" / "settings.yaml") -> dict[str, Any]:
    config_path = Path(path)
    with config_path.open(encoding="utf-8") as config_file:
        config = yaml.safe_load(config_file) or {}
    bbox = config.get("bbox")
    if bbox is not None:
        config["bbox"] = validate_bbox(bbox)
    return config


def path_from_config(config: dict[str, Any], key: str) -> Path:
    return GIS_ROOT / config.get("outputs", {}).get(key, key)


def require_bbox(config: dict[str, Any]) -> list[float]:
    bbox = config.get("bbox")
    if bbox is None:
        raise ValueError("No geographic area selected. Use --bbox west south east north or --area \"place name\".")
    return validate_bbox(bbox)


def geocode_area(area: str, config: dict[str, Any]) -> list[float]:
    area = area.strip()
    if not area:
        raise ValueError("--area must be a non-empty place name")
    sources = config.get("sources", {})
    response = requests.get(
        sources.get("geocoding_url", DEFAULT_GEOCODING_URL),
        params={"q": area, "format": "jsonv2", "limit": 5},
        headers={"User-Agent": sources.get("user_agent", DEFAULT_USER_AGENT)},
        timeout=30,
    )
    response.raise_for_status()
    results = response.json()
    if not results:
        raise ValueError(f'No location found for "{area}". Use a more specific place name.')
    if len(results) != 1:
        matches = "; ".join(result.get("display_name", "unknown result") for result in results[:3])
        raise ValueError(
            f'Location "{area}" is ambiguous. Use a more specific place name. Matches: {matches}'
        )
    try:
        south, north, west, east = (float(value) for value in results[0]["boundingbox"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f'Geocoding returned no valid bounding box for "{area}"') from error
    return validate_bbox([west, south, east, north])
