from pathlib import Path
import math

import numpy as np
import rasterio
from rasterio.windows import Window


BASE_DIR = Path(__file__).resolve().parents[1]

DEM_DIR = (
    BASE_DIR
    / "data"
    / "raw"
    / "nrsc"
    / "cartodem"
)


# ------------------------------------------------------------
# Load DEM tiles once
# ------------------------------------------------------------

DEM_FILES = sorted(DEM_DIR.glob("*/cd*.tif"))

DEM_FILES = [
    p for p in DEM_FILES
    if "_dem_" not in p.name.lower()
]

DEM_DATASETS = [
    rasterio.open(path)
    for path in DEM_FILES
]


def get_terrain(latitude: float, longitude: float):

    """
    Extract elevation and local slope from CartoDEM
    at a latitude/longitude coordinate.
    """

    # --------------------------------------------------------
    # Find tile containing coordinate
    # --------------------------------------------------------

    dataset = None

    for ds in DEM_DATASETS:

        bounds = ds.bounds

        if (
            bounds.left <= longitude <= bounds.right
            and bounds.bottom <= latitude <= bounds.top
        ):
            dataset = ds
            break

    if dataset is None:
        raise ValueError(
            "Location is outside available CartoDEM coverage."
        )

    # --------------------------------------------------------
    # Convert coordinate to raster row / column
    # --------------------------------------------------------

    row, col = dataset.index(
        longitude,
        latitude,
    )

    # Need a 3x3 neighbourhood
    if (
        row < 1
        or col < 1
        or row >= dataset.height - 1
        or col >= dataset.width - 1
    ):
        raise ValueError(
            "Location is too close to DEM boundary."
        )

    # --------------------------------------------------------
    # Read 3x3 elevation window
    # --------------------------------------------------------

    window = dataset.read(
        1,
        window=Window(
            col - 1,
            row - 1,
            3,
            3,
        ),
    ).astype(np.float64)

    nodata = dataset.nodata

    if nodata is not None:
        window[window == nodata] = np.nan

    if np.isnan(window).any():
        raise ValueError(
            "DEM data unavailable at requested location."
        )

    elevation = window[1, 1]

    # --------------------------------------------------------
    # Convert geographic pixel dimensions to metres
    # --------------------------------------------------------

    lat_rad = math.radians(latitude)

    meters_per_degree_lat = 111320.0

    meters_per_degree_lon = (
        111320.0 * math.cos(lat_rad)
    )

    pixel_x = (
        abs(dataset.transform.a)
        * meters_per_degree_lon
    )

    pixel_y = (
        abs(dataset.transform.e)
        * meters_per_degree_lat
    )

    # --------------------------------------------------------
    # Calculate local slope
    # --------------------------------------------------------

    dz_dy, dz_dx = np.gradient(
        window,
        pixel_y,
        pixel_x,
    )

    slope = math.degrees(
        math.atan(
            math.sqrt(
                dz_dx[1, 1] ** 2
                + dz_dy[1, 1] ** 2
            )
        )
    )

    return {
        "elevation_m": round(
            float(elevation),
            2,
        ),
        "slope_deg": round(
            float(slope),
            2,
        ),
    }