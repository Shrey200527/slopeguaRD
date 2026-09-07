import json
from pathlib import Path

from .config import load_config, path_from_config


CANONICAL_ZONES = {
    "ZONE_A": {
        "name": "Zone A",
        "latitude": 27.084,
        "longitude": 93.605,
    },
    "ZONE_B": {
        "name": "Zone B",
        "latitude": 27.586,
        "longitude": 91.859,
    },
    "ZONE_C": {
        "name": "Zone C",
        "latitude": 28.066,
        "longitude": 95.327,
    },
    "ZONE_D": {
        "name": "Zone D",
        "latitude": 27.013,
        "longitude": 92.647,
    },
}


def zone_polygon(latitude: float, longitude: float, size: float = 0.08) -> dict:
    """Create a small operational monitoring polygon around a zone center."""
    return {
        "type": "Polygon",
        "coordinates": [[
            [longitude - size, latitude - size],
            [longitude + size, latitude - size],
            [longitude + size, latitude + size],
            [longitude - size, latitude + size],
            [longitude - size, latitude - size],
        ]],
    }


def fetch(config: dict, area_name: str | None = None) -> Path:
    features = []

    for zone_id, zone in CANONICAL_ZONES.items():
        features.append({
            "type": "Feature",
            "geometry": zone_polygon(
                zone["latitude"],
                zone["longitude"],
            ),
            "properties": {
                "zone_id": zone_id,
                "name": zone["name"],
                "zone_type": "operational_monitoring_zone",
                "source": "SlopeGuard prototype configuration",
                "latitude": zone["latitude"],
                "longitude": zone["longitude"],
            },
        })

    output = {
        "type": "FeatureCollection",
        "features": features,
    }

    output_path = path_from_config(config, "layers_dir") / "zones.geojson"
    output_path.write_text(
        json.dumps(output, indent=2),
        encoding="utf-8",
    )
    return output_path


if __name__ == "__main__":
    fetch(load_config())