# SlopeGuard-NER Frontend

AI-powered landslide risk assessment command center.

## Requirements

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Frontend:
http://localhost:3000

## Production Build

```bash
npm run build
```

## Backend

Default backend:
http://localhost:8000

Swagger:
http://localhost:8000/docs

## Environment

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Architecture

```
ESP32 / IoT
      ↓
Backend
      ↓
SlopeGuard ML
      ↓
Risk Prediction
      ↓
Frontend Command Center

GIS + terrain data
      ↓
Backend / ML

Field Reports
      ↓
Backend
      ↓
Dashboard
```

## Important

The frontend does not calculate landslide risk.

Risk score and risk level are provided by the backend/ML service.

Simulation also uses the backend/ML pipeline.
