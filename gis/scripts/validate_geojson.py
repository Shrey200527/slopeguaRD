import json
from pathlib import Path

from .config import load_config, path_from_config
from .process_layers import LAYER_NAMES


REQUIRED_PROPERTIES = {
    "zones": (
        "zone_id",
        "name",
    ),
    "villages": (
        "village_id",
        "name",
        "latitude",
        "longitude",
        "population",
        "zone_id",
    ),
    "roads": (
        "road_id",
        "name",
        "road_type",
        "status",
        "zone_id",
    ),
    "bridges": (
        "bridge_id",
        "name",
        "latitude",
        "longitude",
        "zone_id",
        "status",
        "criticality",
    ),
    "critical_infrastructure": (
        "asset_id",
        "name",
        "type",
        "latitude",
        "longitude",
        "zone_id",
        "criticality",
        "status",
    ),
    "sensors": (
        "device_id",
        "zone_id",
        "latitude",
        "longitude",
        "status",
    ),
    "historical_landslides": (
        "slide_id",
        "latitude",
        "longitude",
        "district",
        "state",
        "activity",
        "triggering",
        "material",
        "movement_type",
        "zone_id",
    ),
}


# These layers participate directly in the operational
# zone/exposure model and therefore require a valid zone_id.
ZONE_REQUIRED_LAYERS = {
    "villages",
    "roads",
    "bridges",
    "critical_infrastructure",
    "sensors",
    "historical_landslides",
}


POINT_LAYERS = {
    "villages",
    "bridges",
    "critical_infrastructure",
    "sensors",
    "historical_landslides",
}


def validate_geometry(geometry: dict, path: Path) -> None:
    coordinates = geometry.get("coordinates")

    if geometry.get("type") not in {
        "Point",
        "LineString",
        "Polygon",
        "MultiPoint",
        "MultiLineString",
        "MultiPolygon",
    }:
        raise ValueError(
            f"{path}: unsupported geometry type"
        )

    def walk(values):
        if isinstance(values, (int, float)):
            return

        if (
            len(values) == 2
            and all(
                isinstance(value, (int, float))
                for value in values
            )
        ):
            longitude, latitude = values

            if (
                not -180 <= longitude <= 180
                or not -90 <= latitude <= 90
            ):
                raise ValueError(
                    f"{path}: coordinate outside WGS84 bounds"
                )

            return

        for value in values:
            walk(value)

    walk(coordinates)


def validate(path: Path) -> None:
    data = json.loads(
        path.read_text(encoding="utf-8")
    )

    if (
        data.get("type") != "FeatureCollection"
        or not isinstance(
            data.get("features"),
            list,
        )
    ):
        raise ValueError(
            f"{path}: expected GeoJSON FeatureCollection"
        )

    for item in data["features"]:
        if (
            item.get("type") != "Feature"
            or not isinstance(
                item.get("properties"),
                dict,
            )
        ):
            raise ValueError(
                f"{path}: invalid feature structure"
            )

        if item.get("geometry") is not None:
            validate_geometry(
                item["geometry"],
                path,
            )


def validate_property_values(
    layer_name: str,
    properties: dict,
    path: Path,
) -> None:
    for required in REQUIRED_PROPERTIES.get(
        layer_name,
        (),
    ):
        if required not in properties:
            raise ValueError(
                f"{path}: missing required property {required}"
            )

    if (
        "population" in properties
        and properties["population"] is not None
    ):
        if (
            not isinstance(
                properties["population"],
                int,
            )
            or properties["population"] < 0
        ):
            raise ValueError(
                f"{path}: population must be a non-negative integer or null"
            )

    for coordinate_name in (
        "latitude",
        "longitude",
    ):
        if (
            coordinate_name in properties
            and properties[coordinate_name] is not None
        ):
            value = properties[coordinate_name]

            if not isinstance(
                value,
                (int, float),
            ):
                raise ValueError(
                    f"{path}: {coordinate_name} must be numeric"
                )

            limit = (
                90
                if coordinate_name == "latitude"
                else 180
            )

            if not -limit <= value <= limit:
                raise ValueError(
                    f"{path}: {coordinate_name} outside WGS84 range"
                )


def point_in_ring(
    longitude: float,
    latitude: float,
    ring: list[list[float]],
) -> bool:
    inside = False

    for index, current in enumerate(ring):
        previous = ring[index - 1]

        if (
            (current[1] > latitude)
            != (previous[1] > latitude)
            and longitude
            < (
                (previous[0] - current[0])
                * (latitude - current[1])
                / (previous[1] - current[1])
                + current[0]
            )
        ):
            inside = not inside

    return inside


def point_in_geometry(
    longitude: float,
    latitude: float,
    geometry: dict,
) -> bool:
    if geometry["type"] == "Polygon":
        rings = geometry["coordinates"]

        return (
            point_in_ring(
                longitude,
                latitude,
                rings[0],
            )
            and not any(
                point_in_ring(
                    longitude,
                    latitude,
                    ring,
                )
                for ring in rings[1:]
            )
        )

    if geometry["type"] == "MultiPolygon":
        return any(
            point_in_geometry(
                longitude,
                latitude,
                {
                    "type": "Polygon",
                    "coordinates": polygon,
                },
            )
            for polygon in geometry["coordinates"]
        )

    return True


def validate_all(config: dict) -> None:
    output_dir = path_from_config(
        config,
        "layers_dir",
    )

    collections = {}

    # -------------------------------------------------------------
    # Load and structurally validate all expected layers
    # -------------------------------------------------------------
    for name in LAYER_NAMES:
        path = output_dir / f"{name}.geojson"

        validate(path)

        collections[name] = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    # -------------------------------------------------------------
    # Validate canonical zone IDs
    # -------------------------------------------------------------
    zone_features = collections["zones"]["features"]

    zone_ids = [
        feature["properties"].get("zone_id")
        for feature in zone_features
    ]

    if (
        len(zone_ids) != len(set(zone_ids))
        or any(not zone_id for zone_id in zone_ids)
    ):
        raise ValueError(
            "zones.geojson: zone_id values must be present and unique"
        )

    valid_zone_ids = set(zone_ids)

    # -------------------------------------------------------------
    # Validate every layer
    # -------------------------------------------------------------
    for name, data in collections.items():
        ids = []

        id_key = REQUIRED_PROPERTIES.get(
            name,
            (None,),
        )[0]

        for feature in data["features"]:
            properties = feature.get(
                "properties",
                {},
            )

            path = (
                output_dir
                / f"{name}.geojson"
            )

            validate_property_values(
                name,
                properties,
                path,
            )

            # -----------------------------------------------------
            # Check required unique IDs
            # -----------------------------------------------------
            if id_key:
                current_id = properties.get(
                    id_key
                )

                if not current_id:
                    raise ValueError(
                        f"{path}: missing or empty {id_key}"
                    )

                ids.append(current_id)

                if len(ids) != len(set(ids)):
                    raise ValueError(
                        f"{path}: duplicate {id_key} value {current_id}"
                    )

            # -----------------------------------------------------
            # Only operational layers require a valid zone_id
            # -----------------------------------------------------
            if name in ZONE_REQUIRED_LAYERS:
                zone_id = properties.get(
                    "zone_id"
                )

                if zone_id not in valid_zone_ids:
                    raise ValueError(
                        f"{path}: invalid zone_id {zone_id}"
                    )

    print("GeoJSON validation passed")


if __name__ == "__main__":
    validate_all(
        load_config()
    )