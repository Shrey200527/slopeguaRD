import httpx
from typing import Dict, Any

from backend.app.config import settings


class PredictionService:

    @staticmethod
    async def predict(
        latitude: float,
        longitude: float,
        rainfall_24h: float,
        soil_moisture: float,
        ground_movement: float,
    ) -> Dict[str, Any]:

        payload = {
            "latitude": latitude,
            "longitude": longitude,
            "rainfall_24h": rainfall_24h,
            "soil_moisture": soil_moisture,
            "ground_movement": ground_movement,
        }

        url = f"{settings.ML_SERVICE_URL.rstrip('/')}/predict/location"

        try:
            async with httpx.AsyncClient(
                timeout=10.0,
                trust_env=False,
            ) as client:
                response = await client.post(url, json=payload)

            response.raise_for_status()

            data = response.json()

            if "risk" not in data:
                raise RuntimeError(
                    f"ML response missing 'risk': {data}"
                )

            return data["risk"]

        except httpx.TimeoutException as exc:
            raise RuntimeError(
                f"ML service request timed out: {exc}"
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"ML service returned HTTP {exc.response.status_code}: "
                f"{exc.response.text}"
            ) from exc

        except httpx.RequestError as exc:
            raise RuntimeError(
                f"Could not connect to ML service at {url}: {exc}"
            ) from exc

        except Exception as exc:
            raise RuntimeError(
                f"ML integration error: {type(exc).__name__}: {exc}"
            ) from exc
