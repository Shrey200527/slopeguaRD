# SlopeGuard Backend

FastAPI-based backend for the SlopeGuard landslide monitoring system.

## Setup Instructions

### 1. Create a Virtual Environment

From the repository root (`D:\SIH\slopeguaRD`), run:

```powershell
python -m venv venv
```

### 2. Activate the Virtual Environment (Windows PowerShell)

```powershell
.\venv\Scripts\Activate.ps1
```

If you encounter a script execution error, you may need to run:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

Then try activating again.

### 3. Install Dependencies

```powershell
pip install -r backend/requirements.txt
```

### 4. Run the Backend

From the repository root, run:

```powershell
python -m uvicorn backend.app.main:app --reload
```

The server will start on `http://localhost:8000`

## API Endpoints

- **Root Endpoint**: `http://localhost:8000/`
  - Returns API status message
  
- **Health Check**: `http://localhost:8000/health`
  - Returns health status

- **Swagger Documentation**: `http://localhost:8000/docs`
  - Interactive API documentation

## Development

The backend includes CORS middleware configured for common development ports (3000, 5173) to allow frontend connections during development.
