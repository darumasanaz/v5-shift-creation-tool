from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException

from .data_loader import load_input_data
from .models import Person, Shift
from .state import _value_or_none


def _shift_duration(shift: Optional[Shift]) -> int:
    if shift is None:
        return 0
    return shift.end - shift.start


def load_validation_context(
    people_override: Optional[Iterable[Person]] = None,
) -> tuple[list[Person], list[Shift], int, int]:
    payload = load_input_data()
    people = list(people_override) if people_override is not None else [
        Person(**person) for person in payload.get("people", [])
    ]
    shifts = [Shift(**shift) for shift in payload.get("shifts", [])]
    days = payload.get("days", 0)
    weekday_of_day1 = payload.get("weekdayOfDay1", 0)
    return people, shifts, days, weekday_of_day1


def validate_schedule_rules(
    schedule: Dict[str, List[Optional[str]]],
    people: Iterable[Person],
    shifts: Iterable[Shift],
    days: int,
    weekday_of_day1: int,
) -> None:
    shift_map = {shift.code: shift for shift in shifts}
    violations: List[str] = []

    for person in people:
        assignments = schedule.get(person.id, [])
        consecutive_days = 0
        weekly_hours = 0
        monthly_hours = 0

        for day_index in range(days):
            assignment = _value_or_none(assignments, day_index)
            shift = shift_map.get(assignment) if assignment else None
            hours = _shift_duration(shift)

            if shift:
                consecutive_days += 1
                if consecutive_days > person.consecMax:
                    violations.append(
                        f"{person.id}: {person.consecMax}日を超える連勤 (day {day_index + 1})"
                    )
            else:
                consecutive_days = 0

            weekly_hours += hours
            monthly_hours += hours
            is_week_end = (weekday_of_day1 + day_index) % 7 == 6
            if is_week_end:
                if weekly_hours > person.weeklyMax:
                    violations.append(
                        f"{person.id}: 週の労働時間上限 {person.weeklyMax}h を超過"
                    )
                weekly_hours = 0

        if weekly_hours > person.weeklyMax:
            violations.append(
                f"{person.id}: 週の労働時間上限 {person.weeklyMax}h を超過"
            )

        if monthly_hours > person.monthlyMax:
            violations.append(
                f"{person.id}: 月の労働時間上限 {person.monthlyMax}h を超過"
            )

    if violations:
        raise HTTPException(
            status_code=400,
            detail={
                "reason": "RULE_VIOLATION",
                "message": "Schedule violates staffing rules.",
                "violations": violations,
            },
        )
