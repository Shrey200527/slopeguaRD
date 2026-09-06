from backend.app.routes.sensor_data import router as sensor_data_router
from backend.app.routes.prediction import router as prediction_router
from backend.app.routes.alert import router as alert_router
from backend.app.routes.priority import router as priority_router
from backend.app.routes.field_report import router as field_report_router
from backend.app.routes.simulation import router as simulation_router
from backend.app.routes.sync import router as sync_router

__all__ = [
    "sensor_data_router",
    "prediction_router",
    "alert_router",
    "priority_router",
    "field_report_router",
    "simulation_router",
    "sync_router",
]