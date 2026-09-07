# SlopeGuard GIS Pipeline

This module fetches real geographic data and publishes standardized GeoJSON layers for downstream SlopeGuard services. It is self-contained under `gis/` and does not modify or require the backend, frontend, ML, or IoT modules.

## Setup

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r gis\requirements.txt
```

The configured `bbox` is optional and may remain `null`. Select an area at runtime with either a WGS84 bounding box or a place name.

## Data sources

- OpenStreetMap through the Overpass API provides villages, roads, bridges, and tagged critical infrastructure.
- `risk_geojson_url` accepts a real public hazard or landslide GeoJSON source.
- `sensors_geojson_url` accepts real sensor observations or locations. Without a configured source, `sensors.geojson` is an empty valid collection; no coordinates are fabricated.
- Terrain can be loaded from `terrain_geojson_url`, or elevation samples can be requested from the configured OpenTopoData endpoint using explicitly configured `terrain_sample_points`.

Respect the terms, attribution, rate limits, and access policies of every upstream provider. OpenStreetMap data requires attribution under the ODbL.

## Run

```powershell
python -m scripts.run_pipeline --bbox 77.4 12.8 77.8 13.2
python -m scripts.run_pipeline --area "Bengaluru, India"
python -m scripts.validate_geojson
```

Run these commands from inside `gis/`. Use `--config path\to\settings.yaml` with either location option to select another configuration. A configured numeric `bbox` remains a backward-compatible fallback when neither option is provided.

`--area` uses the configured Nominatim geocoding endpoint. If no result is found, multiple results are returned, or the service returns an invalid bounding box, the command exits with a clear error and does not start the data fetchers. The geocoding service requires a descriptive User-Agent and is subject to its usage policy.

## Output contract

Every output is a WGS84 GeoJSON `FeatureCollection`. Each feature has a `properties` object and retains source identifiers where available. Published layers are `risk_zones.geojson`, `villages.geojson`, `roads.geojson`, `bridges.geojson`, `infrastructure.geojson`, `sensors.geojson`, and `terrain.geojson`.
