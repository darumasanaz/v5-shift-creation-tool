import json
from typing import Dict, List, Optional, Tuple

from ortools.sat.python import cp_model

from .models import ScheduleRequest, ShortageInfo


def _load_initial_data() -> Dict:
    with open("api/input_data.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_interval(label: str) -> Tuple[int, int]:
    start_str, end_str = label.split("-")
    start = int(start_str)
    end = int(end_str)
    if start == 0:
        start = 24
        end += 24
    return start, end


def _covers_interval(shift_start: int, shift_end: int, interval: Tuple[int, int]) -> bool:
    interval_start, interval_end = interval
    return max(shift_start, interval_start) < min(shift_end, interval_end)


def _shifts_covering_interval(
    shifts: Dict[str, Dict[str, int]], interval: Tuple[int, int]
) -> List[str]:
    return [
        code
        for code, shift in shifts.items()
        if _covers_interval(shift["start"], shift["end"], interval)
    ]


def _build_time_ranges(shifts: Dict[str, Dict[str, int]]) -> Dict[str, List[str]]:
    labels = ["7-9", "9-15", "16-18", "18-24", "0-7"]
    intervals: Dict[str, Tuple[int, int]] = {
        label: _normalize_interval(label) for label in labels
    }

    time_ranges: Dict[str, List[str]] = {key: [] for key in intervals}
    for label, interval in intervals.items():
        time_ranges[label] = _shifts_covering_interval(shifts, interval)
    return time_ranges


def solve_shift_scheduling(request: ScheduleRequest):
    data = _load_initial_data()

    num_days = data["days"]
    people = request.people
    num_people = len(people)
    shifts = {s["code"]: s for s in data["shifts"]}
    all_shift_codes = list(shifts.keys())
    time_ranges = _build_time_ranges(shifts)

    model = cp_model.CpModel()

    work = {}
    for p in range(num_people):
        for d in range(num_days):
            for s_code in all_shift_codes:
                work[p, d, s_code] = model.NewBoolVar(f"work_{p}_{d}_{s_code}")

    # Hard constraints -----------------------------------------------------
    # At most one shift per person per day
    for p in range(num_people):
        for d in range(num_days):
            model.Add(sum(work[p, d, s_code] for s_code in all_shift_codes) <= 1)

    # Shift eligibility
    for p in range(num_people):
        allowed = set(people[p].canWork)
        for d in range(num_days):
            for s_code in all_shift_codes:
                if s_code not in allowed:
                    model.Add(work[p, d, s_code] == 0)
                    
    # Monthly minimum/maximum assignments
    for p in range(num_people):
        total_days = sum(work[p, d, s_code] for d in range(num_days) for s_code in all_shift_codes)
        model.Add(total_days >= people[p].monthlyMin)
        model.Add(total_days <= people[p].monthlyMax)

    # Night shift rest enforcement
    night_rest: Dict[str, int] = data["rules"]["nightRest"]
    for p in range(num_people):
        can_work = set(people[p].canWork)
        for night_code, rest_days in night_rest.items():
            if night_code not in can_work:
                continue
            for d in range(num_days):
                if d + rest_days >= num_days:
                    continue
                night_work = work[p, d, night_code]
                for offset in range(1, rest_days + 1):
                    for s_code in all_shift_codes:
                        model.Add(work[p, d + offset, s_code] == 0).OnlyEnforceIf(night_work)
    
    # Consecutive working days limit
    for p in range(num_people):
        consec_max = people[p].consecMax
        if consec_max <= 0:
            continue
        for d in range(num_days - consec_max):
            window = sum(
                work[p, day, s_code]
                for day in range(d, d + consec_max + 1)
                for s_code in all_shift_codes
            )
            model.Add(window <= consec_max)
    
    # Fixed off weekdays and requested days off
    weekday_map = {0: "月", 1: "火", 2: "水", 3: "木", 4: "金", 5: "土", 6: "日"}
    start_weekday = data["weekdayOfDay1"] % 7
    wish_offs = request.wishOffs or {}

    for p in range(num_people):
        fixed_off = set(people[p].fixedOffWeekdays)
        for d in range(num_days):
            weekday = weekday_map[(start_weekday + d) % 7]
            if weekday in fixed_off:
                for s_code in all_shift_codes:
                    model.Add(work[p, d, s_code] == 0)
        requested = set(wish_offs.get(people[p].id, []))
        for d in requested:
            if 0 <= d < num_days:
                for s_code in all_shift_codes:
                    model.Add(work[p, d, s_code] == 0)

    # Soft constraints -----------------------------------------------------
    penalties: List[cp_model.LinearExpr] = []
    weights = data["weights"]

    strict_rules = data.get("strictNight", {})
    strict_bounds: Dict[str, Dict[str, int]] = {}

    for label, value in strict_rules.items():
        if label.endswith("_min"):
            base_label = label[: -len("_min")]
            strict_bounds.setdefault(base_label, {})["min"] = value
        elif label.endswith("_max"):
            base_label = label[: -len("_max")]
            strict_bounds.setdefault(base_label, {})["max"] = value
        else:
            bounds = strict_bounds.setdefault(label, {})
            bounds["min"] = value
            bounds["max"] = value

    strict_shift_map: Dict[str, List[str]] = {
        label: _shifts_covering_interval(shifts, _normalize_interval(label))
        for label in strict_bounds
    }

    for d in range(num_days):
        day_type = data["dayTypeByDate"][d]
        needs = data["needTemplate"][day_type]
        for label, related_shifts in time_ranges.items():
            need_value = needs[label]
            actual = sum(work[p, d, s_code] for p in range(num_people) for s_code in related_shifts)
            overstaff = model.NewIntVar(0, num_people, f"overstaff_{d}_{label}")
            model.Add(actual >= need_value)
            model.Add(actual - overstaff <= need_value)
            penalties.append(overstaff * weights["W_overstaff_gt_need_plus1"])

        for label, bounds in strict_bounds.items():
            related_shifts = strict_shift_map[label]
            if not related_shifts:
                continue
            actual = sum(
                work[p, d, s_code] for p in range(num_people) for s_code in related_shifts
            )
            if "min" in bounds:
                model.Add(actual >= bounds["min"])
            if "max" in bounds:
                model.Add(actual <= bounds["max"])

    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    status = solver.Solve(model)

    schedule: Dict[str, List[Optional[str]]] = {}
    shortages: List[ShortageInfo] = []

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for p_idx, person in enumerate(people):
            assignments: List[Optional[str]] = []
            for d in range(num_days):
                assigned = None
                for s_code in all_shift_codes:
                    if solver.Value(work[p_idx, d, s_code]):
                        assigned = s_code
                        break
                assignments.append(assigned)
            schedule[person.id] = assignments

    status_name = solver.StatusName(status)
    return schedule, shortages, status_name
