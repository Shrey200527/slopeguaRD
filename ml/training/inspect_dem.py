from pathlib import Path
import rasterio

BASE_DIR = Path(__file__).resolve().parents[1]
DEM_DIR = BASE_DIR / "data" / "raw" / "nrsc" / "cartodem"

files = list(DEM_DIR.rglob("*.tif"))

print(f"Found {len(files)} TIFF files\n")

for path in sorted(files):

    print("=" * 70)
    print(f"FILE: {path.relative_to(DEM_DIR)}")

    try:
        with rasterio.open(path) as src:

            print("CRS:", src.crs)
            print("Width:", src.width)
            print("Height:", src.height)
            print("Bounds:", src.bounds)
            print("Resolution:", src.res)
            print("Bands:", src.count)
            print("Data type:", src.dtypes[0])
            print("NoData:", src.nodata)

            # Correct rasterio sampling syntax
            center_x = (src.bounds.left + src.bounds.right) / 2
            center_y = (src.bounds.bottom + src.bounds.top) / 2

            sample = next(src.sample([(center_x, center_y)]))

            print("Center pixel value:", sample[0])

    except Exception as e:
        print("ERROR:", e)