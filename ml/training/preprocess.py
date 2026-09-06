from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import Point


# ============================================================
# CONFIG
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]

GSI_PATH = (
    BASE_DIR
    / "data"
    / "raw"
    / "gsi"
    / "landslide_inventory"
    / "GSI_Landslide_Inventory.shp"
)

DEM_DIR = (
    BASE_DIR
    / "data"
    / "raw"
    / "nrsc"
    / "cartodem"
)

OUTPUT_DIR = BASE_DIR / "data" / "processed"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Available DEM coverage
MIN_LON = 92.0
MAX_LON = 95.0
MIN_LAT = 27.0
MAX_LAT = 29.0

# UTM Zone 46N covers the core study area.
TARGET_CRS = "EPSG:32646"


# ============================================================
# 1. LOAD GSI LANDSLIDE INVENTORY
# ============================================================

print("\n[1/6] Loading GSI landslide inventory...")

gsi = gpd.read_file(GSI_PATH)

print(f"Total GSI records: {len(gsi)}")
print(f"Original CRS: {gsi.crs}")

# Select Arunachal Pradesh
arp = gsi[
    gsi["STATE"]
    .astype(str)
    .str.contains("Arunachal", case=False, na=False)
].copy()

print(f"Arunachal landslides: {len(arp)}")

# Make sure coordinates are numeric
arp["LONGITUDE"] = pd.to_numeric(arp["LONGITUDE"], errors="coerce")
arp["LATITUDE"] = pd.to_numeric(arp["LATITUDE"], errors="coerce")

arp = arp.dropna(subset=["LONGITUDE", "LATITUDE"])


# ============================================================
# 2. LIMIT TO AVAILABLE DEM COVERAGE
# ============================================================

print("\n[2/6] Restricting inventory to available DEM coverage...")

arp = arp[
    (arp["LONGITUDE"] >= MIN_LON)
    & (arp["LONGITUDE"] <= MAX_LON)
    & (arp["LATITUDE"] >= MIN_LAT)
    & (arp["LATITUDE"] <= MAX_LAT)
].copy()

print(f"Landslides inside DEM coverage: {len(arp)}")

if len(arp) == 0:
    raise RuntimeError("No GSI landslides fall inside the DEM coverage.")


# Create GeoDataFrame from official GSI coordinates
geometry = [
    Point(lon, lat)
    for lon, lat in zip(arp["LONGITUDE"], arp["LATITUDE"])
]

arp = gpd.GeoDataFrame(
    arp,
    geometry=geometry,
    crs="EPSG:4326"
)


# ============================================================
# 3. LOAD AND MOSAIC CARTODEM RASTERS
# ============================================================

print("\n[3/6] Loading CartoDEM V3R1 tiles...")

dem_files = sorted(DEM_DIR.glob("*/cd*.tif"))

# Only use the six actual elevation surfaces.
# Exclude *_dem_aster.tif and *_dem_srtm.tif.
dem_files = [
    p for p in dem_files
    if "_dem_" not in p.name.lower()
]

if not dem_files:
    raise RuntimeError("No CartoDEM elevation TIFFs found.")

print("DEM files:")

for path in dem_files:
    print(f"  - {path}")

datasets = []

try:
    for path in dem_files:
        datasets.append(rasterio.open(path))

    mosaic, mosaic_transform = merge(datasets)

    source_profile = datasets[0].profile.copy()

finally:
    for ds in datasets:
        ds.close()

# First band
dem = mosaic[0].astype(np.float32)

# Handle possible nodata
nodata = source_profile.get("nodata")

if nodata is not None:
    dem[dem == nodata] = np.nan

print(f"Mosaic shape: {dem.shape}")
print(f"DEM minimum: {np.nanmin(dem):.2f} m")
print(f"DEM maximum: {np.nanmax(dem):.2f} m")


# ============================================================
# 4. REPROJECT DEM TO UTM FOR SLOPE CALCULATION
# ============================================================

print("\n[4/6] Reprojecting DEM to metric CRS...")

height, width = dem.shape

left = mosaic_transform.c
top = mosaic_transform.f
right = left + width * mosaic_transform.a
bottom = top + height * mosaic_transform.e

src_crs = source_profile["crs"]

transform, new_width, new_height = calculate_default_transform(
    src_crs,
    TARGET_CRS,
    width,
    height,
    left=left,
    bottom=bottom,
    right=right,
    top=top
)

dem_utm = np.full(
    (new_height, new_width),
    np.nan,
    dtype=np.float32
)

reproject(
    source=dem,
    destination=dem_utm,
    src_transform=mosaic_transform,
    src_crs=src_crs,
    dst_transform=transform,
    dst_crs=TARGET_CRS,
    resampling=Resampling.bilinear,
    src_nodata=np.nan,
    dst_nodata=np.nan
)

