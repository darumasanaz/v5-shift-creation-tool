import json
from typing import Dict, Iterable, List, Optional, Tuple

from ortools.sat.python import cp_model

from .models import ScheduleRequest, ShortageInfo


def _load_initial_data() -> Dict:
    with open("api/input_data.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _parse_interval(label: str) -> Tuple[int, int]:
    start_str, end_str = label.split("-")
    start = int(start_str)
    end = int(end_str)

    if start == 0 and end <= 7:
        # Treat post-midnight ranges as 24-31 so they work with 24+ hour shifts
        return 24, 24 + end
    return start, end


def _covers_interval(shift_start: int, shift_end: int, interval: Tuple[int, int]) -> bool:
    """Return True when a shift touches the target interval."""

    start, end = interval
    if start >= 24:
        if shift_end <= 24:
            return False
        return shift_start < end and shift_end > start
    if end <= 24:
        effective_end = min(shift_end, 24)
        return shift_start < end and effective_end > start
    # Intervals that cross midnight are not expected here
    return shift_start < end and shift_end > start


def _build_time_ranges(shifts: Dict[str, Dict[str, int]]) -> Dict[str, List[str]]:
    intervals: Dict[str, Tuple[int, int]] = {
        "7-9": (7, 9),
        "9-15": (9, 15),
        "16-18": (16, 18),
        "18-24": (18, 24),
        "0-7": (24, 31),  # treat as 24-31 to account for night shifts
    }

    time_ranges: Dict[str, List[str]] = {key: [] for key in intervals}
    for code, shift in shifts.items():
        for label, interval in intervals.items():
            if _covers_interval(shift["start"], shift["end"], interval):
                time_ranges[label].append(code)
    return time_ranges


def _build_specific_time_ranges(
    shifts: Dict[str, Dict[str, int]], labels: Iterable[str]
) -> Dict[str, List[str]]:
    mapping: Dict[str, List[str]] = {label: [] for label in labels}
    intervals = {label: _parse_interval(label) for label in labels}
    for code, shift in shifts.items():
        for label in labels:
            if _covers_interval(shift["start"], shift["end"], intervals[label]):
                mapping[label].append(code)
    return mapping


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
    shortage_vars: Dict[Tuple[int, str], cp_model.IntVar] = {}

    weights = data["weights"]
    shortage_time_range_weights: Dict[str, int] = weights.get(
        "shortageTimeRangeWeights", {}
    )

    for d in range(num_days):
        day_type = data["dayTypeByDate"][d]
        needs = data["needTemplate"][day_type]
        for label, related_shifts in time_ranges.items():
            need_value = needs[label]
            actual = sum(work[p, d, s_code] for p in range(num_people) for s_code in related_shifts)
            shortage = model.NewIntVar(0, need_value, f"shortage_{d}_{label}")
            overstaff = model.NewIntVar(0, num_people, f"overstaff_{d}_{label}")
            model.Add(actual + shortage >= need_value)
            model.Add(actual - overstaff <= need_value)
            shortage_weight = weights["W_shortage"] + shortage_time_range_weights.get(
                label, 0
            )
            penalties.append(shortage * shortage_weight)
            penalties.append(overstaff * weights["W_overstaff_gt_need_plus1"])
            shortage_vars[(d, label)] = shortage

    strict_night: Dict[str, int] = data.get("strictNight", {})
    if strict_night:
        strict_requirements: Dict[str, Dict[str, Optional[int]]] = {}
        for label, value in strict_night.items():
            if label.endswith("_min"):
                base_label = label[: -len("_min")]
                strict_requirements.setdefault(base_label, {})["min"] = value
            elif label.endswith("_max"):
                base_label = label[: -len("_max")]
                strict_requirements.setdefault(base_label, {})["max"] = value
            else:
                strict_requirements.setdefault(label, {})["min"] = value

        strict_ranges = _build_specific_time_ranges(shifts, strict_requirements.keys())

        for d in range(num_days):
            for label, related_shifts in strict_ranges.items():
                if not related_shifts:
                    continue
                actual = sum(
                    work[p, d, s_code] for p in range(num_people) for s_code in related_shifts
                )
                requirements = strict_requirements[label]
                if requirements.get("min") is not None:
                    model.Add(actual >= requirements["min"])
                if requirements.get("max") is not None:
                    model.Add(actual <= requirements["max"])

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

        for (day_idx, label), var in shortage_vars.items():
            value = solver.Value(var)
            if value > 0:
                shortages.append(ShortageInfo(day=day_idx + 1, time_range=label, shortage=value))

    status_name = solver.StatusName(status)
    return schedule, shortages, status_name
