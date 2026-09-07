# SlopeGuard Member 2 GIS and Exposure

Member 2 provides geographic context and exposure facts: where the selected area is, which villages, roads, bridges, infrastructure assets, sensors, and verified historical landslides are present, and how those entities aggregate by canonical zone. This module does not calculate risk, susceptibility, priority, urgency, or recommended actions.

All published GIS layers use WGS84 / EPSG:4326 GeoJSON.

## Required outputs

- `zones.geojson`: canonical geographic zone(s) with stable `zone_id` and `name`; no risk classification.
- `villages.geojson`: settlements with IDs, names, coordinates, population when verified, and `zone_id`.
- `roads.geojson`: OSM roads with IDs, names, road types, status, and `zone_id`.
- `bridges.geojson`: bridge points with IDs, coordinates, status, criticality, and `zone_id`.
- `critical_infrastructure.geojson`: schools, hospitals, emergency services, utilities, and other mapped assets.
- `sensors.geojson`: sensor locations only; no fabricated live readings.
- `historical_landslides.geojson`: verified historical events only; empty when no configured source is available.
- `data/processed/exposure.csv`: population and asset counts by zone, without risk scores.

Optional reference layers are preserved as `vegetation.geojson`, `terrain.geojson`, and `risk_zones.geojson`. They are not Member 2 risk predictions.

## Sources and limitations

- OpenStreetMap Overpass API supplies settlements, roads, bridges, and mapped infrastructure and requires ODbL attribution.
- Nominatim supplies the selected place boundary when `--area` is used. If a boundary polygon is unavailable, the selected BBOX becomes the canonical zone geometry.
- Historical landslide source status as of 2026-09-07: no verified public GeoJSON source is configured or accessed. `historical_landslides_geojson_url` remains unset, so `historical_landslides.geojson` is an empty valid collection. Configure a verified dataset URL in `config/settings.yaml` before publishing historical events.
- Population is read only from source `population` tags. Missing or unverified population remains `null` and contributes zero to numeric exposure aggregation.
- Sensors, terrain, and risk-zone layers remain empty unless a real source or explicit sample configuration is provided.

## Setup and run

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r gis\requirements.txt
```

Run from inside `gis/` with a runtime-selected area:

```powershell
py -m scripts.run_pipeline --area "Arunachal Pradesh, India"
py -m scripts.run_pipeline --bbox 91.5 26.6 97.4 29.4
py -m scripts.validate_geojson
```

The configured `bbox` may remain `null`. A numeric configured BBOX is still supported as a fallback. `--area` resolves a place name through Nominatim and reports clear errors for missing or ambiguous results.

## Exposure generation

The pipeline creates `data/processed/exposure.csv` with:

```text
zone_id,population,village_count,road_count,bridge_count,school_count,hospital_count,critical_asset_count
```

Rows are aggregated from the normalized GIS layers by `zone_id`. The file contains exposure facts only and does not include risk or priority calculations.

## Validation

`python -m scripts.validate_geojson` checks GeoJSON structure, WGS84 coordinate ranges, duplicate IDs, required Member 2 properties, non-negative population values, valid zone references, coordinate/property agreement, and point-in-zone consistency for polygon zones.

Respect the terms, attribution, rate limits, and access policies of every upstream provider. Access dates and URLs for any configured historical landslide source should be recorded in the configuration and project documentation.
