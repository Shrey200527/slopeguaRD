from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine
from backend.app.models import Base
from backend.app.routes import (
    sensor_data_router,
    prediction_router,
    alert_router,
    priority_router,
    field_report_router,
    simulation_router,
    sync_router,
    zones_router,
)

app = FastAPI(
    title="SlopeGuard Backend API",
    version="0.1.0",
    description="Backend API for SlopeGuard landslide monitoring system"
)


@app.on_event("startup")
def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Warning: Could not create database tables: {e}")
        print("Application will start, but database operations may fail.")

# Configure CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(sensor_data_router)
app.include_router(prediction_router)
app.include_router(alert_router)
app.include_router(priority_router)
app.include_router(field_report_router)
app.include_router(simulation_router)
app.include_router(sync_router)
app.include_router(zones_router)


@app.get("/")
async def root():
    return {
        "message": "SlopeGuard Backend API",
        "status": "running"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }
