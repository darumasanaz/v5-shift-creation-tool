import json
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import HTTPException

from .models import ScheduleChange, ScheduleSaveRequest, ScheduleSaveResponse, ScheduleState

STATE_FILE = Path(__file__).with_name("schedule_state.json")


def load_schedule_state() -> ScheduleState:
    """Load the persisted schedule state or return defaults when absent."""
    if not STATE_FILE.exists():
        return ScheduleState()

    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        return ScheduleState(**payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load schedule state: {exc}",
        ) from exc


def save_schedule_state(state: ScheduleState) -> None:
    """Persist the schedule state to disk."""
    try:
        with STATE_FILE.open("w", encoding="utf-8") as f:
            json.dump(state.model_dump(), f, ensure_ascii=False, indent=2)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save schedule state: {exc}",
        ) from exc


def _value_or_none(items: List[Optional[str]], index: int) -> Optional[str]:
    if index < 0 or index >= len(items):
        return None
    return items[index]


def compute_schedule_changes(
    previous: Dict[str, List[Optional[str]]],
    updated: Dict[str, List[Optional[str]]],
) -> List[ScheduleChange]:
    """Return the list of cell-level changes between two schedules."""

    changes: List[ScheduleChange] = []
    for person_id in sorted(set(previous.keys()) | set(updated.keys())):
        prev_days = previous.get(person_id, [])
        next_days = updated.get(person_id, [])
        max_len = max(len(prev_days), len(next_days))
        for day_index in range(max_len):
            before = _value_or_none(prev_days, day_index)
            after = _value_or_none(next_days, day_index)
            if before == after:
                continue
            changes.append(
                ScheduleChange(
                    personId=person_id,
                    dayIndex=day_index,
                    previous=before,
                    updated=after,
                )
            )
    return changes


def build_save_response(
    state: ScheduleState, changes: List[ScheduleChange]
) -> ScheduleSaveResponse:
    return ScheduleSaveResponse(
        version=state.version,
        locked=state.locked,
        changes=changes,
    )


def enforce_version_and_lock(
    request: ScheduleSaveRequest, current_state: ScheduleState
) -> Optional[ScheduleSaveResponse]:
    if current_state.locked:
        raise HTTPException(
            status_code=423,
            detail={
                "reason": "LOCKED",
                "message": "Schedule is locked and cannot be modified.",
                "currentVersion": current_state.version,
            },
        )

    if (
        request.baseVersion is not None
        and request.baseVersion != current_state.version
    ):
        changes = compute_schedule_changes(
            request.schedule, current_state.schedule
        )
        raise HTTPException(
            status_code=409,
            detail={
                "reason": "VERSION_CONFLICT",
                "message": "Draft is based on an older version.",
                "currentVersion": current_state.version,
                "changes": [change.model_dump() for change in changes],
            },
        )

    return None
