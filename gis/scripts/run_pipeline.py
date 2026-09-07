import argparse

import requests

from .config import geocode_area, load_config, validate_bbox
from .fetch_osm import fetch as fetch_osm
from .fetch_historical_landslides import fetch as fetch_historical_landslides
from .fetch_risk_data import fetch as fetch_risk
from .fetch_sensors import fetch as fetch_sensors
from .fetch_terrain import fetch as fetch_terrain
from .fetch_vegetation import fetch as fetch_vegetation
from .fetch_zones import fetch as fetch_zones
from .generate_exposure import generate as generate_exposure
from .process_layers import process
from .validate_geojson import validate_all


def run(
    config_path: str | None = None,
    bbox: list[float] | None = None,
    area: str | None = None,
) -> None:
    config = load_config(config_path) if config_path else load_config()
    if bbox is not None:
        config["bbox"] = validate_bbox(bbox)
    elif area is not None:
        config["bbox"] = geocode_area(area, config)
    config["selected_area"] = area
    fetch_zones(config, area)
    fetch_osm(config)
    fetch_risk(config)
    fetch_historical_landslides(config)
    fetch_sensors(config)
    fetch_terrain(config)
    fetch_vegetation(config)
    process(config)
    generate_exposure(config)
    validate_all(config)
    print("GIS pipeline completed and GeoJSON validation passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch, process, and validate SlopeGuard GIS layers")
    parser.add_argument("--config", help="Path to a YAML configuration file")
    location = parser.add_mutually_exclusive_group()
    location.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="Runtime WGS84 bounding box; overrides the configured bbox",
    )
    location.add_argument(
        "--area",
        help="Place name to resolve through the configured geocoding service",
    )
    args = parser.parse_args()
    try:
        run(args.config, args.bbox, args.area)
    except (requests.RequestException, ValueError) as error:
        parser.error(str(error))
