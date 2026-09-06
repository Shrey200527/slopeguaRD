from terrain import get_terrain


locations = [
    (27.78, 93.47),
    (27.41, 93.01),
    (28.23, 93.63),
]


for lat, lon in locations:

    try:

        terrain = get_terrain(
            lat,
            lon,
        )

        print(
            f"\nLocation: {lat}, {lon}"
        )

        print(
            f"Elevation: "
            f"{terrain['elevation_m']} m"
        )

        print(
            f"Slope: "
            f"{terrain['slope_deg']}°"
        )

    except Exception as e:

        print(
            f"\nERROR at "
            f"{lat}, {lon}: {e}"
        )