import json
import sys
from pathlib import Path

from .config import GIS_ROOT, load_config, path_from_config
from .process_layers import LAYER_NAMES


def validate_geometry(geometry: dict, path: Path) -> None:
    coordinates = geometry.get("coordinates")
    if geometry.get("type") not in {"Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"}:
        raise ValueError(f"{path}: unsupported geometry type")

    def walk(values):
        if isinstance(values, (int, float)):
            return
        if len(values) == 2 and all(isinstance(value, (int, float)) for value in values):
            longitude, latitude = values
            if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                raise ValueError(f"{path}: coordinate outside WGS84 bounds")
            return
        for value in values:
            walk(value)

    walk(coordinates)


def validate(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"{path}: expected GeoJSON FeatureCollection")
    for item in data["features"]:
        if item.get("type") != "Feature" or not isinstance(item.get("properties"), dict):
            raise ValueError(f"{path}: invalid feature structure")
        if item.get("geometry") is not None:
            validate_geometry(item["geometry"], path)


def validate_all(config: dict) -> None:
    output_dir = path_from_config(config, "layers_dir")
    for name in LAYER_NAMES:
        validate(output_dir / f"{name}.geojson")


if __name__ == "__main__":
    validate_all(load_config())
    print("GeoJSON validation passed")
