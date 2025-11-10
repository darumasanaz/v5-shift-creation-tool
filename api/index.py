from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json

from .models import ScheduleRequest, ScheduleResponse
from .solver import solve_shift_scheduling

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/initial-data")
def get_initial_data():
    try:
        with open("api/input_data.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Initial data not found.") from exc
    except Exception as exc:  # pragma: no cover - generic safeguard
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/generate-schedule", response_model=ScheduleResponse)
def generate_schedule(request: ScheduleRequest):
    try:
        schedule, shortages, coverage_breakdown, status = solve_shift_scheduling(
            request
        )
        return ScheduleResponse(
            schedule=schedule,
            shortages=shortages,
            coverageBreakdown=coverage_breakdown,
            status=status,
        )
    except Exception as exc:  # pragma: no cover - solver fallback
        return ScheduleResponse(
            schedule={},
            shortages=[],
            status="SOLVER_ERROR",
            message=str(exc),
        )
