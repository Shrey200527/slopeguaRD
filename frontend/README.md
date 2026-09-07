# SlopeGuard Frontend Preview

A small, replaceable GIS feature preview for SlopeGuard. It is plain HTML, CSS, and JavaScript so it can be replaced or connected to the backend without a framework migration.

## Run locally

From the repository root:

```powershell
python -m http.server 5173
```

Open <http://127.0.0.1:5173/frontend/> in a browser.

The page reads the published GeoJSON files from `../gis/`. Run the GIS pipeline first if you want populated layers:

```powershell
cd gis
py -m scripts.run_pipeline --area "Bengaluru, India"
```

## Replace the data source

Edit the `DATA_ROOT` constant at the top of `app.js` to point at another GeoJSON directory. Keep the layer filenames aligned with the GIS output contract:

- `risk_zones.geojson`
- `villages.geojson`
- `roads.geojson`
- `bridges.geojson`
- `infrastructure.geojson`
- `sensors.geojson`
- `terrain.geojson`
- `vegetation.geojson`

The frontend expects WGS84 GeoJSON `FeatureCollection` files and displays empty collections as zero-count layers rather than inventing data.

When village features include the OpenStreetMap `population` tag, the dashboard sums and displays that regional population. The infrastructure total and map layer are populated from `infrastructure.geojson`; rerun the GIS pipeline for the selected area after changing the area.
