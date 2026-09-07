import csv
import json
from pathlib import Path

from .config import exposure_path, load_config, path_from_config


FIELDS = (
    "zone_id",
    "population",
    "village_count",
    "road_count",
    "bridge_count",
    "school_count",
    "hospital_count",
    "critical_asset_count",
)


def read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("features", [])


def generate(config: dict) -> Path:
    output_dir = path_from_config(config, "layers_dir")
    zones = read(output_dir / "zones.geojson")
    rows = {}
    for zone in zones:
        zone_id = zone.get("properties", {}).get("zone_id")
        if zone_id:
            rows[zone_id] = {field: 0 for field in FIELDS} | {"zone_id": zone_id}

    def for_zone(feature: dict) -> dict | None:
        zone_id = feature.get("properties", {}).get("zone_id")
        return rows.get(zone_id)

    for feature in read(output_dir / "villages.geojson"):
        row = for_zone(feature)
        if row:
            row["village_count"] += 1
            population = feature.get("properties", {}).get("population")
            if isinstance(population, int) and population >= 0:
                row["population"] += population
    for filename, field in (("roads.geojson", "road_count"), ("bridges.geojson", "bridge_count")):
        for feature in read(output_dir / filename):
            row = for_zone(feature)
            if row:
                row[field] += 1
    for feature in read(output_dir / "critical_infrastructure.geojson"):
        row = for_zone(feature)
        if row:
            row["critical_asset_count"] += 1
            asset_type = str(feature.get("properties", {}).get("type", "")).lower()
            if asset_type in {"school", "kindergarten", "college", "university"}:
                row["school_count"] += 1
            if asset_type in {"hospital", "clinic", "healthcare"}:
                row["hospital_count"] += 1

    output_path = exposure_path(config)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows.values())
    return output_path


if __name__ == "__main__":
    generate(load_config())