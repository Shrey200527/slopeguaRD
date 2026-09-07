from pathlib import Path

import joblib
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]

DEM_DIR = BASE_DIR / "data" / "raw" / "nrsc" / "cartodem"

MODEL_PATH = BASE_DIR / "models" / "landslide_xgb_model.joblib"

OUTPUT_DIR = BASE_DIR / "data" / "processed"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_PATH = OUTPUT_DIR / "landslide_susceptibility.tif"

TARGET_CRS = "EPSG:32646"


# ============================================================
# LOAD DEM
# ============================================================

print("\n[1/5] Loading CartoDEM...")

dem_files = sorted(DEM_DIR.glob("*/cd*.tif"))

dem_files = [
    p for p in dem_files
    if "_dem_" not in p.name.lower()
]

print(f"Found {len(dem_files)} DEM tiles.")

datasets = []

try:

    for path in dem_files:
        datasets.append(rasterio.open(path))

    mosaic, transform = merge(datasets)

    profile = datasets[0].profile.copy()

finally:

    for ds in datasets:
        ds.close()


dem = mosaic[0].astype(np.float32)

print(f"DEM shape: {dem.shape}")
print(f"Elevation range: {np.nanmin(dem):.2f} - {np.nanmax(dem):.2f}")


# ============================================================
# REPROJECT TO UTM
# ============================================================

print("\n[2/5] Reprojecting DEM...")

height, width = dem.shape

left = transform.c
top = transform.f
right = left + width * transform.a
bottom = top + height * transform.e

dst_transform, dst_width, dst_height = calculate_default_transform(
    profile["crs"],
    TARGET_CRS,
    width,
    height,
    left=left,
    bottom=bottom,
    right=right,
    top=top,
)

dem_utm = np.full(
    (dst_height, dst_width),
    np.nan,
    dtype=np.float32,
)

reproject(
    source=dem,
    destination=dem_utm,
    src_transform=transform,
    src_crs=profile["crs"],
    dst_transform=dst_transform,
    dst_crs=TARGET_CRS,
    resampling=Resampling.bilinear,
    src_nodata=np.nan,
    dst_nodata=np.nan,
)

print(f"UTM shape: {dem_utm.shape}")


# ============================================================
# CALCULATE SLOPE
# ============================================================

print("\n[3/5] Calculating slope...")

pixel_x = dst_transform.a
pixel_y = abs(dst_transform.e)

dz_dy, dz_dx = np.gradient(
    dem_utm,
    pixel_y,
    pixel_x,
)

slope = np.degrees(
    np.arctan(
        np.sqrt(dz_dx ** 2 + dz_dy ** 2)
    )
)

print(
    f"Slope range: "
    f"{np.nanmin(slope):.2f} - "
    f"{np.nanmax(slope):.2f} degrees"
)


# ============================================================
# LOAD MODEL
# ============================================================

print("\n[4/5] Running XGBoost across DEM...")

model = joblib.load(MODEL_PATH)

valid = (
    np.isfinite(dem_utm)
    & np.isfinite(slope)
)

elevation_values = dem_utm[valid]
slope_values = slope[valid]

X = np.column_stack(
    [
        elevation_values,
        slope_values,
    ]
)

print(f"Valid prediction cells: {len(X):,}")

# Predict in chunks to avoid unnecessary memory usage
probabilities = np.empty(
    len(X),
    dtype=np.float32,
)

chunk_size = 500_000

for start in range(0, len(X), chunk_size):

    end = min(
        start + chunk_size,
        len(X),
    )

    probabilities[start:end] = (
        model.predict_proba(
            X[start:end]
        )[:, 1]
    )

    print(
        f"Processed "
        f"{end:,} / {len(X):,}"
    )


# ============================================================
# CREATE OUTPUT RASTER
# ============================================================

risk_map = np.full(
    dem_utm.shape,
    np.nan,
    dtype=np.float32,
)

risk_map[valid] = probabilities


# ============================================================
# SAVE GEOTIFF
# ============================================================

print("\n[5/5] Saving susceptibility map...")

output_profile = {
    "driver": "GTiff",
    "height": risk_map.shape[0],
    "width": risk_map.shape[1],
    "count": 1,
    "dtype": "float32",
    "crs": TARGET_CRS,
    "transform": dst_transform,
    "nodata": np.nan,
    "compress": "lzw",
}

with rasterio.open(
    OUTPUT_PATH,
    "w",
    **output_profile,
) as dst:

    dst.write(
        risk_map,
        1,
    )

print("\n========================================")
print("SUSCEPTIBILITY MAP COMPLETE")
print("========================================")

print(f"Output:")
print(OUTPUT_PATH)

print(
    f"\nProbability range:"
    f"\nMin: {np.nanmin(risk_map):.4f}"
    f"\nMax: {np.nanmax(risk_map):.4f}"
)