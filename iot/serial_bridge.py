import json
import sys
import time
from datetime import datetime, timezone

import requests
import serial


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

SERIAL_PORT = "COM5"       # CHANGE THIS to your ESP32 COM port
BAUD_RATE = 115200

BACKEND_URL = "http://127.0.0.1:8000"
SENSOR_ENDPOINT = f"{BACKEND_URL}/sensor-data"

SERIAL_TIMEOUT = 1.0
HTTP_TIMEOUT = 5.0


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def get_timestamp() -> str:
    """Return authoritative laptop timestamp in UTC."""
    return datetime.now(timezone.utc).isoformat()


def validate_payload(payload: dict) -> None:
    """Validate required hardware fields before forwarding."""

    required = {
        "device_id",
        "zone_id",
        "latitude",
        "longitude",
        "rainfall_24h",
        "soil_moisture",
        "ground_movement",
    }

    missing = required - payload.keys()

    if missing:
        raise ValueError(
            f"Missing required fields: {sorted(missing)}"
        )

    latitude = float(payload["latitude"])
    longitude = float(payload["longitude"])
    rainfall = float(payload["rainfall_24h"])
    soil_moisture = float(payload["soil_moisture"])
    ground_movement = float(payload["ground_movement"])

    if not -90 <= latitude <= 90:
        raise ValueError("Invalid latitude")

    if not -180 <= longitude <= 180:
        raise ValueError("Invalid longitude")

    if rainfall < 0:
        raise ValueError("Rainfall cannot be negative")

    if not 0 <= soil_moisture <= 100:
        raise ValueError(
            "Soil moisture must be between 0 and 100"
        )

    if ground_movement < 0:
        raise ValueError(
            "Ground movement cannot be negative"
        )


def prepare_payload(payload: dict) -> dict:
    """
    Prepare ESP32 JSON for the backend.

    The backend/laptop timestamp is authoritative so an ESP32
    epoch such as 1970-01-01 does not propagate into the system.
    """

    payload = dict(payload)

    payload["device_id"] = str(
        payload["device_id"]
    )

    payload["zone_id"] = str(
        payload["zone_id"]
    )

    payload["latitude"] = float(
        payload["latitude"]
    )

    payload["longitude"] = float(
        payload["longitude"]
    )

    payload["rainfall_24h"] = float(
        payload["rainfall_24h"]
    )

    payload["soil_moisture"] = float(
        payload["soil_moisture"]
    )

    payload["ground_movement"] = float(
        payload["ground_movement"]
    )

    payload["timestamp"] = get_timestamp()

    return payload


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("SLOPEGUARD USB SENSOR BRIDGE")
    print("=" * 60)
    print(f"Serial : {SERIAL_PORT}")
    print(f"Baud   : {BAUD_RATE}")
    print(f"Backend: {SENSOR_ENDPOINT}")
    print()

    try:
        ser = serial.Serial(
            port=SERIAL_PORT,
            baudrate=BAUD_RATE,
            timeout=SERIAL_TIMEOUT,
        )
    except serial.SerialException as exc:
        print(f"[ERROR] Could not open {SERIAL_PORT}: {exc}")
        sys.exit(1)

    print(f"[OK] Connected to {SERIAL_PORT}")
    print("[INFO] Waiting for ESP32 JSON readings...")
    print()

    try:
        while True:
            raw = ser.readline()

            if not raw:
                continue

            line = raw.decode(
                "utf-8",
                errors="ignore",
            ).strip()

            if not line:
                continue

            # Ignore normal human-readable ESP32 output.
            if not line.startswith("{"):
                print(f"[ESP32] {line}")
                continue

            try:
                incoming = json.loads(line)
            except json.JSONDecodeError:
                print("[WARN] Ignoring invalid JSON:")
                print(line)
                continue

            try:
                validate_payload(incoming)
                payload = prepare_payload(incoming)
            except (ValueError, TypeError) as exc:
                print(f"[WARN] Invalid sensor payload: {exc}")
                continue

            print("-" * 60)
            print("[SENSOR] Reading received")
            print(json.dumps(payload, indent=2))

            try:
                response = requests.post(
                    SENSOR_ENDPOINT,
                    json=payload,
                    timeout=HTTP_TIMEOUT,
                )

                if response.ok:
                    print(
                        f"[BACKEND] {response.status_code} OK"
                    )

                    try:
                        result = response.json()
                        print(
                            "[RISK]",
                            json.dumps(
                                result,
                                indent=2,
                            ),
                        )
                    except ValueError:
                        print(
                            "[BACKEND]",
                            response.text,
                        )

                else:
                    print(
                        f"[BACKEND ERROR] "
                        f"{response.status_code}: "
                        f"{response.text}"
                    )

            except requests.RequestException as exc:
                print(
                    f"[BACKEND ERROR] "
                    f"Could not reach backend: {exc}"
                )

            time.sleep(0.05)

    except KeyboardInterrupt:
        print("\n[INFO] Stopping bridge.")

    finally:
        ser.close()
        print("[INFO] Serial connection closed.")


if __name__ == "__main__":
    main()