print(f"UTM DEM shape: {dem_utm.shape}")


# ============================================================
# 5. CALCULATE SLOPE
# ============================================================

print("\n[5/6] Calculating terrain slope...")

pixel_size_x = transform.a
pixel_size_y = abs(transform.e)

# Gradient in metres/metre
dz_dy, dz_dx = np.gradient(
    dem_utm,
    pixel_size_y,
    pixel_size_x
)

slope_rad = np.arctan(
    np.sqrt(dz_dx ** 2 + dz_dy ** 2)
)

slope_deg = np.degrees(slope_rad)

print(
    f"Slope range: "
    f"{np.nanmin(slope_deg):.2f}° - "
    f"{np.nanmax(slope_deg):.2f}°"
)


# ============================================================
# 6. SAMPLE TERRAIN FEATURES AT LANDSLIDE LOCATIONS
# ============================================================

print("\n[6/6] Extracting terrain features...")

# Reproject landslide points into UTM
arp_utm = arp.to_crs(TARGET_CRS)

elevations = []
slopes = []

for point in arp_utm.geometry:

    row, col = rasterio.transform.rowcol(
        transform,
        point.x,
        point.y
    )

    if (
        0 <= row < dem_utm.shape[0]
        and 0 <= col < dem_utm.shape[1]
    ):
        elevations.append(dem_utm[row, col])
        slopes.append(slope_deg[row, col])
    else:
        elevations.append(np.nan)
        slopes.append(np.nan)


arp["elevation"] = elevations
arp["slope"] = slopes


# Remove points where DEM sampling failed
before = len(arp)

arp = arp.dropna(
    subset=["elevation", "slope"]
).copy()

print(
    f"Valid terrain samples: "
    f"{len(arp)} / {before}"
)


# ============================================================
# CREATE POSITIVE DATASET
# ============================================================

positive = arp[
    [
        "LATITUDE",
        "LONGITUDE",
        "elevation",
        "slope"
    ]
].copy()

positive["landslide"] = 1


# ============================================================
# CREATE BACKGROUND / NEGATIVE SAMPLES
# ============================================================

print("\nGenerating background samples...")

rng = np.random.default_rng(42)

n_negative = len(positive)

negative_rows = []

# Generate more candidates than necessary because
# some may fall on known landslide locations.
candidate_count = n_negative * 5

candidate_lats = rng.uniform(
    MIN_LAT,
    MAX_LAT,
    candidate_count
)

candidate_lons = rng.uniform(
    MIN_LON,
    MAX_LON,
    candidate_count
)

# Known landslide coordinates
positive_coords = set(
    zip(
        positive["LATITUDE"].round(5),
        positive["LONGITUDE"].round(5)
    )
)

for lat, lon in zip(candidate_lats, candidate_lons):

    key = (round(lat, 5), round(lon, 5))

    if key in positive_coords:
        continue

    point = Point(lon, lat)

    # Transform to UTM
    point_utm = (
        gpd.GeoSeries(
            [point],
            crs="EPSG:4326"
        )
        .to_crs(TARGET_CRS)
        .iloc[0]
    )

    row, col = rasterio.transform.rowcol(
        transform,
        point_utm.x,
        point_utm.y
    )

    if not (
        0 <= row < dem_utm.shape[0]
        and 0 <= col < dem_utm.shape[1]
    ):
        continue

    elevation = dem_utm[row, col]
    slope = slope_deg[row, col]

    if np.isnan(elevation) or np.isnan(slope):
        continue

    negative_rows.append(
        {
            "LATITUDE": lat,
            "LONGITUDE": lon,
            "elevation": elevation,
            "slope": slope,
            "landslide": 0
        }
    )

    if len(negative_rows) >= n_negative:
        break


negative = pd.DataFrame(negative_rows)

print(f"Negative samples generated: {len(negative)}")

if len(negative) < n_negative:
    print(
        "WARNING: Could not generate the requested "
        "number of negative samples."
    )


# ============================================================
# COMBINE DATASET
# ============================================================

dataset = pd.concat(
    [positive, negative],
    ignore_index=True
)

# Shuffle
dataset = dataset.sample(
    frac=1,
    random_state=42
).reset_index(drop=True)


# ============================================================
# SAVE
# ============================================================

output_path = OUTPUT_DIR / "landslide_terrain_dataset.csv"

dataset.to_csv(
    output_path,
    index=False
)

print("\n========================================")
print("PREPROCESSING COMPLETE")
print("========================================")

print(f"Dataset saved to:")
print(output_path)

print("\nDataset shape:")
print(dataset.shape)

print("\nClass distribution:")
print(dataset["landslide"].value_counts())

print("\nFeature summary:")
print(dataset.describe())

print("\nFirst five rows:")
print(dataset.head())