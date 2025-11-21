from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json

from .models import (
    ScheduleRequest,
    ScheduleResponse,
    ScheduleSaveRequest,
    ScheduleSaveResponse,
    ScheduleState,
)
from .state import (
    build_save_response,
    compute_schedule_changes,
    enforce_version_and_lock,
    load_schedule_state,
    save_schedule_state,
)
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


@app.post("/api/save-draft", response_model=ScheduleSaveResponse)
def save_draft(request: ScheduleSaveRequest):
    current_state = load_schedule_state()
    enforce_version_and_lock(request, current_state)

    changes = compute_schedule_changes(current_state.schedule, request.schedule)
    next_state = ScheduleState(
        version=current_state.version + 1,
        locked=False,
        schedule=request.schedule,
    )
    save_schedule_state(next_state)
    return build_save_response(next_state, changes)


@app.post("/api/finalize-schedule", response_model=ScheduleSaveResponse)
def finalize_schedule(request: ScheduleSaveRequest):
    current_state = load_schedule_state()
    enforce_version_and_lock(request, current_state)

    changes = compute_schedule_changes(current_state.schedule, request.schedule)
    next_state = ScheduleState(
        version=current_state.version + 1,
        locked=True,
        schedule=request.schedule,
    )
    save_schedule_state(next_state)
    return build_save_response(next_state, changes)
